import type { Career, CareerData } from '#lib/domain/career.ts';
import { addDays } from '#lib/domain/dates.ts';
import { applyTrainingWeek, recoverFitness } from '#lib/domain/drills.ts';
import { closeSeason, prepareRound, seasonFixtures, seasonStartDate, type SeasonSummary } from '#lib/domain/league.ts';
import { CUP_ID, cupFixtures, cupView, prepareCup, projectedCup } from '#lib/domain/cup.ts';
import { strengthFor } from '#lib/domain/strength.ts';
import type { Fixture } from '#lib/domain/season.ts';
import { careerSquad, fixtureSetup, newFixtureMatch, observedFrom, simulateOtherFixtures, summarize, type MatchdayContext } from '#lib/domain/matchday.ts';
import { learnFromMatch, teamMastery } from '#lib/domain/tactical.ts';
import { careerView } from '#lib/domain/view.ts';
import { ENGINE_VERSION, type AppliedDecision } from '#lib/engine/types.ts';
import { FORMATIONS, isFormation, normalizeMentality, normalizeStyle } from '#lib/domain/tactics.ts';
import { presetInstructions, sanitizeInstructions } from '#lib/engine/instructions.ts';
import { isRoleId } from '#lib/engine/roles.ts';
import type { Decision } from '#lib/engine/types.ts';
import type { Db } from './db/index.ts';
import { saveCareerProgress } from './repos/careers.ts';
import { insertRound, listResults, listUserMatches, type RoundInsert } from './repos/matches.ts';

export class RoundError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

/** Contexto do dia de jogo a partir do estado salvo (o mesmo usado pelo navegador). */
export async function matchdayContext(db: Db, career: Career, view?: ReturnType<typeof careerView>): Promise<MatchdayContext> {
	view ??= careerView(career, await listResults(db, career.id, career.season));
	const previous = await listUserMatches(db, career.id);
	const observed = previous
		.slice(-3)
		.map((m) => observedFrom(m.summary))
		.filter((o) => o !== null);
	return { season: career.season, firstSeason: view.firstSeason, tactical: view.tactical, fitness: career.data.fitness, observed };
}


/**
 * Processa o próximo PASSO do calendário (domingo de liga ou quarta de Copa): reproduz a partida do
 * usuário pela semente + decisões (o placar enviado pelo cliente nunca é aceito), simula os demais
 * jogos, aplica aprendizado tático, treino e recuperação, e grava tudo de uma vez.
 * Jogos da competição do usuário usam o motor completo; os demais, o modelo rápido calibrado.
 */
export async function playRound(db: Db, profileId: string, career: Career, body: { version: number; round?: number; step?: string; decisions?: AppliedDecision[] }) {
	if (body.version !== career.version) throw new RoundError('A carreira mudou em outra janela. Recarregue para continuar.', 409);
	const results = await listResults(db, career.id, career.season);
	const view = careerView(career, results);
	if (view.seasonOver || !view.step) throw new RoundError('A temporada terminou. Encerre-a para começar a próxima.', 409);
	const step = view.step;
	const asked = body.step ?? (typeof body.round === 'number' ? `league:${body.round}` : null);
	if (asked !== step.key) throw new RoundError('Este passo do calendário já foi disputado ou ainda não chegou.', 409);
	const strengthOf = strengthFor(career);

	let league = view.league;
	let cup = view.cup;
	let fixtures: Fixture[];
	if (step.kind === 'league') {
		league = prepareRound(league, step.round, results, career.seed, strengthOf);
		fixtures = seasonFixtures(league, career.seed).filter((f) => f.round === step.round);
	} else {
		cup = prepareCup(cup!, step.matchday, results, career.seed, strengthOf);
		fixtures = cupFixtures(cup).filter((f) => f.round === step.matchday);
	}
	const round = step.kind === 'league' ? step.round : step.matchday;
	const mine = fixtures.find((f) => f.home === career.clubId || f.away === career.clubId) ?? null;
	const ctx = await matchdayContext(db, career, view);
	const rows: RoundInsert[] = [];
	let userMatch: { homeGoals: number; awayGoals: number; summary: ReturnType<typeof summarize> } | null = null;
	let tactical = view.tactical;
	let fitness = { ...(career.data.fitness ?? {}) };
	const squad = careerSquad(career);

	if (mine) {
		const setup = fixtureSetup(career, mine, view.tactic, ctx);
		const decisions = sanitizeDecisions(body.decisions, setup.control);
		const match = newFixtureMatch(career, mine, view.tactic, ctx, decisions);
		const result = match.runToEnd();
		const t = setup.myTactic;
		const mastery = teamMastery(view.tactical, t.formation, t.style, t.lineup, t.instructions);
		const summary = summarize(match, result, setup.mySide, {
			tactic: { formation: t.formation, style: t.style, ...(t.instructions ? { instructions: t.instructions } : {}), roles: t.roles },
			opponentCoach: setup.opponentCoach,
			opponentPlan: setup.opponentPlan,
			execution: mastery.execution
		});
		rows.push({ season: career.season, round, competition: mine.competition, home: mine.home, away: mine.away, homeGoals: result.homeGoals, awayGoals: result.awayGoals, seed: setup.seed, isUser: true, decisions: result.decisions.filter((d) => d.side === setup.control), summary });
		userMatch = { homeGoals: result.homeGoals, awayGoals: result.awayGoals, summary };
		// Aprendizado: quem jogou, quantos minutos e em que função (titulares pelo slot; reservas na função do slot que ocuparam).
		const team = match.teams[setup.mySide];
		const appearances = [...match.states.values()]
			.filter((s) => s.side === setup.mySide && (result.players[s.id]?.minutes ?? 0) > 0)
			.map((s) => ({ id: s.id, minutes: result.players[s.id].minutes, role: t.roles[s.slot] ?? t.roles[0] }));
		tactical = learnFromMatch(tactical, { formation: team.tactic.formation, style: team.tactic.style, instructions: t.instructions, appearances, squad });
		tactical.history = [...tactical.history, { season: career.season, round, formation: t.formation, style: t.style, goalsFor: setup.mySide === 'home' ? result.homeGoals : result.awayGoals, goalsAgainst: setup.mySide === 'home' ? result.awayGoals : result.homeGoals, execution: mastery.execution }].slice(-120);
		for (const [id, st] of Object.entries(result.players)) if (squad.some((p) => p.id === id) && st.minutes > 0) fitness[id] = st.condition;
	}
	const others = fixtures.filter((f) => f !== mine);
	// Motor completo: a divisão do usuário (rodadas de liga) e todo o mundo fictício; o resto, modelo rápido.
	const full = view.world === 'brasfc' ? () => true : (f: Fixture) => step.kind === 'league' && f.competition === view.division;
	for (const r of simulateOtherFixtures(career, others, ctx, { full, strengthOf })) {
		rows.push({ season: career.season, round, competition: r.competition, home: r.home, away: r.away, homeGoals: r.homeGoals, awayGoals: r.awayGoals, seed: r.seed, isUser: false });
	}
	// Domingo: semana de treinos e recuperação até a próxima rodada. Quarta: só o desgaste do jogo.
	const plan = view.trainingPlan;
	if (step.kind === 'league') {
		if (career.mode === 'coach') {
			tactical = applyTrainingWeek(tactical, plan, { formation: view.tactic.formation, style: view.tactic.style, lineup: view.tactic.lineup, roles: view.tactic.roles, squad });
		}
		fitness = recoverFitness(fitness, squad, career.mode === 'coach' ? plan : { sessions: ['descanso', 'formacao', 'posse', 'defesa', 'descanso'], intensity: 'normal' });
	}
	const nextDate = addDays(step.date, 1);
	const data: Partial<CareerData> = { tactical, fitness, league, ...(cup ? { cup } : {}) };
	const updated = await db.transaction(async (tx) => {
		await insertRound(tx, career.id, rows, ENGINE_VERSION);
		return saveCareerProgress(tx, profileId, career.id, { gameDate: nextDate, data }, career.version);
	});
	return { career: updated, round, step: step.key, match: userMatch, results: rows.filter((r) => !r.isUser).map(({ home, away, homeGoals, awayGoals, competition }) => ({ home, away, homeGoals, awayGoals, competition })) };
}

/** Encerra a temporada: tabela final, acesso/rebaixamento, Copa e início da próxima. */
export async function finishSeason(db: Db, profileId: string, career: Career, version: number) {
	if (version !== career.version) throw new RoundError('A carreira mudou em outra janela. Recarregue para continuar.', 409);
	const results = await listResults(db, career.id, career.season);
	const view = careerView(career, results);
	if (!view.seasonOver) throw new RoundError('Ainda há jogos a disputar nesta temporada.', 409);
	const strengthOf = strengthFor(career);
	const leagueResults = results.filter((r) => r.competition !== CUP_ID);
	const outcome = closeSeason(view.league, leagueResults, career.seed, strengthOf);
	const table = outcome.tables[view.division] ?? [];
	const row = table.find((r) => r.clubId === career.clubId);
	const move = outcome.moves.find((m) => m.clubId === career.clubId);
	const summary: SeasonSummary = {
		season: career.season,
		division: view.division,
		position: row?.position ?? 0,
		points: row?.points ?? 0,
		played: row?.played ?? 0,
		outcome: outcome.champions[view.division] === career.clubId ? 'campeao' : move?.reason === 'acesso' ? 'acesso' : move?.reason === 'rebaixamento' ? 'rebaixado' : 'permanece',
		champion: outcome.champions[view.division] ?? null
	};
	// Entre temporadas: elenco descansa; o conhecimento tático fica, com leve esquecimento.
	const tactical = structuredClone(view.tactical);
	for (const f of Object.keys(tactical.formations) as Array<keyof typeof tactical.formations>) tactical.formations[f] = Math.round(tactical.formations[f] * 0.95 * 10) / 10;
	for (const s of Object.keys(tactical.styles) as Array<keyof typeof tactical.styles>) tactical.styles[s] = Math.round(tactical.styles[s] * 0.95 * 10) / 10;
	const fitness: Record<string, number> = {};
	for (const p of view.squad) fitness[p.id] = 100;
	const next = outcome.next;
	const cupNow = view.cup ? cupView(view.cup, results, career.seed, strengthOf) : null;
	// Copa da próxima temporada (projeção) a partir das novas divisões e dos campeões.
	const nextCup =
		view.world === 'brasil'
			? projectedCup(next, { cChampion: outcome.champions['serie-c'], cRunnerUp: outcome.runnersUp['serie-c'], dChampion: outcome.champions['serie-d'], dRunnerUp: outcome.runnersUp['serie-d'], dRanking: outcome.tables['serie-d']?.map((r) => r.clubId) })
			: undefined;
	const updated = await saveCareerProgress(
		db,
		profileId,
		career.id,
		{ gameDate: seasonStartDate(next.season), season: next.season, data: { league: next, tactical, fitness, seasons: [...view.seasons, summary], ...(nextCup ? { cup: nextCup } : {}) } },
		career.version
	);
	return { career: updated, summary, moves: outcome.moves, champions: outcome.champions, cupChampion: cupNow?.champion ?? null };
}

const MAX_DECISIONS = 80;

/** Valida a forma das decisões do lado humano; o motor ainda aplica as regras. */
export function sanitizeDecisions(raw: unknown, side: 'home' | 'away' | null): AppliedDecision[] {
	if (raw === undefined || raw === null) return [];
	if (!Array.isArray(raw) || raw.length > MAX_DECISIONS) throw new RoundError('Lista de decisões inválida.', 400);
	const out: AppliedDecision[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') throw new RoundError('Decisão inválida.', 400);
		const d = item as Record<string, unknown>;
		if (side === null || d.side !== side || d.rejected) continue; // decisões da IA são recalculadas aqui
		const tick = Number(d.tick);
		if (!Number.isInteger(tick) || tick < 0 || tick > 7200) throw new RoundError('Momento da decisão inválido.', 400);
		const decision = parseDecision(d.decision);
		if (!decision) throw new RoundError('Decisão de tipo desconhecido.', 400);
		out.push({ tick, side, decision });
	}
	return out;
}


function parseDecision(raw: unknown): Decision | null {
	const dec = raw as Record<string, unknown> | undefined;
	if (!dec || typeof dec !== 'object') return null;
	if (dec.type === 'sub' && typeof dec.outId === 'string' && typeof dec.inId === 'string') return { type: 'sub', outId: dec.outId, inId: dec.inId };
	if (dec.type === 'mentality' && normalizeMentality(dec.value)) return { type: 'mentality', value: normalizeMentality(dec.value)! };
	if (dec.type === 'style' && normalizeStyle(dec.value)) return { type: 'style', value: normalizeStyle(dec.value)! };
	if (dec.type === 'instructions' && dec.value && typeof dec.value === 'object') return { type: 'instructions', value: sanitizeInstructions(dec.value, presetInstructions('equilibrada', 'posse')) };
	if (dec.type === 'formation' && isFormation(dec.value) && Array.isArray(dec.lineup) && dec.lineup.length === FORMATIONS[dec.value].length && dec.lineup.every((x) => typeof x === 'string')) {
		const roles = Array.isArray(dec.roles) && dec.roles.length === dec.lineup.length && dec.roles.every(isRoleId) ? dec.roles : undefined;
		return { type: 'formation', value: dec.value, lineup: dec.lineup as string[], ...(roles ? { roles } : {}) };
	}
	return null;
}
