import { randomUUID } from 'node:crypto';
import { initialCareerData, validateCreateCareer, type Career, type CareerData } from '#lib/domain/career.ts';
import { DEFAULT_APPEARANCE, isAppearance, type Appearance } from '#lib/domain/appearance.ts';
import { catalogClub, ROSTER_CATALOG, type RosterCatalogId } from '#lib/data/roster-catalog.ts';
import { clubLineup, initialClubTactic } from '#lib/domain/club-selection.ts';
import { clubEconomy } from '#lib/domain/club.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { DEFAULT_LEAGUE_OPTIONS, type LeagueOptions } from '#lib/domain/league-options.ts';
import { seasonSteps } from '#lib/domain/calendar.ts';
import { initialCup, clubCupRun, cupView, prepareCup, cupFixtures, phaseOfMatchday, projectedCup, tieOutcome } from '#lib/domain/cup.ts';
import { addDays } from '#lib/domain/dates.ts';
import { DEFAULT_PLAN, applyTrainingWeek, recoverFitness, sanitizePlan } from '#lib/domain/drills.ts';
import { initialLeague, divisionOf, effectiveRule, divisionStandings, prepareRound, seasonFixtures, closeSeason, seasonStartDate, type DivisionId, type LeagueState, type StoredRoundResult } from '#lib/domain/league.ts';
import { aiTeam, matchSeed, simulateOtherFixtures } from '#lib/domain/matchday.ts';
import { currentClubOf, findPlayer, emptyMarket, tierOfDivision, rosterOf, transferWindow, ROLE_LABELS, type ContractRole, type MarketState } from '#lib/domain/market.ts';
import { marketIndex, marketProfile, queryMarket, readMarketFilters } from './market-search.ts';
import type { MarketProfile } from '#lib/domain/market-search.ts';
import { hashString } from '#lib/domain/rng.ts';
import { recoverTactic, sanitizeTactic, type Tactic } from '#lib/domain/tactics.ts';
import { rosterContext, strengthMemo, clubStateOf } from '#lib/domain/world.ts';
import { engineFamiliarity, resolveRoles, sanitizeTacticalState, type TacticalState } from '#lib/domain/tactical.ts';
import { sanitizeOffice } from '#lib/domain/office.ts';
import { scoutCandidates } from '#lib/domain/academy.ts';
import { staffCandidates, STAFF_ROLES } from '#lib/domain/staff.ts';
import { closeClubSeason, initialWageBudget, makeOffer, processWeek, payroll, type ClubState } from '#lib/domain/management.ts';
import { playerAttributes, playerState, advancePlayerDays, assessPlayer, recordProgress } from '#lib/domain/player-development.ts';
import { applyPlayerAction } from './player-actions.ts';
import { actionContext, applyAction } from './management.ts';
import { applyOfficeAction, OFFICE_ACTIONS } from './office-actions.ts';
import { careerView } from '#lib/domain/view.ts';
import { closePlayerSeason } from '#lib/domain/careerlife.ts';
import { ensureUniverse, officeOf, officeSeasonEnd, officeStep, universeAfterStep, universeAtSeasonEnd, type Msg } from './universe.ts';
import { computeOverall } from '#lib/engine/attributes.ts';
import { buildTeamSetup } from '#lib/engine/teams.ts';
import { Match } from '#lib/engine/match.ts';
import { ENGINE_VERSION, supportsEngineVersion, type MatchEvent, type MatchResult, type Side, type PlayerStats } from '#lib/engine/types.ts';
import { canCommitRound, checkpoint, enginesFor, forgetRound, keepEngines, matchView, preparedFixtures, pulseRound, rememberFixtures, startRound, type LiveFixture, type LiveRound, type RoundReplay } from './live-round.ts';
import { parseDecision } from './rounds.ts';
import type { Db } from './db/index.ts';
import { isUuid } from './repos/careers.ts';
import { listMembers, RoomError, type Room } from './repos/rooms.ts';

import type { FinanceDraft, FinanceGrant, FinancialCommand } from '#lib/domain/staff-finance.ts';
import { delegatedFinancialCommand, sanitizeFinanceGrant } from './staff-finance.ts';

type Activity = { id: string; actor: string; action: string; date: string; club?: string; scope?: string[]; target?: string; author?: string; decisionClub?: string; private?: boolean };
type LeagueAward = { season: number; club: string; competition: string };

type Assignment = {
	profile: string; name: string; club: string; role: 'coach' | 'assistant' | 'player';
	ready: boolean; finance?: FinanceGrant; financeIssuer?: string; delegated?: boolean; matchDelegated?: boolean; lineupDelegated?: boolean; athlete?: CareerData; appearance?: Appearance; notices?: Array<Msg & { id: string; date: string }>; history: Array<{ club: string; role: string; date: string }>;
};
type AthleteDeal = { profile: string; offer: string; from: string; to: string; approvals: string[] };
type Deal = { id: string; from: string; to: string; player: string; fee: number; proposedAt?: string; expiresRound?: number; counter?: boolean; agreement?: boolean; contractMessage?: string };
type SettledDeal = Deal & { status: 'aceita' | 'recusada' | 'encerrada' | 'expirada'; name: string; date: string };
type Replay = RoundReplay;
type MarketStat = Pick<PlayerStats, 'minutes' | 'goals' | 'assists' | 'yellow' | 'red'>;
type MarketTransfer = MarketProfile['transfers'][number] & { playerId: string };
type Played = StoredRoundResult & { marketStats?: Record<string, MarketStat>; replay?: Replay; replayVersion?: string; athletes?: Record<string, { stats?: PlayerStats; selection: 'titular' | 'reserva' | 'fora' }>; events?: MatchEvent[] };
type WorldState = {
	rosterCatalog?: RosterCatalogId;
	options?: LeagueOptions;
	financeDrafts?: FinanceDraft[]; activity?: Activity[]; awards?: Record<string, LeagueAward[]>;
	universe?: CareerData['universe']; league: LeagueState; cup: ReturnType<typeof initialCup> | null; date: string; step: number; firstSeason: number;
	participants: Record<string, Assignment>; tactics: Record<string, Tactic>;
	plans: Record<string, ReturnType<typeof sanitizePlan>>; mastery?: Record<string, TacticalState>; fitness?: Record<string, Record<string, number>>; clubs: Record<string, ClubState>;
	market: MarketState; shortlists?: Record<string, string[]>; marketTransfers?: MarketTransfer[]; deals: Deal[]; dealHistory?: SettledDeal[]; athleteDeals?: AthleteDeal[]; vacancies: Record<string, string>; alumniHistory?: Record<string, Assignment['history']>; allowAbsent: boolean; inviteOpen: boolean;
	last: Played[]; champions: Array<{ season: number; clubs: Record<string, string> }>;
};
type RecordRow = { revision: number; state: WorldState };
function fail(message: string, code = 422): never { throw new RoomError(message, code); }
const seedOf = (room: Room) => hashString(room.id);
const readState = (row: RecordRow): WorldState => typeof row.state === 'string' ? JSON.parse(row.state) : row.state;

function initial(room: Room): WorldState {
	const options = room.leagueOptions ?? DEFAULT_LEAGUE_OPTIONS;
	const { season } = options;
	const date = scheduleDate(options, seasonStartDate(season));
	return { options, rosterCatalog: ROSTER_CATALOG, league: initialLeague('brasil', season),
		cup: options.competition === 'league' ? null : initialCup(season), date, step: 0, firstSeason: season,
		participants: {}, tactics: {}, plans: {}, clubs: {}, market: emptyMarket(), deals: [], vacancies: {}, last: [],
		allowAbsent: false, inviteOpen: true, champions: [] };
}

const scheduleDate = (options: LeagueOptions | undefined, date: string) => options?.calendar === 'saturday' ? addDays(date, -1) : date;
const schedule = (s: WorldState) => seasonSteps(s.league, s.cup).map((step) => ({ ...step, date: scheduleDate(s.options, step.date) }));
const scheduledFixtures = <T extends { date: string }>(state: WorldState, fixtures: T[]) =>
	fixtures.map((fixture) => ({ ...fixture, date: scheduleDate(state.options, fixture.date) }));
const stepOf = (s: WorldState) => schedule(s)[s.step] ?? null;
const marketRound = (s: WorldState) => schedule(s).slice(s.step).find((entry) => entry.kind === 'league')?.round ?? 99;

function rememberMarketTransfers(s: WorldState, transfers: MarketTransfer[]) {
	if (transfers.length) s.marketTransfers = [...(s.marketTransfers ?? []), ...transfers].slice(-600);
}

function expireDeals(s: WorldState, room: Room, predicate: (deal: Deal) => boolean) {
	const expired = s.deals.filter(predicate);
	if (!expired.length) return;
	s.dealHistory = [...(s.dealHistory ?? []), ...expired.map((deal): SettledDeal => ({
		...deal, name: roster(room, s, deal.from).find((athlete) => athlete.id === deal.player)?.name ?? deal.player,
		date: s.date, status: 'expirada'
	}))].slice(-64);
	s.deals = s.deals.filter((deal) => !expired.includes(deal));
}
const clubList = (s: WorldState) => Object.values(s.league.divisions).flatMap((clubs) => clubs ?? []);
const athleteId = (member: Assignment) => `human-${member.profile}`;
function moveAthlete(person: Assignment, club: string, date: string) {
	if (club === person.club) return;
	person.club = club;
	person.ready = false;
	person.history.push({ club, role: 'player', date });
}

function rememberNotices(person: Assignment, news: Msg[], date: string, key: string) {
	person.notices = [...(person.notices ?? []), ...news.map((message, index) => ({ ...message, date, id: `${key}:${index}` }))].slice(-32);
}

function humanWages(s: WorldState, club: string) {
	return Object.values(s.participants).reduce((sum, person) => {
		const player = person.role === 'player' ? person.athlete?.playerCareer : undefined;
		return player && (player.daily.loan?.parent ?? person.club) === club ? sum + player.contract.wage : sum;
	}, 0);
}


function context(room: Room, s: WorldState, club: string, person?: Assignment): Career {
	return { id: room.id, personName: person?.name ?? room.name, clubId: club, mode: person?.role === 'player' ? 'player' : 'coach',
		seed: person?.role === 'player' ? hashString(room.id + person.profile) : seedOf(room), season: s.league.season,
		gameDate: s.date, version: 0, createdAt: room.createdAt, updatedAt: room.createdAt,
		data: { ...person?.athlete, world: 'brasil', rosterCatalog: s.rosterCatalog, firstSeason: s.firstSeason, league: s.league,
			cup: s.cup ?? undefined, universe: s.universe, market: s.market, club: s.clubs[club] } };
}

async function results(db: Db, room: Room, season: number, compact = false, steps: string[] | null = null): Promise<Played[]> {
	const rows = await db.query<{ result: Played }>(`SELECT result - 'replay' - 'marketStats' ${compact ? "- 'events' - 'athletes'" : ''} AS result FROM room_world_matches WHERE room_id = $1 AND season = $2 AND ($3::text[] IS NULL OR step = ANY($3::text[]))`, [room.id, season, steps]);
	return rows.map(({ result }) => typeof result === 'string' ? JSON.parse(result) : result);
}

function roster(room: Room, s: WorldState, club: string) {
	const c = context(room, s, club);
	const players = rosterOf(rosterContext({ ...c, mode: 'player' }, s.league), club).map((p) => ({ ...p, condition: s.fitness?.[club]?.[p.id] ?? p.condition }));
	const humans = Object.values(s.participants).filter((p) => p.role === 'player' && p.club === club);
	return [...players, ...humans.flatMap((p) => {
		const profile = p.athlete?.player;
		const position = p.athlete?.position;
		if (!profile || !position) return [];
		const career = context(room, s, club, p);
		const state = playerState(career, divisionOf(s.league, club))!;
		if (state.daily.injuryUntil && state.daily.injuryUntil > s.date) return [];
		const attributes = playerAttributes(career.seed, position, profile, state.daily);
		return [{ id: athleteId(p), name: p.name, shortName: p.name, position, number: profile.number,
			age: profile.age, potential: profile.potential, overall: computeOverall(attributes.attributes, position), condition: state.daily.condition,
			morale: 'boa' as const, appearance: p.athlete?.appearance ?? DEFAULT_APPEARANCE,
			...attributes }];
	})];
}

export async function worldSnapshot(db: Db, room: Room, profile: string) {
	const members = await listMembers(db, room.id);
	if (!members.some((m) => m.profileId === profile)) fail('Universo não encontrado.', 404);
	const [row] = await db.query<RecordRow>('SELECT revision, state FROM room_worlds WHERE room_id = $1', [room.id]);
	const s = row ? readState(row) : initial(room);
	const current = s.participants[profile];
	const past = current ? await results(db, room, s.league.season, true, schedule(s).slice(0, s.step).map((step) => step.key)) : [];
	const division = current ? divisionOf(s.league, current.club) : null;
	const step = stepOf(s);
	const ownClub = current && current.role !== 'player' ? clubStateOf(context(room, s, current.club), s.league) : null;
	const fixtures = scheduledFixtures(s, [...seasonFixtures(s.league, seedOf(room)), ...(s.cup ? cupFixtures(s.cup) : [])]);
	const squad = current ? roster(room, s, current.club) : [];
	const tactic = current ? recoverTactic(s.tactics[current.club], squad) ?? initialClubTactic(s.rosterCatalog, current.club, squad) : undefined;
	const clubCalendar = current ? fixtures.filter((fixture) => [fixture.home, fixture.away].includes(current.club))
		.sort((a, b) => a.date.localeCompare(b.date)) : [];
	const priorScores = new Map(past.filter((game) => current && [game.home, game.away].includes(current.club))
		.map((game) => [`${game.competition}:${game.round}:${game.home}:${game.away}`, [game.homeGoals, game.awayGoals]]));
	const coach = current?.role === 'coach' ? current : null;
	const issuer = current?.financeIssuer ? s.participants[current.financeIssuer] : undefined;
	const assistant = current?.role === 'assistant' && current.finance && issuer?.role === 'coach' && issuer.club === current.club
		? current : null;
	const tier = tierOfDivision(division);
	const half = (schedule(s).slice(s.step).find((entry) => entry.kind === 'league')?.round ?? 38) <= 19 ? 1 : 2;
	const [[live], reservations] = await Promise.all([
		db.query('SELECT 1 FROM room_live_rounds WHERE room_id=$1', [room.id]),
		db.query<{ club: string; role: 'coach' | 'assistant'; mine: boolean }>(
			"SELECT club,role,recipient=$2 AS mine FROM room_invitations WHERE room_id=$1 AND club IS NOT NULL AND status='pending' AND expires_at>now()",
			[room.id, profile])
	]);
	return { reservations, options: s.options ?? DEFAULT_LEAGUE_OPTIONS, entryMode: room.entryMode, started: room.started ?? true, assistantsRequired: room.assistantsRequired ?? true, live: !!live, revision: Number(row?.revision ?? 0), ownerId: room.ownerId, season: s.league.season, date: s.date, rosterCatalog: s.rosterCatalog,
		next: step, fixture: current && step ? fixtures.find((f) => f.competition === (step.kind === 'cup' ? 'copa-do-brasil' : f.competition)
			&& (step.kind === 'cup' || f.competition !== 'copa-do-brasil') && f.round === (step.kind === 'league' ? step.round : step.matchday)
			&& [f.home, f.away].includes(current.club)) : null,
		members: members.map((m) => { const p = s.participants[m.profileId]; return {
			...m, assignment: p ? { club: p.club, role: p.role, ready: p.ready, delegated: p.delegated, matchDelegated: p.matchDelegated, lineupDelegated: p.lineupDelegated ?? p.matchDelegated, finance: coach?.club === p.club && p.financeIssuer === profile ? p.finance : undefined, appearance: p.appearance ?? p.athlete?.appearance } : null }; }),
		clubs: Object.entries(s.league.divisions).flatMap(([division, ids]) =>
			ids.map((id) => ({ id, name: getClub(id)?.name ?? id, division: division as DivisionId }))),
		current: current?.finance && !assistant ? { ...current, finance: undefined, financeIssuer: undefined } : current, activity: (s.activity ?? []).filter((event) => event.private
			? event.target === profile || event.author === profile || (!!event.decisionClub && coach?.club === event.decisionClub)
			: !event.scope || current && event.scope.includes(current.club) || event.target === profile).slice(-12).reverse(),
		financeDrafts: (s.financeDrafts ?? []).filter((draft) => current?.club === draft.club &&
			(current.role === 'coach' || profile === draft.author)).reverse()
			.sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')).slice(0, 40),
		assistantMarket: assistant && ownClub ? { budget: ownClub.transferBudget,
			negotiations: ownClub.negotiations.filter((entry) => s.activity?.some((event) => event.id === entry.op && event.target === profile)) } : null,
		standings: division ? divisionStandings(s.league, division, past) : [],
		last: s.last.map(({ athletes, events, replay, replayVersion, ...match }) => ({ ...match,
			me: current && athletes ? athletes[athleteId(current)] : undefined,
			replay: Boolean(supportsEngineVersion(replayVersion ?? replay?.version) && current && [match.home, match.away].includes(current.club)),
			events: current && [match.home, match.away].includes(current.club) ? events : undefined })),
		allowAbsent: s.allowAbsent, inviteOpen: s.inviteOpen, champions: s.champions, news: s.universe?.news.slice(-5).reverse() ?? [],
		marketWindow: (coach || assistant) && step ? transferWindow(marketRound(s)) : null,
		deals: current ? s.deals.filter((d) => current.club === d.from || current.club === d.to).map((d) => ({
			...d, name: roster(room, s, d.from).find((p) => p.id === d.player)?.name ?? d.player
		})) : [],
		dealHistory: current?.role === 'coach' ? (s.dealHistory ?? []).filter((deal) => [deal.from, deal.to].includes(current.club)).slice(-20).reverse() : [],
		vacancies: s.vacancies[profile] ? [s.vacancies[profile]] : [],
		roster: squad,
		tactic, mastery: current && tactic ? s.mastery?.[current.club]?.formations[tactic.formation] : undefined,
		calendar: clubCalendar.map((fixture) => ({ fixture, score: priorScores.get(`${fixture.competition}:${fixture.round}:${fixture.home}:${fixture.away}`) })),
		management: coach && ownClub ? {
			budget: ownClub.transferBudget, wages: payroll(rosterOf(rosterContext({ ...context(room, s, coach.club), mode: 'player' }, s.league), coach.club)) + humanWages(s, coach.club),
			wageBudget: ownClub.wageBudget, sponsors: ownClub.sponsors, board: ownClub.board, months: ownClub.months.slice(-12),
			academy: ownClub.academy.map(({ id, name, position, age, overall, plan, appearance }) => ({ id, name, position, age, overall, plan, appearance })),
			scouts: ownClub.scouts, reports: ownClub.reports, incoming: ownClub.incoming, negotiations: ownClub.negotiations, listed: s.market.listed, scoutCandidates: scoutCandidates(seedOf(room), s.league.season),
			staffCandidates: Object.fromEntries(STAFF_ROLES.map((role) => [role, staffCandidates(seedOf(room), s.league.season, half, role, tier)])),
			office: sanitizeOffice(coach.athlete?.office, s.league.season, tier, ownClub.coachReputation)
		} : null,
		plan: current ? s.plans[current.club] : undefined,
		balance: ownClub?.balance,
		sponsors: current?.role === 'coach' ? ownClub?.sponsorOffers : undefined,
		staff: current?.role === 'coach' ? ownClub?.staff : undefined,
		athleteDeals: (s.athleteDeals ?? []).filter((x) => current?.role === 'coach' ? [x.from, x.to].includes(current.club) : x.profile === profile)
			.map((x) => ({ ...x, name: s.participants[x.profile]?.name ?? 'Atleta' }))
	};
}

async function playOfficialMatch(replay: Replay) {
	const match = new Match({ ...replay, ...(replay.neutral ? { rules: { homeAdvantage: false } } : {}) });
	for (let tick = 0; tick <= 20_000 && match.step(); tick++) {
		// Give HTTP/WebSocket callbacks time between slices while this room's transaction stays locked.
		if (tick % 256 === 255) await new Promise<void>((resolve) => setImmediate(resolve));
	}
	return match.result();
}

type OfficialResult = { replay: Replay; match: MatchResult };
type RoundRun = { prepare: LiveFixture[]; finished?: never } | { finished: OfficialResult[]; prepare?: never };
async function advance(tx: Db, room: Room, s: WorldState, run?: RoundRun) {
	const active = Object.values(s.participants);
	const required = requiredForRound(s, room.assistantsRequired ?? true);
	if (!required.length || (!s.allowAbsent && required.some((p) => !p.ready))) fail('Aguarde a confirmação dos participantes.', 409);
	const step = stepOf(s);
	const previous = await results(tx, room, s.league.season, Boolean(step));
	const seed = seedOf(room);
	const c = { ...context(room, s, s.league.divisions['serie-a']![0]), mode: 'player' as const };
	s.universe = ensureUniverse(c, s.league);
	const strength = strengthMemo(rosterContext({ ...c, mode: 'player' }, s.league));
	if (!step) {
		const outcome = closeSeason(s.league, previous.filter((g) => g.competition !== 'copa-do-brasil'), seed, strength);
		const cup = s.cup ? cupView(s.cup, previous, seed, strength) : null;
		const cupChampion = cup?.champion ?? null;
		const nextDate = scheduleDate(s.options, seasonStartDate(outcome.next.season));
		const nextCup = s.options?.competition === 'league' ? null : projectedCup(outcome.next, { cChampion: outcome.champions['serie-c'], dChampion: outcome.champions['serie-d'] });
		for (const club of Object.keys(s.clubs)) {
			const division = divisionOf(s.league, club), nextDivision = divisionOf(outcome.next, club);
			if (!division || !nextDivision) continue;
			const table = outcome.tables[division] ?? [];
			const rank = table.find((r) => r.clubId === club)?.position ?? table.length;
			const nextIds = outcome.next.divisions[nextDivision] ?? [];
			const rule = nextDivision === 'liga-brasfc' ? { promoted: 0, relegated: 0 } : effectiveRule(outcome.next, nextDivision);
			s.clubs[club] = closeClubSeason(s.clubs[club], seed, club, s.league.season, tierOfDivision(division), {
				position: rank, size: table.length, division,
				promoted: outcome.moves.some((m) => m.clubId === club && m.reason === 'acesso'),
				relegated: outcome.moves.some((m) => m.clubId === club && m.reason === 'rebaixamento'),
				champion: outcome.champions[division] === club, cupPhase: cup ? clubCupRun(cup, club)?.lastPhase ?? 0 : 0,
				nextTier: tierOfDivision(nextDivision), nextDivision,
				rank: [...nextIds].sort((a, b) => strength(b) - strength(a)).indexOf(club) + 1,
				nextSize: nextIds.length, promotion: rule.promoted, relegation: rule.relegated, inCupNext: !!nextCup && Object.values(nextCup.entrants).some((entry) => entry.includes(club))
			}).state;
		}
		const champions = { ...outcome.champions, ...(cupChampion ? { 'copa-do-brasil': cupChampion } : {}) };
		s.champions.push({ season: s.league.season, clubs: champions });
		s.activity = [...(s.activity ?? []), { id: `season:${s.league.season}`, actor: 'Liga', action: 'season', date: s.date }].slice(-120);
		for (const person of active) {
			if (person.role !== 'player') {
				const awards = Object.entries(champions).filter(([, club]) => club === person.club)
					.map(([competition]) => ({ competition, club: person.club, season: s.league.season }));
				if (awards.length) (s.awards ??= {})[person.profile] = [...(s.awards?.[person.profile] ?? []), ...awards].slice(-40);
			}
			if (person.role === 'player' && person.athlete?.player) {
				const career = context(room, s, person.club, person);
				const stats = previous.flatMap((r) => { const p = r.athletes?.[athleteId(person)]; return p?.stats?.minutes ? [{ ...p.stats, started: p.selection === 'titular' }] : []; });
				const games = stats.length;
				const current = playerState(career, divisionOf(s.league, person.club))!;
				const next = closePlayerSeason(current, person.athlete.player, {
					games, starts: stats.filter((p) => p.started).length, goals: stats.reduce((x,p) => x+p.goals,0),
					assists: stats.reduce((x,p) => x+p.assists,0), minutes: stats.reduce((x,p) => x+p.minutes,0),
					rating: games ? stats.reduce((x,p) => x+p.rating,0)/games : 0
				}, { rating: false, scorer: false }, s.league.season, career.seed);
				if (games && (cupChampion === person.club || Object.values(outcome.champions).includes(person.club))) {
					next.state.awards.push({ season: career.season, label: 'Campeão pelo clube' });
				}
				if (next.state.contract.until <= s.league.season) next.state.contract.until = outcome.next.season;
				const d = next.state.daily;
				if (d.loan && d.loan.until <= s.league.season) {
					moveAthlete(person, d.loan.parent, nextDate);
					d.clubs.push({ clubId: person.club, date: nextDate, kind: 'retorno' });
					d.loan = null;
					d.trust = 48;
					d.support = { ...d.support, fans: 50, squad: 50 };
				}
				d.condition = 100; d.injuryUntil = null; d.drills = [];
				d.renewal = null; d.press = null; d.form = [];
				if (d.sponsor && d.sponsor.until < outcome.next.season) d.sponsor = null;
				for (const key of Object.keys(d.gains) as Array<keyof typeof d.gains>) {
					d.gains[key] = (d.gains[key] ?? 0) * (next.profile.age >= 30 ? 0.55 : 0.85);
				}
				recordProgress({ ...career, data: { ...career.data, player: next.profile } }, next.state, nextDate);
				person.athlete = { ...person.athlete, player: next.profile, playerCareer: next.state };
			}
			if (person.role === 'coach' && s.clubs[person.club]) {
				const career = context(room, s, person.club, person);
				const division = divisionOf(s.league, person.club);
				const position = division ? outcome.tables[division]?.find((row) => row.clubId === person.club)?.position ?? null : null;
				const move = outcome.moves.find((entry) => entry.clubId === person.club)?.reason;
				const result = officeSeasonEnd({ career, office: officeOf(career, s.clubs[person.club], s.league),
					club: s.clubs[person.club], universe: s.universe, division, position, next: outcome.next,
					outcome: division && outcome.champions[division] === person.club ? 'campeao' : move === 'acesso' ? 'acesso' : move === 'rebaixamento' ? 'queda' : 'permanece' });
				s.clubs[person.club] = result.club;
				person.athlete = { ...person.athlete, office: result.office };
				rememberNotices(person, result.news, nextDate, `${s.league.season}:final`);
			}
			person.ready = false;
		}
		s.universe = universeAtSeasonEnd(s.universe, c, s.league, {
			tables: Object.fromEntries(Object.entries(outcome.tables).map(([id, table]) => [id, table.map((r) => r.clubId)])),
			points: Object.fromEntries(Object.values(outcome.tables).flatMap((table) => table.map((r) => [r.clubId, { points: r.points, games: r.played }]))),
			champions: outcome.champions, promoted: outcome.moves.filter((m) => m.reason === 'acesso').map((m) => m.clubId),
			relegated: outcome.moves.filter((m) => m.reason === 'rebaixamento').map((m) => m.clubId), next: outcome.next, cupChampion
		});
		s.league = outcome.next;
		s.cup = nextCup;
		s.date = nextDate;
		expireDeals(s, room, () => true);
		s.step = 0; s.athleteDeals = []; s.last = [];
		return;
	}
	const season = s.league.season;
	const started = performance.now();
	const round = step.kind === 'league' ? step.round : step.matchday;
	if (step.kind === 'league') s.league = prepareRound(s.league, round, previous, seed, strength);
	else s.cup = prepareCup(s.cup!, round, previous, seed, strength);
	const leagueFixtures = scheduledFixtures(s, seasonFixtures(s.league, seed));
	const fixtures = (step.kind === 'league' ? leagueFixtures : scheduledFixtures(s, cupFixtures(s.cup!))).filter((f) => f.round === round);
	const participatingClubs = new Set(active.map((p) => p.club));
	const fitness = (s.fitness ??= {});
	const mastery = (s.mastery ??= {});
	for (const p of active) if (p.role === 'player') {
		const career = context(room, s, p.club, p);
		const state = playerState(career, divisionOf(s.league, p.club))!;
		const dates = fixtures.filter((f) => [f.home, f.away].includes(p.club)).map((f) => f.date);
		p.athlete = { ...p.athlete, playerCareer: advancePlayerDays(career, state, step.date, dates) };
	}
	s.date = step.date;
	const rows: Played[] = [];
	for (const f of fixtures) {
		if (!run && !participatingClubs.has(f.home) && !participatingClubs.has(f.away)) {
			rows.push({ ...simulateOtherFixtures(c, [f], { season, firstSeason: s.firstSeason }, { full: () => false, strengthOf: strength })[0], round });
			continue;
		}
		const team = (id: string) => {
			const projection = context(room, s, id);
			const squad = roster(room, s, id);
			const manager = active.find((p) => p.club === id && p.role === 'coach');
			const opening = s.league.season === s.firstSeason && step.kind === 'league' && round === 1 && catalogClub(s.rosterCatalog, id);
			const saved = manager?.ready
				? recoverTactic(s.tactics[id], squad) ?? (opening ? initialClubTactic(s.rosterCatalog, id, squad) : null)
				: null;
			const ai = aiTeam(projection, id, { season, firstSeason: s.firstSeason }, round).setup;
			const tactical = saved ?? { ...ai.tactic, lineup: [], bench: undefined, formation: ai.tactic.formation };
			const identity = getClub(id)!;
			const built = buildTeamSetup({ id, name: identity.name, short: identity.short, colors: identity.colors }, squad, tactical);
			built.tactic.instructions = tactical.instructions; built.tactic.roles = tactical.roles;
			built.coach = ai.coach;
			// Apply the chosen difficulty only against CPU clubs in a human fixture.
			const humanFixture = participatingClubs.has(f.home) || participatingClubs.has(f.away);
			if (!manager && !participatingClubs.has(id) && humanFixture && s.options?.difficulty && s.options.difficulty !== 'standard') {
				const level = s.options.difficulty === 'advanced' ? 82 : 38;
				built.familiarity = { execution: level, setPieces: level };
			}
			if (saved) {
				const trained = sanitizeTacticalState(mastery[id], squad, saved.formation, saved.style);
				built.familiarity = engineFamiliarity(trained, saved.formation, saved.style, built.tactic.lineup, resolveRoles(saved.formation, saved.roles), saved.instructions);
			}
			return built;
		};
		const official = run?.finished?.[rows.length];
		const home = official?.replay.home ?? team(f.home), away = official?.replay.away ?? team(f.away);
		const replay: Replay = official?.replay ?? { home, away, seed: matchSeed({ seed }, season, round, f.home, f.competition),
			neutral: Boolean('neutral' in f && f.neutral), version: ENGINE_VERSION };
		if (run?.prepare) {
			replay.ai = { home: !active.some((p) => p.club === f.home && p.role === 'coach'),
				away: !active.some((p) => p.club === f.away && p.role === 'coach') };
			run.prepare.push({ competition: f.competition, replay, venue: replay.neutral ? s.cup?.finalVenue : getClub(f.home)?.stadium });
			continue;
		}
		if (run?.finished && (!official || home.id !== f.home || away.id !== f.away)) fail('Súmula divergente na rodada.', 409);
		const match = official?.match ?? await playOfficialMatch(replay);
		for (const side of [home, away]) {
			const conditions = (fitness[side.id] ??= {});
			for (const player of side.players) {
				const stats = match.players[player.id];
				if (stats?.minutes && !player.id.startsWith('human-')) conditions[player.id] = stats.condition;
			}
		}
		const athletes: NonNullable<Played['athletes']> = {};
		for (const p of active.filter((p) => p.role === 'player' && [f.home, f.away].includes(p.club))) {
			const id = athleteId(p), t = p.club === f.home ? home : away, stats = match.players[id];
			const selection = t.tactic.lineup.includes(id) ? 'titular' : t.tactic.bench.includes(id) ? 'reserva' : 'fora';
			const career = context(room, s, p.club, p), state = playerState(career, divisionOf(s.league, p.club))!;
			assessPlayer(career, state, step.date, selection, stats, match.events.some((e) => e.type === 'injury' && e.player === id));
			p.athlete = { ...p.athlete, playerCareer: state };
			athletes[id] = { stats, selection };
		}
		const marketStats = participatingClubs.has(f.home) || participatingClubs.has(f.away)
			? Object.fromEntries(Object.entries(match.players).filter(([, stats]) => stats.minutes > 0)
				.map(([id, { minutes, goals, assists, yellow, red }]) => [id, { minutes, goals, assists, yellow, red }]))
			: undefined;
		rows.push({ home: f.home, away: f.away, round, competition: f.competition,
			homeGoals: match.homeGoals, awayGoals: match.awayGoals, athletes, replay, marketStats,
			events: match.events.filter((e) => ['goal', 'goal_disallowed', 'yellow', 'red', 'injury', 'sub'].includes(e.type)).slice(0, 100) });
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	if (run?.prepare) return;
	const simulationMs = performance.now() - started;
	const writeStarted = performance.now();
	if (rows.length) await tx.query(`INSERT INTO room_world_matches (room_id, season, step, competition, home, away, result)
		SELECT $1,$2,$3,r->>'competition',r->>'home',r->>'away',r FROM jsonb_array_elements($4::jsonb) AS r`,
		[room.id, season, step.key, JSON.stringify(rows)]);
	const roundWriteMs = performance.now() - writeStarted;
	for (const club of participatingClubs) {
		const career = context(room, s, club);
		const division = divisionOf(s.league, club);
		if (!division) continue;
		const game = rows.find((g) => g.home === club || g.away === club);
		const home = game?.home === club;
		const opponent = game ? (home ? game.away : game.home) : '';
		const squad = rosterOf(rosterContext({ ...career, mode: 'player' }, s.league), club);
		const weekly = step.kind === 'league';
		const phase = step.kind === 'cup' && game ? phaseOfMatchday(step.matchday) : null;
		const cupPrize = phase && phase.matchdays[0] === round ? phase.prize ?? 0 : 0;
		s.clubs[club] = processWeek(clubStateOf(career, s.league), { seed, clubId: club, season, round,
			tier: tierOfDivision(division), division, roster: squad, fullWeek: weekly,
			firstSeasonOfCareer: season === s.firstSeason, cupPrize, humanWages: humanWages(s, club),
			match: game ? { home, opponent, competition: game.competition ?? division,
				goalsFor: home ? game.homeGoals : game.awayGoals, goalsAgainst: home ? game.awayGoals : game.homeGoals,
				myStrength: strength(club), opponentStrength: strength(opponent), youthMinutes: 0 } : null }).state;
		if (weekly) {
			const plan = s.plans[club] ?? DEFAULT_PLAN;
			const available = roster(room, s, club);
			const tactic = recoverTactic(s.tactics[club], available) ?? initialClubTactic(s.rosterCatalog, club, available);
			const trained = sanitizeTacticalState(mastery[club], available, tactic.formation, tactic.style);
			mastery[club] = applyTrainingWeek(trained, plan, { ...tactic, roles: resolveRoles(tactic.formation, tactic.roles), squad: available });
			fitness[club] = recoverFitness(fitness[club] ?? {}, squad, plan);
		}
	}
	for (const p of active) {
		p.ready = false;
		if (p.role === 'player' && p.athlete?.playerCareer) {
			const career = context(room, s, p.club, p);
			p.athlete.playerCareer = advancePlayerDays(career, p.athlete.playerCareer, addDays(step.date, 1), [step.date], step.date);
		}
	}
	s.universe = universeAfterStep(s.universe, c, s.league, { round, league: step.kind === 'league', seasonResults: [...previous, ...rows],
		newResults: rows.map((g) => ({ ...g, competition: g.competition ?? 'liga-brasfc' })), strengthOf: strength });
	for (const person of active.filter((member) => member.role === 'coach')) {
		const club = s.clubs[person.club];
		if (!club) continue;
		const career = context(room, s, person.club, person);
		const game = rows.find((item) => [item.home, item.away].includes(person.club));
		const next = leagueFixtures.find((fixture) => fixture.date > step.date && [fixture.home, fixture.away].includes(person.club));
		const office = officeStep({ career, league: s.league, club, office: officeOf(career, club, s.league), universe: s.universe,
			round, isLeague: step.kind === 'league', totalRounds: leagueFixtures.filter((fixture) => fixture.home === person.club).length * 2,
			seasonResults: [...previous, ...rows], userMatch: game ? { ...game, competition: game.competition ?? 'liga-brasfc' } : null,
			nextOpponent: next ? next.home === person.club ? next.away : next.home : null, nextDecisive: false, signedBig: null });
		person.athlete = { ...person.athlete, office: office.office };
		s.clubs[person.club] = office.club;
		s.universe = office.universe;
		rememberNotices(person, office.news, step.date, `${season}:${step.key}`);
	}
	s.activity = [...(s.activity ?? []), { id: `${season}:${step.key}`, actor: 'Liga', action: 'round', date: step.date }].slice(-120);
	s.last = rows.map(({ replay, marketStats: _stats, ...row }) => ({ ...row, replayVersion: replay?.version }));
	s.date = addDays(step.date, 1);
	s.step++;
	const nextRound = marketRound(s);
	expireDeals(s, room, (deal) => deal.expiresRound !== undefined && deal.expiresRound < nextRound);
	return { simulationMs, roundWriteMs };
}

export async function worldRevision(db: Db, room: Room, profile: string) {
	const [row] = await db.query<{ revision: number; status: Room['status'] }>(`SELECT COALESCE(w.revision,0) AS revision,r.status
		FROM rooms r JOIN room_members m ON m.room_id=r.id LEFT JOIN room_worlds w ON w.room_id=r.id
		WHERE r.id=$1 AND m.profile_id=$2`, [room.id, profile]);
	if (!row) fail('Universo não encontrado.', 404);
	if (row.status !== 'open') fail('Universo arquivado.', 410);
	return { revision: Number(row.revision) };
}

export async function worldClubLineup(db: Db, room: Room, profile: string, club: string) {
	const members = await listMembers(db, room.id);
	if (!members.some((member) => member.profileId === profile)) fail('Universo não encontrado.', 404);
	const [row] = await db.query<RecordRow>('SELECT revision, state FROM room_worlds WHERE room_id = $1', [room.id]);
	const state = row ? readState(row) : initial(room);
	if (!divisionOf(state.league, club)) fail('Clube não participa desta temporada.', 404);
	const squad = roster(room, state, club);
	const career = context(room, state, club);
	const model = clubStateOf(career, state.league);
	const opening = catalogClub(state.rosterCatalog, club);
	return {
		...clubLineup(squad, recoverTactic(state.tactics[club], squad) ?? initialClubTactic(state.rosterCatalog, club, squad), opening),
		transferBudget: model.transferBudget,
		wageBudget: model.wageBudget,
		coach: state.universe?.coaches[state.universe.clubs[club]?.coachId ?? '']?.name ?? opening?.coach
	};
}

export async function worldMarket(db: Db, room: Room, profileId: string, params: URLSearchParams) {
	const [row] = await db.query<RecordRow>(`SELECT w.revision,w.state - 'last' - 'universe' - 'plans' - 'mastery' - 'fitness' - 'tactics' AS state
		FROM room_worlds w JOIN room_members m ON m.room_id=w.room_id
		WHERE w.room_id=$1 AND m.profile_id=$2`, [room.id, profileId]);
	if (!row) fail('Mercado indisponível neste universo.', 404);
	const s = readState(row);
	const coach = s.participants[profileId];
	if (!coach || coach.role === 'player') fail('A busca de atletas é exclusiva da comissão técnica.', 403);
	const career = context(room, s, coach.club, coach);
	const ctx = rosterContext({ ...career, mode: 'player' }, s.league);
	ctx.market.shortlist = s.shortlists?.[coach.club] ?? [];
	const humans = new Map(Object.values(s.participants).filter((person) => person.role === 'coach').map((person) => [person.club, person.profile]));
	const index = marketIndex(`world:${room.id}:${coach.club}:${row.revision}`, coach.club, ctx, s.league, clubStateOf(career, s.league), humans, s.cup ? Object.values(s.cup.entrants).flat() : []);
	const id = params.get('player');
	if (!id) return queryMarket(index, readMarketFilters(params));
	const player = marketProfile(index, id);
	if (!player) fail('Atleta indisponível neste mercado.', 404);
	const stats = await db.query<{ season: number; games: number; minutes: number; goals: number; assists: number; yellow: number; red: number }>(
		`SELECT season, count(*)::int AS games, sum((stats->>'minutes')::int)::int AS minutes,
			sum((stats->>'goals')::int)::int AS goals, sum((stats->>'assists')::int)::int AS assists,
			sum((stats->>'yellow')::int)::int AS yellow, sum((stats->>'red')::int)::int AS red
		FROM (SELECT season, result->'marketStats'->$2::text AS stats FROM room_world_matches WHERE room_id=$1) m
		WHERE stats IS NOT NULL GROUP BY season ORDER BY season DESC`, [room.id, id]);
	player.stats = stats;
	player.transfers = (s.marketTransfers ?? []).filter((transfer) => transfer.playerId === id).slice(-30).reverse();
	return player;
}

export async function worldReplay(db: Db, room: Room, profile: string, home: string, away: string) {
	const [row] = await db.query<RecordRow>(`SELECT w.revision,w.state FROM room_worlds w JOIN room_members m ON m.room_id=w.room_id
		WHERE w.room_id=$1 AND m.profile_id=$2`, [room.id, profile]);
	if (!row) fail('Partida não encontrada.', 404);
	const s = readState(row);
	const club = s.participants[profile]?.club;
	if (!club || ![home, away].includes(club) || !s.last.some((g) => g.home === home && g.away === away)) fail('Partida não encontrada.', 404);
	const step = schedule(s)[s.step - 1]?.key;
	const [match] = await db.query<{ replay: Replay }>(`SELECT result->'replay' AS replay FROM room_world_matches
		WHERE room_id=$1 AND season=$2 AND step=$3 AND home=$4 AND away=$5`, [room.id, s.league.season, step, home, away]);
	if (!match?.replay || !supportsEngineVersion(match.replay.version)) fail('Reprodução indisponível.', 404);
	return match.replay;
}

type RoundConnection = { online: () => ReadonlySet<string>; now?: () => number; timing?: (stage: string, ms: number) => void };
function financialPlayer(s: WorldState, command: FinancialCommand): string | undefined {
	if (command.action === 'deal') return command.player;
	if (command.action === 'club') return command.request.playerId;
	return s.deals.find((deal) => deal.id === command.id)?.player;
}

function cancelFinanceDrafts(s: WorldState, author: string) {
	for (const draft of s.financeDrafts ?? []) if (draft.author === author && draft.status === 'pending') draft.status = 'cancelled';
}

export async function applyWorldCommand(db: Db, room: Room, profile: string, body: Record<string, unknown>, connection?: RoundConnection): Promise<{
	revision: number; duplicate: boolean; message?: string; timing?: { simulationMs: number; roundWriteMs: number };
}> {
	const op = body.op;
	if (typeof op !== 'string' || !isUuid(op) || !Number.isInteger(body.revision)) fail('Comando ou revisão inválida.', 400);
	return db.transaction(async (tx) => {
		const [identity] = await tx.query<{ owner_id: string; status: string; started: boolean; entry_mode: string; assistants_required: boolean }>('SELECT owner_id, status, started, entry_mode, assistants_required FROM rooms WHERE id = $1 FOR UPDATE', [room.id]);
		const members = await listMembers(tx, room.id);
		const member = members.find((m) => m.profileId === profile);
		if (!identity || !member) fail('Universo não encontrado.', 404);
		if (identity.status !== 'open') fail('Universo arquivado.', 410);
		const [row] = await tx.query<RecordRow>('SELECT revision, state FROM room_worlds WHERE room_id = $1', [room.id]);
		const [receipt] = await tx.query<{ revision: number }>('SELECT revision FROM room_world_operations WHERE room_id=$1 AND profile_id=$2 AND operation_id=$3', [room.id, profile, op]);
		if (receipt) return { revision: Number(receipt.revision), duplicate: true };
		const revision = Number(row?.revision ?? 0);
		if (body.revision !== revision) fail('O universo mudou. Revise o estado atualizado antes de tentar novamente.', 409);
		const s = row ? readState(row) : initial(room);
		const p = s.participants[profile];
		const owner = identity.owner_id === profile;
		const requested = body.action;
		let action = requested;
		const [activeRound] = await tx.query('SELECT 1 FROM room_live_rounds WHERE room_id=$1', [room.id]);
		if (activeRound) fail('A rodada está em andamento. Conclua a sessão antes de alterar o universo.', 409);
		let timing: Awaited<ReturnType<typeof advance>> = undefined;
		let outcomeMessage: string | undefined;
		let actingCoach = p?.role === 'coach' ? p : undefined;
		let queued = false;
		let reviewed: FinanceDraft | undefined;
		let counterparty = typeof body.id === 'string' ? s.deals.find((deal) => deal.id === body.id) : undefined;
		const managed = () => { if (!actingCoach) fail('Apenas o treinador principal pode realizar esta ação.', 403); return actingCoach; };
		if (requested === 'finance-review') {
			const coach = managed();
			reviewed = s.financeDrafts?.find((draft) => draft.id === body.id && draft.club === coach.club && draft.status === 'pending');
			if (!reviewed || typeof body.approve !== 'boolean') fail('Solicitação indisponível.', 409);
			if (!body.approve) {
				reviewed.status = 'declined';
				outcomeMessage = 'Solicitação recusada pelo treinador.';
				queued = true;
			} else {
				const author = s.participants[reviewed.author];
				const command = author?.role === 'assistant' && author.club === coach.club && author.financeIssuer === coach.profile && author.finance
					? delegatedFinancialCommand(reviewed.command, author.finance) : null;
				if (!command) fail('A autorização do auxiliar mudou. Revise ou recuse a solicitação.', 409);
				body = { ...command };
				action = command.action;
				reviewed.status = 'approved';
			}
		} else if (p?.role === 'assistant' && (action === 'deal' || action === 'contract-deal' || action === 'club')) {
			const supervisor = Object.values(s.participants).find((person) => person.role === 'coach' && person.club === p.club);
			const command = p.finance && delegatedFinancialCommand(body, p.finance);
			if (!supervisor || p.financeIssuer !== supervisor.profile || !p.finance || !command) fail('A operação excede a permissão financeira concedida pelo treinador.', 403);
			if (p.finance.mode === 'review') {
				const playerId = financialPlayer(s, command);
				const seller = command.action === 'deal' ? s.participants[command.target] : undefined;
				const deal = command.action === 'contract-deal' ? s.deals.find((item) => item.id === command.id && item.to === p.club && item.agreement) : undefined;
				const from = seller?.club ?? deal?.from;
				if ((command.action === 'deal' && (!seller || seller.role !== 'coach' || seller.club === p.club)) ||
					(command.action === 'contract-deal' && !deal)) fail('Proposta indisponível.', 409);
				const clubs = from ? [from] : command.action === 'club' && command.request.action === 'renovar' ? [p.club] : clubList(s);
				const ctx = rosterContext({ ...context(room, s, p.club), mode: 'player' }, s.league);
				const currentClub = playerId ? currentClubOf(ctx, playerId) : null;
				const player = playerId ? findPlayer(ctx, playerId) : null;
				if (!player || player.pending || (currentClub ? !clubs.includes(currentClub) :
					command.action !== 'club' || command.request.kind !== 'livre')) fail('Atleta indisponível.', 409);
				const drafts = s.financeDrafts ?? [];
				if (drafts.filter((draft) => draft.status === 'pending').length >= 32 ||
					drafts.some((draft) => draft.status === 'pending' && draft.author === profile && financialPlayer(s, draft.command) === playerId)) {
					fail('Já existe uma solicitação pendente para este atleta ou a fila está cheia.', 409);
				}
				s.financeDrafts = [...drafts.filter((draft) => draft.status !== 'pending').slice(-31),
					...drafts.filter((draft) => draft.status === 'pending'),
					{ id: op, author: profile, authorName: member.displayName, club: p.club, player: player.name,
						date: s.date, command, status: 'pending' }];
				outcomeMessage = 'Solicitação enviada ao treinador para revisão.';
				queued = true;
			} else {
				actingCoach = supervisor;
				body = { ...command };
			}
		}
		if (action === 'contract-deal' && typeof body.id === 'string') counterparty = s.deals.find((deal) => deal.id === body.id);
		if ((action === 'deal' || action === 'club') && body.request && typeof body.request === 'object') {
			body = { ...body, request: { ...body.request, operation: op } };
		}
		if (queued) {
			// A proposta só altera o mercado quando executada pelo fluxo oficial.
		} else if (action === 'assign') {
			const role = body.role, club = body.club;
			if (owner && !p && identity.entry_mode !== 'mixed' && role !== identity.entry_mode) fail('A função do criador deve seguir o modo escolhido.');
			if (role !== 'coach' && role !== 'assistant' && role !== 'player') fail('Escolha uma função.');
			if (typeof club !== 'string' || !clubList(s).includes(club)) fail('Escolha um clube da temporada.');
			if (p?.role === 'player') fail('Um atleta muda de clube pelo mercado.');
			if (p && role === 'player') fail('Este participante já tem uma carreira técnica.');
			if (role !== 'player') {
				const [reserved] = await tx.query<{ recipient: string }>(`SELECT recipient FROM room_invitations
					WHERE room_id=$1 AND club=$2 AND role=$3 AND status='pending' AND expires_at>now()`, [room.id, club, role]);
				if (reserved && reserved.recipient !== profile) fail('A vaga está reservada para outro participante.', 409);
				if (identity.entry_mode !== 'mixed' && role === 'assistant' && !reserved && (p?.role !== 'assistant' || p.club !== club)) fail('O treinador precisa convidar você para a comissão.', 403);
			}
			if (role !== 'player' && Object.values(s.participants).some((x) => x.profile !== profile && x.role === role && x.club === club)) fail('Esta função já está ocupada.', 409);
			if (role === 'assistant' && !Object.values(s.participants).some((x) => x.role === 'coach' && x.club === club && x.profile !== profile)) fail('Escolha um clube com treinador humano.');
			if (p?.role === 'assistant' && role === 'coach' && s.vacancies[profile] !== club) fail('Aceite uma proposta para assumir outro clube.');
			const appearance = body.appearance ?? p?.appearance ?? p?.athlete?.appearance;
			if (appearance !== undefined && !isAppearance(appearance)) fail('Aparência inválida.');
			let athlete: CareerData | undefined;
			if (role === 'player') {
				const validated = validateCreateCareer({ ...body, mode: 'player', world: 'brasil', clubId: club, appearance: appearance ?? DEFAULT_APPEARANCE });
				if (!validated.ok) fail(Object.values(validated.errors)[0]);
				const { player, playerCareer, appearance: playerLook, position, playerFocus } = initialCareerData(validated.value, hashString(room.id + profile));
				playerCareer!.contract.until = s.league.season + 2;
				playerCareer!.daily.clubs = [{ clubId: club, date: s.date, kind: 'inicio' }];
				athlete = { player, playerCareer, appearance: playerLook, position, playerFocus };
			}
			const name = role === 'player' ? String(body.personName).trim() : member.displayName;
			s.participants[profile] = { profile, name, role, club, appearance, athlete: athlete ?? p?.athlete, notices: p?.notices, ready: false, history: [...(p?.history ?? s.alumniHistory?.[profile] ?? []), { club, role, date: s.date }] };
			if (role !== p?.role || club !== p?.club) {
				cancelFinanceDrafts(s, profile);
				if (p?.role === 'coach') for (const former of Object.values(s.participants)) {
					if (former.role !== 'assistant' || former.club !== p.club) continue;
					former.finance = undefined;
					former.financeIssuer = undefined;
					cancelFinanceDrafts(s, former.profile);
				}
			} else {
				const assignment = s.participants[profile];
				assignment.finance = p.finance;
				assignment.financeIssuer = p.financeIssuer;
				assignment.delegated = p.delegated;
				assignment.lineupDelegated = p.lineupDelegated;
				assignment.matchDelegated = p.matchDelegated;
			}
			delete s.vacancies[profile];
		} else if (action === 'decline-vacancy') {
			if (p?.role !== 'assistant' || typeof body.club !== 'string' || s.vacancies[profile] !== body.club) fail('Vaga indisponível.', 409);
			delete s.vacancies[profile];
		} else if (action === 'leave-commission') {
			if (p?.role !== 'assistant') fail('Apenas o auxiliar pode sair da comissão por este comando.', 403);
			(s.alumniHistory ??= {})[profile] = [...p.history, { club: p.club, role: 'left', date: s.date }];
			cancelFinanceDrafts(s, profile);
			delete s.participants[profile];
			delete s.vacancies[profile];
		} else if (action === 'appearance') {
			if (!p || !isAppearance(body.appearance)) fail('Aparência inválida.');
			p.appearance = body.appearance;
			if (p.role === 'player') p.athlete = { ...p.athlete, appearance: body.appearance };
		} else if (action === 'ready') {
			if (!p || typeof body.value !== 'boolean') fail('Selecione sua função antes de confirmar.');
			p.ready = body.value;
		} else if (action === 'tactic') {
			const coach = Object.values(s.participants).find((person) => person.club === p?.club && person.role === 'coach');
			if (!p || !coach || (p.role !== 'coach' && !(p.role === 'assistant' && (p.lineupDelegated ?? p.matchDelegated)))) {
				fail('É necessária autorização para alterar a tática do clube.', 403);
			}
			const tactic = sanitizeTactic(body.tactic, roster(room, s, p.club));
			if (!tactic) fail('A escalação ou tática é inválida.');
			s.tactics[p.club] = tactic;
			for (const member of Object.values(s.participants)) if (member.club === p.club) member.ready = false;
		} else if (action === 'training') {
			const boss = Object.values(s.participants).find((x) => x.role === 'coach' && x.club === p?.club);
			if (!p || (p.role !== 'coach' && !(p.role === 'assistant' && p.delegated && boss))) fail('Treino coletivo exige permissão do treinador.', 403);
			s.plans[p.club] = sanitizePlan(body.plan);
			p.ready = false;
			if (boss) boss.ready = false;
		} else if (action === 'delegate') {
			const coach = managed(), assistant = typeof body.target === 'string' ? s.participants[body.target] : null;
			if (!assistant || assistant.role !== 'assistant' || assistant.club !== coach.club || typeof body.value !== 'boolean') fail('Auxiliar inválido.');
			if (body.area === 'match') assistant.matchDelegated = body.value;
			else if (body.area === 'lineup') assistant.lineupDelegated = body.value;
			else assistant.delegated = body.value;
		} else if (action === 'delegate-finance') {
			const coach = managed(), assistant = typeof body.target === 'string' ? s.participants[body.target] : null;
			const grant = sanitizeFinanceGrant(body.grant);
			if (!assistant || assistant.role !== 'assistant' || assistant.club !== coach.club || !grant) fail('Auxiliar ou limites inválidos.');
			assistant.finance = grant.offers || grant.contracts ? grant : undefined;
			assistant.financeIssuer = assistant.finance ? coach.profile : undefined;
			if (!assistant.finance) cancelFinanceDrafts(s, assistant.profile);
		} else if (action === 'vacancy') {
			if (!owner) fail('Apenas o administrador pode oferecer uma vaga.', 403);
			if (typeof body.target !== 'string' || s.participants[body.target]?.role !== 'assistant' || typeof body.club !== 'string' || !clubList(s).includes(body.club) ||
				Object.values(s.participants).some((x) => x.role === 'coach' && x.club === body.club)) fail('Vaga indisponível.');
			s.vacancies[body.target] = body.club;
		} else if (action === 'deal' || action === 'accept-deal' || action === 'reject-deal' || action === 'counter-deal' || action === 'contract-deal') {
			const coach = managed();
			const window = stepOf(s) && transferWindow(marketRound(s));
			if (!window) fail('Janela fechada.');
			const validFee = (fee: unknown): fee is number => typeof fee === 'number' && Number.isInteger(fee) && fee >= 0 && fee <= 2e9;
			if (action === 'deal') {
				const seller = s.participants[String(body.target)], fee = body.fee, player = body.player;
				if (!seller || seller.role !== 'coach' || seller.club === coach.club || !validFee(fee) ||
					typeof player !== 'string' || !rosterOf(rosterContext({ ...context(room, s, seller.club), mode: 'player' }, s.league), seller.club).some((a) => a.id === player && !a.loan && !a.pending)) fail('Oferta inválida.');
				if (s.deals.length >= 32 || s.deals.some((d) => d.to === coach.club && d.player === player)) fail('Já existe proposta ou o limite foi atingido.');
				s.deals.push({ id: op, from: seller.club, to: coach.club, fee, player, proposedAt: s.date, expiresRound: window === 'pre-temporada' ? 8 : 27 });
			} else {
				const deal = s.deals.find((item) => item.id === body.id && (item.agreement ? item.to : item.counter ? item.to : item.from) === coach.club);
				if (!deal || (deal.agreement && action !== 'contract-deal' && action !== 'reject-deal')) fail('Proposta indisponível.', 409);
				if (action === 'contract-deal') {
					if (!deal.agreement || !Object.values(s.participants).some((person) => person.role === 'coach' && person.club === deal.from)) fail('Acordo entre clubes indisponível.', 409);
					const { wage, years, role } = body;
					if (typeof wage !== 'number' || !Number.isInteger(wage) || wage < 500 || wage > 1e8 ||
						typeof years !== 'number' || !Number.isInteger(years) || years < 1 || years > 5 ||
						typeof role !== 'string' || !Object.hasOwn(ROLE_LABELS, role)) fail('Informe salário, duração e papel válidos.');
					const buyer = context(room, s, deal.to), seller = clubStateOf(context(room, s, deal.from), s.league);
					const ctx = { ...actionContext(buyer, s.league, rosterContext({ ...buyer, mode: 'player' }, s.league), marketRound(s)), additionalWages: humanWages(s, deal.to) };
					const offer = makeOffer(clubStateOf(buyer, s.league), s.market, ctx,
						{ playerId: deal.player, kind: 'compra', fee: deal.fee, wage, years, role: role as ContractRole }, op, deal.from);
					outcomeMessage = offer.message;
					if (!offer.negotiation?.done) deal.contractMessage = offer.message;
					else {
						s.clubs[deal.to] = { ...offer.club, negotiations: offer.club.negotiations.filter((entry) => entry.op !== op) };
						s.clubs[deal.from] = { ...seller, balance: seller.balance + deal.fee, transferBudget: seller.transferBudget + Math.round(deal.fee / 2) };
						s.market = offer.market;
						s.market.listed = s.market.listed.filter((player) => player !== deal.player);
						rememberMarketTransfers(s, [{ playerId: deal.player, from: deal.from, to: deal.to, fee: deal.fee, kind: 'compra', gameDate: s.date }]);
						expireDeals(s, room, (other) => other.id !== deal.id && other.player === deal.player);
						s.deals = s.deals.filter((other) => other.id !== deal.id);
						s.dealHistory = [...(s.dealHistory ?? []), { ...deal, name: offer.negotiation.playerName ?? deal.player, date: s.date, status: 'aceita' as const }].slice(-64);
					}
				} else if (action === 'accept-deal' && identity.entry_mode !== 'mixed') {
					deal.agreement = true;
				} else if (action === 'counter-deal') {
					if (deal.counter || !validFee(body.fee)) fail('Contraproposta inválida.');
					deal.fee = body.fee;
					deal.counter = true;
				} else {
					const accepted = action === 'accept-deal';
					if (accepted) {
						const buyer = clubStateOf(context(room, s, deal.to), s.league), seller = clubStateOf(context(room, s, deal.from), s.league);
						const target = rosterOf(rosterContext({ ...context(room, s, deal.from), mode: 'player' }, s.league), deal.from).find((x) => x.id === deal.player && !x.loan);
						const buyers = rosterOf(rosterContext({ ...context(room, s, deal.to), mode: 'player' }, s.league), deal.to);
						const wages = payroll(buyers) + humanWages(s, deal.to);
						const limit = buyer.wageBudget || initialWageBudget(wages, clubEconomy(deal.to, tierOfDivision(divisionOf(s.league, deal.to))).tvAnnual);
						if (target && (buyers.length >= 34 || wages + target.contract.wage > limit)) fail('O comprador excederia o limite de elenco ou folha.', 409);
						if (!target || buyer.balance < deal.fee || buyer.transferBudget < deal.fee) fail('Atleta ou orçamento indisponível.', 409);
						s.clubs[deal.to] = { ...buyer, balance: buyer.balance - deal.fee, transferBudget: buyer.transferBudget - deal.fee, wageBudget: limit };
						s.clubs[deal.from] = { ...seller, balance: seller.balance + deal.fee, transferBudget: seller.transferBudget + Math.round(deal.fee / 2) };
						s.market.players[deal.player] = { club: deal.to, since: s.date, contract: target.contract };
						s.market.listed = s.market.listed.filter((id) => id !== deal.player);
						rememberMarketTransfers(s, [{ playerId: deal.player, from: deal.from, to: deal.to, fee: deal.fee, kind: 'compra', gameDate: s.date }]);
					}
					const closed = s.deals.filter((item) => accepted ? item.player === deal.player : item.id === deal.id);
					const name = roster(room, s, accepted ? deal.to : deal.from).find((p) => p.id === deal.player)?.name ?? deal.player;
					s.dealHistory = [...(s.dealHistory ?? []), ...closed.map((item): SettledDeal => ({
						...item, name, date: s.date, status: item.id === deal.id ? accepted ? 'aceita' : 'recusada' : 'encerrada'
					}))].slice(-64);
					s.deals = s.deals.filter((item) => !closed.includes(item));
				}
			}
		} else if (action === 'club') {
			const coach = managed(), c = context(room, s, coach.club, coach);
			const plan = careerView(c, await results(tx, room, s.league.season, true));
			const club = clubStateOf(c, s.league);
			const ctx = { ...actionContext(c, s.league, rosterContext({ ...c, mode: 'player' }, s.league), plan.nextRound), additionalWages: humanWages(s, coach.club) };
			const request = body.request;
			if (!request || typeof request !== 'object' || Array.isArray(request)) fail('Ação do clube inválida.');
			const change = request as Record<string, unknown>;
			if (change.action === 'oferta' && typeof change.playerId === 'string') {
				const seller = currentClubOf(ctx.roster, change.playerId);
				if (seller && Object.values(s.participants).some((x) => x.role === 'coach' && x.club === seller)) fail('Negocie pela proposta entre clubes humanos.');
			}
			if (typeof change.action === 'string' && OFFICE_ACTIONS.has(change.action)) {
				const row = plan.standings.find((r) => r.clubId === coach.club);
				const updated = applyOfficeAction(c, s.league, club, plan.nextRound, row?.points ?? 0, row?.position ?? null, change);
				s.clubs[coach.club] = updated.club;
				coach.athlete = { ...coach.athlete, office: updated.office };
			} else {
				const shortlist = s.shortlists?.[coach.club] ?? [];
				const updated = applyAction(club, { ...s.market, shortlist }, ctx, change);
				outcomeMessage = updated.message;
				(s.shortlists ??= {})[coach.club] = updated.market.shortlist;
				s.market = { ...updated.market, shortlist: s.market.shortlist };
				s.clubs[coach.club] = updated.club;
				rememberMarketTransfers(s, updated.transfers.map(({ playerId, from, to, kind, fee }) => ({ playerId, from, to, kind, fee, gameDate: s.date })));
			}
			coach.ready = false;
		} else if (action === 'approve-athlete' || action === 'reject-athlete') {
			const coach = managed(), deals = (s.athleteDeals ??= []);
			const proposal = deals.find((x) => x.offer === body.id && x.profile === body.target && [x.from, x.to].includes(coach.club));
			if (!proposal) fail('Proposta indisponível.', 409);
			const athlete = s.participants[proposal.profile];
			if (!athlete || athlete.role !== 'player' || athlete.club !== proposal.from) fail('Atleta indisponível.');
			if (action === 'approve-athlete') {
				proposal.approvals = [...new Set([...proposal.approvals, coach.club])];
				const required = Object.values(s.participants).filter((x) => x.role === 'coach' && [proposal.from, proposal.to].includes(x.club));
				if (required.every((x) => proposal.approvals.includes(x.club))) {
					const c = context(room, s, athlete.club, athlete);
					const accepted = applyPlayerAction(c, careerView(c, await results(tx, room, s.league.season, true)), { action: 'jogador-aceitar', offerId: proposal.offer });
					if (accepted.clubId !== proposal.to) fail('Destino da proposta mudou.', 409);
					athlete.athlete = { ...athlete.athlete, playerCareer: accepted.state };
					moveAthlete(athlete, accepted.clubId, s.date);
					s.athleteDeals = deals.filter((x) => x.profile !== athlete.profile);
				}
			} else {
				const c = context(room, s, athlete.club, athlete);
				const rejected = applyPlayerAction(c, careerView(c, await results(tx, room, s.league.season, true)), { action: 'jogador-recusar', offerId: proposal.offer });
				athlete.athlete = { ...athlete.athlete, playerCareer: rejected.state };
				s.athleteDeals = deals.filter((x) => x !== proposal);
			}
		} else if (typeof action === 'string' && action.startsWith('jogador-')) {
			if (!p || p.role !== 'player') fail('Ação exclusiva do atleta.', 403);
			const c = context(room, s, p.club, p);
			const result = applyPlayerAction(c, careerView(c, await results(tx, room, s.league.season, true)), body);
			const clubId = result.clubId;
			const requiresApproval = clubId && Object.values(s.participants).some((x) => x.role === 'coach' && [p.club, clubId].includes(x.club));
			if (requiresApproval && typeof body.offerId === 'string') {
				const deals = (s.athleteDeals ??= []);
				if (!deals.some((x) => x.profile === p.profile && x.offer === body.offerId)) {
					deals.push({ profile: p.profile, offer: body.offerId, from: p.club, to: clubId, approvals: [] });
				}
			} else {
				p.athlete = { ...p.athlete, playerCareer: result.state };
				if (clubId) moveAthlete(p, clubId, s.date);
				if (action === 'jogador-recusar') s.athleteDeals = (s.athleteDeals ?? []).filter((x) => x.profile !== p.profile || x.offer !== body.offerId);
			}
			p.ready = false;
		} else {
			if (!owner) fail('Ação exclusiva do administrador.', 403);
			if (action === 'start') {
				if (identity.started) fail('Esta liga já começou.', 409);
				if (!p || members.some((m) => !s.participants[m.profileId])) fail('Todos os membros devem escolher seu clube e sua função.', 409);
				await tx.query('UPDATE rooms SET started=true WHERE id=$1', [room.id]);
			} else if (action === 'advance') {
				if (!identity.started) fail('Inicie a temporada no lobby.', 409);
				if (connection) timing = await beginLiveRound(tx, room, s, connection, identity.assistants_required);
				else timing = await advance(tx, room, s);
			}
			else if (action === 'settings') {
				if (typeof body.allowAbsent !== 'boolean' || typeof body.inviteOpen !== 'boolean') fail('Preferências inválidas.');
				s.allowAbsent = body.allowAbsent; s.inviteOpen = body.inviteOpen;
			} else if (action === 'archive') await tx.query("UPDATE rooms SET status='closed', closed_at=now() WHERE id=$1", [room.id]);
			else if (action === 'remove' || action === 'transfer-owner') {
				if (typeof body.target !== 'string' || body.target === profile || !members.some((m) => m.profileId === body.target)) fail('Participante inválido.');
				if (action === 'remove') {
					const removed = s.participants[body.target];
					if (removed) (s.alumniHistory ??= {})[body.target] = removed.history;
					cancelFinanceDrafts(s, body.target);
					if (removed?.role === 'coach') for (const former of Object.values(s.participants)) {
						if (former.role !== 'assistant' || former.club !== removed.club) continue;
						former.finance = undefined;
						former.financeIssuer = undefined;
						cancelFinanceDrafts(s, former.profile);
					}
					delete s.participants[body.target];
					await tx.query('DELETE FROM room_members WHERE room_id=$1 AND profile_id=$2', [room.id, body.target]);
				} else {
					await tx.query('UPDATE rooms SET owner_id=$2 WHERE id=$1', [room.id, body.target]);
					await tx.query("UPDATE room_members SET role=CASE WHEN profile_id=$2 THEN 'owner' ELSE 'member' END WHERE room_id=$1", [room.id, body.target]);
				}
			} else fail('Ação desconhecida.', 400);
		}
		const activityClub = s.participants[profile]?.club ?? p?.club;
		const clubAction = body.request && typeof body.request === 'object' ? (body.request as { action?: string }).action : undefined;
		const dealing = ['deal', 'accept-deal', 'reject-deal', 'counter-deal', 'contract-deal'].includes(String(action));
		const dealTo = action === 'deal' && typeof body.target === 'string' ? s.participants[body.target]?.club : undefined;
		const scope = dealing && !queued ? [activityClub, counterparty?.from, counterparty?.to, dealTo].filter((id): id is string => !!id)
			: activityClub ? [activityClub] : [];
		const type = requested === 'finance-review' ? reviewed?.status === 'approved' ? 'finance-approved' : 'finance-declined'
			: queued ? 'finance-requested' : action === 'club' ? (['oferta', 'renovar'].includes(clubAction ?? '') ? clubAction : undefined) : action;
		// Administrative and club-only actions are published only to their authorized audience.
		if (typeof type === 'string' && ['start', 'assign', 'leave-commission', 'tactic', 'training', 'delegate', 'delegate-finance',
			'vacancy', 'decline-vacancy', 'finance-requested', 'finance-approved', 'finance-declined', 'deal', 'accept-deal',
			'reject-deal', 'counter-deal', 'contract-deal', 'oferta', 'renovar'].includes(type)) {
			const publicEvent = ['start', 'assign', 'leave-commission'].includes(type);
			const target = reviewed?.author ?? (p?.role === 'assistant' && (dealing || clubAction) ? profile :
				typeof body.target === 'string' ? body.target : undefined);
			s.activity = [...(s.activity ?? []), { id: op, actor: member.displayName, action: type, date: s.date,
				club: activityClub, scope: publicEvent ? undefined : scope, target, author: profile,
				private: type.startsWith('finance-') || type === 'vacancy' || type === 'decline-vacancy',
				decisionClub: type.startsWith('finance-') ? activityClub : undefined }].slice(-120);
		}
		if (!queued && connection && ['assign', 'leave-commission', 'tactic', 'training', 'club', 'accept-deal', 'contract-deal', 'approve-athlete', 'jogador-renovar', 'jogador-aceitar', 'jogador-treinar', 'jogador-cancelar-treino'].includes(String(action))) {
			// Conservatively require a new collective confirmation after a match-relevant change.
			for (const participant of Object.values(s.participants)) participant.ready = false;
		}
		if (connection && action === 'ready' && body.value === true && identity.started && stepOf(s) && allReady(s, connection.online(), identity.assistants_required)) {
			await beginLiveRound(tx, room, s, connection, identity.assistants_required);
		}
		if (!row) await tx.query('INSERT INTO room_worlds (room_id,revision,state) VALUES ($1,$2,$3::jsonb)', [room.id, revision + 1, JSON.stringify(s)]);
		else await tx.query('UPDATE room_worlds SET revision=$2,state=$3::jsonb WHERE room_id=$1', [room.id, revision + 1, JSON.stringify(s)]);
		await tx.query('INSERT INTO room_world_operations (room_id,profile_id,operation_id,revision) VALUES ($1,$2,$3,$4)', [room.id, profile, op, revision + 1]);
		return { revision: revision + 1, duplicate: false, message: outcomeMessage, ...(timing ? { timing } : {}) };
	});
}

function requiredForRound(state: WorldState, assistantsRequired: boolean) {
	return Object.values(state.participants).filter((member) => member.role !== 'assistant' || assistantsRequired);
}
function allReady(state: WorldState, online: ReadonlySet<string>, assistantsRequired: boolean) {
	const members = requiredForRound(state, assistantsRequired);
	return members.length > 0 && members.every((p) => p.ready && online.has(p.profile));
}

async function beginLiveRound(tx: Db, room: Room, s: WorldState, connection: RoundConnection, assistantsRequired: boolean) {
	if (!allReady(s, connection.online(), assistantsRequired)) fail('Todos os participantes precisam estar online e prontos.', 409);
	const step = stepOf(s);
	if (!step) return advance(tx, room, s);
	const fixtures: LiveFixture[] = [];
	await advance(tx, room, structuredClone(s), { prepare: fixtures });
	const round = step.kind === 'cup' ? step.matchday : step.round;
	const required = requiredForRound(s, assistantsRequired).map((person) => person.profile);
	const session = startRound(randomUUID(), s.league.season, step.key, round, step.date, fixtures, required, (connection.now ?? Date.now)());
	await tx.query('INSERT INTO room_live_rounds (room_id,session_id,state,fixtures) VALUES ($1,$2,$3::jsonb,$4::jsonb)', [
		room.id, session.id, JSON.stringify(checkpoint(session)), JSON.stringify(fixtures)
	]);
	rememberFixtures(session.id, fixtures);
}

function canManageRound(player: Assignment, participants: WorldState['participants']) {
	return player.role === 'coach' || (player.role === 'assistant' && !!player.matchDelegated &&
		Object.values(participants).some((coach) => coach.role === 'coach' && coach.club === player.club));
}

function viewLiveRound(round: LiveRound, player: Assignment, participants: WorldState['participants'], online: ReadonlySet<string>, known?: unknown) {
	const matches = enginesFor(round);
	const index = round.fixtures.findIndex(({ replay }) => [replay.home.id, replay.away.id].includes(player.club));
	const fixture = round.fixtures[index];
	const side: Side | null = fixture ? fixture.replay.home.id === player.club ? 'home' : 'away' : null;
	return { id: round.id, season: round.season, round: round.round, date: round.date, phase: round.phase, sequence: round.sequence, since: round.since,
		countdownUntil: round.phase === 'LOADING' && round.since ? round.since + 3000 : null,
		waiting: round.required.filter((id) => !online.has(id)), suspended: round.suspended, tick: round.tick,
		loaded: round.loaded, confirmed: round.confirmed, required: round.required,
		relevant: fixture && side ? { match: matchView(matches[index]), shootout: round.shootouts?.[index], side,
			detail: known === round.id ? undefined : { ...fixture, stadium: fixture.venue ?? getClub(fixture.replay.home.id)?.stadium,
				crew: Object.values(participants).filter((p) => p.role !== 'player' && [fixture.replay.home.id, fixture.replay.away.id].includes(p.club))
					.map(({ club, role, name, appearance }) => ({ club, role, name, appearance })) },
			canManage: canManageRound(player, participants) } : null,
		suggestions: round.suggestions.filter((item) => item.club === player.club),
		role: player.role, athleteId: player.role === 'player' ? athleteId(player) : null,
		fixtures: round.fixtures.map(({ competition, replay }, i) => ({ competition, home: replay.home.id, away: replay.away.id,
			score: { ...matches[i].score }, phase: matches[i].phase, minute: matches[i].minuteLabel(matches[i].tick) })) };
}

async function collectShootouts(tx: Db, room: Room, round: LiveRound) {
	const [row] = await tx.query<RecordRow>('SELECT revision,state FROM room_worlds WHERE room_id=$1', [room.id]);
	const state = readState(row);
	const phase = phaseOfMatchday(round.round);
	if (!state.cup || phase.matchdays.at(-1) !== round.round) return {};
	const seed = seedOf(room);
	const prior = await results(tx, room, round.season, true);
	const matches = enginesFor(round);
	const rows = [...prior, ...round.fixtures.map((fixture, index) => ({
		competition: fixture.competition, round: round.round, home: fixture.replay.home.id, away: fixture.replay.away.id,
		homeGoals: matches[index].score.home, awayGoals: matches[index].score.away
	}))];
	const strength = strengthMemo(rosterContext({ ...context(room, state, state.league.divisions['serie-a']![0]), mode: 'player' }, state.league));
	const cup = prepareCup(state.cup, round.round, prior, seed, strength);
	return Object.fromEntries(round.fixtures.flatMap(({ replay }, index) => {
		const tie = cup.stages[phase.phase - 1]?.find((pair) => pair.includes(replay.home.id) && pair.includes(replay.away.id));
		const penalties = tie && tieOutcome(cup, phase.phase - 1, tie, rows, seed, strength)?.penalties;
		return penalties ? [[index, penalties]] : [];
	}));
}

export async function updateLiveRound(db: Db, room: Room, profile: string, body: Record<string, unknown>, connection: RoundConnection) {
	const started = performance.now();
	return db.transaction(async (tx) => {
		const [identity] = await tx.query('SELECT id FROM rooms WHERE id=$1 AND status=\'open\' FOR UPDATE', [room.id]);
		connection.timing?.('lock', performance.now() - started);
		const readStarted = performance.now();
		if (!identity || !(await listMembers(tx, room.id)).some((member) => member.profileId === profile)) fail('Universo não encontrado.', 404);
		const [row] = await tx.query<{ session_id: string; state: Omit<LiveRound, 'fixtures'> }>(
			'SELECT session_id,state FROM room_live_rounds WHERE room_id=$1', [room.id]
		);
		if (!row) return { session: null };
		const fixtures = preparedFixtures(row.session_id) ?? rememberFixtures(row.session_id,
			(await tx.query<{ fixtures: LiveFixture[] }>('SELECT fixtures FROM room_live_rounds WHERE room_id=$1', [room.id]))[0].fixtures);
		const round = { ...row.state, fixtures };
		const [{ participants }] = await tx.query<{ participants: WorldState['participants'] }>(
			"SELECT state->'participants' AS participants FROM room_worlds WHERE room_id=$1", [room.id]);
		connection.timing?.('read', performance.now() - readStarted);
		const player = participants[profile];
		if (!player) fail('Você não participa desta rodada.', 403);
		const online = connection.online();
		const now = (connection.now ?? Date.now)();
		const action = body.action;
		let changed = false;
		if (action !== 'pulse') {
			if (body.session !== round.id || !isUuid(String(body.op))) fail('Comando de sessão inválido.', 400);
			const request = `${profile}:${body.op}`;
			if (round.requests.includes(request)) return { session: viewLiveRound(round, player, participants, online) };
			if (!online.has(profile)) fail('Reconecte-se à sala para confirmar esta ação.', 409);
			if (round.requests.length >= 512) fail('Limite de operações desta sessão atingido.', 409);
			if (action === 'loaded' && round.phase === 'LOADING') {
				if (!round.loaded.includes(profile)) round.loaded.push(profile);
			} else if (action === 'confirm' && round.phase === 'HALF_TIME' && typeof body.value === 'boolean') {
				round.confirmed = [...round.confirmed.filter((id) => id !== profile), ...(body.value ? [profile] : [])];
			} else if ((action === 'decision' || action === 'suggest') && ['FIRST_HALF', 'HALF_TIME', 'SECOND_HALF'].includes(round.phase)) {
				const decision = parseDecision(body.decision);
				const index = round.fixtures.findIndex(({ replay }) => [replay.home.id, replay.away.id].includes(player.club));
				if (!decision || index < 0) fail('Decisão inválida para este confronto.');
				if (action === 'suggest') {
					if (player.role !== 'assistant') fail('Apenas o auxiliar pode enviar sugestões.', 403);
					round.suggestions.push({ profile, club: player.club, decision, id: String(body.op) });
					round.confirmed = round.confirmed.filter((id) => id !== profile);
				} else {
					if (!canManageRound(player, participants)) fail('Seu cargo não autoriza intervenções.', 403);
					if (body.sequence !== round.sequence) fail('A partida avançou. Revise a decisão.', 409);
					const match = enginesFor(round)[index];
					const side = round.fixtures[index].replay.home.id === player.club ? 'home' : 'away';
					if (match.phase === 'finished') fail('Este confronto já terminou.', 409);
					const atInterval = round.phase === 'HALF_TIME';
					if (atInterval) {
						const rejected = match.prepareInterval(side, decision);
						if (rejected) {
							forgetRound(round.id);
							fail(rejected);
						}
					} else match.submit(side, decision);
					round.submissions.push({ fixture: index, tick: match.tick, side, decision, id: String(body.op), secondHalf: round.phase === 'SECOND_HALF', atInterval });
					round.confirmed = round.confirmed.filter((id) => participants[id]?.club !== player.club);
				}
			} else fail('A ação não é válida nesta fase da rodada.', 409);
			round.requests.push(request);
			round.sequence++;
			keepEngines(round);
			changed = true;
		}
		const engineStarted = performance.now();
		if (await pulseRound(round, online, now)) { round.sequence++; keepEngines(round); changed = true; }
		connection.timing?.('engine', performance.now() - engineStarted);
		if (round.phase === 'FULL_TIME' && round.step.startsWith('cup:') && !round.shootouts) {
			round.shootouts = await collectShootouts(tx, room, round);
			changed = true;
		}
		if (canCommitRound(round, now)) {
			const commitStarted = performance.now();
			const official = enginesFor(round).map((match, index) => {
				const replay = round.fixtures[index].replay;
				const result = match.result();
				return { replay: { ...replay, decisions: result.decisions }, match: result };
			});
			const [world] = await tx.query<RecordRow>('SELECT revision,state FROM room_worlds WHERE room_id=$1', [room.id]);
			const state = readState(world);
			await advance(tx, room, state, { finished: official });
			const revision = Number(world.revision) + 1;
			await tx.query('UPDATE room_worlds SET revision=$2,state=$3::jsonb WHERE room_id=$1', [room.id, revision, JSON.stringify(state)]);
			await tx.query('DELETE FROM room_live_rounds WHERE room_id=$1 AND session_id=$2', [room.id, round.id]);
			forgetRound(round.id);
			connection.timing?.('result', performance.now() - commitStarted);
			return { session: null, revision };
		}
		const checkpointStarted = performance.now();
		if (changed) await tx.query('UPDATE room_live_rounds SET state=$2::jsonb WHERE room_id=$1', [room.id, JSON.stringify(checkpoint(round))]);
		connection.timing?.('checkpoint', performance.now() - checkpointStarted);
		const viewStarted = performance.now();
		const session = viewLiveRound(round, player, participants, online, body.known);
		connection.timing?.('view', performance.now() - viewStarted);
		return { session };
	});
}
