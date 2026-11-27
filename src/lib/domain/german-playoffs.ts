import { resolveTie, type StoredRoundResult, type StrengthOf, type Tie, type TieOutcome } from './league.ts';
import { penaltyShootout, quickMatch } from './quick.ts';
import { deriveSeed } from './rng.ts';
import type { Fixture, StandingRow } from './season.ts';

export const GERMAN_FIRST = 'league/ger/1';
export const GERMAN_SECOND = 'league/ger/2';
export const GERMAN_THIRD = 'league/ger/3';
export const GERMAN_DIVISIONS = [GERMAN_FIRST, GERMAN_SECOND, GERMAN_THIRD] as const;
const reserves = new Set(['world/ger/tsg-1899-hoffenheim-ii', 'world/ger/vfb-stuttgart-ii']);

export const GERMAN_PLAYOFF_LABEL = 'Playoff de acesso e permanência';

export type GermanPlayoffState = Partial<Record<typeof GERMAN_FIRST | typeof GERMAN_SECOND, {
	extra: [number, number];
	penalties?: [number, number];
}>>;

export interface GermanPlayoff {
	higher: typeof GERMAN_FIRST | typeof GERMAN_SECOND;
	lower: typeof GERMAN_SECOND | typeof GERMAN_THIRD;
	incumbent: string;
	challenger: string;
	rounds: [number, number];
	tie: Tie;
	outcome: TieOutcome | null;
}

export function germanPromotionCandidates(table: StandingRow[]): StandingRow[] {
	return table.filter(({ clubId }) => !reserves.has(clubId));
}

export function germanPlayoffPlan(
	rounds: [number, number], tables: [StandingRow[], StandingRow[], StandingRow[]],
	results: StoredRoundResult[], decisions: GermanPlayoffState
): GermanPlayoff[] {
	return ([
		{ higher: GERMAN_FIRST, lower: GERMAN_SECOND, upperTable: tables[0], lowerTable: tables[1] },
		{ higher: GERMAN_SECOND, lower: GERMAN_THIRD, upperTable: tables[1], lowerTable: tables[2] }
	] as const).flatMap(({ higher, lower, upperTable, lowerTable }): GermanPlayoff[] => {
		if (upperTable.length !== 18 || lowerTable.length < 18 || upperTable.some(({ played }) => played !== (upperTable.length - 1) * 2)
			|| lowerTable.some(({ played }) => played !== (lowerTable.length - 1) * 2)) return [];
		const incumbent = upperTable.at(-3)!.clubId;
		const challenger = germanPromotionCandidates(lowerTable)[2].clubId;
		// A 2. Bundesliga termina um dia depois das outras duas no calendário-base da DFL.
		const tie: Tie = higher === GERMAN_FIRST ? [incumbent, challenger] : [challenger, incumbent];
		const base = resolveTie(tie, results, higher, rounds, 0, () => 70, { byCampaign: true });
		let outcome = base?.decidedBy === 'campanha' ? null : base;
		const decision = decisions[higher];
		if (base?.decidedBy === 'campanha' && decision && (decision.extra[0] !== decision.extra[1] || decision.penalties)) {
			const [home, away] = decision.extra;
			const penalties = decision.penalties ? { home: decision.penalties[0], away: decision.penalties[1] } : null;
			const winner = (home === away ? penalties!.home > penalties!.away : home > away) ? tie[1] : tie[0];
			outcome = { ...base, aggregate: [base.aggregate[0] + away, base.aggregate[1] + home], penalties, winner,
				loser: winner === tie[0] ? tie[1] : tie[0], decidedBy: home === away ? 'penaltis' : 'prorrogacao' };
		}
		return [{ higher, lower, incumbent, challenger, rounds, tie, outcome }];
	});
}

export function germanPlayoffFixtures(plan: GermanPlayoff[], at: (round: number) => string): Fixture[] {
	return plan.flatMap(({ higher, rounds, tie }) => rounds.map((round, leg) => ({
		competition: higher, round, date: at(round), time: '20:30', home: tie[leg], away: tie[1 - leg], phase: GERMAN_PLAYOFF_LABEL
	})));
}

export function settleGermanPlayoffs(plan: GermanPlayoff[], current: GermanPlayoffState, round: number, results: StoredRoundResult[], seed: number, strength: StrengthOf): GermanPlayoffState {
	const next = { ...current };
	for (const { higher, rounds, tie } of plan) {
		if (round !== rounds[1] || next[higher]) continue;
		const fullTime = resolveTie(tie, results, higher, rounds, 0, strength, { byCampaign: true });
		if (fullTime?.decidedBy !== 'campanha') continue;
		const [away, home] = tie;
		const key = deriveSeed(seed, higher, home, away);
		const { homeGoals, awayGoals } = quickMatch(strength(home), strength(away), key, false, 30);
		next[higher] = { extra: [homeGoals, awayGoals] };
		if (homeGoals === awayGoals) {
			const penalties = penaltyShootout(strength(home), strength(away), key);
			next[higher]!.penalties = [penalties.home, penalties.away];
		}
	}
	return next;
}

export function sanitizeGermanPlayoffs(input: object): GermanPlayoffState {
	const scores = (value: unknown): value is [number, number] => Array.isArray(value) && value.length === 2
		&& value.every((score) => Number.isInteger(score) && score >= 0 && score < 35);
	const result: GermanPlayoffState = {};
	for (const id of [GERMAN_FIRST, GERMAN_SECOND] as const) {
		const entry = (input as GermanPlayoffState)[id];
		if (!entry || !scores(entry.extra)) continue;
		const penalties = scores(entry.penalties) && entry.penalties[0] !== entry.penalties[1] ? entry.penalties : undefined;
		if (entry.extra[0] === entry.extra[1] && !penalties) continue;
		result[id] = { extra: entry.extra, ...(penalties ? { penalties } : {}) };
	}
	return result;
}
