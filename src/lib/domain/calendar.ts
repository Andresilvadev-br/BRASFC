import { CUP_AFTER_ROUND, CUP_ID, cupDate, cupFixtures, type CupState } from './cup.ts';
import { roundDate, totalRounds, type LeagueState, type StoredRoundResult } from './league.ts';
import type { Fixture } from './season.ts';

/**
 * Passos do calendário da temporada: domingos (rodadas das ligas) e quartas-feiras (Copa do Brasil).
 * Cada clique em "Avançar" processa exatamente um passo — o servidor recusa passos fora de ordem.
 */
export type Step = { kind: 'league'; round: number; date: string; key: string } | { kind: 'cup'; matchday: number; date: string; key: string };

export function stepKey(s: Pick<Step, 'kind'> & { round?: number; matchday?: number }): string {
	return s.kind === 'league' ? `league:${s.round}` : `cup:${s.matchday}`;
}

export function seasonSteps(league: LeagueState, cup: CupState | null): Step[] {
	const out: Step[] = [];
	const n = totalRounds(league);
	for (let r = 1; r <= n; r++) {
		out.push({ kind: 'league', round: r, date: roundDate(league.season, r), key: `league:${r}` });
		if (cup) {
			const md = CUP_AFTER_ROUND.indexOf(r) + 1;
			if (md > 0) out.push({ kind: 'cup', matchday: md, date: cupDate(league.season, md), key: `cup:${md}` });
		}
	}
	return out;
}

export function processedKeys(results: StoredRoundResult[]): Set<string> {
	const out = new Set<string>();
	for (const r of results) out.add(r.competition === CUP_ID ? `cup:${r.round}` : `league:${r.round}`);
	return out;
}

/** Próximo passo ainda não processado (null = temporada encerrada). */
export function nextStep(steps: Step[], processed: Set<string>): Step | null {
	return steps.find((s) => !processed.has(s.key)) ?? null;
}

/** Todas as partidas conhecidas da temporada (ligas + Copa), em ordem de data. */
export function allFixtures(leagueFixtures: Fixture[], cup: CupState | null): Fixture[] {
	return [...leagueFixtures, ...(cup ? cupFixtures(cup) : [])].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/** Partidas de um passo. */
export function stepFixtures(step: Step, fixtures: Fixture[]): Fixture[] {
	return step.kind === 'league' ? fixtures.filter((f) => f.competition !== CUP_ID && f.round === step.round) : fixtures.filter((f) => f.competition === CUP_ID && f.round === step.matchday);
}
