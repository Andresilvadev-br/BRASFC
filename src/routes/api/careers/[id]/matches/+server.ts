import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { getCareer, VersionConflictError } from '#lib/server/repos/careers.ts';
import { listUserMatches } from '#lib/server/repos/matches.ts';
import { playRound, RoundError } from '#lib/server/rounds.ts';
import type { AppliedDecision } from '#lib/engine/types.ts';
import type { RequestHandler } from './$types';

/** Histórico das partidas do usuário (com resumo e estatísticas individuais). */
export const GET: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	return noStore({ matches: await listUserMatches(db, career.id) });
};

/**
 * Processa a próxima rodada. O servidor NÃO confia no placar do cliente: reproduz a
 * partida pela semente + decisões do treinador e simula os demais jogos (ver rounds.ts).
 */
export const POST: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	const body = await readJson(event.request, 65_536);
	const version = Number(body.version);
	const round = Number(body.round);
	if (!Number.isInteger(version) || !Number.isInteger(round)) error(400, 'Versão e rodada são obrigatórias.');
	try {
		return noStore(await playRound(db, profile.id, career, { version, round, decisions: body.decisions as AppliedDecision[] | undefined }));
	} catch (e) {
		if (e instanceof RoundError) error(e.status, e.message);
		if (e instanceof VersionConflictError) error(409, e.message);
		if (e instanceof Error && /duplicate key|unique/i.test(e.message)) error(409, 'Esta rodada já foi registrada.');
		throw e;
	}
};
