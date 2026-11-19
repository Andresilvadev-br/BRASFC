import { Match } from '#lib/engine/match.ts';
import { ENGINE_VERSION, type AppliedDecision, type Decision, type MatchEvent, type Side, type TeamSetup } from '#lib/engine/types.ts';
import { RoomError } from './repos/rooms.ts';

export type RoundReplay = {
	home: TeamSetup; away: TeamSetup; seed: number; neutral: boolean; version: string;
	ai?: Partial<Record<Side, boolean>>; decisions?: AppliedDecision[];
};

export type LiveFixture = { competition: string; replay: RoundReplay };
type Submission = { fixture: number; tick: number; side: Side; decision: Decision; id: string; secondHalf: boolean; atInterval: boolean };
type Suggestion = { profile: string; club: string; decision: Decision; id: string };
export type RoundPhase = 'LOADING' | 'PRESENTATION' | 'FIRST_HALF' | 'HALF_TIME' | 'SECOND_HALF' | 'FULL_TIME';
export type LiveRound = {
	id: string; season: number; step: string; round: number; date: string; fixtures: LiveFixture[];
	required: string[]; loaded: string[]; confirmed: string[]; phase: RoundPhase;
	tick: number; since: number; updated: number; sequence: number; suspended: boolean;
	requests: string[]; submissions: Submission[]; suggestions: Suggestion[];
};

const SPEED = 80;
const MAX_SLICE = 120;
const PRESENTATION_MS = 12_000;
const LOADING_MS = 3_000;
const ENDED_MS = 4_000;
const cache = new Map<string, { sequence: number; matches: Match[] }>();
export const forgetRound = (id: string) => cache.delete(id);
export function keepEngines(round: LiveRound) {
	const existing = cache.get(round.id);
	if (existing?.sequence === round.sequence - 1) existing.sequence = round.sequence;
}
const prepared = new Map<string, LiveFixture[]>();
export function rememberFixtures(id: string, fixtures: LiveFixture[]) {
	if (prepared.size >= 8) prepared.delete(prepared.keys().next().value!);
	prepared.set(id, fixtures);
	return fixtures;
}
export const preparedFixtures = (id: string) => prepared.get(id);
export function checkpoint(round: LiveRound): Omit<LiveRound, 'fixtures'> {
	const { fixtures: _fixtures, ...state } = round;
	return state;
}
const sides = ['home', 'away'] as const;
const featuredEvents = new Set<MatchEvent['type']>(['goal', 'foul', 'free_kick', 'corner', 'penalty', 'penalty_miss', 'yellow', 'red', 'sub', 'offside', 'injury', 'shot_saved', 'half_time', 'second_half', 'full_time', 'tactic', 'shot', 'aerial', 'cross']);

function moveTo(match: Match, tick: number, secondHalf: boolean) {
	while (match.tick < tick && match.phase !== 'finished' && (secondHalf || match.phase !== 'half_time')) match.step();
}

export function enginesFor(session: LiveRound) {
	const covered = cache.get(session.id);
	if (covered?.sequence === session.sequence) return covered.matches;
	const secondHalf = ['SECOND_HALF', 'FULL_TIME'].includes(session.phase);
	const matches = session.fixtures.map(({ replay }, fixture) => {
		if (replay.version !== ENGINE_VERSION) throw new RoomError('Esta rodada exige a versão do motor com que foi iniciada.', 409);
		const match = new Match({ ...replay, ...(replay.neutral ? { rules: { homeAdvantage: false } } : {}) });
		for (const entry of session.submissions) {
			if (entry.fixture !== fixture) continue;
			const afterInterval = entry.secondHalf;
			moveTo(match, entry.tick, afterInterval);
			if (entry.atInterval) {
				const rejected = match.prepareInterval(entry.side, entry.decision);
				if (rejected) throw new RoomError('A decisão do intervalo divergiu na recuperação.', 409);
			} else match.submit(entry.side, entry.decision);
		}
		moveTo(match, session.tick, secondHalf);
		return match;
	});
	if (cache.size >= 8) cache.delete(cache.keys().next().value!);
	cache.set(session.id, { sequence: session.sequence, matches });
	return matches;
}

export function startRound(id: string, season: number, step: string, round: number, date: string, fixtures: LiveFixture[], required: string[], now: number): LiveRound {
	return { id, season, step, round, date, fixtures, required, loaded: [], confirmed: [], phase: 'LOADING',
		tick: 0, since: 0, updated: now, sequence: 0, suspended: false, requests: [], submissions: [], suggestions: [] };
}

export function pulseRound(session: LiveRound, connected: ReadonlySet<string>, now: number) {
	if (!session.required.every((id) => connected.has(id))) {
		if (!session.suspended) {
			session.suspended = true;
			if (session.phase === 'LOADING') session.loaded = session.loaded.filter((id) => connected.has(id));
			session.since = 0;
			session.updated = now;
			return true;
		}
		return false;
	}
	if (session.suspended) {
		session.suspended = false;
		session.since = session.phase === 'LOADING' ? 0 : now;
		session.updated = now;
		return true;
	}
	const transition = (phase: RoundPhase) => {
		session.phase = phase;
		session.since = now;
		session.updated = now;
	};
	if (session.phase === 'LOADING') {
		if (!session.required.every((id) => session.loaded.includes(id))) return false;
		if (!session.since) { session.since = now; return true; }
		if (now - session.since < LOADING_MS) return false;
		transition('PRESENTATION');
		return true;
	}
	if (session.phase === 'PRESENTATION') {
		if (now - session.since < PRESENTATION_MS) return false;
		transition('FIRST_HALF');
		return true;
	}
	if (session.phase === 'HALF_TIME') {
		if (!session.required.every((id) => session.confirmed.includes(id))) return false;
		transition('SECOND_HALF');
		return true;
	}
	if (session.phase === 'FULL_TIME') return false;
	const count = Math.min(MAX_SLICE, Math.floor((now - session.updated) * SPEED / 1000));
	if (!count) return false;
	const matches = enginesFor(session);
	const end = session.tick + count;
	const second = session.phase === 'SECOND_HALF';
	for (const match of matches) moveTo(match, end, second);
	session.tick = matches.length ? Math.max(...matches.map((match) => match.tick)) : end;
	cache.set(session.id, { sequence: session.sequence + 1, matches });
	if (!second && matches.every((match) => match.phase === 'half_time')) transition('HALF_TIME');
	else if (matches.every((match) => match.phase === 'finished')) transition('FULL_TIME');
	session.updated = now;
	return true;
}

export function canCommitRound(session: LiveRound, now: number) {
	return session.phase === 'FULL_TIME' && !session.suspended && now - session.since >= ENDED_MS;
}

export function matchView(match: Match) {
	const { players, stats } = match.result();
	return { tick: match.tick, minute: match.minuteLabel(match.tick), phase: match.phase, score: { ...match.score },
		players: [...match.states.values()].filter((p) => p.onPitch).map((p) => ({ ...p })), ball: { ...match.ball },
		events: match.events.filter((e) => featuredEvents.has(e.type)).slice(-36).map((event) => ({ ...event, minute: match.minuteLabel(event.tick) })),
		decisions: match.applied.slice(-16), stats: { players, teams: stats },
		teams: Object.fromEntries(sides.map((side) => [side, { tactic: { ...match.teams[side].tactic, instructions: match.teams[side].instructions },
			bench: match.bench(side), gkId: match.teams[side].gkId, subs: match.subsLeft(side) }])) as Record<Side, {
				tactic: TeamSetup['tactic']; bench: ReturnType<Match['bench']>; gkId: string; subs: number;
			}> };
}
