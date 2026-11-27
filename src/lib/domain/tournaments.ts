import type { CompetitionParticipation, WorldCompetition } from '#lib/world/contract.ts';
import { resolveTie, type StoredRoundResult, type StrengthOf, type Tie, type TieOutcome } from './league.ts';
import { quickMatch } from './quick.ts';
import { deriveSeed } from './rng.ts';
import { computeStandings, type Fixture, type StandingRow } from './season.ts';

type Seed = { group: number; place: number } | { phase: number; tie: number };

export interface TournamentDefinition {
	competition: WorldCompetition;
	groups: string[][];
	dates: string[];
	groupRounds: Tie[][];
	phases: {
		name: string;
		legs: 1 | 2;
		neutral?: boolean;
		extraTime?: boolean;
		time?: string;
		seeds: [Seed, Seed][];
	}[];
}

export interface TournamentState {
	id: string;
	entrants?: Tie;
	shootouts?: Record<string, [number, number]>;
	extraTime?: Record<string, [number, number]>;
}

export interface TournamentView {
	competition: WorldCompetition;
	tables: StandingRow[][];
	fixtures: Fixture[];
	ranking: string[];
	phases: {
		name: string;
		ties: Tie[];
		rounds: number[];
		outcomes: (TieOutcome | null)[];
	}[];
	champion: string | null;
	runnerUp: string | null;
	participation: CompetitionParticipation;
}

const resultKey = (round: number, home: string, away: string) => `${round}:${home}:${away}`;

function rank(ids: string[], matches: StoredRoundResult[], seed: number): StandingRow[] {
	// Usa a tabela de todos os participantes também quando os jogos são intergrupos.
	const rows = computeStandings(ids, matches);
	return rows.sort((a, b) => b.points - a.points || b.won - a.won || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor
		|| deriveSeed(seed, a.clubId) - deriveSeed(seed, b.clubId) || a.clubId.localeCompare(b.clubId));
}

function tieResult(
	state: TournamentState, tie: Tie, rounds: number[], matches: StoredRoundResult[], seed: number, strengthOf: StrengthOf,
	phase: TournamentDefinition['phases'][number]
): TieOutcome | null {
	const key = resultKey(rounds[0], ...tie);
	const stored = state.shootouts?.[key];
	if (!stored && !phase.extraTime) return resolveTie(tie, matches, state.id, rounds, seed, strengthOf);
	const base = resolveTie(tie, matches, state.id, rounds, seed, strengthOf, { byCampaign: true });
	if (!base || base.decidedBy !== 'campanha') return base;
	const order = rounds.length === 1 ? tie : [tie[1], tie[0]];
	let score = state.extraTime?.[key];
	if (phase.extraTime && !score) {
		const [home, away] = order;
		const extra = quickMatch(strengthOf(home), strengthOf(away), deriveSeed(seed, state.id, key, 'prorrogacao'), !!phase.neutral, 30);
		score = [extra.homeGoals, extra.awayGoals];
	}
	const [a, b] = score ?? [0, 0];
	const aggregate: [number, number] = rounds.length === 1
		? [base.aggregate[0] + a, base.aggregate[1] + b]
		: [base.aggregate[0] + b, base.aggregate[1] + a];
	if (a !== b) {
		const [winner, loser] = a > b ? order : [...order].reverse();
		return { ...base, aggregate, extraTime: score, winner, loser, decidedBy: 'prorrogacao' };
	}
	if (!stored) return { ...resolveTie(tie, matches, state.id, rounds, seed, strengthOf)!, ...(score ? { extraTime: score } : {}) };
	const [home, away] = stored;
	const [winner, loser] = home > away ? order : [...order].reverse();
	return { ...base, aggregate, ...(score ? { extraTime: score } : {}), winner, loser, decidedBy: 'penaltis', penalties: { home, away } };
}

export function tournamentView(definition: TournamentDefinition, state: TournamentState, results: StoredRoundResult[], seed: number, strengthOf: StrengthOf, club: string): TournamentView {
	const matches = results.filter((r) => r.competition === state.id);
	const players = definition.groups.flat();
	const participants = new Set(players);
	const groupCutoff = definition.groupRounds.length;
	const groupResults = matches.filter((r) => r.round <= groupCutoff);
	const standings = rank(players, groupResults, seed);
	const tables = definition.groups.map((group) => standings.filter((r) => group.includes(r.clubId)).map((r, i) => ({ ...r, position: i + 1 })));
	const fixtures: Fixture[] = [];
	const add = (round: number, [home, away]: Tie, phase: string, neutral = false, time = '19:00') => fixtures.push({
		competition: state.id, round, date: definition.dates[round - 1], time, home, away, phase, ...(neutral ? { neutral } : {})
	} as Fixture);
	definition.groupRounds.forEach((ties, i) => ties.forEach((tie) => add(i + 1, tie, 'Fase de grupos')));
	const groupDone = groupResults.length === definition.groupRounds.reduce((n, ties) => n + ties.length, 0);
	const phases: TournamentView['phases'] = [];
	const resolveSeed = (ref: Seed) => 'group' in ref
		? (groupCutoff === 0 ? definition.groups[ref.group]?.[ref.place - 1] : groupDone ? tables[ref.group]?.[ref.place - 1]?.clubId : undefined)
		: phases[ref.phase]?.outcomes[ref.tie]?.winner;
	let offset = groupCutoff;
	for (const phase of definition.phases) {
		const rounds = Array.from({ length: phase.legs }, (_, i) => offset + 1 + i);
		const pairs = phase.seeds.map(([host, visitor]) => [resolveSeed(host), resolveSeed(visitor)]);
		if (pairs.some(([a, b]) => !a || !b)) break;
		const campaign = phase.legs === 2 ? rank(players, matches.filter((r) => r.round <= offset), seed) : [];
		const ties = pairs.map(([a, b]): Tie => {
			const [one, two] = [a!, b!];
			if (phase.legs === 1 || offset === 0) return [one, two];
			return campaign.findIndex((row) => row.clubId === one) < campaign.findIndex((row) => row.clubId === two)
				? [two, one] : [one, two];
		});
		for (const tie of ties) {
			add(rounds[0], tie, phase.name, phase.neutral, phase.time);
			if (phase.legs === 2) add(rounds[1], [tie[1], tie[0]], phase.name, phase.neutral, phase.time);
		}
		const outcomes = ties.map((tie) => tieResult(state, tie, rounds, matches, seed, strengthOf, phase));
		phases.push({ name: phase.name, ties, rounds, outcomes });
		offset += phase.legs;
	}
	const final = phases.length === definition.phases.length ? phases.at(-1)?.outcomes[0] : null;
	const champion = final?.winner ?? null;
	const runnerUp = final?.loser ?? null;
	const advancement = new Map<string, number>();
	for (const [i, phase] of phases.entries()) {
		for (const id of phase.ties.flat()) advancement.set(id, i + 1);
	}
	const ranking = rank(players, matches, seed).sort((a, b) => (advancement.get(b.clubId) ?? 0) - (advancement.get(a.clubId) ?? 0)).map((row) => row.clubId);
	if (final) ranking.splice(0, 2, final.winner, final.loser);
	const played = new Set(matches.map((r) => resultKey(r.round, r.home, r.away)));
	const mine = fixtures.filter((f) => f.home === club || f.away === club);
	const upcoming = mine.find((f) => !played.has(resultKey(f.round, f.home, f.away)));
	const last = mine.findLast((f) => played.has(resultKey(f.round, f.home, f.away)));
	const eliminated = phases.find((phase) => phase.outcomes.some((outcome) => outcome?.loser === club));
	const groupQualified = definition.phases.some(({ seeds }) => seeds.flat().some((ref) => 'group' in ref && resolveSeed(ref) === club));
	const eliminatedInGroup = groupCutoff > 0 && groupDone && participants.has(club) && !groupQualified;
	const status = !participants.has(club) ? 'nao-classificado'
		: champion === club ? 'campeao'
		: eliminated || eliminatedInGroup ? 'eliminado'
		: !last ? 'aguardando-estreia'
		: last.round <= groupCutoff && !groupDone ? 'em-disputa'
		: upcoming?.phase === last.phase ? 'em-disputa' : 'classificado';
	return {
		competition: definition.competition, tables: groupCutoff > 0 ? tables : [], fixtures, phases, ranking, champion, runnerUp,
		participation: {
			competition: state.id, club, status, stage: upcoming?.phase ?? last?.phase ?? null, nextDate: upcoming?.date ?? null,
			...(eliminated || eliminatedInGroup ? { eliminatedStage: eliminated?.name ?? 'Fase de grupos' } : {}),
			...(eliminated ? { eliminatedBy: eliminated.outcomes.find((outcome) => outcome?.loser === club)?.winner } : {})
		}
	};
}

/** Persiste a decisão junto aos gols; alterações posteriores no elenco não mudam a chave. */
export function settleTournament(state: TournamentState, view: TournamentView, matchday: number): TournamentState {
	const phase = view.phases.find(({ rounds }) => rounds.at(-1) === matchday);
	if (!phase) return state;
	const shootouts = { ...state.shootouts };
	const extraTime = { ...state.extraTime };
	for (const outcome of phase.outcomes) {
		if (outcome?.penalties) shootouts[resultKey(phase.rounds[0], ...outcome.tie)] = [outcome.penalties.home, outcome.penalties.away];
		if (outcome?.extraTime) extraTime[resultKey(phase.rounds[0], ...outcome.tie)] = outcome.extraTime;
	}
	return {
		...state,
		...(Object.keys(shootouts).length ? { shootouts } : {}),
		...(Object.keys(extraTime).length ? { extraTime } : {})
	};
}
