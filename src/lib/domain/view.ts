import '#lib/data/brasil.ts'; // registra os clubes reais no registro de clubes
import { careerWorld, type Career } from './career.ts';
import { requireClub } from './clubs.ts';
import { DEFAULT_PLAN, sanitizePlan } from './drills.ts';
import {
	DIVISION_LABELS,
	divisionOf,
	divisionStandings,
	groupStandings,
	sanitizeLeague,
	seasonFixtures,
	totalRounds,
	type DivisionId,
	type StoredRoundResult
} from './league.ts';
import { careerSquad, withFitness } from './matchday.ts';
import { clubFixtures } from './season.ts';
import { allFixtures, nextStep, processedKeys, seasonSteps, stepFixtures } from './calendar.ts';
import { CUP_ID, sanitizeCup } from './cup.ts';
import { CLUBES_2026 } from '#lib/data/brasil.ts';
import { squadStrength } from './squad.ts';
import { resolveRoles, sanitizeTacticalState, syncSquad, teamMastery } from './tactical.ts';
import { defaultTactic, sanitizeTactic, type Tactic } from './tactics.ts';

/**
 * Visão derivada de uma carreira: tudo o que é determinístico a partir da semente e do
 * estado salvo (elencos, calendário, classificação, domínio tático) é calculado aqui,
 * igual no servidor e no navegador.
 */
const KNOWN = new Set(CLUBES_2026.map((c) => c.id));

export function careerCalendar(career: Career, results: StoredRoundResult[], league = sanitizeLeague(career.data.league, careerWorld(career), career.season)) {
	const world = league.world;
	const fixtures = seasonFixtures(league, career.seed);
	const mine = clubFixtures(fixtures, career.clubId);
	const cup = world === 'brasil' ? sanitizeCup(career.data.cup, KNOWN) : null;
	const activeCup = cup && cup.season === career.season ? cup : null;
	const steps = seasonSteps(league, activeCup);
	const done = processedKeys(results);
	const step = nextStep(steps, done);
	const rounds = totalRounds(league);
	const seasonOver = step === null;
	const everything = allFixtures(fixtures, activeCup);
	const mineAll = everything.filter((f) => f.home === career.clubId || f.away === career.clubId);
	const played = new Set(results.map((r) => `${r.competition ?? 'liga-brasfc'}:${r.round}:${r.home}`));
	// Próximo passo do CALENDÁRIO (todas as competições); o usuário pode não jogar nele.
	const next = step ? (stepFixtures(step, everything).find((f) => f.home === career.clubId || f.away === career.clubId) ?? null) : null;
	const upcoming = mineAll.find((f) => !played.has(`${f.competition}:${f.round}:${f.home}`)) ?? null;
	return { fixtures, mine, activeCup, steps, step, rounds, seasonOver, mineAll, next, upcoming };
}

export function careerView(career: Career, results: StoredRoundResult[] = []) {
	const club = requireClub(career.clubId);
	const world = careerWorld(career);
	const league = sanitizeLeague(career.data.league, world, career.season);
	const squad = withFitness(careerSquad(career), career.data.fitness);
	const { fixtures, mine, activeCup, steps, step, rounds, seasonOver, mineAll, next, upcoming } = careerCalendar(career, results, league);
	const division = (divisionOf(league, career.clubId) ?? 'liga-brasfc') as DivisionId;
	const persisted = career.data.tactic ? sanitizeTactic(career.data.tactic, squad) : null;
	const tactic: Tactic = persisted ?? defaultTactic(squad);
	const roles = resolveRoles(tactic.formation, tactic.roles);
	const tactical = syncSquad(sanitizeTacticalState(career.data.tactical, squad, tactic.formation, tactic.style), squad);
	let nextRound = step?.kind === 'league' ? step.round : 1;
	if (step?.kind === 'cup') {
		const leagueDone = new Set(results.filter((r) => r.competition !== CUP_ID).map((r) => r.round));
		while (leagueDone.has(nextRound) && nextRound <= rounds) nextRound++;
	} else if (!step) nextRound = rounds + 1;
	const standings = divisionStandings(league, division, results);
	return {
		club,
		world,
		league,
		division,
		divisionLabel: DIVISION_LABELS[division],
		squad,
		fixtures,
		clubFixtures: mineAll,
		/** só as partidas de liga do clube */
		leagueFixtures: mine,
		cup: activeCup,
		steps,
		/** próximo passo do calendário (domingo de liga ou quarta de Copa) */
		step,
		/** partida do usuário na próxima rodada (null = folga nesta rodada ou temporada encerrada) */
		next,
		/** próximo jogo do usuário, mesmo que não seja na próxima rodada */
		upcoming,
		nextRound,
		rounds,
		seasonOver,
		results,
		standings,
		groups: division === 'serie-c' ? groupStandings(league, results) : [],
		strength: squadStrength(squad),
		tactic: { ...tactic, roles },
		tacticSaved: !!persisted,
		tactical,
		mastery: teamMastery(tactical, tactic.formation, tactic.style, tactic.lineup, tactic.instructions),
		trainingPlan: career.data.trainingPlan ? sanitizePlan(career.data.trainingPlan) : { ...DEFAULT_PLAN, sessions: [...DEFAULT_PLAN.sessions] },
		fitness: career.data.fitness ?? {},
		seasons: career.data.seasons ?? [],
		firstSeason: career.data.firstSeason ?? career.season
	};
}

export type CareerView = ReturnType<typeof careerView>;
