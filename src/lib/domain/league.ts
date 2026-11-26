import { CLUBES_2026, SERIE_D_2026, TEMPORADA_2026 } from '#lib/data/brasil.ts';
import { CLUBS, getClub, LEAGUE } from './clubs.ts';
import { addDays, weekday } from './dates.ts';
import { penaltyShootout } from './quick.ts';
import { createRng, deriveSeed } from './rng.ts';
import { divisionRule, type DivisionRule, type NationalDivision } from './rules.ts';
import { computeStandings, generateLeagueFixtures, type Fixture, type MatchResult, type ScheduleVersion, type StandingRow } from './season.ts';

/**
 * Mundos e competições da carreira.
 *  - 'brasfc': a liga fictícia da Dev 0.1/0.2 (saves antigos continuam nela).
 *  - 'brasil': Séries A, B, C e D com regras POR EDIÇÃO (src/lib/domain/rules.ts),
 *    acesso, rebaixamento e expansão da Série C (20 → 24 → 28).
 *
 * Calendário e tabelas são DERIVADOS (semente + estado da liga + resultados); só resultados
 * e as definições de fase (grupos, chaves) são gravados. Temporadas posteriores a 2026 são
 * projeções do BRASFC (divisões definidas pelos resultados da carreira).
 */
export type World = 'brasfc' | 'brasil';
export type DivisionId = NationalDivision | typeof LEAGUE.id;
export const BRASIL_DIVISIONS = ['serie-a', 'serie-b', 'serie-c', 'serie-d'] as const;
export type BrasilDivision = (typeof BRASIL_DIVISIONS)[number];

export const DIVISION_LABELS: Record<DivisionId, string> = {
	'serie-a': 'Série A',
	'serie-b': 'Série B',
	'serie-c': 'Série C',
	'serie-d': 'Série D',
	[LEAGUE.id]: LEAGUE.name
};

/** A seleção é compartilhada pelos treinadores e pertence ao save, não aos perfis. */
export interface LeagueSelection {
	divisions: DivisionId[];
	cup: boolean;
}

export function validateLeagueSelection(world: World, input: unknown): LeagueSelection | undefined {
	if (!input || typeof input !== 'object') return;
	const { divisions, cup } = input as Partial<LeagueSelection>;
	const allowed: readonly DivisionId[] = world === 'brasil' ? BRASIL_DIVISIONS : [LEAGUE.id];
	if (!Array.isArray(divisions) || !divisions.length || divisions.length > allowed.length ||
		new Set(divisions).size !== divisions.length || !divisions.every((id) => allowed.includes(id)) ||
		typeof cup !== 'boolean' || (world === 'brasfc' && cup)) return;
	return { divisions: allowed.filter((id) => divisions.includes(id)), cup };
}

/** Mata-mata em ida e volta: [quem manda o 1º jogo, quem manda o 2º (melhor campanha)]. */
export type Tie = [string, string];

export interface DBracket {
	/** classificados da 1ª fase em ordem de campanha (índice técnico) */
	seeds: string[];
	/** fases já sorteadas: 0 = 2ª fase (64), 1 = 3ª (32), 2 = 4ª (16), 3 = quartas, 4 = semifinal, 5 = final */
	stages: Tie[][];
	/** playoffs de acesso entre eliminados nas quartas (2 confrontos) */
	playoff: Tie[] | null;
}

export interface LeagueState {
	world: World;
	season: number;
	/** Temporadas salvas sem a versão continuam com o calendário original. */
	scheduleVersion?: Exclude<ScheduleVersion, 1>;
	/** clubes de cada divisão */
	divisions: Partial<Record<DivisionId, string[]>>;
	/** Ausente em saves antigos, que preservam calendário e motor anteriores. */
	selection?: LeagueSelection;
	/** grupos da 1ª fase (Série C a partir de 2028; Série D) */
	groups?: Partial<Record<DivisionId, string[][]>>;
	/** Série C: quadrangulares da 2ª fase (definidos ao fim da 1ª fase) */
	cGroups?: [string[], string[]] | null;
	/** Série C: final entre os líderes dos quadrangulares [1º jogo, 2º jogo] */
	cFinal?: Tie | null;
	/** Série D: mata-mata */
	dBracket?: DBracket | null;
	/** clubes estaduais fora das séries nacionais (completam a Série D) */
	pool?: string[];
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

export interface StoredRoundResult extends MatchResult {
	round: number;
	competition?: string;
}

/** Força de um clube (média dos 11 melhores) — usada em desempates por pênaltis. */
export type StrengthOf = (clubId: string) => number;

// ─────────────────────────────────────────────────────────────── regras efetivas

/**
 * Regra efetiva da divisão nesta temporada. Saves antigos (Dev 0.3) podem ter uma Série C com
 * tamanho diferente da edição: nesse caso vale a fórmula de tabela única + quadrangulares.
 */
export function effectiveRule(league: LeagueState, div: NationalDivision): DivisionRule {
	const rule = divisionRule(div, league.season);
	const size = league.divisions[div]?.length ?? 0;
	if (div === 'serie-c' && size && size !== rule.size) {
		return { ...divisionRule('serie-c', 2026), season: league.season, size, status: 'projetado', nota: 'Save anterior à expansão: tabela única + quadrangulares; a expansão acontece na troca de temporada.' };
	}
	return rule;
}

/** Grupos da 1ª fase (tabela única = um grupo). */
export function phaseOneGroups(league: LeagueState, div: DivisionId): string[][] {
	const ids = league.divisions[div] ?? [];
	return league.groups?.[div]?.length ? league.groups[div]! : [ids];
}

export function phaseOneLength(league: LeagueState, div: DivisionId): number {
	if (league.world === 'brasfc' || div === LEAGUE.id) return 38;
	const rule = effectiveRule(league, div as NationalDivision);
	const groups = phaseOneGroups(league, div);
	const per = groups[0]?.length ?? rule.size;
	return (per % 2 === 0 ? per - 1 : per) * rule.phase1.legs;
}

// ─────────────────────────────────────────────────────────────── início

const REGION_ORDER = ['AM', 'RR', 'AP', 'PA', 'AC', 'RO', 'TO', 'MT', 'MS', 'GO', 'DF', 'MA', 'PI', 'CE', 'RN', 'PB', 'PE', 'AL', 'SE', 'BA', 'MG', 'ES', 'RJ', 'SP', 'PR', 'SC', 'RS'];
const UF_OF = new Map(CLUBES_2026.map((c) => [c.id, c.uf ?? 'SP']));

/** Grupos regionais (norte → sul), como fazem as competições nacionais com muitos clubes. */
export function regionalGroups(ids: string[], groups: number): string[][] {
	const sorted = [...ids].sort((a, b) => REGION_ORDER.indexOf(UF_OF.get(a)!) - REGION_ORDER.indexOf(UF_OF.get(b)!) || a.localeCompare(b));
	const size = Math.ceil(sorted.length / groups);
	return Array.from({ length: groups }, (_, i) => sorted.slice(i * size, (i + 1) * size));
}

export function initialLeague(world: World, season: number, selection?: LeagueSelection): LeagueState {
	if (world === 'brasfc') return { world, season, scheduleVersion: 3, divisions: { [LEAGUE.id]: CLUBS.map((c) => c.id) }, ...(selection ? { selection } : {}) };
	const divisions: LeagueState['divisions'] = {};
	for (const comp of TEMPORADA_2026.competicoes) divisions[comp.id as BrasilDivision] = [...comp.clubes];
	return {
		world,
		season,
		scheduleVersion: 3,
		divisions,
		...(selection ? { selection } : {}),
		groups: { 'serie-d': SERIE_D_2026.grupos.map((g) => [...g]) },
		cGroups: null,
		cFinal: null,
		dBracket: null,
		pool: CLUBES_2026.filter((c) => c.serie === 'E').map((c) => c.id)
	};
}

export function divisionOf(league: LeagueState, clubId: string): DivisionId | null {
	for (const [d, ids] of Object.entries(league.divisions)) if (ids?.includes(clubId)) return d as DivisionId;
	return null;
}

export function activeDivisions(league: LeagueState): DivisionId[] {
	return (league.selection?.divisions ?? Object.keys(league.divisions) as DivisionId[]).filter((div) => league.divisions[div]?.length);
}

export function activeMembership(league: LeagueState): Record<string, string[]> {
	return Object.fromEntries(activeDivisions(league).map((div) => [div, league.divisions[div]!]));
}

export function isActiveClub(league: LeagueState, clubId: string): boolean {
	return activeDivisions(league).some((div) => league.divisions[div]!.includes(clubId));
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

/** Data (domingo) da rodada de liga. */
export function roundDate(season: number, round: number): string {
	return addDays(firstRoundDate(season), (round - 1) * 7);
}

/** Total de rodadas de domingo da temporada (a maior competição define o fim). */
export function totalRounds(league: LeagueState): number {
	if (!league.selection) return 38;
	return Math.max(0, ...activeDivisions(league).map((div) => phaseOneLength(league, div) + (div === 'serie-c' ? 8 : div === 'serie-d' ? 12 : 0)));
}

/** Projeção de volume, independentemente do sorteio e sem construir elencos/calendário. */
export function divisionMatchCount(league: LeagueState, div: DivisionId): number {
	const legs = div === LEAGUE.id ? 2 : effectiveRule(league, div).phase1.legs;
	const regular = phaseOneGroups(league, div).reduce((sum, ids) => sum + (ids.length * (ids.length - 1) / 2) * legs, 0);
	return regular + (div === 'serie-c' ? 26 : div === 'serie-d' ? 130 : 0);
}

// ─────────────────────────────────────────────────────────────── calendário das ligas

function retarget(fixtures: Fixture[], season: number, comp: DivisionId, offset = 0, group?: number): Fixture[] {
	return fixtures.map((f) => ({ ...f, round: f.round + offset, date: roundDate(season, f.round + offset), competition: comp as Fixture['competition'], ...(group ? { group } : {}) }));
}

function roundRobin(seed: number, ids: string[], legs: 1 | 2, version: ScheduleVersion): Fixture[] {
	const all = generateLeagueFixtures(seed, ids, version);
	return legs === 2 ? all : all.filter((f) => f.round <= ids.length - 1);
}

/** Jogos de ida e volta de uma lista de confrontos nas rodadas indicadas. */
function tieFixtures(season: number, comp: DivisionId, ties: Tie[], r1: number, r2: number, phase: string): Fixture[] {
	const out: Fixture[] = [];
	ties.forEach(([a, b], i) => {
		out.push({ round: r1, date: roundDate(season, r1), time: i % 2 ? '19:00' : '16:00', home: a, away: b, competition: comp, phase } as Fixture);
		out.push({ round: r2, date: roundDate(season, r2), time: i % 2 ? '19:00' : '16:00', home: b, away: a, competition: comp, phase } as Fixture);
	});
	return out;
}

const D_STAGE_NAMES = ['2ª fase', '3ª fase', '4ª fase', 'Quartas de final', 'Semifinal', 'Final'];

/** Calendário (domingos) de todas as divisões, até onde as fases já foram definidas. */
export function seasonFixtures(league: LeagueState, careerSeed: number): Fixture[] {
	const out: Fixture[] = [];
	const version = league.scheduleVersion ?? 1;
	for (const div of activeDivisions(league)) {
		const ids = league.divisions[div]!;
		const seed = deriveSeed(careerSeed, 'cal', `${league.season}:${div}`);
		if (div === LEAGUE.id) {
			out.push(...(league.season === 2027 ? generateLeagueFixtures(careerSeed, ids, version) : retarget(generateLeagueFixtures(seed, ids, version), league.season, div)));
			continue;
		}
		const rule = effectiveRule(league, div as NationalDivision);
		const groups = phaseOneGroups(league, div);
		const p1 = phaseOneLength(league, div);
		if (groups.length === 1) out.push(...retarget(roundRobin(seed, ids, rule.phase1.legs, version), league.season, div));
		else groups.forEach((g, gi) => out.push(...retarget(roundRobin(deriveSeed(seed, 'g', gi), g, rule.phase1.legs, version), league.season, div, 0, gi + 1)));
		if (div === 'serie-c' && league.cGroups) {
			league.cGroups.forEach((g, gi) => {
				const base = generateLeagueFixtures(deriveSeed(careerSeed, 'grupo', `${league.season}:${gi}`), g, version);
				out.push(...base.map((f) => ({ ...f, round: p1 + f.round, date: roundDate(league.season, p1 + f.round), competition: 'serie-c', group: gi + 1, phase: 'Quadrangular' }) as Fixture));
			});
			if (league.cFinal) out.push(...tieFixtures(league.season, 'serie-c', [league.cFinal], p1 + 7, p1 + 8, 'Final'));
		}
		if (div === 'serie-d' && league.dBracket) {
			league.dBracket.stages.forEach((ties, k) => out.push(...tieFixtures(league.season, 'serie-d', ties, p1 + 2 * k + 1, p1 + 2 * k + 2, D_STAGE_NAMES[k])));
			if (league.dBracket.playoff) out.push(...tieFixtures(league.season, 'serie-d', league.dBracket.playoff, p1 + 9, p1 + 10, 'Playoff de acesso'));
		}
	}
	return out;
}

// ─────────────────────────────────────────────────────────────── tabelas

const inComp = (div: DivisionId) => (r: StoredRoundResult) => (r.competition ?? LEAGUE.id) === div;

/** Tabelas da 1ª fase (uma por grupo). */
export function phaseOneTables(league: LeagueState, div: DivisionId, results: StoredRoundResult[]): StandingRow[][] {
	if (league.selection && !league.selection.divisions.includes(div)) return [];
	const p1 = div === LEAGUE.id ? Infinity : phaseOneLength(league, div);
	const rs = results.filter((r) => inComp(div)(r) && r.round <= p1);
	return phaseOneGroups(league, div).map((g) => computeStandings(g, rs));
}

/** Classificação de uma divisão (1ª fase; com grupos, a junção ordenada por campanha). */
export function divisionStandings(league: LeagueState, div: DivisionId, results: StoredRoundResult[]): StandingRow[] {
	const tables = phaseOneTables(league, div, results);
	if (tables.length === 1) return tables[0];
	return rankCampaigns(tables.flat());
}

function rankCampaigns(rows: StandingRow[]): StandingRow[] {
	const sorted = [...rows].sort((x, y) => y.points - x.points || y.won - x.won || y.goalDiff - x.goalDiff || y.goalsFor - x.goalsFor || x.clubId.localeCompare(y.clubId));
	return sorted.map((r, i) => ({ ...r, position: i + 1 }));
}

export function groupStandings(league: LeagueState, results: StoredRoundResult[]): StandingRow[][] {
	if (!league.cGroups) return [];
	const p1 = phaseOneLength(league, 'serie-c');
	return league.cGroups.map((g) => computeStandings(g, results.filter((r) => r.competition === 'serie-c' && r.round > p1 && r.round <= p1 + 6 && g.includes(r.home))));
}

// ─────────────────────────────────────────────────────────────── mata-mata

export interface TieOutcome {
	tie: Tie;
	/** gols no agregado (do ponto de vista de tie[0], tie[1]) */
	aggregate: [number, number];
	penalties: { home: number; away: number; kicks?: ReturnType<typeof penaltyShootout>['kicks'] } | null;
	winner: string;
	loser: string;
	decidedBy: 'agregado' | 'penaltis' | 'campanha';
}

/**
 * Resultado de um confronto de ida e volta (ou jogo único com `single`). Empate no agregado:
 * pênaltis (determinísticos) — ou melhor campanha, quando a regra manda (playoff da Série D).
 */
export function resolveTie(tie: Tie, results: StoredRoundResult[], comp: string, rounds: number[], seed: number, strengthOf: StrengthOf, opts: { byCampaign?: boolean } = {}): TieOutcome | null {
	const legs = rounds.map((r) => results.find((x) => (x.competition ?? '') === comp && x.round === r && ((x.home === tie[0] && x.away === tie[1]) || (x.home === tie[1] && x.away === tie[0]))));
	if (legs.some((l) => !l)) return null;
	let a = 0;
	let b = 0;
	for (const l of legs as StoredRoundResult[]) {
		if (l.home === tie[0]) {
			a += l.homeGoals;
			b += l.awayGoals;
		} else {
			a += l.awayGoals;
			b += l.homeGoals;
		}
	}
	if (a !== b) return { tie, aggregate: [a, b], penalties: null, winner: a > b ? tie[0] : tie[1], loser: a > b ? tie[1] : tie[0], decidedBy: 'agregado' };
	if (opts.byCampaign) return { tie, aggregate: [a, b], penalties: null, winner: tie[1], loser: tie[0], decidedBy: 'campanha' };
	const last = legs.at(-1)!;
	const pen = penaltyShootout(strengthOf(last.home), strengthOf(last.away), deriveSeed(seed, comp, rounds.join('-'), tie.join('-')));
	const winner = pen.winner === 'home' ? last.home : last.away;
	return { tie, aggregate: [a, b], penalties: { home: pen.home, away: pen.away, kicks: pen.kicks }, winner, loser: winner === tie[0] ? tie[1] : tie[0], decidedBy: 'penaltis' };
}

/** Confrontos por índice técnico: melhor campanha × pior campanha; o melhor decide em casa. */
function seededTies(ranked: string[]): Tie[] {
	const out: Tie[] = [];
	for (let i = 0; i < ranked.length / 2; i++) out.push([ranked[ranked.length - 1 - i], ranked[i]]);
	return out;
}

/**
 * Define o que a próxima rodada precisa antes de ser jogada: quadrangulares e final da Série C,
 * chaves do mata-mata e playoffs da Série D. Retorna o estado (inalterado se nada mudou).
 */
export function prepareRound(league: LeagueState, round: number, results: StoredRoundResult[], careerSeed: number, strengthOf: StrengthOf): LeagueState {
	if (league.world !== 'brasil') return league;
	let next = league;
	const c = league.divisions['serie-c'];
	if (c?.length && (league.selection?.divisions.includes('serie-c') ?? true)) {
		const p1 = phaseOneLength(league, 'serie-c');
		if (!next.cGroups && round === p1 + 1) next = { ...next, cGroups: computeCGroups(next, results) };
		if (next.cGroups && !next.cFinal && round === p1 + 7) {
			const leaders = groupStandings(next, results).map((t) => t[0]);
			const [best, other] = [...leaders].sort((x, y) => y.points - x.points || y.won - x.won || y.goalDiff - x.goalDiff || y.goalsFor - x.goalsFor);
			next = { ...next, cFinal: [other.clubId, best.clubId] };
		}
	}
	const d = league.divisions['serie-d'];
	if (d?.length && (league.selection?.divisions.includes('serie-d') ?? true)) {
		const p1 = phaseOneLength(league, 'serie-d');
		const rule = effectiveRule(league, 'serie-d');
		const perGroup = rule.phase2?.kind === 'mata-mata' ? rule.phase2.qualifiersPerGroup : 4;
		if (!next.dBracket && round === p1 + 1) {
			const tables = phaseOneTables(next, 'serie-d', results);
			const seeds = rankCampaigns(tables.flatMap((t) => t.slice(0, perGroup))).map((r) => r.clubId);
			next = { ...next, dBracket: { seeds, stages: [seededTies(seeds)], playoff: null } };
		}
		const br = next.dBracket;
		if (br) {
			const k = br.stages.length; // próxima fase a sortear
			if (k < 6 && round === p1 + 2 * k + 1) {
				const prev = br.stages[k - 1];
				const winners = prev.map((t) => resolveTie(t, results, 'serie-d', [p1 + 2 * (k - 1) + 1, p1 + 2 * (k - 1) + 2], careerSeed, strengthOf)!.winner);
				const ranked = br.seeds.filter((s) => winners.includes(s));
				const stages = [...br.stages, seededTies(ranked)];
				let playoff = br.playoff;
				if (k === 4 && !playoff) {
					// Eliminados nas quartas: 1º × 4º e 2º × 3º por campanha (ida e volta).
					const losers = prev.map((t) => (winners.includes(t[0]) ? t[1] : t[0]));
					const r = br.seeds.filter((s) => losers.includes(s));
					playoff = [[r[3], r[0]], [r[2], r[1]]];
				}
				next = { ...next, dBracket: { ...br, stages, playoff } };
			}
		}
	}
	return next;
}

/** Quadrangulares da Série C a partir da 1ª fase. */
export function computeCGroups(league: LeagueState, results: StoredRoundResult[]): [string[], string[]] {
	const tables = phaseOneTables(league, 'serie-c', results);
	if (tables.length === 1) {
		const t = tables[0].map((r) => r.clubId);
		return [[t[0], t[3], t[4], t[7]], [t[1], t[2], t[5], t[6]]];
	}
	// Dois grupos (2028+, projeção): 1º e 4º de um com 2º e 3º do outro.
	const [g1, g2] = tables.map((t) => t.map((r) => r.clubId));
	return [[g1[0], g2[1], g1[2], g2[3]], [g2[0], g1[1], g2[2], g1[3]]];
}

/** Compatibilidade com a Dev 0.3. */
export function needsCGroups(league: LeagueState, round: number): boolean {
	const c = league.divisions['serie-c'];
	return league.world === 'brasil' && (league.selection?.divisions.includes('serie-c') ?? true) && !!c && !league.cGroups && round === phaseOneLength(league, 'serie-c') + 1;
}

// ─────────────────────────────────────────────────────────────── fim de temporada

export interface SeasonOutcome {
	next: LeagueState;
	moves: Array<{ clubId: string; from: DivisionId | 'estadual'; to: DivisionId | 'estadual'; reason: 'acesso' | 'rebaixamento' | 'estadual' }>;
	champions: Partial<Record<DivisionId, string>>;
	tables: Partial<Record<DivisionId, StandingRow[]>>;
	/** vices (finais) */
	runnersUp: Partial<Record<DivisionId, string>>;
}

/** Fecha a temporada: campeões, acessos, rebaixamentos, expansão e a próxima edição. */
export function closeSeason(league: LeagueState, results: StoredRoundResult[], careerSeed = 0, strengthOf: StrengthOf = () => 70): SeasonOutcome {
	const tables: SeasonOutcome['tables'] = {};
	const champions: SeasonOutcome['champions'] = {};
	const runnersUp: SeasonOutcome['runnersUp'] = {};
	const moves: SeasonOutcome['moves'] = [];
	if (league.world === 'brasfc') {
		const t = divisionStandings(league, LEAGUE.id, results);
		tables[LEAGUE.id] = t;
		champions[LEAGUE.id] = t[0]?.clubId;
		runnersUp[LEAGUE.id] = t[1]?.clubId;
		return { next: { ...league, season: league.season + 1, scheduleVersion: 3 }, moves, champions, tables, runnersUp };
	}
	const season = league.season;
	const up = (t: StandingRow[], n: number) => t.slice(0, n).map((r) => r.clubId);
	const down = (t: StandingRow[], n: number) => (n > 0 ? t.slice(t.length - n).map((r) => r.clubId) : []);
	const active = new Set(activeDivisions(league));
	// Nas divisões inativas, só resolve a ordem anual necessária aos acessos e quedas.
	// Usa metadados do clube, sem montar elencos, inventar placares ou registrar campeões.
	const projectedOrder = (div: BrasilDivision) => (league.divisions[div] ?? [])
		.map((id) => ({
			id,
			score: (getClub(id)?.reputation ?? 2) * 8 + createRng(deriveSeed(careerSeed, 'acessos', `${season}:${div}:${id}`)).int(0, 30)
		}))
		.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
		.map(({ id }) => id);
	const tail = (ids: string[], n: number) => n > 0 ? ids.slice(-n) : [];
	const A = league.divisions['serie-a'] ?? [];
	const B = league.divisions['serie-b'] ?? [];
	const C = league.divisions['serie-c'] ?? [];
	const D = league.divisions['serie-d'] ?? [];

	const a = divisionStandings(league, 'serie-a', results);
	const b = divisionStandings(league, 'serie-b', results);
	if (active.has('serie-a')) {
		tables['serie-a'] = a;
		champions['serie-a'] = a[0]?.clubId;
		runnersUp['serie-a'] = a[1]?.clubId;
	}
	if (active.has('serie-b')) {
		tables['serie-b'] = b;
		champions['serie-b'] = b[0]?.clubId;
		runnersUp['serie-b'] = b[1]?.clubId;
	}
	const ra = effectiveRule(league, 'serie-a');
	const rb = effectiveRule(league, 'serie-b');
	const rc = effectiveRule(league, 'serie-c');
	const passB = active.has('serie-b') ? [] : projectedOrder('serie-b');
	const aDown = active.has('serie-a') ? down(a, ra.relegated) : tail(projectedOrder('serie-a'), ra.relegated);
	const bUp = active.has('serie-b') ? up(b, rb.promoted) : passB.slice(0, rb.promoted);
	const bDown = active.has('serie-b') ? down(b, rb.relegated) : tail(passB, rb.relegated);

	// Série C: acesso pelos quadrangulares; queda pela 1ª fase (por grupo a partir de 2028).
	const cTables = phaseOneTables(league, 'serie-c', results);
	const cTable = cTables.length === 1 ? cTables[0] : rankCampaigns(cTables.flat());
	if (active.has('serie-c')) tables['serie-c'] = cTable;
	const passC = active.has('serie-c') ? [] : projectedOrder('serie-c');
	const quads = active.has('serie-c') ? groupStandings(league, results) : [];
	const cUp = active.has('serie-c') ? (quads.length === 2 ? quads.flatMap((q) => up(q, 2)) : up(cTable, rc.promoted)) : passC.slice(0, rc.promoted);
	if (active.has('serie-c') && league.cFinal) {
		const p1 = phaseOneLength(league, 'serie-c');
		const fin = resolveTie(league.cFinal, results, 'serie-c', [p1 + 7, p1 + 8], careerSeed, strengthOf);
		if (fin) {
			champions['serie-c'] = fin.winner;
			runnersUp['serie-c'] = fin.loser;
		}
	}
	if (active.has('serie-c')) {
		champions['serie-c'] ??= quads.length ? [quads[0][0], quads[1][0]].sort((x, y) => y.points - x.points || y.goalDiff - x.goalDiff)[0]?.clubId : cTable[0]?.clubId;
	}
	const cDown = active.has('serie-c')
		? (rc.relegatedPerGroup && cTables.length > 1 ? cTables.flatMap((t) => down(t, rc.relegatedPerGroup!)) : down(cTable, rc.relegated))
		: tail(passC, rc.relegated);

	// Série D: semifinalistas + vencedores dos playoffs sobem; piores campanhas voltam aos estaduais.
	let dUp: string[] = [];
	let dOut: string[] = [];
	const nextC = divisionRule('serie-c', season + 1).size;
	const stayingC = C.length - cUp.length - cDown.length + bDown.length;
	const neededFromD = nextC - stayingC;
	if (D.length && !active.has('serie-d')) {
		const ranking = projectedOrder('serie-d');
		dUp = ranking.slice(0, Math.max(0, neededFromD));
		dOut = tail(ranking.slice(dUp.length), effectiveRule(league, 'serie-d').backToState ?? 0);
	} else if (D.length) {
		const dTables = phaseOneTables(league, 'serie-d', results);
		const dRank = rankCampaigns(dTables.flat());
		tables['serie-d'] = dRank;
		const br = league.dBracket;
		const p1 = phaseOneLength(league, 'serie-d');
		if (br && br.stages.length >= 5) {
			dUp = [...br.stages[4].flat()];
			for (const t of br.playoff ?? []) {
				const o = resolveTie(t, results, 'serie-d', [p1 + 9, p1 + 10], careerSeed, strengthOf, { byCampaign: true });
				if (o) dUp.push(o.winner);
			}
			if (br.stages.length === 6) {
				const fin = resolveTie(br.stages[5][0], results, 'serie-d', [p1 + 11, p1 + 12], careerSeed, strengthOf);
				if (fin) {
					champions['serie-d'] = fin.winner;
					runnersUp['serie-d'] = fin.loser;
				}
			}
		}
		// Completa/limita pela conta da Série C da próxima edição (saves antigos ou temporada incompleta).
		const extra = dRank.map((r) => r.clubId).filter((id) => !dUp.includes(id));
		while (dUp.length < neededFromD && extra.length) dUp.push(extra.shift()!);
		dUp = dUp.slice(0, Math.max(0, neededFromD));
		const back = effectiveRule(league, 'serie-d').backToState ?? 0;
		dOut = dRank
			.map((r) => r.clubId)
			.filter((id) => !dUp.includes(id))
			.slice(-back);
	} else if (season === 2026 && neededFromD > 0) {
		// Save da Dev 0.3 sem Série D simulada: usa os acessos REAIS da Série D 2026.
		dUp = SERIE_D_2026.acessos.filter((id) => !A.includes(id) && !B.includes(id) && !C.includes(id)).slice(0, neededFromD);
	}
	if (!D.length && dUp.length < neededFromD) {
		// Sem Série D (save antigo, temporada > 2026): os clubes da base 2026 mais fortes completam.
		const pool = CLUBES_2026.filter((c) => c.serie === 'D' && ![...A, ...B, ...C, ...dUp].includes(c.id))
			.map((c) => c.id)
			.sort((x, y) => strengthOf(y) - strengthOf(x) || x.localeCompare(y));
		dUp.push(...pool.slice(0, neededFromD - dUp.length));
	}

	for (const id of aDown) moves.push({ clubId: id, from: 'serie-a', to: 'serie-b', reason: 'rebaixamento' });
	for (const id of bUp) moves.push({ clubId: id, from: 'serie-b', to: 'serie-a', reason: 'acesso' });
	for (const id of bDown) moves.push({ clubId: id, from: 'serie-b', to: 'serie-c', reason: 'rebaixamento' });
	for (const id of cUp) moves.push({ clubId: id, from: 'serie-c', to: 'serie-b', reason: 'acesso' });
	for (const id of cDown) moves.push({ clubId: id, from: 'serie-c', to: 'serie-d', reason: 'rebaixamento' });
	for (const id of dUp) moves.push({ clubId: id, from: D.includes(id) ? 'serie-d' : 'estadual', to: 'serie-c', reason: 'acesso' });
	for (const id of dOut) moves.push({ clubId: id, from: 'serie-d', to: 'estadual', reason: 'estadual' });

	const nextA = [...A.filter((id) => !aDown.includes(id)), ...bUp];
	const nextB = [...B.filter((id) => !bUp.includes(id) && !bDown.includes(id)), ...aDown, ...cUp];
	const nextCList = [...C.filter((id) => !cUp.includes(id) && !cDown.includes(id)), ...bDown, ...dUp];
	let nextD: string[] = [];
	let pool = [...(league.pool ?? CLUBES_2026.filter((c) => c.serie === 'E').map((c) => c.id))];
	if (D.length || season >= 2026) {
		const baseD = D.length ? D : CLUBES_2026.filter((c) => c.serie === 'D').map((c) => c.id).filter((id) => ![...nextA, ...nextB, ...nextCList].includes(id));
		nextD = [...baseD.filter((id) => !dUp.includes(id) && !dOut.includes(id)), ...cDown];
		const target = divisionRule('serie-d', season + 1).size;
		// Estaduais completam a Série D (fila: quem voltou aos estaduais entra no fim).
		while (nextD.length < target && pool.length) nextD.push(pool.shift()!);
		pool = [...pool, ...dOut];
		nextD = nextD.slice(0, target);
	}
	const nextRuleC = divisionRule('serie-c', season + 1);
	const next: LeagueState = {
		world: 'brasil',
		season: season + 1,
		scheduleVersion: 3,
		...(league.selection ? { selection: league.selection } : {}),
		divisions: { 'serie-a': nextA, 'serie-b': nextB, 'serie-c': nextCList, ...(nextD.length ? { 'serie-d': nextD } : {}) },
		groups: {
			...(nextRuleC.phase1.groups > 1 && nextCList.length === nextRuleC.size ? { 'serie-c': regionalGroups(nextCList, nextRuleC.phase1.groups) } : {}),
			...(nextD.length ? { 'serie-d': regionalGroups(nextD, 16) } : {})
		},
		cGroups: null,
		cFinal: null,
		dBracket: null,
		pool
	};
	return { next, moves, champions, tables, runnersUp };
}

// ─────────────────────────────────────────────────────────────── validação de saves

export function sanitizeLeague(input: unknown, world: World, season: number): LeagueState {
	const base = initialLeague(world, season);
	// Saves sem liga persistida também vinham da regra antiga.
	delete base.scheduleVersion;
	if (!input || typeof input !== 'object') return base;
	const raw = input as Partial<LeagueState>;
	if (raw.world !== world || typeof raw.season !== 'number' || !raw.divisions) return base;
	const known = new Set(world === 'brasil' ? CLUBES_2026.map((c) => c.id) : CLUBS.map((c) => c.id));
	const okList = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.every((id) => typeof id === 'string' && known.has(id));
	const divisions: LeagueState['divisions'] = {};
	for (const [d, ids] of Object.entries(raw.divisions)) {
		if (!okList(ids)) return base;
		divisions[d as DivisionId] = [...ids];
	}
	const groups: LeagueState['groups'] = {};
	for (const [d, gs] of Object.entries(raw.groups ?? {})) if (Array.isArray(gs) && gs.every(okList)) groups[d as DivisionId] = gs.map((g) => [...g]);
	const tie = (t: unknown): t is Tie => okList(t) && t.length === 2;
	const cGroups = Array.isArray(raw.cGroups) && raw.cGroups.length === 2 && raw.cGroups.every(okList) ? (raw.cGroups as [string[], string[]]) : null;
	const cFinal = tie(raw.cFinal) ? raw.cFinal : null;
	const br = raw.dBracket;
	const dBracket = br && okList(br.seeds) && Array.isArray(br.stages) && br.stages.every((s) => Array.isArray(s) && s.every(tie)) ? { seeds: [...br.seeds], stages: br.stages.map((s) => s.map((t) => [...t] as Tie)), playoff: Array.isArray(br.playoff) && br.playoff.every(tie) ? br.playoff : null } : null;
	const pool = okList(raw.pool) ? [...raw.pool] : base.pool;
	const scheduleVersion = raw.scheduleVersion === 2 || raw.scheduleVersion === 3 ? raw.scheduleVersion : undefined;
	const selection = validateLeagueSelection(world, raw.selection);
	return { world, season: raw.season, scheduleVersion, divisions, ...(selection ? { selection } : {}), ...(Object.keys(groups).length ? { groups } : {}), cGroups, cFinal, dBracket, ...(pool ? { pool } : {}) };
}

/** Clube aleatório (determinístico) — usado em testes de temporadas completas. */
export function pickClub(league: LeagueState, seed: number, div: DivisionId): string {
	const ids = league.divisions[div] ?? [];
	return createRng(seed).pick(ids);
}

/** Rodadas (domingos) em que cada fase da Série D acontece — usado pela interface. */
export function dStageRounds(league: LeagueState, stage: number): [number, number] {
	const p1 = phaseOneLength(league, 'serie-d');
	return [p1 + 2 * stage + 1, p1 + 2 * stage + 2];
}
export { D_STAGE_NAMES };
