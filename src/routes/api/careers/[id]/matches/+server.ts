import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { getCareer, VersionConflictError } from '#lib/server/repos/careers.ts';
import { listUserMatches } from '#lib/server/repos/matches.ts';
import { playRound, RoundError } from '#lib/server/rounds.ts';
import { prefetchRound } from '#lib/server/round-prefetch.ts';
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
	const round = body.round === undefined ? undefined : Number(body.round);
	const step = typeof body.step === 'string' && /^(league|cup):\d{1,2}$/.test(body.step) ? body.step : undefined;
	if (!Number.isInteger(version) || (step === undefined && !Number.isInteger(round))) error(400, 'Versão e passo do calendário são obrigatórios.');
	try {
		const out = await playRound(db, profile.id, career, { version, ...(step ? { step } : { round }), decisions: body.decisions as AppliedDecision[] | undefined });
		// Operação secundária: já simula em segundo plano os outros jogos do próximo passo.
		prefetchRound(db, profile.id, out.career.id);
		// Resposta enxuta: a tela só precisa do resultado e da versão; a carreira é relida ao voltar à gestão.
		const { career: saved, timings, ...rest } = out;
		const res = noStore({ ...rest, career: { id: saved.id, version: saved.version, gameDate: saved.gameDate, season: saved.season } });
		res.headers.set('Server-Timing', Object.entries(timings).map(([k, v]) => `${k};dur=${v}`).join(', '));
		return res;
	} catch (e) {
		if (e instanceof RoundError) error(e.status, e.message);
		if (e instanceof VersionConflictError) error(409, e.message);
		if (e instanceof Error && /duplicate key|unique/i.test(e.message)) error(409, 'Esta rodada já foi registrada.');
		throw e;
	}
};
