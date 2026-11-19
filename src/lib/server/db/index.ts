import { runMigrations } from './migrate.ts';

/**
 * Acesso ao banco com uma interface mínima e comum a:
 *  • PostgreSQL (produção/Docker) via `postgres`;
 *  • PGlite (Postgres compilado para WASM) no desenvolvimento sem Docker e nos testes.
 * As mesmas migrações SQL rodam nos dois.
 */
export interface Db {
	readonly kind: 'postgres' | 'pglite';
	query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
	exec(text: string): Promise<void>;
	transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
	close(): Promise<void>;
}

export async function createPostgresDb(url: string): Promise<Db> {
	const { default: postgres } = await import('postgres');
	const sql = postgres(url, {
		max: Number(process.env.DATABASE_POOL_MAX ?? 5),
		idle_timeout: 30,
		connect_timeout: 10,
		onnotice: () => {},
		types: {
			// Os repositórios já enviam JSON pronto (texto) em parâmetros `$n::jsonb`. O serializador
			// padrão do driver aplicava JSON.stringify DE NOVO e o banco gravava uma string (ou, com
			// `data || $n`, uma lista de strings) em vez do objeto. Texto passa intacto; objetos viram JSON.
			json: {
				to: 114,
				from: [114, 3802],
				serialize: (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x)),
				parse: (x: string) => JSON.parse(x)
			}
		}
	});
	type Runner = { unsafe: (q: string, p?: never[]) => Promise<unknown> };
	const wrap = (runner: Runner, isTx: boolean): Db => ({
		kind: 'postgres',
		async query<T>(text: string, params: unknown[] = []) {
			return (await runner.unsafe(text, params as never[])) as unknown as T[];
		},
		async exec(text: string) {
			await runner.unsafe(text);
		},
		async transaction<T>(fn: (tx: Db) => Promise<T>) {
			if (isTx) return fn(wrap(runner, true));
			return (await sql.begin((tx) => fn(wrap(tx as unknown as Runner, true)))) as T;
		},
		async close() {
			await sql.end({ timeout: 5 });
		}
	});
	return wrap(sql as unknown as Runner, false);
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
	// Import dinâmico com especificador variável: o PGlite é ferramenta de
	// desenvolvimento e não entra no bundle de produção.
	const specifier = '@electric-sql/pglite';
	const { PGlite } = (await import(/* @vite-ignore */ specifier)) as typeof import('@electric-sql/pglite');
	if (dataDir) {
		const { mkdirSync } = await import('node:fs');
		mkdirSync(dataDir, { recursive: true });
	}
	const pg = dataDir ? new PGlite(dataDir) : new PGlite();
	await pg.waitReady;
	type Q = { query: (q: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (q: string) => Promise<unknown> };
	const wrap = (runner: Q, isTx: boolean): Db => ({
		kind: 'pglite',
		async query<T>(text: string, params: unknown[] = []) {
			return (await runner.query(text, params)).rows as T[];
		},
		async exec(text: string) {
			await runner.exec(text);
		},
		async transaction<T>(fn: (tx: Db) => Promise<T>) {
			if (isTx) return fn(wrap(runner, true));
			return pg.transaction((tx) => fn(wrap(tx as unknown as Q, true)));
		},
		async close() {
			await pg.close();
		}
	});
	return wrap(pg as unknown as Q, false);
}

const KEY = Symbol.for('brasfc.db');
type Holder = { promise?: Promise<Db>; override?: Db };
const holder: Holder = ((globalThis as Record<symbol, unknown>)[KEY] ??= {}) as Holder;

/** Instância única (compartilhada entre o runner SSR do Vite e o hub de tempo real). */
export function getDb(): Promise<Db> {
	if (holder.override) return Promise.resolve(holder.override);
	holder.promise ??= (async () => {
		const url = process.env.DATABASE_URL;
		let db: Db;
		if (url) {
			db = await createPostgresDb(url);
		} else if (process.env.NODE_ENV === 'production' && process.env.BRASFC_ALLOW_PGLITE !== '1') {
			throw new Error('DATABASE_URL não definida em produção.');
		} else {
			db = await createPgliteDb(process.env.PGLITE_DIR ?? './data/pglite');
		}
		await runMigrations(db);
		return db;
	})();
	holder.promise.catch(() => (holder.promise = undefined));
	return holder.promise;
}

/** Usado pelos testes para injetar um banco em memória. */
export function setDbForTests(db: Db | undefined) {
	holder.override = db;
}

export async function closeDb() {
	const p = holder.promise;
	holder.promise = undefined;
	if (p) await (await p).close();
}
