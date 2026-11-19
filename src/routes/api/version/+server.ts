import { RELEASES } from '#lib/changelog.ts';
import { getDb } from '#lib/server/db/index.ts';
import { currentMigration } from '#lib/server/db/migrate.ts';
import { noStore } from '#lib/server/http.ts';
import { BUILD } from '#lib/server/version.ts';
import type { RequestHandler } from './$types';

/**
 * Versão publicada no servidor + notas das últimas versões (as notas vêm do SERVIDOR: um cliente
 * antigo descobre o que a versão nova traz antes de atualizar). Público e sem cache.
 */
export const GET: RequestHandler = async () => {
	let migration: string | null = null;
	try {
		migration = await currentMigration(await getDb());
	} catch {
		migration = null;
	}
	return noStore({
		version: BUILD.version,
		commit: BUILD.commit,
		name: BUILD.name,
		builtAt: BUILD.builtAt,
		environment: BUILD.environment,
		channel: process.env.BRASFC_CHANNEL ?? (BUILD.environment === 'producao' ? 'estavel' : 'desenvolvimento'),
		database: migration,
		releases: RELEASES.slice(0, 6)
	});
};
