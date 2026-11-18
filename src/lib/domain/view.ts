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
import { squadStrength } from './squad.ts';
import { resolveRoles, sanitizeTacticalState, syncSquad, teamMastery } from './tactical.ts';
import { defaultTactic, sanitizeTactic, type Tactic } from './tactics.ts';

/**
 * Visão derivada de uma carreira: tudo o que é determinístico a partir da semente e do
 * estado salvo (elencos, calendário, classificação, domínio tático) é calculado aqui,
 * igual no servidor e no navegador.
 */
export function careerView(career: Career, results: StoredRoundResult[] = []) {
	const club = requireClub(career.clubId);
	const world = careerWorld(career);
	const league = sanitizeLeague(career.data.league, world, career.season);
	const squad = withFitness(careerSquad(career), career.data.fitness);
	const fixtures = seasonFixtures(league, career.seed);
	const division = (divisionOf(league, career.clubId) ?? 'liga-brasfc') as DivisionId;
	const mine = clubFixtures(fixtures, career.clubId);
	const persisted = career.data.tactic ? sanitizeTactic(career.data.tactic, squad) : null;
	const tactic: Tactic = persisted ?? defaultTactic(squad);
	const roles = resolveRoles(tactic.formation, tactic.roles);
	const tactical = syncSquad(sanitizeTacticalState(career.data.tactical, squad, tactic.formation, tactic.style), squad);
	const processed = new Set(results.map((r) => r.round));
	const rounds = totalRounds(league);
	// Próxima rodada do CALENDÁRIO (todas as divisões); o usuário pode não jogar nela.
	let nextRound = 1;
	while (processed.has(nextRound) && nextRound <= rounds) nextRound++;
	const seasonOver = nextRound > rounds;
	const next = seasonOver ? null : (mine.find((f) => f.round === nextRound) ?? null);
	const upcoming = mine.find((f) => f.round >= nextRound) ?? null;
	const standings = divisionStandings(league, division, results);
	return {
		club,
		world,
		league,
		division,
		divisionLabel: DIVISION_LABELS[division],
		squad,
		fixtures,
		clubFixtures: mine,
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
