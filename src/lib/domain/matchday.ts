import { computeOverall, generateAttributes } from '#lib/engine/attributes.ts';
import { Match, simulateMatch } from '#lib/engine/match.ts';
import { buildTeamSetup } from '#lib/engine/teams.ts';
import type { AppliedDecision, MatchResult as EngineResult, PlayerStats, Side, TeamSetup } from '#lib/engine/types.ts';
import type { TacticalInstructions } from '#lib/engine/instructions.ts';
import type { RoleId } from '#lib/engine/roles.ts';
import type { Career } from './career.ts';
import { aiTeamPlan, scoutFrom, type ObservedMatch } from './coaches.ts';
import { requireClub } from './clubs.ts';
import { randomAppearance } from './appearance.ts';
import { createRng, deriveSeed } from './rng.ts';
import type { Fixture, MatchResult } from './season.ts';
import { generateSquad, type SquadPlayer } from './squad.ts';
import { engineFamiliarity, resolveRoles, type TacticalState } from './tactical.ts';
import type { FormationId, PlayStyle, Tactic } from './tactics.ts';

/**
 * Dia de jogo da carreira. Tudo aqui é determinístico e roda igual no navegador
 * (para exibir a partida) e no servidor (que reproduz e valida o resultado).
 */
export const CAREER_PLAYER_ID = 'eu';

/** Semente de uma partida da carreira: carreira + temporada + rodada + mandante. */
export function matchSeed(career: Pick<Career, 'seed'>, season: number, round: number, home: string): number {
	return deriveSeed(career.seed, 'match', `${season}:${round}:${home}`);
}

/** Elenco do clube da carreira; no modo jogador, inclui o atleta do usuário. */
export function careerSquad(career: Career): SquadPlayer[] {
	const squad = generateSquad(career.clubId, career.seed);
	if (career.mode !== 'player' || !career.data.player || !career.data.position) return squad;
	const p = career.data.player;
	const rng = createRng(deriveSeed(career.seed, 'eu-attr'));
	const { attributes, archetype } = generateAttributes(career.data.position, p.overall, rng);
	const me: SquadPlayer = {
		id: CAREER_PLAYER_ID,
		name: career.personName,
		shortName: career.personName.split(' ')[0],
		number: p.number,
		position: career.data.position,
		age: p.age,
		overall: computeOverall(attributes, career.data.position),
		potential: p.potential,
		condition: 100,
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
}

/** Time do usuário: tática salva (treinador) ou plano do técnico da IA (modo jogador). */
export function userTeam(career: Career, myTactic: Tactic, ctx: MatchdayContext, round: number): { setup: TeamSetup; tactic: Tactic & { roles: RoleId[] } } {
	const squad = withFitness(careerSquad(career), ctx.fitness);
	if (career.mode === 'player') {
		const plan = aiTeamPlan(career.seed, career.clubId, ctx.season, ctx.firstSeason, squad, undefined, round);
		const t = plan.tactic;
		const setup = buildTeamSetup(identity(career.clubId), squad, t);
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
	const squad = generateSquad(clubId, career.seed);
	const scout = opponentObserved ? scoutFrom(opponentObserved, squad) : undefined;
	const plan = aiTeamPlan(career.seed, clubId, ctx.season, ctx.firstSeason, squad, scout, round);
	const setup = buildTeamSetup(identity(clubId), squad, plan.tactic);
	setup.tactic.instructions = plan.tactic.instructions;
	setup.tactic.roles = plan.tactic.roles;
	setup.familiarity = plan.familiarity;
	setup.coach = plan.coach.profile;
	return { setup, reasons: plan.reasons, coachLabel: plan.coach.profile.label };
}

/** Monta os dois times da partida do usuário. */
export function fixtureSetup(career: Career, fixture: Fixture, myTactic: Tactic, ctx: MatchdayContext) {
	const mine = career.clubId;
	const opp = fixture.home === mine ? fixture.away : fixture.home;
	const me = userTeam(career, myTactic, ctx, fixture.round);
	const them = aiTeam(career, opp, ctx, fixture.round, ctx.observed);
	const mySide: Side = fixture.home === mine ? 'home' : 'away';
	return {
		home: mySide === 'home' ? me.setup : them.setup,
		away: mySide === 'home' ? them.setup : me.setup,
		seed: matchSeed(career, ctx.season, fixture.round, fixture.home),
		mySide,
		/** o treinador comanda o próprio lado; no modo jogador ninguém comanda (IA dos dois lados) */
		control: career.mode === 'coach' ? mySide : null,
		myTactic: me.tactic,
		opponentPlan: them.reasons,
		opponentCoach: them.coachLabel
	};
}

export function newFixtureMatch(career: Career, fixture: Fixture, myTactic: Tactic, ctx: MatchdayContext, replay?: AppliedDecision[]): Match {
	const s = fixtureSetup(career, fixture, myTactic, ctx);
	return new Match({
		home: s.home,
		away: s.away,
		seed: s.seed,
		ai: { home: s.control !== 'home', away: s.control !== 'away' },
		...(replay ? { replay } : {})
	});
}

/** Demais jogos da rodada (IA × IA), simulados direto pelo mesmo motor. */
export function simulateOtherFixtures(career: Career, fixtures: Fixture[], ctx: Pick<MatchdayContext, 'season' | 'firstSeason'>): Array<MatchResult & { competition: string; seed: number }> {
	return fixtures.map((f) => {
		const seed = matchSeed(career, ctx.season, f.round, f.home);
		const r = simulateMatch({ home: aiTeam(career, f.home, ctx, f.round).setup, away: aiTeam(career, f.away, ctx, f.round).setup, seed });
		return { home: f.home, away: f.away, homeGoals: r.homeGoals, awayGoals: r.awayGoals, competition: f.competition, seed };
	});
}

/** Resumo persistido da partida do usuário (sem o registro completo de eventos). */
export interface MatchSummary {
	stats: EngineResult['stats'];
	/** estatísticas individuais do time do usuário */
	players: Record<string, PlayerStats>;
	goals: Array<{ tick: number; side: Side; player: string; assist?: string; minute: string }>;
	cards: Array<{ tick: number; side: Side; player: string; kind: 'yellow' | 'red'; minute: string }>;
	me?: PlayerStats;
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
		...(result.players[CAREER_PLAYER_ID] ? { me: result.players[CAREER_PLAYER_ID] } : {}),
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
