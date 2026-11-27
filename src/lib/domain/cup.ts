import { COPA_2026 } from '#lib/data/brasil.ts';
import { addDays } from './dates.ts';
import { resolveTie, roundDate, type LeagueState, type StoredRoundResult, type StrengthOf, type Tie, type TieOutcome } from './league.ts';
import { createRng, deriveSeed } from './rng.ts';
import type { Fixture } from './season.ts';
import type { CompetitionParticipation } from '#lib/world/contract.ts';

/**
 * Copa do Brasil (Dev 0.4) — 126 clubes, nove fases (regulamento 2026, ver docs/DADOS.md):
 *  - fases 1 a 4 em jogo único (empate → pênaltis);
 *  - 5ª fase, oitavas, quartas e semifinal em ida e volta (empate no agregado → pênaltis; sem gol fora);
 *  - final em jogo único, em campo neutro.
 * Entradas: 28 na 1ª fase, 74 na 2ª, 4 na 3ª e os 20 da Série A na 5ª.
 *
 * Datas: quartas-feiras entre as rodadas do BRASFC (calendário compactado — a liga do jogo tem uma
 * rodada por semana). Sorteios são determinísticos pela semente da carreira (o regulamento usa potes
 * pelo ranking da CBF; o BRASFC sorteia sem potes — projeção documentada).
 */
export const CUP_ID = 'copa-do-brasil';
export const CUP_NAME = 'Copa do Brasil';

export interface CupPhase {
	phase: number;
	name: string;
	legs: 1 | 2;
	/** índices de "data de Copa" (1–13) */
	matchdays: number[];
	neutral?: boolean;
	/** premiação por clube que disputa a fase (R$) — valores de referência, ver CUP_PRIZE_SOURCE */
	prize: number;
}

export const CUP_PHASES: CupPhase[] = [
	{ phase: 1, name: '1ª fase', legs: 1, matchdays: [1], prize: 750_000 },
	{ phase: 2, name: '2ª fase', legs: 1, matchdays: [2], prize: 830_000 },
	{ phase: 3, name: '3ª fase', legs: 1, matchdays: [3], prize: 950_000 },
	{ phase: 4, name: '4ª fase', legs: 1, matchdays: [4], prize: 1_070_000 },
	{ phase: 5, name: '5ª fase', legs: 2, matchdays: [5, 6], prize: 2_000_000 },
	{ phase: 6, name: 'Oitavas de final', legs: 2, matchdays: [7, 8], prize: 3_000_000 },
	{ phase: 7, name: 'Quartas de final', legs: 2, matchdays: [9, 10], prize: 4_000_000 },
	{ phase: 8, name: 'Semifinal', legs: 2, matchdays: [11, 12], prize: 9_000_000 },
	{ phase: 9, name: 'Final', legs: 1, matchdays: [13], neutral: true, prize: 0 }
];
/** Campeão e vice (além das fases). */
export const CUP_FINAL_PRIZE = { champion: 78_000_000, runnerUp: 34_000_000 };
export const CUP_PRIZE_SOURCE =
	'Premiação de referência: tabela da página "2026 Copa do Brasil" (Wikipédia, inglês), não conferida no regulamento; 1ª fase sem valor publicado — estimativa do BRASFC.';

/** Após qual rodada de domingo acontece cada data da Copa (quarta-feira seguinte). */
export const CUP_AFTER_ROUND = [3, 5, 7, 9, 13, 16, 21, 23, 26, 28, 31, 33, 36];

export function cupDate(season: number, matchday: number): string {
	return addDays(roundDate(season, CUP_AFTER_ROUND[matchday - 1]), 3);
}

export function phaseOfMatchday(matchday: number): CupPhase {
	return CUP_PHASES.find((p) => p.matchdays.includes(matchday))!;
}

export interface CupState {
	season: number;
	edition: 'oficial' | 'projetada';
	/** clubes que entram em cada fase */
	entrants: Record<'1' | '2' | '3' | '5', string[]>;
	/** confrontos sorteados por fase (índice = fase − 1). Jogo único: [mandante, visitante]; ida e volta: [manda a ida, manda a volta] */
	stages: Tie[][];
	/** Placar dos pênaltis na ordem de mando do último jogo de cada confronto. */
	shootouts?: Record<string, [number, number]>;
	/** sede da final (texto) */
	finalVenue: string;
}

export function cupMatchCount(cup: CupState): number {
	const entrants = Object.values(cup.entrants).reduce((sum, clubs) => sum + clubs.length, 0);
	const extraLegs = CUP_PHASES.filter((phase) => phase.legs === 2).reduce((sum, phase) => sum + 2 ** (CUP_PHASES.length - phase.phase), 0);
	return Math.max(0, entrants - 1) + extraLegs;
}

/** Edição 2026: participantes reais (Wikipédia/CBF). */
export function initialCup(season: number): CupState {
	const by = (f: number) => COPA_2026.participantes.filter((p) => p.fase === f).map((p) => p.clube);
	return { season, edition: 'oficial', entrants: { '1': by(1), '2': by(2), '3': by(3), '5': by(5) }, stages: [], finalVenue: season === 2026 ? 'Estádio Nacional Mané Garrincha, Brasília' : 'Campo neutro' };
}

/**
 * Edições seguintes (projeção do BRASFC): os 20 da Série A entram na 5ª fase; campeões e vices da
 * Série C e da Série D anterior na 3ª (no lugar de Copa Verde/Nordeste, não simuladas); Série B,
 * Série C e as melhores campanhas da Série D na 2ª; os demais da Série D na 1ª.
 */
export function projectedCup(league: LeagueState, previous: { cChampion?: string; cRunnerUp?: string; dChampion?: string; dRunnerUp?: string; dRanking?: string[]; cRanking?: string[]; regionalRankings?: string[][] }): CupState {
	const A = league.divisions['serie-a'] ?? [];
	const B = league.divisions['serie-b'] ?? [];
	const C = league.divisions['serie-c'] ?? [];
	const D = league.divisions['serie-d'] ?? [];
	const used = new Set(A);
	const third: string[] = [];
	const choose = (ranking: Array<string | undefined>) => {
		const club = ranking.find((id): id is string => !!id && !used.has(id));
		if (club) {
			third.push(club);
			used.add(club);
		}
	};
	const regional2027 = league.season === 2027 && previous.regionalRankings?.length === 4;
	if (regional2027) {
		previous.regionalRankings!.forEach(choose);
		choose([previous.cChampion, previous.cRunnerUp, ...(previous.cRanking ?? [])]);
		choose([previous.dChampion, previous.dRunnerUp, ...(previous.dRanking ?? [])]);
	} else {
		for (const id of [previous.cChampion, previous.dChampion, previous.cRunnerUp, previous.dRunnerUp]) choose([id]);
	}
	const rankedD = (previous.dRanking ?? []).filter((id) => D.includes(id));
	const fill = [...new Set([...B, ...C, ...rankedD, ...D])];
	const count = regional2027 ? 6 : 4;
	while (third.length < count && fill.some((id) => !used.has(id))) choose(fill);
	const rest = fill.filter((id) => !used.has(id));
	// Com seis entradas na 3ª fase, 36 + 66 mantém as 102 vagas iniciais e a chave de 32 na 5ª fase.
	const roundTwo = regional2027 ? 66 : 74;
	return { season: league.season, edition: 'projetada', entrants: { '1': rest.slice(roundTwo, 102), '2': rest.slice(0, roundTwo), '3': third, '5': [...A] }, stages: [], finalVenue: 'Campo neutro' };
}

/** Partidas da Copa já sorteadas. */
export function cupFixtures(cup: CupState): Fixture[] {
	const out: Fixture[] = [];
	cup.stages.forEach((ties, i) => {
		const ph = CUP_PHASES[i];
		ties.forEach(([a, b], k) => {
			const time = k % 3 === 0 ? '21:30' : k % 3 === 1 ? '19:00' : '20:00';
			out.push({ round: ph.matchdays[0], date: cupDate(cup.season, ph.matchdays[0]), time, home: a, away: b, competition: CUP_ID, phase: ph.name, ...(ph.neutral ? { neutral: true } : {}) } as Fixture);
			if (ph.legs === 2) out.push({ round: ph.matchdays[1], date: cupDate(cup.season, ph.matchdays[1]), time, home: b, away: a, competition: CUP_ID, phase: ph.name } as Fixture);
		});
	});
	return out;
}

export function tieOutcome(cup: CupState, phaseIndex: number, tie: Tie, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf): TieOutcome | null {
	const ph = CUP_PHASES[phaseIndex];
	const saved = cup.shootouts?.[shootoutKey(ph, tie)];
	if (!saved) return resolveTie(tie, results, CUP_ID, ph.matchdays, deriveSeed(seed, 'copa', cup.season), strengthOf);
	const aggregate = resolveTie(tie, results, CUP_ID, ph.matchdays, 0, strengthOf, { byCampaign: true });
	if (!aggregate || aggregate.decidedBy !== 'campanha') return aggregate;
	const [home, away] = saved;
	const [lastHome, lastAway] = ph.legs === 1 ? tie : [tie[1], tie[0]];
	const [winner, loser] = home > away ? [lastHome, lastAway] : [lastAway, lastHome];
	return { ...aggregate, winner, loser, penalties: { home, away }, decidedBy: 'penaltis' };
}

const shootoutKey = (phase: CupPhase, tie: Tie) => `${phase.phase}:${tie[0]}:${tie[1]}`;

/** Grava os pênaltis no mesmo passo que os resultados. Mudanças nos elencos não mudam a classificação. */
export function settleCupMatchday(cup: CupState, matchday: number, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf): CupState {
	const phase = phaseOfMatchday(matchday);
	if (matchday !== phase.matchdays.at(-1)) return cup;
	const shootouts = { ...cup.shootouts };
	for (const tie of cup.stages[phase.phase - 1] ?? []) {
		const outcome = tieOutcome(cup, phase.phase - 1, tie, results, seed, strengthOf);
		if (outcome?.penalties) shootouts[shootoutKey(phase, tie)] = [outcome.penalties.home, outcome.penalties.away];
	}
	return Object.keys(shootouts).length ? { ...cup, shootouts } : cup;
}

/** Vencedores de uma fase (null se ainda há confrontos sem resultado). */
export function phaseWinners(cup: CupState, phaseIndex: number, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf): string[] | null {
	const ties = cup.stages[phaseIndex];
	if (!ties) return null;
	const out: string[] = [];
	for (const t of ties) {
		const o = tieOutcome(cup, phaseIndex, t, results, seed, strengthOf);
		if (!o) return null;
		out.push(o.winner);
	}
	return out;
}

/** Sorteia a próxima fase quando a data da Copa abre uma fase nova. */
export function prepareCup(cup: CupState, matchday: number, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf): CupState {
	const ph = phaseOfMatchday(matchday);
	if (ph.matchdays[0] !== matchday || cup.stages.length !== ph.phase - 1) return cup;
	const i = ph.phase - 1;
	const previous = i === 0 ? [] : phaseWinners(cup, i - 1, results, seed, strengthOf);
	if (previous === null) return cup;
	const entering = (cup.entrants as Record<string, string[]>)[String(ph.phase)] ?? [];
	const pot = [...previous, ...entering];
	const rng = createRng(deriveSeed(seed, 'sorteio-copa', cup.season, ph.phase));
	const drawn = rng.shuffle(pot);
	const ties: Tie[] = [];
	for (let k = 0; k + 1 < drawn.length; k += 2) ties.push([drawn[k], drawn[k + 1]]);
	return { ...cup, stages: [...cup.stages, ties] };
}

/** Recupera chaves ausentes quando as súmulas confirmam todo o sorteio da fase. */
export function restoreCupStages(cup: CupState, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf): CupState {
	for (let i = cup.stages.length; i < CUP_PHASES.length; i++) {
		const phase = CUP_PHASES[i];
		const firstLegs = results.filter((r) => r.competition === CUP_ID && r.round === phase.matchdays[0]);
		if (!firstLegs.length) break;
		const previous = i === 0 ? [] : phaseWinners(cup, i - 1, results, seed, strengthOf);
		if (!previous) break;
		const entering = cup.entrants[String(phase.phase) as keyof CupState['entrants']] ?? [];
		const expected = new Set([...previous, ...entering]);
		const selected = new Set(firstLegs.flatMap((r) => [r.home, r.away]));
		if (selected.size !== firstLegs.length * 2 || selected.size !== expected.size || ![...selected].every((id) => expected.has(id))) break;
		const ties: Tie[] = firstLegs.map(({ home, away }) => [home, away]);
		if (phase.legs === 2) {
			const secondLegs = results.filter((r) => r.competition === CUP_ID && r.round === phase.matchdays[1]);
			if (secondLegs.some(({ home, away }) => !ties.some(([a, b]) => a === away && b === home))) break;
		}
		cup = { ...cup, stages: [...cup.stages, ties] };
	}
	return cup;
}

export function cupParticipation(cup: CupState, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf, clubId: string): CompetitionParticipation {
	const base = { competition: CUP_ID, club: clubId, stage: null, nextDate: null };
	const entry = Object.entries(cup.entrants).find(([, ids]) => ids.includes(clubId));
	if (!entry) return { ...base, status: 'nao-classificado' };
	const entryIndex = Number(entry[0]) - 1;
	const index = cup.stages.findLastIndex((ties) => ties.some((tie) => tie.includes(clubId)));
	if (index < 0) {
		const phase = CUP_PHASES[entryIndex];
		return { ...base, status: 'aguardando-estreia', stage: phase.name, nextDate: cupDate(cup.season, phase.matchdays[0]) };
	}
	const phase = CUP_PHASES[index];
	const tie = cup.stages[index].find((pair) => pair.includes(clubId))!;
	const outcome = tieOutcome(cup, index, tie, results, seed, strengthOf);
	if (outcome?.loser === clubId) {
		return { ...base, status: 'eliminado', stage: phase.name, eliminatedStage: phase.name, eliminatedBy: outcome.winner };
	}
	if (outcome?.winner === clubId && index === CUP_PHASES.length - 1) return { ...base, status: 'campeao', stage: phase.name };
	if (outcome?.winner === clubId) {
		const next = CUP_PHASES[index + 1];
		return { ...base, status: 'classificado', stage: next.name, nextDate: cupDate(cup.season, next.matchdays[0]) };
	}
	const completed = results.filter((r) => r.competition === CUP_ID && phase.matchdays.includes(r.round) && tie.includes(r.home) && tie.includes(r.away));
	const nextDate = cupDate(cup.season, phase.matchdays[completed.length] ?? phase.matchdays[0]);
	const status = completed.length ? 'em-disputa' : index === entryIndex ? 'aguardando-estreia' : 'classificado';
	return { ...base, status, stage: phase.name, nextDate };
}

export interface CupView {
	phases: Array<{ phase: CupPhase; ties: Array<{ tie: Tie; outcome: TieOutcome | null; legs: Array<StoredRoundResult | null> }> }>;
	champion: string | null;
	runnerUp: string | null;
	/** fase atual (primeira com confronto em aberto) */
	current: number;
}

/** Visão da Copa para a interface: cada fase com confrontos, placares e quem avançou. */
export function cupView(cup: CupState, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf): CupView {
	const phases = CUP_PHASES.map((phase, i) => ({
		phase,
		ties: (cup.stages[i] ?? []).map((tie) => {
			const legs = phase.matchdays.map((md, li) => {
				const [h, a] = li === 0 ? tie : [tie[1], tie[0]];
				return results.find((r) => r.competition === CUP_ID && r.round === md && r.home === h && r.away === a) ?? null;
			});
			return { tie, outcome: tieOutcome(cup, i, tie, results, seed, strengthOf), legs };
		})
	}));
	const final = phases[8].ties[0]?.outcome ?? null;
	let current = phases.findIndex((p) => !p.ties.length || p.ties.some((t) => !t.outcome));
	if (current < 0) current = 8;
	return { phases, champion: final?.winner ?? null, runnerUp: final?.loser ?? null, current };
}

/** Até onde o clube foi (para premiação e histórico). */
export function clubCupRun(view: CupView, clubId: string): { lastPhase: number; eliminated: boolean; champion: boolean } | null {
	let last = 0;
	let eliminated = false;
	for (const p of view.phases) {
		const t = p.ties.find((x) => x.tie.includes(clubId));
		if (!t) continue;
		last = p.phase.phase;
		eliminated = t.outcome?.loser === clubId;
	}
	if (!last) return null;
	return { lastPhase: last, eliminated, champion: view.champion === clubId };
}

export function sanitizeCup(input: unknown, known: Set<string>): CupState | null {
	if (!input || typeof input !== 'object') return null;
	const raw = input as Partial<CupState>;
	const okList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && known.has(x));
	if (typeof raw.season !== 'number' || !raw.entrants || !Array.isArray(raw.stages)) return null;
	const e = raw.entrants as Record<string, unknown>;
	if (!['1', '2', '3', '5'].every((k) => okList(e[k]))) return null;
	if (raw.stages.length > CUP_PHASES.length || !raw.stages.every((s) => Array.isArray(s) && s.every((t) => okList(t) && t.length === 2))) return null;
	const shootouts: NonNullable<CupState['shootouts']> = {};
	for (const [i, stage] of raw.stages.entries()) for (const tie of stage) {
		const key = shootoutKey(CUP_PHASES[i], tie);
		const score = raw.shootouts?.[key];
		if (Array.isArray(score) && score.length === 2 && score.every((n) => Number.isInteger(n) && n >= 0 && n <= 36) && score[0] !== score[1]) {
			shootouts[key] = score;
		}
	}
	return {
		season: raw.season,
		edition: raw.edition === 'projetada' ? 'projetada' : 'oficial',
		entrants: { '1': [...(e['1'] as string[])], '2': [...(e['2'] as string[])], '3': [...(e['3'] as string[])], '5': [...(e['5'] as string[])] },
		stages: raw.stages.map((s) => s.map((t) => [t[0], t[1]] as Tie)),
		...(Object.keys(shootouts).length ? { shootouts } : {}),
		finalVenue: typeof raw.finalVenue === 'string' ? raw.finalVenue.slice(0, 80) : 'Campo neutro'
	};
}
