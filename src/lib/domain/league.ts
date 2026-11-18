import { CLUBES_2026, TEMPORADA_2026, type RegraSerie } from '#lib/data/brasil.ts';
import { CLUBS, LEAGUE } from './clubs.ts';
import { addDays, weekday } from './dates.ts';
import { createRng, deriveSeed } from './rng.ts';
import { computeStandings, generateLeagueFixtures, type Fixture, type MatchResult, type StandingRow } from './season.ts';

/**
 * Mundos e competições da carreira (Dev 0.3).
 *  - 'brasfc': a liga fictícia da Dev 0.1/0.2 (saves antigos continuam nela).
 *  - 'brasil': Séries A, B e C com os 60 clubes da base 2026, com acesso e rebaixamento.
 *
 * Tudo que é calendário é DERIVADO (semente + estado da liga); só resultados são gravados.
 * Temporadas posteriores a 2026 são projeções do BRASFC (divisões definidas pelos resultados
 * da carreira), nunca dados reais de 2027 em diante.
 */
export type World = 'brasfc' | 'brasil';
export type DivisionId = 'serie-a' | 'serie-b' | 'serie-c' | typeof LEAGUE.id;
export const BRASIL_DIVISIONS = ['serie-a', 'serie-b', 'serie-c'] as const;
export type BrasilDivision = (typeof BRASIL_DIVISIONS)[number];

export const DIVISION_LABELS: Record<DivisionId, string> = {
	'serie-a': 'Série A',
	'serie-b': 'Série B',
	'serie-c': 'Série C',
	[LEAGUE.id]: LEAGUE.name
};

export interface LeagueState {
	world: World;
	season: number;
	divisions: Partial<Record<DivisionId, string[]>>;
	/** Série C: grupos da 2ª fase (definidos ao fim da 1ª fase) */
	cGroups?: [string[], string[]] | null;
}

export interface SeasonSummary {
	season: number;
	division: DivisionId;
	position: number;
	points: number;
	played: number;
	outcome: 'campeao' | 'acesso' | 'rebaixado' | 'permanece';
	champion: string | null;
}

const RULES_FALLBACK: Record<BrasilDivision, RegraSerie> = {
	'serie-a': { formato: 'pontos-corridos', turnos: 2, rebaixados: 4, fonte: null, status: 'a confirmar' },
	'serie-b': { formato: 'pontos-corridos', turnos: 2, promovidos: 4, rebaixados: 4, fonte: null, status: 'a confirmar' },
	'serie-c': { formato: 'primeira-fase-mais-grupos', turnos: 1, classificados: 8, grupos: 2, promovidos: 4, rebaixados: 2, fonte: null, status: 'a confirmar' }
};

/** Regras da temporada (a base só tem 2026; temporadas futuras repetem as últimas conhecidas). */
export function rulesFor(div: BrasilDivision): RegraSerie {
	return TEMPORADA_2026.regras?.[div] ?? RULES_FALLBACK[div];
}

export function initialLeague(world: World, season: number): LeagueState {
	if (world === 'brasfc') return { world, season, divisions: { [LEAGUE.id]: CLUBS.map((c) => c.id) } };
	const divisions: LeagueState['divisions'] = {};
	for (const comp of TEMPORADA_2026.competicoes) divisions[comp.id as BrasilDivision] = [...comp.clubes];
	return { world, season, divisions, cGroups: null };
}

export function divisionOf(league: LeagueState, clubId: string): DivisionId | null {
	for (const [d, ids] of Object.entries(league.divisions)) if (ids?.includes(clubId)) return d as DivisionId;
	return null;
}

/** Primeira rodada da temporada: primeiro domingo a partir de 24/01. */
export function firstRoundDate(season: number): string {
	let d = `${season}-01-24`;
	while (weekday(d) !== 0) d = addDays(d, 1);
	return d;
}

export function seasonStartDate(season: number): string {
	return addDays(firstRoundDate(season), -13);
}

/** Total de rodadas do calendário (a maior competição define o fim da temporada). */
export function totalRounds(league: LeagueState): number {
	if (league.world === 'brasfc') return 38;
	return 38;
}

function retarget(fixtures: Fixture[], season: number, comp: DivisionId): Fixture[] {
	const first = firstRoundDate(season);
	return fixtures.map((f) => ({ ...f, date: addDays(first, (f.round - 1) * 7), competition: comp as Fixture['competition'] }));
}

/** Calendário completo de todas as divisões da temporada. */
export function seasonFixtures(league: LeagueState, careerSeed: number): Fixture[] {
	const out: Fixture[] = [];
	for (const [div, ids] of Object.entries(league.divisions) as Array<[DivisionId, string[]]>) {
		if (!ids?.length) continue;
		const seed = deriveSeed(careerSeed, 'cal', `${league.season}:${div}`);
		if (div === LEAGUE.id) {
			out.push(...(league.season === 2027 ? generateLeagueFixtures(careerSeed, ids) : retarget(generateLeagueFixtures(seed, ids), league.season, div)));
			continue;
		}
		const rule = rulesFor(div as BrasilDivision);
		const all = retarget(generateLeagueFixtures(seed, ids), league.season, div);
		if (rule.turnos === 1) {
			out.push(...all.filter((f) => f.round <= ids.length - 1));
			if (rule.formato === 'primeira-fase-mais-grupos' && league.cGroups) out.push(...groupFixtures(league, careerSeed, ids.length - 1));
		} else out.push(...all);
	}
	return out;
}

/** 2ª fase da Série C: dois grupos de 4 em turno e returno (6 rodadas). */
function groupFixtures(league: LeagueState, careerSeed: number, after: number): Fixture[] {
	const out: Fixture[] = [];
	const first = firstRoundDate(league.season);
	league.cGroups!.forEach((group, gi) => {
		const base = generateLeagueFixtures(deriveSeed(careerSeed, 'grupo', `${league.season}:${gi}`), group);
		for (const f of base) {
			const round = after + f.round;
			out.push({ ...f, round, date: addDays(first, (round - 1) * 7), competition: 'serie-c' as Fixture['competition'], group: gi + 1 } as Fixture);
		}
	});
	return out;
}

export interface StoredRoundResult extends MatchResult {
	round: number;
	competition?: string;
}

/** Classificação de uma divisão (na Série C, só a 1ª fase). */
export function divisionStandings(league: LeagueState, div: DivisionId, results: StoredRoundResult[]): StandingRow[] {
	const ids = league.divisions[div] ?? [];
	const firstPhase = div === 'serie-c' ? ids.length - 1 : Infinity;
	return computeStandings(ids, results.filter((r) => (r.competition ?? LEAGUE.id) === div && r.round <= firstPhase));
}

export function groupStandings(league: LeagueState, results: StoredRoundResult[]): StandingRow[][] {
	if (!league.cGroups) return [];
	const after = (league.divisions['serie-c']?.length ?? 20) - 1;
	return league.cGroups.map((g) => computeStandings(g, results.filter((r) => r.competition === 'serie-c' && r.round > after && g.includes(r.home))));
}

/** Define os grupos da 2ª fase da Série C a partir da 1ª fase (1-4-5-8 e 2-3-6-7). */
export function computeCGroups(league: LeagueState, results: StoredRoundResult[]): [string[], string[]] {
	const table = divisionStandings(league, 'serie-c', results).map((r) => r.clubId);
	return [[table[0], table[3], table[4], table[7]], [table[1], table[2], table[5], table[6]]];
}

/** Precisa definir os grupos antes desta rodada? */
export function needsCGroups(league: LeagueState, round: number): boolean {
	const c = league.divisions['serie-c'];
	return league.world === 'brasil' && !!c && !league.cGroups && round === c.length;
}

export interface SeasonOutcome {
	next: LeagueState;
	moves: Array<{ clubId: string; from: DivisionId; to: DivisionId; reason: 'acesso' | 'rebaixamento' }>;
	champions: Partial<Record<DivisionId, string>>;
	tables: Partial<Record<DivisionId, StandingRow[]>>;
}

/** Fecha a temporada: campeões, acessos e rebaixamentos, e monta a próxima. */
export function closeSeason(league: LeagueState, results: StoredRoundResult[]): SeasonOutcome {
	const tables: SeasonOutcome['tables'] = {};
	const champions: SeasonOutcome['champions'] = {};
	const moves: SeasonOutcome['moves'] = [];
	if (league.world === 'brasfc') {
		const t = divisionStandings(league, LEAGUE.id, results);
		tables[LEAGUE.id] = t;
		champions[LEAGUE.id] = t[0]?.clubId;
		return { next: { ...league, season: league.season + 1 }, moves, champions, tables };
	}
	const a = divisionStandings(league, 'serie-a', results);
	const b = divisionStandings(league, 'serie-b', results);
	const c = divisionStandings(league, 'serie-c', results);
	tables['serie-a'] = a;
	tables['serie-b'] = b;
	tables['serie-c'] = c;
	champions['serie-a'] = a[0]?.clubId;
	champions['serie-b'] = b[0]?.clubId;
	const ra = rulesFor('serie-a');
	const rb = rulesFor('serie-b');
	const rc = rulesFor('serie-c');
	const down = (t: StandingRow[], n: number) => t.slice(t.length - n).map((r) => r.clubId);
	const up = (t: StandingRow[], n: number) => t.slice(0, n).map((r) => r.clubId);
	const aDown = down(a, ra.rebaixados ?? 4);
	const bUp = up(b, rb.promovidos ?? 4);
	const bDown = down(b, rb.rebaixados ?? 4);
	let cUp: string[];
	const groups = groupStandings(league, results);
	if (groups.length === 2) {
		cUp = [...up(groups[0], 2), ...up(groups[1], 2)];
		// Final não simulada: campeão = melhor campanha entre os líderes dos grupos.
		const leaders = [groups[0][0], groups[1][0]].sort((x, y) => y.points - x.points || y.goalDiff - x.goalDiff);
		champions['serie-c'] = leaders[0]?.clubId;
	} else cUp = up(c, rc.promovidos ?? 4);
	for (const id of aDown) moves.push({ clubId: id, from: 'serie-a', to: 'serie-b', reason: 'rebaixamento' });
	for (const id of bUp) moves.push({ clubId: id, from: 'serie-b', to: 'serie-a', reason: 'acesso' });
	for (const id of bDown) moves.push({ clubId: id, from: 'serie-b', to: 'serie-c', reason: 'rebaixamento' });
	for (const id of cUp) moves.push({ clubId: id, from: 'serie-c', to: 'serie-b', reason: 'acesso' });
	// A Série D não é simulada: quem cairia da C permanece nela (documentado em docs/DADOS.md).
	const next: LeagueState = {
		world: 'brasil',
		season: league.season + 1,
		divisions: {
			'serie-a': [...(league.divisions['serie-a'] ?? []).filter((id) => !aDown.includes(id)), ...bUp],
			'serie-b': [...(league.divisions['serie-b'] ?? []).filter((id) => !bUp.includes(id) && !bDown.includes(id)), ...aDown, ...cUp],
			'serie-c': [...(league.divisions['serie-c'] ?? []).filter((id) => !cUp.includes(id)), ...bDown]
		},
		cGroups: null
	};
	return { next, moves, champions, tables };
}

export function sanitizeLeague(input: unknown, world: World, season: number): LeagueState {
	const base = initialLeague(world, season);
	if (!input || typeof input !== 'object') return base;
	const raw = input as Partial<LeagueState>;
	if (raw.world !== world || typeof raw.season !== 'number' || !raw.divisions) return base;
	const known = new Set(world === 'brasil' ? CLUBES_2026.map((c) => c.id) : CLUBS.map((c) => c.id));
	const divisions: LeagueState['divisions'] = {};
	for (const [d, ids] of Object.entries(raw.divisions)) {
		if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && known.has(id))) return base;
		divisions[d as DivisionId] = [...ids];
	}
	const cGroups = Array.isArray(raw.cGroups) && raw.cGroups.length === 2 ? (raw.cGroups as [string[], string[]]) : null;
	return { world, season: raw.season, divisions, cGroups };
}

/** Clube aleatório (determinístico) — usado em testes de temporadas completas. */
export function pickClub(league: LeagueState, seed: number, div: DivisionId): string {
	const ids = league.divisions[div] ?? [];
	return createRng(seed).pick(ids);
}
