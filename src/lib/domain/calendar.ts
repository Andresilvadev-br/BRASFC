import { CUP_AFTER_ROUND, CUP_ID, cupDate, cupFixtures, type CupState } from './cup.ts';
import { EUROPE_NAMES, EUROPE_SHORT, europeFixtures, europeMatchdays, europeStageName, isEuropeComp, type EuropeCompId, type EuropeState } from './europe.ts';
import { leagueRoundDate, totalRounds, type LeagueState, type StoredRoundResult } from './league.ts';
import type { Fixture } from './season.ts';

/**
 * Passos do calendário da temporada: domingos (rodadas das ligas), quartas-feiras (Copa do Brasil) e, no
 * mundo europeu, terças (Champions League) e quintas (Europa League).
 * Cada clique em "Avançar" processa exatamente um passo — o servidor recusa passos fora de ordem.
 */
export type Step =
	| { kind: 'league'; round: number; date: string; key: string }
	| { kind: 'cup'; matchday: number; date: string; key: string }
	| { kind: 'europe'; competition: EuropeCompId; matchday: number; date: string; key: string };

/** Jogos de copa (Copa do Brasil ou copas europeias): fora da tabela de liga. */
export const isCupCompetition = (competition: string | undefined | null) => competition === CUP_ID || isEuropeComp(competition);

const europeKey = (competition: EuropeCompId, matchday: number) => `${EUROPE_SHORT[competition].toLowerCase()}:${matchday}`;

export function stepKey(s: Pick<Step, 'kind'> & { round?: number; matchday?: number; competition?: EuropeCompId }): string {
	if (s.kind === 'europe') return europeKey(s.competition!, s.matchday!);
	return s.kind === 'league' ? `league:${s.round}` : `cup:${s.matchday}`;
}

/** Competição e número de um passo pela chave ("league:3", "cup:2", "ucl:5"). */
export function parseStepKey(key: string): { competition: string | null; number: number } | null {
	const [kind, n] = key.split(':');
	const number = Number(n);
	if (!Number.isInteger(number)) return null;
	if (kind === 'league') return { competition: null, number };
	if (kind === 'cup') return { competition: CUP_ID, number };
	const europe = (Object.keys(EUROPE_SHORT) as EuropeCompId[]).find((id) => EUROPE_SHORT[id].toLowerCase() === kind);
	return europe ? { competition: europe, number } : null;
}

export function seasonSteps(league: LeagueState, cup: CupState | null, europe: EuropeState | null = null): Step[] {
	const out: Step[] = [];
	const n = totalRounds(league);
	for (let r = 1; r <= n; r++) {
		out.push({ kind: 'league', round: r, date: leagueRoundDate(league, r), key: `league:${r}` });
	}
	if (cup) for (let md = 1; md <= CUP_AFTER_ROUND.length; md++) {
		out.push({ kind: 'cup', matchday: md, date: cupDate(league.season, md), key: `cup:${md}` });
	}
	if (europe) for (const e of europeMatchdays(europe)) {
		out.push({ kind: 'europe', competition: e.competition, matchday: e.matchday, date: e.date, key: europeKey(e.competition, e.matchday) });
	}
	return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function processedKeys(results: StoredRoundResult[]): Set<string> {
	const out = new Set<string>();
	for (const r of results) {
		out.add(r.competition === CUP_ID ? `cup:${r.round}` : isEuropeComp(r.competition) ? europeKey(r.competition, r.round) : `league:${r.round}`);
	}
	return out;
}

/** Próximo passo ainda não processado (null = temporada encerrada). */
export function nextStep(steps: Step[], processed: Set<string>): Step | null {
	return steps.find((s) => !processed.has(s.key)) ?? null;
}

/** Todas as partidas conhecidas da temporada (ligas + copas), em ordem de data. */
export function allFixtures(leagueFixtures: Fixture[], cup: CupState | null, europe: EuropeState | null = null): Fixture[] {
	return [...leagueFixtures, ...(cup ? cupFixtures(cup) : []), ...(europe ? europeFixtures(europe) : [])].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/** O resultado (ou partida) pertence ao passo? */
export function inStep(step: Pick<Step, 'kind'> & { round?: number; matchday?: number; competition?: string }, r: { competition?: string; round: number }): boolean {
	if (step.kind === 'league') return !isCupCompetition(r.competition) && r.round === step.round;
	if (step.kind === 'cup') return r.competition === CUP_ID && r.round === step.matchday;
	return r.competition === step.competition && r.round === step.matchday;
}

/** Nome do passo para a interface ("Rodada 12", "Copa do Brasil", "Champions League · Oitavas de final"). */
export function stepTitle(step: { kind: string; round?: number; matchday?: number; competition?: string } | null | undefined, leagueRound?: number): string {
	if (!step) return 'Fim da temporada';
	if (step.kind === 'cup') return 'Copa do Brasil';
	if (step.kind === 'europe' && isEuropeComp(step.competition)) return `${EUROPE_NAMES[step.competition]} · ${europeStageName(step.matchday ?? 1)}`;
	return `Rodada ${leagueRound ?? step.round ?? 1}`;
}

/** Partidas de um passo. */
export function stepFixtures(step: Step, fixtures: Fixture[]): Fixture[] {
	return fixtures.filter((f) => inStep(step, f));
}
