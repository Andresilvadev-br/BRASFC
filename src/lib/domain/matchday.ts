import { catalogClub } from '#lib/data/roster-catalog.ts';
import { initialClubTactic } from './club-selection.ts';
import { computeOverall } from '#lib/engine/attributes.ts';
import { Match, simulateMatch } from '#lib/engine/match.ts';
import { buildTeamSetup } from '#lib/engine/teams.ts';
import type { AppliedDecision, MatchResult as EngineResult, PlayerStats, Side, TeamSetup } from '#lib/engine/types.ts';
import type { TacticalInstructions } from '#lib/engine/instructions.ts';
import type { RoleId } from '#lib/engine/roles.ts';
import type { Career } from './career.ts';
import { aiTeamPlan, scoutFrom, type CoachOverride, type ObservedMatch } from './coaches.ts';
import { aiExecution, type UniverseState } from './universe.ts';
import { requireClub } from './clubs.ts';
import { randomAppearance } from './appearance.ts';
import { createRng, deriveSeed } from './rng.ts';
import type { Fixture, MatchResult } from './season.ts';
import { squadStrength, type SquadPlayer } from './squad.ts';
import { rosterOf } from './market.ts';
import { advancePlayerDays, playerAttributes, playerState, type PlayerAssessment, type PlayerSelection } from './player-development.ts';
import { rosterContext } from './world.ts';
import { quickMatch } from './quick.ts';
import { engineFamiliarity, resolveRoles, type TacticalState } from './tactical.ts';
import type { FormationId, PlayStyle, Tactic } from './tactics.ts';

/**
 * Dia de jogo da carreira. Tudo aqui é determinístico e roda igual no navegador
 * (para exibir a partida) e no servidor (que reproduz e valida o resultado).
 */
export const CAREER_PLAYER_ID = 'eu';

/** Semente de uma partida da carreira: carreira + temporada + rodada + mandante (+ Copa). */
export function matchSeed(career: Pick<Career, 'seed'>, season: number, round: number, home: string, competition?: string): number {
	if (competition === 'copa-do-brasil') return deriveSeed(career.seed, 'match', `${season}:copa:${round}:${home}`);
	return deriveSeed(career.seed, 'match', `${season}:${round}:${home}`);
}

/** Elenco do clube da carreira; no modo jogador, inclui o atleta do usuário. */
export function careerSquad(career: Career): SquadPlayer[] {
	const squad: SquadPlayer[] = rosterOf(rosterContext(career), career.clubId);
	if (career.mode !== 'player' || !career.data.player || !career.data.position) return squad;
	const p = career.data.player;
	const rng = createRng(deriveSeed(career.seed, 'eu-attr'));
	const { attributes, archetype } = playerAttributes(career.seed, career.data.position, p, career.data.playerCareer?.daily);
	const me: SquadPlayer = {
		id: CAREER_PLAYER_ID,
		name: career.personName,
		shortName: career.personName.split(' ')[0],
		number: p.number,
		position: career.data.position,
		age: p.age,
		overall: computeOverall(attributes, career.data.position),
		potential: p.potential,
		condition: career.data.playerCareer?.daily?.condition ?? career.data.fitness?.eu ?? 95,
		morale: 'boa',
		appearance: career.data.appearance ?? randomAppearance(rng),
		attributes,
		archetype
	};
	return [...squad, me];
}

/** Aplica a condição física persistida ao elenco (atletas sem registro: 95). */
export function withFitness(squad: SquadPlayer[], fitness: Record<string, number> | undefined): SquadPlayer[] {
	if (!fitness) return squad;
	return squad.map((p) => ({ ...p, condition: Math.round(fitness[p.id] ?? 95) }));
}

function identity(clubId: string) {
	const club = requireClub(clubId);
	return { id: club.id, name: club.name, short: club.short, colors: club.colors };
}

export interface MatchdayContext {
	season: number;
	firstSeason: number;
	tactical: TacticalState;
	fitness?: Record<string, number>;
	/** partidas anteriores do usuário (para o adversário estudar) */
	observed: ObservedMatch[];
	playerCalendar?: { division: string; gameDates: string[] };
}

/** Time do usuário: tática salva (treinador) ou plano do técnico da IA (modo jogador). */
export function userTeam(career: Career, myTactic: Tactic, ctx: MatchdayContext, round: number): { setup: TeamSetup; tactic: Tactic & { roles: RoleId[] } } {
	const squad = withFitness(careerSquad(career), ctx.fitness);
	if (career.mode === 'player') {
		const d = career.data.playerCareer?.daily;
		const fit = squad.filter((p) => p.id !== CAREER_PLAYER_ID || !d || (!d.injuryUntil && d.condition >= 55))
			.map((p) => p.id === CAREER_PLAYER_ID && d ? {
				...p, condition: d.condition,
				overall: p.overall + (d.trust - 50) * 0.28 + (d.support.squad - 50) * 0.07 + (d.condition - 95) * 0.32
			} : p);
		const plan = aiTeamPlan(career.seed, career.clubId, ctx.season, ctx.firstSeason, fit, undefined, round, universeCoach(career, career.clubId));
		const t = plan.tactic;
		const setup = buildTeamSetup(identity(career.clubId), fit, t);
		setup.familiarity = engineFamiliarity(ctx.tactical, t.formation, t.style, setup.tactic.lineup, t.roles, t.instructions);
		setup.coach = plan.coach.profile;
		setup.tactic.instructions = t.instructions;
		setup.tactic.roles = t.roles;
		return { setup, tactic: t };
	}
	const roles = resolveRoles(myTactic.formation, myTactic.roles);
	const setup = buildTeamSetup(identity(career.clubId), squad, myTactic);
	setup.tactic.roles = roles;
	if (myTactic.instructions) setup.tactic.instructions = myTactic.instructions;
	setup.familiarity = engineFamiliarity(ctx.tactical, myTactic.formation, myTactic.style, setup.tactic.lineup, roles, myTactic.instructions);
	return { setup, tactic: { ...myTactic, roles } };
}

/** Time da IA para um jogo (com estudo do adversário quando é o usuário). */
export function aiTeam(career: Career, clubId: string, ctx: Pick<MatchdayContext, 'season' | 'firstSeason'>, round: number, opponentObserved?: ObservedMatch[]): { setup: TeamSetup; reasons: string[]; coachLabel: string } {
	const squad: SquadPlayer[] = rosterOf(rosterContext(career), clubId);
	const scout = opponentObserved ? scoutFrom(opponentObserved, squad) : undefined;
	const override = universeCoach(career, clubId);
	const catalog = career.data.rosterCatalog;
	const opening = ctx.season === ctx.firstSeason && round === 1 && catalogClub(catalog, clubId)
		? initialClubTactic(catalog, clubId, squad) : undefined;
	const plan = aiTeamPlan(career.seed, clubId, ctx.season, ctx.firstSeason, squad, scout, round, override, opening);
	const setup = buildTeamSetup(identity(clubId), squad, plan.tactic);
	setup.tactic.instructions = plan.tactic.instructions;
	setup.tactic.roles = plan.tactic.roles;
	setup.familiarity = plan.familiarity;
	setup.coach = plan.coach.profile;
	return { setup, reasons: plan.reasons, coachLabel: override ? `${override.name} (${plan.coach.profile.label})` : plan.coach.profile.label };
}

/** Técnico, sistema e domínio do clube no universo da carreira (null em saves sem universo). */
export function universeCoach(career: Pick<Career, 'data'>, clubId: string): CoachOverride | null {
	const u = career.data.universe as UniverseState | undefined;
	const mind = u?.clubs?.[clubId];
	const coach = mind?.coachId ? u!.coaches?.[mind.coachId] : null;
	if (!mind || !coach) {
		const reference = catalogClub(career.data.rosterCatalog, clubId);
		return reference ? { style: 'equilibrado', formation: reference.formation, execution: 55, name: reference.coach, since: 2026 } : null;
	}
	return { style: coach.style, formation: mind.formation, execution: aiExecution(u, clubId) ?? 55, name: coach.name, since: coach.since };
}

/** Monta os dois times da partida do usuário. */
export function fixtureSetup(career: Career, fixture: Fixture, myTactic: Tactic, ctx: MatchdayContext) {
	const mine = career.clubId;
	const opp = fixture.home === mine ? fixture.away : fixture.home;
	let prepared = career;
	if (career.mode === 'player' && career.data.player && ctx.playerCalendar) {
		const state = advancePlayerDays(career, playerState(career, ctx.playerCalendar.division)!, fixture.date, ctx.playerCalendar.gameDates);
		if (state.daily.injuryUntil && state.daily.injuryUntil <= fixture.date) state.daily.injuryUntil = null;
		prepared = { ...career, data: { ...career.data, playerCareer: state } };
	}
	const me = userTeam(prepared, myTactic, ctx, fixture.round);
	const them = aiTeam(career, opp, ctx, fixture.round, ctx.observed);
	const mySide: Side = fixture.home === mine ? 'home' : 'away';
	// Preparação específica (treino "adversário" + analista): execução um pouco melhor contra ESTE rival.
	const prep = ctx.tactical.opponentPrep;
	if (career.mode === 'coach' && prep && prep.opponent === opp && me.setup.familiarity) me.setup.familiarity = { ...me.setup.familiarity, execution: Math.min(95, me.setup.familiarity.execution + prep.bonus) };
	return {
		home: mySide === 'home' ? me.setup : them.setup,
		away: mySide === 'home' ? them.setup : me.setup,
		seed: matchSeed(career, ctx.season, fixture.round, fixture.home, fixture.competition),
		neutral: !!(fixture as Fixture & { neutral?: boolean }).neutral,
		mySide,
		/** o treinador comanda o próprio lado; no modo jogador ninguém comanda (IA dos dois lados) */
		control: career.mode === 'coach' ? mySide : null,
		myTactic: me.tactic,
		opponentPlan: them.reasons,
		opponentCoach: them.coachLabel
	};
}

export function selectionOf(team: TeamSetup): PlayerSelection {
	return team.tactic.lineup.includes(CAREER_PLAYER_ID) ? 'titular' : team.tactic.bench.includes(CAREER_PLAYER_ID) ? 'reserva' : 'fora';
}

export function newFixtureMatch(career: Career, fixture: Fixture, myTactic: Tactic, ctx: MatchdayContext, replay?: AppliedDecision[]): Match {
	return matchFromSetup(fixtureSetup(career, fixture, myTactic, ctx), replay);
}

export function matchFromSetup(s: ReturnType<typeof fixtureSetup>, replay?: AppliedDecision[]): Match {
	return new Match({
		home: s.home,
		away: s.away,
		seed: s.seed,
		ai: { home: s.control !== 'home', away: s.control !== 'away' },
		...(s.neutral ? { rules: { homeAdvantage: false } } : {}),
		...(replay ? { replay } : {})
	});
}

/**
 * Demais jogos da rodada (IA × IA). `full` decide quais usam o motor completo (padrão: todos);
 * os outros usam o modelo rápido calibrado pelo motor (src/lib/domain/quick.ts).
 */
export function simulateOtherFixtures(
	career: Career,
	fixtures: Fixture[],
	ctx: Pick<MatchdayContext, 'season' | 'firstSeason'>,
	opts: { full?: (f: Fixture) => boolean; strengthOf?: (clubId: string) => number } = {}
): Array<MatchResult & { competition: string; seed: number; quick?: boolean; goals?: Array<{ side: 'home' | 'away'; player: string; minute: number }> }> {
	return fixtures.map((f) => {
		const seed = matchSeed(career, ctx.season, f.round, f.home, f.competition);
		const neutral = !!(f as Fixture & { neutral?: boolean }).neutral;
		if (opts.full && !opts.full(f)) {
			const st = opts.strengthOf ?? ((id: string) => squadStrengthOf(career, id));
			const q = quickMatch(st(f.home), st(f.away), seed, neutral);
			return { home: f.home, away: f.away, homeGoals: q.homeGoals, awayGoals: q.awayGoals, competition: f.competition, seed, quick: true };
		}
		const r = simulateMatch({ home: aiTeam(career, f.home, ctx, f.round).setup, away: aiTeam(career, f.away, ctx, f.round).setup, seed, ...(neutral ? { rules: { homeAdvantage: false } } : {}) });
		const goals = r.events.filter((e) => e.type === 'goal').map((e) => ({ side: e.side!, player: e.player!, minute: Math.floor(e.tick / 60) }));
		return { home: f.home, away: f.away, homeGoals: r.homeGoals, awayGoals: r.awayGoals, competition: f.competition, seed, goals };
	});
}

function squadStrengthOf(career: Career, clubId: string): number {
	return squadStrength(rosterOf(rosterContext(career), clubId));
}

/** Resumo persistido da partida do usuário (sem o registro completo de eventos). */
export interface MatchSummary {
	stats: EngineResult['stats'];
	/** estatísticas individuais do time do usuário */
	players: Record<string, PlayerStats>;
	goals: Array<{ tick: number; side: Side; player: string; assist?: string; minute: string }>;
	cards: Array<{ tick: number; side: Side; player: string; kind: 'yellow' | 'red'; minute: string }>;
	me?: PlayerStats;
	assessment?: PlayerAssessment;
	playerEvents?: Array<{ minute: string; kind: 'entrou' | 'saiu' | 'lesao' }>;
	/** titulares do usuário (para titularidades) */
	starters?: string[];
	/** o que o adversário pôde observar deste jogo */
	tactic?: { formation: FormationId; style: PlayStyle; instructions?: TacticalInstructions; roles?: RoleId[] };
	mySide?: Side;
	opponentCoach?: string;
	opponentPlan?: string[];
	execution?: number;
}

export function summarize(match: Match, result: EngineResult, mySide: Side, extra: Partial<MatchSummary> = {}): MatchSummary {
	const mine = new Set(match.teams[mySide].setup.players.map((p) => p.id));
	const players: Record<string, PlayerStats> = {};
	for (const [id, s] of Object.entries(result.players)) if (mine.has(id) && s.minutes > 0) players[id] = s;
	return {
		stats: result.stats,
		players,
		goals: result.events
			.filter((e) => e.type === 'goal')
			.map((e) => ({ tick: e.tick, side: e.side!, player: e.player!, ...(e.other ? { assist: e.other } : {}), minute: match.minuteLabel(e.tick) })),
		cards: result.events
			.filter((e) => e.type === 'yellow' || e.type === 'red')
			.map((e) => ({ tick: e.tick, side: e.side!, player: e.player!, kind: e.type as 'yellow' | 'red', minute: match.minuteLabel(e.tick) })),
		...(result.players[CAREER_PLAYER_ID]?.minutes ? { me: result.players[CAREER_PLAYER_ID] } : {}),
		starters: [...match.teams[mySide].setup.tactic.lineup],
		mySide,
		...extra
	};
}

/** Observação do adversário a partir do resumo salvo de um jogo do usuário. */
export function observedFrom(s: MatchSummary): ObservedMatch | null {
	if (!s.tactic) return null;
	const side = s.mySide ?? 'home';
	const total = s.stats.home.possessionTicks + s.stats.away.possessionTicks || 1;
	return { formation: s.tactic.formation, instructions: s.tactic.instructions, roles: s.tactic.roles, possession: (s.stats[side].possessionTicks / total) * 100 };
}

/** Próxima partida ainda não disputada do clube. */
export function nextUnplayed(clubFixtures: Fixture[], played: Set<number>): Fixture | null {
	return clubFixtures.find((f) => !played.has(f.round)) ?? null;
}
