import { generateAttributes, computeOverall } from '#lib/engine/attributes.ts';
import { Match, simulateMatch } from '#lib/engine/match.ts';
import { buildTeamSetup } from '#lib/engine/teams.ts';
import type { AppliedDecision, MatchResult as EngineResult, PlayerStats, Side, TeamSetup } from '#lib/engine/types.ts';
import type { Career } from './career.ts';
import { requireClub } from './clubs.ts';
import { randomAppearance } from './appearance.ts';
import { createRng, deriveSeed } from './rng.ts';
import type { Fixture, MatchResult } from './season.ts';
import { generateSquad, type SquadPlayer } from './squad.ts';
import { autoLineup, defaultTactic, type Tactic } from './tactics.ts';

/**
 * Dia de jogo da carreira. Tudo aqui é determinístico e roda igual no navegador
 * (para exibir a partida) e no servidor (que reproduz e valida o resultado).
 */
export const CAREER_PLAYER_ID = 'eu';

/** Semente de uma partida da carreira: depende só da carreira e da rodada. */
export function matchSeed(career: Pick<Career, 'seed'>, round: number, home: string): number {
	return deriveSeed(career.seed, 'match', `${round}:${home}`);
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

function teamFor(clubId: string, squad: SquadPlayer[], tactic: Tactic): TeamSetup {
	const club = requireClub(clubId);
	return buildTeamSetup({ id: club.id, name: club.name, short: club.short, colors: club.colors }, squad, tactic);
}

/** Monta os dois times da partida do usuário: o dele com a tática salva, o rival com a tática padrão. */
export function fixtureSetup(career: Career, fixture: Fixture, myTactic: Tactic) {
	const mySquad = careerSquad(career);
	const mine = career.clubId;
	const opp = fixture.home === mine ? fixture.away : fixture.home;
	const oppSquad = generateSquad(opp, career.seed);
	let tactic = myTactic;
	if (career.mode === 'player') {
		// No modo jogador, o técnico (IA) escala o melhor time, que pode ou não incluir o usuário.
		const base = defaultTactic(mySquad);
		tactic = { ...base, lineup: autoLineup(base.formation, mySquad) };
	}
	const myTeam = teamFor(mine, mySquad, tactic);
	const oppTeam = teamFor(opp, oppSquad, defaultTactic(oppSquad));
	const mySide: Side = fixture.home === mine ? 'home' : 'away';
	return {
		home: mySide === 'home' ? myTeam : oppTeam,
		away: mySide === 'home' ? oppTeam : myTeam,
		seed: matchSeed(career, fixture.round, fixture.home),
		mySide,
		/** o treinador comanda o próprio lado; no modo jogador ninguém comanda (IA dos dois lados) */
		control: career.mode === 'coach' ? mySide : null
	};
}

export function newFixtureMatch(career: Career, fixture: Fixture, myTactic: Tactic, replay?: AppliedDecision[]): Match {
	const s = fixtureSetup(career, fixture, myTactic);
	return new Match({
		home: s.home,
		away: s.away,
		seed: s.seed,
		ai: { home: s.control !== 'home', away: s.control !== 'away' },
		...(replay ? { replay } : {})
	});
}

/** Demais jogos da rodada, simulados direto (resultado rápido). */
export function simulateOtherFixtures(career: Career, fixtures: Fixture[]): MatchResult[] {
	return fixtures.map((f) => {
		const hs = generateSquad(f.home, career.seed);
		const as = generateSquad(f.away, career.seed);
		const r = simulateMatch({
			home: teamFor(f.home, hs, defaultTactic(hs)),
			away: teamFor(f.away, as, defaultTactic(as)),
			seed: matchSeed(career, f.round, f.home)
		});
		return { home: f.home, away: f.away, homeGoals: r.homeGoals, awayGoals: r.awayGoals };
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
}

export function summarize(match: Match, result: EngineResult, mySide: Side): MatchSummary {
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
		...(result.players[CAREER_PLAYER_ID] ? { me: result.players[CAREER_PLAYER_ID] } : {})
	};
}

/** Próxima partida ainda não disputada do clube. */
export function nextUnplayed(clubFixtures: Fixture[], played: Set<number>): Fixture | null {
	return clubFixtures.find((f) => !played.has(f.round)) ?? null;
}
