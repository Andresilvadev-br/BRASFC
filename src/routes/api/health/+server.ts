import { getDb } from '#lib/server/db/index.ts';
import { currentMigration } from '#lib/server/db/migrate.ts';
import { noStore } from '#lib/server/http.ts';
import { gameEnabled } from '#lib/server/mode.ts';
import { BUILD } from '#lib/server/version.ts';
import type { RequestHandler } from './$types';

/** Saúde do serviço: usado pelo Docker, pelo deploy e pelo monitoramento. */
export const GET: RequestHandler = async () => {
	const started = performance.now();
	let db: { ok: boolean; kind?: string; migration?: string | null; latencyMs?: number; error?: string; site?: true };
	if (!gameEnabled(process.env, import.meta.env.DEV)) db = { ok: true, site: true }; // site público: sem banco
	else try {
		const conn = await getDb();
		await conn.query('SELECT 1');
		db = { ok: true, kind: conn.kind, migration: await currentMigration(conn), latencyMs: Math.round(performance.now() - started) };
	} catch {
		db = { ok: false, error: 'Banco indisponível' };
	}
	const body = {
		status: db.ok ? 'ok' : 'degradado',
		version: BUILD.version,
		commit: BUILD.commit,
		builtAt: BUILD.builtAt,
		environment: BUILD.environment,
		uptimeSeconds: Math.round(process.uptime()),
		db,
		memoryMb: Math.round(process.memoryUsage().rss / 1048576)
	};
	return noStore(body, { status: db.ok ? 200 : 503 });
};
