import { CUP_AFTER_ROUND, CUP_ID, cupDate, cupFixtures, type CupState } from './cup.ts';
import { isLeagueMatchdayScheduled, leagueRoundDate, totalRounds, type LeagueState, type StoredRoundResult } from './league.ts';
import { addDays } from './dates.ts';
import type { TournamentDefinition } from './tournaments.ts';
import type { Fixture } from './season.ts';

/**
 * Passos do calendário da temporada: domingos (rodadas das ligas) e quartas-feiras (Copa do Brasil).
 * Cada clique em "Avançar" processa exatamente um passo — o servidor recusa passos fora de ordem.
 */
export type Step = { kind: 'league'; round: number; date: string; key: string } | { kind: 'cup'; matchday: number; date: string; key: string; competition?: string; name?: string };

export function stepKey(s: Pick<Step, 'kind'> & { round?: number; matchday?: number }): string {
	return s.kind === 'league' ? `league:${s.round}` : `cup:${s.matchday}`;
}

export function fixtureStepKey(competition: string | undefined, round: number): string {
	if (competition === CUP_ID) return `cup:${round}`;
	return competition?.startsWith('cup/') || competition?.startsWith('state/') || competition?.startsWith('continental/')
		? `${competition}:${round}`
		: `league:${round}`;
}

export function seasonSteps(league: LeagueState, cup: CupState | null, tournaments: TournamentDefinition[] = [], results: StoredRoundResult[] = []): Step[] {
	const out: Step[] = [];
	const n = totalRounds(league);
	for (let r = 1; r <= n; r++) {
		if (!isLeagueMatchdayScheduled(league, r, results)) continue;
		out.push({ kind: 'league', round: r, date: leagueRoundDate(league, r), key: `league:${r}` });
	}
	if (cup) for (let md = 1; md <= CUP_AFTER_ROUND.length; md++) {
		out.push({ kind: 'cup', matchday: md, date: cupDate(league.season, md), key: `cup:${md}` });
	}
	const occupied = new Set(out.map((step) => step.date));
	for (const tournament of tournaments) {
		const { id, name } = tournament.competition;
		let previous = '';
		for (const [index, preferred] of tournament.dates.entries()) {
			let date = preferred > previous ? preferred : addDays(previous, 1);
			while (occupied.has(date)) date = addDays(date, 1);
			const matchday = index + 1;
			out.push({ kind: 'cup', competition: id, name, matchday, date, key: fixtureStepKey(id, matchday) });
			occupied.add(date);
			previous = date;
		}
	}
	return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function processedKeys(results: StoredRoundResult[]): Set<string> {
	const out = new Set<string>();
	for (const r of results) out.add(fixtureStepKey(r.competition, r.round));
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
	return fixtures.filter((f) => fixtureStepKey(f.competition, f.round) === step.key);
}
