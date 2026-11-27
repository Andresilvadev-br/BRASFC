import { EUROPE_2026, type EuropeEdition } from '#lib/data/world/2026/europe-2026-27.ts';
import type { CompetitionParticipation } from '#lib/world/contract.ts';
import { getClub } from './clubs.ts';
import { addDays, weekday } from './dates.ts';
import { resolveTie, type StoredRoundResult, type StrengthOf, type Tie, type TieOutcome } from './league.ts';
import { createRng, deriveSeed } from './rng.ts';
import { computeStandings, type Fixture, type StandingRow } from './season.ts';

/**
 * Copas europeias (World Database): Champions League e Europa League no formato desde 2024/25.
 *
 *  - Fase de liga com 36 clubes: 8 jogos contra 8 adversários diferentes, 4 em casa e 4 fora, numa
 *    classificação única. Do 1º ao 8º vão às oitavas; do 9º ao 24º jogam o playoff; os demais saem.
 *  - Playoff, oitavas, quartas e semifinal em ida e volta (empate no agregado → pênaltis); final em jogo
 *    único, em campo neutro.
 *  - Sorteio do BRASFC a partir dos potes reais: cada clube enfrenta, sempre que possível, dois de cada pote,
 *    sem rival do mesmo país e no máximo dois do mesmo país. A UEFA usa um software próprio; o resultado aqui
 *    é uma projeção determinística pela semente da carreira.
 *  - Chave fixa pela campanha: 1º × vencedor de 16º/17º, 2º × 15º/18º… e o mais bem colocado decide em casa.
 *  - Datas: terças (Champions) e quintas (Europa League) no padrão do calendário UEFA, fora das datas FIFA.
 */
export const UCL = 'continental/ucl';
export const UEL = 'continental/uel';
export type EuropeCompId = typeof UCL | typeof UEL;
export const EUROPE_COMPS: EuropeCompId[] = [UCL, UEL];
export const EUROPE_NAMES: Record<EuropeCompId, string> = { [UCL]: 'Champions League', [UEL]: 'Europa League' };
export const EUROPE_SHORT: Record<EuropeCompId, string> = { [UCL]: 'UCL', [UEL]: 'UEL' };

export const isEuropeComp = (id: string | undefined | null): id is EuropeCompId => id === UCL || id === UEL;

export const LEAGUE_MATCHDAYS = 8;
export const KO_STAGES = [
	{ name: 'Playoff', matchdays: [9, 10] },
	{ name: 'Oitavas de final', matchdays: [11, 12] },
	{ name: 'Quartas de final', matchdays: [13, 14] },
	{ name: 'Semifinal', matchdays: [15, 16] },
	{ name: 'Final', matchdays: [17], neutral: true }
] as const;
export const EUROPE_MATCHDAYS = 17;

/**
 * Premiação por fase disputada, na escala de dinheiro do jogo (R$, a mesma das ligas): estimativa do BRASFC
 * proporcional aos valores da UEFA, paga na estreia de cada fase (a da final vale para os dois finalistas).
 */
export const EUROPE_PRIZES: Record<EuropeCompId, { liga: number; stages: number[] }> = {
	'continental/ucl': { liga: 40_000_000, stages: [6_000_000, 12_000_000, 18_000_000, 24_000_000, 30_000_000] },
	'continental/uel': { liga: 15_000_000, stages: [2_000_000, 4_000_000, 6_000_000, 9_000_000, 12_000_000] }
};

/** Prêmio da estreia numa fase (0 se a rodada não abre fase). */
export function europePrize(comp: EuropeCompId, matchday: number): number {
	const p = EUROPE_PRIZES[comp];
	if (matchday === 1) return p.liga;
	const stage = KO_STAGES.findIndex((s) => s.matchdays[0] === matchday);
	return stage < 0 ? 0 : p.stages[stage];
}

export interface EuropeComp {
	id: EuropeCompId;
	edition: 'oficial' | 'projetada';
	/** potes do sorteio (9 clubes cada) */
	pots: string[][];
	/** clube que ocupa a vaga de um clube real ausente do banco → nome do clube real */
	substitutes: Record<string, string>;
	/** fase de liga: 8 rodadas de [mandante, visitante] */
	league: Tie[][];
	/** mata-mata já definido: 0 playoff, 1 oitavas, 2 quartas, 3 semifinal, 4 final. Ida e volta: [manda a ida, manda a volta] */
	stages: Tie[][];
	/** pênaltis gravados no passo do último jogo de cada confronto */
	shootouts?: Record<string, [number, number]>;
}

export interface EuropeState {
	season: number;
	comps: EuropeComp[];
}

// ─────────────────────────────────────────────────────────────── calendário

const WEEKS: Array<[number, number]> = [[9, 16], [9, 30], [10, 21], [11, 4], [11, 25], [12, 9], [1, 20], [1, 27], [2, 17], [2, 24], [3, 10], [3, 17], [4, 7], [4, 14], [4, 28], [5, 5]];
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const onOrAfter = (date: string, day: number) => addDays(date, (day - weekday(date) + 7) % 7);

/** Data de uma rodada europeia (1–8 fase de liga, 9–16 mata-mata, 17 final). */
export function europeDate(comp: EuropeCompId, season: number, matchday: number): string {
	if (matchday >= EUROPE_MATCHDAYS) return comp === UCL ? onOrAfter(iso(season + 1, 5, 29), 6) : onOrAfter(iso(season + 1, 5, 19), 3);
	const [m, d] = WEEKS[matchday - 1];
	const wednesday = onOrAfter(iso(m >= 7 ? season : season + 1, m, d), 3);
	return addDays(wednesday, comp === UCL ? -1 : 1);
}

export function europeStageName(matchday: number): string {
	if (matchday <= LEAGUE_MATCHDAYS) return `Fase de liga · ${matchday}ª rodada`;
	return KO_STAGES.find((s) => (s.matchdays as readonly number[]).includes(matchday))!.name;
}

// ─────────────────────────────────────────────────────────────── sorteio da fase de liga

const countryOf = (id: string) => id.split('/')[1] ?? id;

/** Quanto o sorteio foge da regra: potes desequilibrados, rival do mesmo país, mais de dois do mesmo país, adversário repetido. */
function drawScore(rounds: number[][][], pot: number[], country: number[], countries: number): number {
	const n = pot.length;
	const pc = new Int16Array(n * 4);
	const cc = new Int16Array(n * countries);
	const meet = new Int16Array(n * n);
	let score = 0;
	for (const round of rounds) for (const [a, b] of round) {
		if (country[a] === country[b]) score += 40;
		if (meet[a * n + b]++) score += 100;
		meet[b * n + a]++;
		pc[a * 4 + pot[b]]++;
		pc[b * 4 + pot[a]]++;
		cc[a * countries + country[b]]++;
		cc[b * countries + country[a]]++;
	}
	for (let i = 0; i < pc.length; i++) score += Math.abs(pc[i] - 2);
	for (let i = 0; i < cc.length; i++) if (cc[i] > 2) score += 10 * (cc[i] - 2);
	return score;
}

/** Mando: orientação euleriana do grafo 8-regular, que dá exatamente 4 jogos em casa e 4 fora a cada clube. */
function orient(rounds: Tie[][]): Tie[][] {
	const edges = rounds.flatMap((round, r) => round.map(([a, b]) => ({ a, b, r })));
	const adj = new Map<string, number[]>();
	edges.forEach((e, i) => {
		adj.set(e.a, [...(adj.get(e.a) ?? []), i]);
		adj.set(e.b, [...(adj.get(e.b) ?? []), i]);
	});
	const used = new Array<boolean>(edges.length).fill(false);
	const pointer = new Map<string, number>();
	const home = new Array<string>(edges.length);
	for (const start of adj.keys()) {
		const stack = [start];
		while (stack.length) {
			const v = stack.at(-1)!;
			const list = adj.get(v)!;
			let p = pointer.get(v) ?? 0;
			while (p < list.length && used[list[p]]) p++;
			pointer.set(v, p);
			if (p === list.length) {
				stack.pop();
				continue;
			}
			const i = list[p];
			used[i] = true;
			home[i] = v;
			stack.push(edges[i].a === v ? edges[i].b : edges[i].a);
		}
	}
	const out: Tie[][] = rounds.map(() => []);
	edges.forEach((e, i) => out[e.r].push(home[i] === e.a ? [e.a, e.b] : [e.b, e.a]));
	return out;
}

/**
 * Oito rodadas completas (cada clube joga uma vez por rodada) por busca local: troca de parceiros dentro de
 * uma rodada até cada clube ter dois adversários de cada pote, sem repetir adversário nem país proibido.
 */
export function drawLeaguePhase(pots: string[][], seed: number): Tie[][] {
	const teams = pots.flat();
	const n = teams.length;
	const pot = teams.map((id) => pots.findIndex((p) => p.includes(id)));
	const names = [...new Set(teams.map(countryOf))];
	const country = teams.map((id) => names.indexOf(countryOf(id)));
	let best: { rounds: number[][][]; score: number } | null = null;
	for (let attempt = 0; attempt < 6 && best?.score !== 0; attempt++) {
		const rng = createRng(deriveSeed(seed, 'sorteio-europa', attempt));
		const rounds = Array.from({ length: LEAGUE_MATCHDAYS }, () => {
			const order = rng.shuffle([...Array(n).keys()]);
			return Array.from({ length: n / 2 }, (_, k) => [order[2 * k], order[2 * k + 1]]);
		});
		let score = drawScore(rounds, pot, country, names.length);
		for (let it = 0; it < 40_000 && score > 0; it++) {
			const round = rounds[rng.int(0, LEAGUE_MATCHDAYS - 1)];
			const i = rng.int(0, round.length - 1);
			const j = rng.int(0, round.length - 1);
			if (i === j) continue;
			const [a, b] = round[i];
			const [c, d] = round[j];
			const swap = rng.chance(0.5);
			round[i] = swap ? [a, c] : [a, d];
			round[j] = swap ? [b, d] : [b, c];
			const s = drawScore(rounds, pot, country, names.length);
			if (s <= score) score = s;
			else {
				round[i] = [a, b];
				round[j] = [c, d];
			}
		}
		if (!best || score < best.score) best = { rounds: rounds.map((r) => r.map((p) => [...p])), score };
	}
	return orient(best!.rounds.map((r) => r.map(([a, b]) => [teams[a], teams[b]] as Tie)));
}

// ─────────────────────────────────────────────────────────────── edição

const prefixed = (id: string) => (id.startsWith('world/') ? id : `world/${id}`);

function compFromEdition(e: EuropeEdition, season: number, seed: number): EuropeComp {
	const pots = e.pots.map((p) => p.map(prefixed));
	return {
		id: e.id, edition: 'oficial', pots,
		substitutes: Object.fromEntries(Object.entries(e.substitutes).map(([id, name]) => [prefixed(id), name])),
		league: drawLeaguePhase(pots, deriveSeed(seed, 'europa', e.id, season)), stages: []
	};
}

/** Clubes de todas as edições oficiais (para levar os elencos no save). */
export function europeClubIds(state: EuropeState | null | undefined = null): string[] {
	const comps = state?.comps ?? EUROPE_2026.map((e) => ({ pots: e.pots.map((p) => p.map(prefixed)) }));
	return [...new Set(comps.flatMap((c) => c.pots.flat()))];
}

/** Edição 2026/27: participantes reais. Outras temporadas iniciais não têm lista conferida. */
export function initialEurope(season: number, seed: number): EuropeState | null {
	if (season !== 2026) return null;
	return { season, comps: EUROPE_2026.map((e) => compFromEdition(e, season, seed)) };
}

/**
 * Próxima edição (projeção do BRASFC): cada país com liga jogável na carreira manda à Champions e à Europa
 * League a mesma quantidade de clubes da edição anterior, pela ordem da tabela final. Os clubes de países
 * sem liga simulada continuam (não há tabela deles para substituí-los). Potes pela força dos elencos.
 */
export function projectEurope(prev: EuropeState, finalTables: Record<string, Array<{ clubId: string }>>, season: number, seed: number, strengthOf: StrengthOf): EuropeState {
	const ucl = prev.comps.find((c) => c.id === UCL);
	const uel = prev.comps.find((c) => c.id === UEL);
	const entries = new Map<EuropeCompId, string[]>([[UCL, ucl?.pots.flat() ?? []], [UEL, uel?.pots.flat() ?? []]]);
	for (const [div, table] of Object.entries(finalTables)) {
		const m = /^league\/([a-z]{3})\/1$/.exec(div);
		if (!m || !table.length) continue;
		const country = m[1];
		const ranked = table.map((r) => r.clubId);
		let cursor = 0;
		for (const id of EUROPE_COMPS) {
			const list = entries.get(id)!;
			const slots = list.filter((c) => countryOf(c) === country).length;
			const kept = list.filter((c) => countryOf(c) !== country);
			entries.set(id, [...kept, ...ranked.slice(cursor, cursor + slots)]);
			cursor += slots;
		}
	}
	const comps: EuropeComp[] = [];
	const taken = new Set<string>();
	for (const id of EUROPE_COMPS) {
		const before = prev.comps.find((c) => c.id === id);
		const clubs = [...new Set(entries.get(id)!)].filter((c) => !taken.has(c));
		clubs.forEach((c) => taken.add(c));
		if (clubs.length !== 36) continue; // edição incompleta: a copa fica fora em vez de ser completada com inventados
		const ordered = [...clubs].sort((a, b) => strengthOf(b) - strengthOf(a) || a.localeCompare(b));
		const pots = [0, 1, 2, 3].map((p) => ordered.slice(p * 9, p * 9 + 9));
		const substitutes = Object.fromEntries(Object.entries(before?.substitutes ?? {}).filter(([c]) => clubs.includes(c)));
		comps.push({ id, edition: 'projetada', pots, substitutes, league: drawLeaguePhase(pots, deriveSeed(seed, 'europa', id, season)), stages: [] });
	}
	return { season, comps };
}

// ─────────────────────────────────────────────────────────────── jogos e tabela

const leagueResults = (comp: EuropeComp, results: StoredRoundResult[]) => results.filter((r) => r.competition === comp.id && r.round <= LEAGUE_MATCHDAYS);

/** Classificação da fase de liga: pontos, saldo, gols, gols fora, vitórias, vitórias fora. */
export function europeTable(comp: EuropeComp, results: StoredRoundResult[]): Array<StandingRow & { awayGoals: number; awayWins: number }> {
	const games = leagueResults(comp, results);
	const extra = new Map<string, { awayGoals: number; awayWins: number }>();
	for (const g of games) {
		const e = extra.get(g.away) ?? { awayGoals: 0, awayWins: 0 };
		e.awayGoals += g.awayGoals;
		if (g.awayGoals > g.homeGoals) e.awayWins++;
		extra.set(g.away, e);
	}
	const name = (id: string) => getClub(id)?.name ?? id;
	return computeStandings(comp.pots.flat(), games)
		.map((r) => ({ ...r, ...(extra.get(r.clubId) ?? { awayGoals: 0, awayWins: 0 }) }))
		.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || b.awayGoals - a.awayGoals || b.won - a.won || b.awayWins - a.awayWins || name(a.clubId).localeCompare(name(b.clubId), 'pt-BR'))
		.map((r, i) => ({ ...r, position: i + 1 }));
}

const leagueDone = (comp: EuropeComp, results: StoredRoundResult[]) => leagueResults(comp, results).length === comp.league.flat().length;

const shootoutKey = (stage: number, tie: Tie) => `${stage}:${tie[0]}:${tie[1]}`;

export function europeTieOutcome(comp: EuropeComp, stage: number, tie: Tie, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf): TieOutcome | null {
	const matchdays = [...KO_STAGES[stage].matchdays];
	const saved = comp.shootouts?.[shootoutKey(stage, tie)];
	if (!saved) return resolveTie(tie, results, comp.id, matchdays, deriveSeed(seed, 'europa', comp.id), strengthOf);
	const aggregate = resolveTie(tie, results, comp.id, matchdays, 0, strengthOf, { byCampaign: true });
	if (!aggregate || aggregate.decidedBy !== 'campanha') return aggregate;
	const [home, away] = saved;
	const [lastHome, lastAway] = matchdays.length === 1 ? tie : [tie[1], tie[0]];
	const [winner, loser] = home > away ? [lastHome, lastAway] : [lastAway, lastHome];
	return { ...aggregate, winner, loser, penalties: { home, away }, decidedBy: 'penaltis' };
}

function stageWinners(comp: EuropeComp, stage: number, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf): string[] | null {
	const ties = comp.stages[stage];
	if (!ties) return null;
	const out: string[] = [];
	for (const tie of ties) {
		const o = europeTieOutcome(comp, stage, tie, results, seed, strengthOf);
		if (!o) return null;
		out.push(o.winner);
	}
	return out;
}

/** Monta as fases de mata-mata assim que a anterior termina (determinístico: tabela + resultados). */
export function prepareEuropeComp(comp: EuropeComp, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf): EuropeComp {
	if (!leagueDone(comp, results)) return comp;
	const table = europeTable(comp, results).map((r) => r.clubId);
	const rank = (id: string) => table.indexOf(id);
	const hostsSecond = (a: string, b: string): Tie => (rank(a) < rank(b) ? [b, a] : [a, b]);
	let next = comp;
	while (next.stages.length < KO_STAGES.length) {
		const stage = next.stages.length;
		let ties: Tie[];
		if (stage === 0) {
			ties = [];
			for (let i = 9; i <= 16; i++) ties.push([table[33 - i - 1], table[i - 1]]);
		} else {
			const winners = stageWinners(next, stage - 1, results, seed, strengthOf);
			if (!winners) break;
			if (stage === 1) {
				ties = [1, 8, 4, 5, 2, 7, 3, 6].map((s) => [winners[17 - s - 9], table[s - 1]] as Tie);
			} else {
				ties = [];
				for (let k = 0; k + 1 < winners.length; k += 2) {
					const [a, b] = [winners[k], winners[k + 1]];
					ties.push(stage === KO_STAGES.length - 1 ? (rank(a) < rank(b) ? [a, b] : [b, a]) : hostsSecond(a, b));
				}
			}
		}
		next = { ...next, stages: [...next.stages, ties] };
	}
	return next;
}

export function prepareEurope(state: EuropeState, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf): EuropeState {
	const comps = state.comps.map((c) => prepareEuropeComp(c, results, seed, strengthOf));
	return comps.every((c, i) => c === state.comps[i]) ? state : { ...state, comps };
}

/** Grava os pênaltis no passo do último jogo de cada confronto (mudanças nos elencos não mudam o vencedor). */
export function settleEuropeMatchday(state: EuropeState, compId: string, matchday: number, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf): EuropeState {
	const stage = KO_STAGES.findIndex((s) => (s.matchdays as readonly number[]).at(-1) === matchday);
	if (stage < 0) return state;
	return {
		...state,
		comps: state.comps.map((comp) => {
			if (comp.id !== compId) return comp;
			const shootouts = { ...comp.shootouts };
			for (const tie of comp.stages[stage] ?? []) {
				const o = europeTieOutcome(comp, stage, tie, results, seed, strengthOf);
				if (o?.penalties) shootouts[shootoutKey(stage, tie)] = [o.penalties.home, o.penalties.away];
			}
			return Object.keys(shootouts).length ? { ...comp, shootouts } : comp;
		})
	};
}

const TIMES = ['21:00', '18:45', '21:00'];

export function europeFixtures(state: EuropeState): Fixture[] {
	const out: Fixture[] = [];
	for (const comp of state.comps) {
		comp.league.forEach((round, r) => round.forEach(([home, away], k) => {
			out.push({ round: r + 1, date: europeDate(comp.id, state.season, r + 1), time: TIMES[k % 3], home, away, competition: comp.id, phase: 'Fase de liga' });
		}));
		comp.stages.forEach((ties, s) => {
			const stage = KO_STAGES[s];
			ties.forEach(([a, b], k) => {
				const time = TIMES[k % 2];
				out.push({ round: stage.matchdays[0], date: europeDate(comp.id, state.season, stage.matchdays[0]), time: s === 4 ? '21:00' : time, home: a, away: b, competition: comp.id, phase: stage.name, ...('neutral' in stage ? { neutral: true } : {}) } as Fixture);
				if (stage.matchdays.length === 2) out.push({ round: stage.matchdays[1], date: europeDate(comp.id, state.season, stage.matchdays[1]), time, home: b, away: a, competition: comp.id, phase: stage.name });
			});
		});
	}
	return out;
}

/** Rodadas europeias que existem nesta temporada: a fase de liga inteira e o mata-mata até a final. */
export function europeMatchdays(state: EuropeState): Array<{ competition: EuropeCompId; matchday: number; date: string }> {
	return state.comps.flatMap((c) => Array.from({ length: EUROPE_MATCHDAYS }, (_, i) => ({ competition: c.id, matchday: i + 1, date: europeDate(c.id, state.season, i + 1) })));
}

// ─────────────────────────────────────────────────────────────── visão

export interface EuropeCompView {
	id: EuropeCompId;
	name: string;
	edition: 'oficial' | 'projetada';
	substitutes: Record<string, string>;
	pots: string[][];
	table: ReturnType<typeof europeTable>;
	leagueDone: boolean;
	stages: Array<{ name: string; ties: Array<{ tie: Tie; outcome: TieOutcome | null; legs: Array<StoredRoundResult | null> }> }>;
	champion: string | null;
	runnerUp: string | null;
}

export function europeView(state: EuropeState, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf): EuropeCompView[] {
	return state.comps.map((comp) => {
		const stages = KO_STAGES.map((stage, s) => ({
			name: stage.name,
			ties: (comp.stages[s] ?? []).map((tie) => ({
				tie,
				outcome: europeTieOutcome(comp, s, tie, results, seed, strengthOf),
				legs: stage.matchdays.map((md, li) => {
					const [h, a] = li === 0 ? tie : [tie[1], tie[0]];
					return results.find((r) => r.competition === comp.id && r.round === md && r.home === h && r.away === a) ?? null;
				})
			}))
		}));
		const final = stages[4].ties[0]?.outcome ?? null;
		return {
			id: comp.id, name: EUROPE_NAMES[comp.id], edition: comp.edition, substitutes: comp.substitutes, pots: comp.pots,
			table: europeTable(comp, results), leagueDone: leagueDone(comp, results), stages,
			champion: final?.winner ?? null, runnerUp: final?.loser ?? null
		};
	});
}

/** Situação do clube em cada copa europeia em que está inscrito. */
export function europeParticipation(state: EuropeState, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf, clubId: string): CompetitionParticipation[] {
	const out: CompetitionParticipation[] = [];
	for (const comp of state.comps) {
		if (!comp.pots.some((p) => p.includes(clubId))) continue;
		const base = { competition: comp.id, club: clubId };
		const mine = (md: number) => results.some((r) => r.competition === comp.id && r.round === md && (r.home === clubId || r.away === clubId));
		const played = [...Array(LEAGUE_MATCHDAYS).keys()].filter((i) => mine(i + 1)).length;
		if (!leagueDone(comp, results)) {
			out.push({ ...base, status: played ? 'em-disputa' : 'aguardando-estreia', stage: 'Fase de liga', nextDate: europeDate(comp.id, state.season, played + 1) });
			continue;
		}
		const position = europeTable(comp, results).findIndex((r) => r.clubId === clubId) + 1;
		const index = comp.stages.findLastIndex((ties) => ties.some((t) => t.includes(clubId)));
		if (index < 0) {
			out.push(position > 24
				? { ...base, status: 'eliminado', stage: 'Fase de liga', nextDate: null, eliminatedStage: `Fase de liga (${position}º)` }
				: { ...base, status: 'classificado', stage: position <= 8 ? 'Oitavas de final' : 'Playoff', nextDate: europeDate(comp.id, state.season, position <= 8 ? 11 : 9) });
			continue;
		}
		const stage = KO_STAGES[index];
		const tie = comp.stages[index].find((t) => t.includes(clubId))!;
		const o = europeTieOutcome(comp, index, tie, results, seed, strengthOf);
		if (o?.loser === clubId) out.push({ ...base, status: 'eliminado', stage: stage.name, nextDate: null, eliminatedStage: stage.name, eliminatedBy: o.winner });
		else if (o?.winner === clubId && index === KO_STAGES.length - 1) out.push({ ...base, status: 'campeao', stage: stage.name, nextDate: null });
		else if (o?.winner === clubId) out.push({ ...base, status: 'classificado', stage: KO_STAGES[index + 1].name, nextDate: europeDate(comp.id, state.season, KO_STAGES[index + 1].matchdays[0]) });
		else {
			const done = stage.matchdays.filter((md) => mine(md)).length;
			out.push({ ...base, status: done ? 'em-disputa' : 'classificado', stage: stage.name, nextDate: europeDate(comp.id, state.season, stage.matchdays[done] ?? stage.matchdays[0]) });
		}
	}
	return out;
}

// ─────────────────────────────────────────────────────────────── save

const TIE = (v: unknown): v is Tie => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'string' && x.startsWith('world/'));

export function sanitizeEurope(input: unknown): EuropeState | null {
	if (!input || typeof input !== 'object') return null;
	const raw = input as Partial<EuropeState>;
	if (typeof raw.season !== 'number' || !Array.isArray(raw.comps)) return null;
	const comps: EuropeComp[] = [];
	for (const c of raw.comps as Array<Partial<EuropeComp>>) {
		if (!c || !isEuropeComp(c.id) || comps.some((x) => x.id === c.id)) return null;
		const pots = c.pots;
		if (!Array.isArray(pots) || pots.length !== 4 || !pots.every((p) => Array.isArray(p) && p.length === 9 && p.every((id) => typeof id === 'string' && id.startsWith('world/')))) return null;
		const clubs = new Set(pots.flat());
		if (clubs.size !== 36) return null;
		const okRound = (round: unknown) => Array.isArray(round) && round.every((t) => TIE(t) && clubs.has(t[0]) && clubs.has(t[1]));
		if (!Array.isArray(c.league) || c.league.length !== LEAGUE_MATCHDAYS || !c.league.every(okRound)) return null;
		if (!Array.isArray(c.stages) || c.stages.length > KO_STAGES.length || !c.stages.every(okRound)) return null;
		const shootouts: Record<string, [number, number]> = {};
		for (const [key, score] of Object.entries(c.shootouts ?? {})) {
			if (Array.isArray(score) && score.length === 2 && score.every((n) => Number.isInteger(n) && n >= 0 && n <= 36) && score[0] !== score[1]) shootouts[key] = [score[0], score[1]];
		}
		const substitutes = Object.fromEntries(Object.entries(c.substitutes ?? {}).filter(([id, name]) => clubs.has(id) && typeof name === 'string').map(([id, name]) => [id, String(name).slice(0, 60)]));
		comps.push({
			id: c.id, edition: c.edition === 'projetada' ? 'projetada' : 'oficial', pots: pots.map((p) => [...p]), substitutes,
			league: c.league.map((r) => r.map((t) => [t[0], t[1]] as Tie)), stages: c.stages.map((r) => r.map((t) => [t[0], t[1]] as Tie)),
			...(Object.keys(shootouts).length ? { shootouts } : {})
		});
	}
	return { season: raw.season, comps };
}
