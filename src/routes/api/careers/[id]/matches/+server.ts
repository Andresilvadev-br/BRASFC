import { error } from '@sveltejs/kit';
import { addDays } from '#lib/domain/dates.ts';
import { fixtureSetup, matchSeed, newFixtureMatch, simulateOtherFixtures, summarize } from '#lib/domain/matchday.ts';
import { FORMATIONS, isFormation, normalizeMentality, normalizeStyle } from '#lib/domain/tactics.ts';
import { careerView } from '#lib/domain/view.ts';
import { ENGINE_VERSION, type AppliedDecision, type Decision, type Side } from '#lib/engine/types.ts';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { advanceCareerDate, getCareer, VersionConflictError } from '#lib/server/repos/careers.ts';
import { insertRound, listResults, listUserMatches } from '#lib/server/repos/matches.ts';
import type { RequestHandler } from './$types';

/** Histórico das partidas do usuário (com resumo e estatísticas individuais). */
export const GET: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	return noStore({ matches: await listUserMatches(db, career.id) });
};

const MAX_DECISIONS = 80;

/** Valida a forma de cada decisão recebida; o motor ainda aplica as regras (limites, janelas). */
function parseDecisions(raw: unknown, side: Side | null): AppliedDecision[] {
	if (raw === undefined) return [];
	if (!Array.isArray(raw) || raw.length > MAX_DECISIONS) error(400, 'Lista de decisões inválida.');
	const out: AppliedDecision[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') error(400, 'Decisão inválida.');
		const d = item as Record<string, unknown>;
		if (d.side !== side || side === null) continue; // decisões do adversário (IA) são recalculadas aqui
		const tick = Number(d.tick);
		if (!Number.isInteger(tick) || tick < 0 || tick > 7200) error(400, 'Momento da decisão inválido.');
		if (d.rejected) continue;
		const dec = d.decision as Record<string, unknown> | undefined;
		let decision: Decision | null = null;
		if (dec?.type === 'sub' && typeof dec.outId === 'string' && typeof dec.inId === 'string') decision = { type: 'sub', outId: dec.outId, inId: dec.inId };
		else if (dec?.type === 'mentality' && normalizeMentality(dec.value)) decision = { type: 'mentality', value: normalizeMentality(dec.value)! };
		else if (dec?.type === 'style' && normalizeStyle(dec.value)) decision = { type: 'style', value: normalizeStyle(dec.value)! };
		else if (dec?.type === 'formation' && isFormation(dec.value) && Array.isArray(dec.lineup) && dec.lineup.length === FORMATIONS[dec.value].length && dec.lineup.every((x) => typeof x === 'string')) {
			decision = { type: 'formation', value: dec.value, lineup: dec.lineup as string[] };
		}
		if (!decision) error(400, 'Decisão de tipo desconhecido.');
		out.push({ tick, side, decision });
	}
	return out;
}

/**
 * Registra a próxima partida da carreira. O servidor NÃO confia no placar enviado:
 * ele reproduz a partida pela semente + decisões do treinador, simula os outros jogos
 * da rodada e grava tudo numa transação (com controle de versão da carreira).
 */
export const POST: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	const body = await readJson(event.request, 65_536);
	const version = Number(body.version);
	if (!Number.isInteger(version)) error(400, 'Versão da carreira ausente.');
	if (version !== career.version) error(409, 'A carreira mudou em outra janela. Recarregue para continuar.');

	const view = careerView(career, await listResults(db, career.id));
	const fixture = view.next;
	if (!fixture) error(409, 'Não há partidas pendentes nesta temporada.');
	if (Number(body.round) !== fixture.round) error(409, 'Esta rodada já foi disputada ou ainda não chegou.');

	const setup = fixtureSetup(career, fixture, view.tactic);
	const decisions = parseDecisions(body.decisions, setup.control);
	const match = newFixtureMatch(career, fixture, view.tactic, decisions);
	const result = match.runToEnd();
	const summary = summarize(match, result, setup.mySide);

	const others = view.fixtures.filter((f) => f.round === fixture.round && f.home !== fixture.home);
	const otherResults = simulateOtherFixtures(career, others);

	try {
		const updated = await db.transaction(async (tx) => {
			await insertRound(
				tx,
				career.id,
				[
					{ round: fixture.round, home: fixture.home, away: fixture.away, homeGoals: result.homeGoals, awayGoals: result.awayGoals, seed: setup.seed, isUser: true, decisions: result.decisions.filter((d) => d.side === setup.control), summary },
					...otherResults.map((r) => ({ round: fixture.round, ...r, seed: matchSeed(career, fixture.round, r.home), isUser: false }))
				],
				ENGINE_VERSION
			);
			return advanceCareerDate(tx, profile.id, career.id, addDays(fixture.date, 1), version);
		});
		return noStore({
			career: updated,
			match: { round: fixture.round, home: fixture.home, away: fixture.away, homeGoals: result.homeGoals, awayGoals: result.awayGoals, summary },
			round: otherResults
		});
	} catch (e) {
		if (e instanceof VersionConflictError) error(409, e.message);
		if (e instanceof Error && /duplicate key|unique/i.test(e.message)) error(409, 'Esta rodada já foi registrada.');
		throw e;
	}
};
