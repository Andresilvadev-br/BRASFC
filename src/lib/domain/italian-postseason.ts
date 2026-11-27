import type { Fixture, StandingRow } from './season.ts';
import { resolveTie, type StoredRoundResult, type StrengthOf, type Tie, type TieOutcome } from './league.ts';
import { penaltyShootout, quickMatch } from './quick.ts';
import { deriveSeed } from './rng.ts';

export const ITALIAN_SECOND = 'league/ita/2';

export interface ItalianDecision {
	extra: [number, number];
	penalties?: [number, number];
}

export type ItalianPostseason = Record<string, ItalianDecision>;

type Stage = 'preliminar' | 'semifinal' | 'final' | 'permanencia';
interface Series {
	stage: Stage;
	days: number[];
	tie: Tie;
	better: string;
	extraTime: boolean;
	penalties: boolean;
}

export interface ItalianPostseasonView {
	complete: boolean;
	promotion: boolean;
	playout: boolean;
	series: Array<Series & { outcome: TieOutcome | null }>;
	promoted: string | null;
	relegated: string | null;
}

const keyOf = (series: Series) => `${series.days.at(-1)}:${series.tie.join(':')}`;

export const ITALIAN_STAGE_NAMES: Record<Stage, string> = {
	preliminar: 'Preliminar de acesso',
	semifinal: 'Semifinal do playoff de acesso',
	final: 'Final do playoff de acesso',
	permanencia: 'Play-out de permanência'
};

function outcomeOf(series: Series, results: StoredRoundResult[], decisions: ItalianPostseason): TieOutcome | null {
	const base = resolveTie(series.tie, results, ITALIAN_SECOND, series.days, 0, () => 70, { byCampaign: true });
	if (base?.decidedBy !== 'campanha') return base;
	const decision = decisions[keyOf(series)];
	const [a, b] = decision?.extra ?? [0, 0];
	const [home, away] = series.days.length === 1 ? series.tie : [series.tie[1], series.tie[0]];
	const penalties = decision?.penalties ? { home: decision.penalties[0], away: decision.penalties[1] } : null;
	const winner = a !== b ? (a > b ? home : away) : penalties ? (penalties.home > penalties.away ? home : away) : series.better;
	const aggregate: [number, number] = series.days.length === 1
		? [base.aggregate[0] + a, base.aggregate[1] + b]
		: [base.aggregate[0] + b, base.aggregate[1] + a];
	return { ...base, aggregate, winner, loser: winner === home ? away : home, penalties,
		decidedBy: a !== b ? 'prorrogacao' : penalties ? 'penaltis' : 'campanha' };
}

export function italianPostseason(table: StandingRow[], regular: number, results: StoredRoundResult[], decisions: ItalianPostseason): ItalianPostseasonView {
	const plan: ItalianPostseasonView = { complete: false, promotion: false, playout: false, series: [], promoted: null, relegated: null };
	if (table.length !== 20 || table.some(({ played }) => played !== regular)) return plan;
	const club = (place: number) => table[place - 1];
	const add = (stage: Stage, days: number[], better: StandingRow, worse: StandingRow, extraTime: boolean, penalties: boolean) => {
		const tie: Tie = days.length === 1 ? [better.clubId, worse.clubId] : [worse.clubId, better.clubId];
		const series = { stage, days, tie, better: better.clubId, extraTime, penalties };
		const outcome = outcomeOf(series, results, decisions);
		plan.series.push({ ...series, outcome });
		return outcome;
	};
	plan.complete = true;
	plan.promotion = club(3).points - club(4).points <= 14;
	plan.playout = club(16).points - club(17).points <= 4;
	if (plan.playout) {
		const equal = club(16).points === club(17).points;
		plan.relegated = add('permanencia', [regular + 1, regular + 2], club(16), club(17), equal, equal)?.loser ?? null;
	} else plan.relegated = club(17).clubId;
	if (!plan.promotion) {
		plan.promoted = club(3).clubId;
		return plan;
	}
	const prelim = [add('preliminar', [regular + 1], club(5), club(8), true, false), add('preliminar', [regular + 1], club(6), club(7), true, false)];
	const semi = [prelim[1], prelim[0]].map((match, i) => {
		const survivor = table.find((r) => r.clubId === match?.winner);
		return survivor ? add('semifinal', [regular + 2, regular + 3], club(3 + i), survivor, false, false) : null;
	});
	if (semi.every((match) => match)) {
		const [better, worse] = table.filter((row) => semi.some((match) => match?.winner === row.clubId));
		const equal = better.points === worse.points;
		plan.promoted = add('final', [regular + 4, regular + 5], better, worse, equal, equal)?.winner ?? null;
	}
	return plan;
}

export function italianFixtures(plan: ItalianPostseasonView, at: (round: number) => string): Fixture[] {
	return plan.series.flatMap(({ tie, days, stage }) => days.map((round, leg) => ({
		competition: ITALIAN_SECOND, round, date: at(round), time: '20:30', home: tie[leg === 0 ? 0 : 1], away: tie[leg === 0 ? 1 : 0], phase: ITALIAN_STAGE_NAMES[stage]
	})));
}

export function decideItalianMatchday(plan: ItalianPostseasonView, current: ItalianPostseason, round: number, seed: number, strength: StrengthOf): ItalianPostseason {
	const decisions = { ...current };
	for (const series of plan.series) {
		const key = keyOf(series);
		if (!series.extraTime || decisions[key] || series.days.at(-1) !== round || series.outcome?.decidedBy !== 'campanha') continue;
		const [home, away] = series.days.length === 1 ? series.tie : [series.tie[1], series.tie[0]];
		const pace = deriveSeed(seed, ITALIAN_SECOND, key);
		const { homeGoals, awayGoals } = quickMatch(strength(home), strength(away), pace, false, 30);
		const decision: ItalianDecision = { extra: [homeGoals, awayGoals] };
		if (series.penalties && homeGoals === awayGoals) {
			const shots = penaltyShootout(strength(home), strength(away), pace);
			decision.penalties = [shots.home, shots.away];
		}
		decisions[key] = decision;
	}
	return decisions;
}
