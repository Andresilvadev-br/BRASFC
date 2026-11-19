import type { Db } from './index.ts';

/** Migrações SQL embutidas no build (ordem pelo nome do arquivo). */
const FILES = import.meta.glob('/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface Migration {
	version: string;
	sql: string;
}

export const MIGRATIONS: Migration[] = Object.entries(FILES)
	.map(([path, sql]) => ({ version: path.split('/').pop()!.replace(/\.sql$/, ''), sql }))
	.sort((a, b) => a.version.localeCompare(b.version));

const LOCK_ID = 727_2027;

/** Aplica, em transação, cada migração ainda não registrada. Idempotente. */
export async function runMigrations(db: Db, migrations: Migration[] = MIGRATIONS): Promise<string[]> {
	const applied: string[] = [];
	await db.transaction(async (tx) => {
		// Construtores concorrentes também precisam serializar a primeira criação da tabela.
		await tx.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
		await tx.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`);
		const rows = await tx.query<{ version: string }>('SELECT version FROM schema_migrations');
		const done = new Set(rows.map((r) => r.version));
		for (const m of migrations) {
			if (done.has(m.version)) continue;
			await tx.exec(m.sql);
			await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
			applied.push(m.version);
		}
	});
	return applied;
}

export async function currentMigration(db: Db): Promise<string | null> {
	const rows = await db.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
	return rows[0]?.version ?? null;
}
