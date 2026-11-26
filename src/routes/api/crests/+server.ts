import { error } from '@sveltejs/kit';
import { matchCrest, groupCrests } from '#lib/crests/match.ts';
import { clearCrests, crestCoverage, crestIndex, crestMap, saveCrests } from '#lib/server/crests.ts';
import { noStore, readJson } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

/** Pacote local de escudos (Configurações › Escudos). O processamento das imagens acontece no próprio app. */
const MAX_PATHS = 40_000;
const MAX_BATCH = 24;

export const GET: RequestHandler = () => noStore({ coverage: crestCoverage(), crests: crestMap() });

export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<{ action?: string; paths?: unknown; items?: unknown }>(request, 4 * 1024 * 1024);
	if (body.action === 'match') {
		// Etapa 1: só os caminhos relativos da pasta escolhida, para saber o que vale a pena ler.
		if (!Array.isArray(body.paths) || body.paths.length > MAX_PATHS || !body.paths.every((p) => typeof p === 'string' && p.length < 400)) error(400, 'Lista de arquivos inválida.');
		const { index } = crestIndex();
		const matches = (body.paths as string[]).map((p) => matchCrest(index, p)).filter((m) => m !== null);
		const groups = [...groupCrests(matches)].map(([club, list]) => ({ club, candidates: list.map((m) => ({ path: m.path, source: m.source })) }));
		return noStore({ groups, scanned: body.paths.length });
	}
	if (body.action === 'save') {
		// Etapa 2: imagens já padronizadas no app (WebP 128 px), em lotes pequenos.
		if (!Array.isArray(body.items) || !body.items.length || body.items.length > MAX_BATCH) error(400, 'Lote de escudos inválido.');
		const items = (body.items as Array<Record<string, unknown>>).map((item) => {
			if (typeof item?.club !== 'string' || typeof item.source !== 'string' || typeof item.data !== 'string') error(400, 'Escudo inválido.');
			return { club: item.club, source: item.source, data: new Uint8Array(Buffer.from(item.data, 'base64')) };
		});
		const { clubs } = crestIndex();
		const result = saveCrests(items, (club) => clubs.has(club));
		return noStore({ ...result, coverage: crestCoverage() });
	}
	error(400, 'Ação desconhecida.');
};

export const DELETE: RequestHandler = () => {
	clearCrests();
	return noStore({ coverage: crestCoverage(), crests: {} });
};
