import { estimateRange } from '#lib/domain/academy.ts';
import { scoutMargin } from '#lib/domain/club.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { currentClubOf, freeAgents, rosterOf, type RosterContext, type RosterPlayer } from '#lib/domain/market.ts';
import type { ClubState } from '#lib/domain/management.ts';
import { POSITIONS, type Position } from '#lib/domain/positions.ts';
import type { DivisionId, LeagueState } from '#lib/domain/league.ts';
import { visibleSquadAge } from '#lib/domain/squad.ts';
import { ALL_ATTRIBUTES, GOALKEEPING, type AttributeKey } from '#lib/engine/attributes.ts';
import { MARKET_SORTS, MARKET_STATUS, normalizeSearch, type MarketAthlete, type MarketCompetition, type MarketFilters, type MarketProfile, type MarketResults, type Rating } from '#lib/domain/market-search.ts';
import type { worldCatalog } from './world-catalog.ts';

const PAGE_SIZE = 24;
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const midpoint = (rating?: Rating | null) => rating ? (rating.min + rating.max) / 2 : null;
const rating = ([min, max]: [number, number]): Rating => ({ min, max });
const inRange = (value: number | null, min?: number, max?: number) =>
	(min === undefined && max === undefined) || (value !== null && (min === undefined || value >= min) && (max === undefined || value <= max));

interface Entry {
	row: MarketAthlete;
	search: string;
	athlete: RosterPlayer;
	margin: number;
}
interface Index {
	clubs: MarketResults['clubs'];
	world?: ReturnType<typeof worldCatalog>;
	entriesFor: (clubId: string) => Entry[];
	ctx: RosterContext;
	clubId: string;
	humans: ReadonlyMap<string, string>;
	cupClubs: ReadonlySet<string>;
	competitions: MarketCompetition[];
}
const cache = new Map<string, Index>();

export function marketIndex(key: string, clubId: string, ctx: RosterContext, league: LeagueState, club: ClubState, humans: ReadonlyMap<string, string> = new Map(), cupEntrants: string[] = [], world?: ReturnType<typeof worldCatalog>): Index {
	const hit = cache.get(key);
	if (hit) {
		cache.delete(key);
		cache.set(key, hit);
		return hit;
	}
	const scope = key.slice(0, key.lastIndexOf(':'));
	for (const saved of cache.keys()) if (saved.slice(0, saved.lastIndexOf(':')) === scope) cache.delete(saved);
	const divisions = new Map(Object.entries(league.divisions).flatMap(([division, ids]) => ids.map((id) => [id, division as DivisionId] as const)));
	const cupClubs = new Set(cupEntrants.filter((id) => Boolean(getClub(id))));
	const competitions = [...new Set<MarketCompetition>(divisions.values())];
	if (cupClubs.size) competitions.push('copa-do-brasil');
	const clubs = [...new Set([...divisions.keys(), ...cupClubs, ...(league.selection ? league.pool ?? [] : [])])].map((id) => ({
		id, division: divisions.get(id) ?? null, name: getClub(id)?.name ?? id
	})).sort((a, b) => collator.compare(a.name, b.name));
	const reports = new Map(club.reports.map((entry) => [entry.playerId, entry]));
	const observed = new Set(ctx.market.shortlist);
	const listed = new Set(ctx.market.listed);
	const clubsById = new Map([...clubs, ...(world?.clubs ?? [])].map((team) => [team.id, team]));
	const cacheByClub = new Map<string, Entry[]>();
	function entriesFor(id: string) {
		const cached = cacheByClub.get(id);
		if (cached) return cached;
		const team = clubsById.get(id);
		if (id && !team) return [];
		const roster = team ? rosterOf(ctx, id) : freeAgents(ctx);
		const entries: Entry[] = [];
		const counts = new Map<Position, number>();
		for (const p of roster) counts.set(p.position, 1 + (counts.get(p.position) ?? 0));
		for (const athlete of roster) {
			if (athlete.pending) continue;
			const { id, name, position, secondary = [], nationality, value, contract, loan } = athlete;
			const own = team?.id === clubId;
			const report = reports.get(id);
			const range = estimateRange(athlete.overall, scoutMargin(club.infra.observacao.level, 10), `${scope}:${id}`);
			const until = team ? contract.until : null;
			const row: MarketAthlete = {
				id, name, position, secondary, nationality, value, age: visibleSquadAge(athlete),
				club: team?.id ?? '', clubName: team?.name ?? 'Sem clube', division: team?.division ?? null,
				overall: rating(own ? [athlete.overall, athlete.overall] : report?.overall ?? range),
				potential: own ? rating([athlete.potential, athlete.potential]) : report ? rating(report.potential) : null,
				wage: team ? contract.wage : null, until, years: until === null ? null : Math.max(0, until - ctx.season + 1),
				status: !team ? 'livre' : loan ? 'emprestado' : contract.until <= ctx.season ? 'fim-de-contrato' : 'contratado',
				observed: observed.has(id), report: Boolean(report), listed: listed.has(id),
				loanable: Boolean(team && !own && !humans.has(team.id) && !loan && contract.role !== 'titular' && (counts.get(position) ?? 0) > 1)
			};
			entries.push({
				row, athlete, margin: own ? 0 : report ? Math.max(2, Math.ceil((report.overall[1] - report.overall[0]) / 2)) : scoutMargin(club.infra.observacao.level, 10),
				search: normalizeSearch(`${name} ${athlete.shortName} ${row.clubName} ${nationality ?? ''} ${position} ${secondary.join(' ')}`)
			});
		}
		cacheByClub.set(id, entries);
		if (cacheByClub.size > clubs.length + 80) cacheByClub.delete(cacheByClub.keys().next().value!);
		return entries;
	}
	const index = { ctx, clubId, humans, clubs, world, cupClubs, competitions, entriesFor };
	cache.set(key, index);
	if (cache.size > 8) cache.delete(cache.keys().next().value!);
	return index;
}

function attr(entry: Entry, key: AttributeKey): Rating | null {
	if (entry.row.position !== 'GOL' && (GOALKEEPING as readonly string[]).includes(key)) return null;
	const value = entry.athlete.attributes?.[key];
	if (!Number.isFinite(value)) return null;
	return rating(entry.margin ? estimateRange(value, entry.margin, `${entry.row.id}:${key}`) : [value, value]);
}

export function readMarketFilters(params: URLSearchParams): MarketFilters {
	const str = (key: string) => params.get(key)?.trim().slice(0, 100) || undefined;
	const num = (key: string) => {
		const val = str(key);
		if (val === undefined) return;
		const n = Number(val);
		return Number.isFinite(n) && n >= 0 ? n : undefined;
	};
	const match = <T extends string>(key: string, values: readonly T[]) => values.find((item) => item === str(key));
	return {
		world: params.get('world') === 'true',
		q: str('q'), position: match('position', POSITIONS), secondary: match('secondary', POSITIONS),
		club: str('club'), division: str('division') as MarketCompetition | undefined, nationality: str('nationality'),
		status: match('status', Object.keys(MARKET_STATUS) as Array<keyof typeof MARKET_STATUS>),
		sort: match('sort', Object.keys(MARKET_SORTS) as Array<keyof typeof MARKET_SORTS>), direction: match('direction', ['asc', 'desc'] as const),
		ageMin: num('ageMin'), ageMax: num('ageMax'), overallMin: num('overallMin'), overallMax: num('overallMax'),
		potentialMin: num('potentialMin'), potentialMax: num('potentialMax'), valueMin: num('valueMin'), valueMax: num('valueMax'),
		wageMin: num('wageMin'), wageMax: num('wageMax'), yearsMin: num('yearsMin'), yearsMax: num('yearsMax'),
		attribute: match('attribute', ALL_ATTRIBUTES), attributeMin: num('attributeMin'),
		listed: str('listed') === 'true', loanable: str('loanable') === 'true', observed: str('observed') === 'true',
		page: num('page')
	};
}

export function queryMarket(index: Index, f: MarketFilters): MarketResults {
	const words = normalizeSearch(f.q ?? '').split(' ').filter(Boolean);
	const world = f.world ? index.world : undefined;
	const allClubs = f.world ? world?.clubs ?? [] : index.clubs;
	const matchClubs = world && !f.club ? world.clubsMatching(words) : null;
	const teams = f.status === 'livre' ? [] : allClubs.filter((team) => (!matchClubs || matchClubs.has(team.id)) && (!f.club || team.id === f.club)
		&& (!f.division || (f.division === 'copa-do-brasil' ? index.cupClubs.has(team.id) : team.division === f.division)));
	const entries = teams.flatMap((team) => index.entriesFor(team.id));
	if (!f.world && !f.club && !f.division && (!f.status || f.status === 'livre')) entries.push(...index.entriesFor(''));
	const matches = entries.filter((entry) => {
		const p = entry.row;
		return (!f.position || p.position === f.position)
			&& (!f.secondary || p.secondary.includes(f.secondary))
			&& (!f.club || p.club === f.club) && (!f.division || (f.division === 'copa-do-brasil' ? index.cupClubs.has(p.club) : p.division === f.division))
			&& (!f.nationality || p.nationality === f.nationality) && (!f.status || p.status === f.status)
			&& (!f.listed || p.listed) && (!f.loanable || p.loanable) && (!f.observed || p.observed)
			&& words.every((word) => entry.search.includes(word))
			&& inRange(p.age, f.ageMin, f.ageMax)
			&& inRange(midpoint(p.overall), f.overallMin, f.overallMax)
			&& inRange(midpoint(p.potential), f.potentialMin, f.potentialMax)
			&& inRange(p.value, f.valueMin, f.valueMax) && inRange(p.wage, f.wageMin, f.wageMax)
			&& inRange(p.years, f.yearsMin, f.yearsMax)
			&& (!f.attribute || inRange(midpoint(attr(entry, f.attribute)), f.attributeMin));
	});
	const sort = f.sort ?? 'overall';
	const direction = (f.direction ?? (sort === 'age' || sort === 'name' ? 'asc' : 'desc')) === 'asc' ? 1 : -1;
	const rank = (p: MarketAthlete) => sort === 'overall' || sort === 'potential' ? midpoint(p[sort]) : sort === 'name' ? null : p[sort];
	matches.sort(({ row: a }, { row: b }) => {
		if (sort === 'name') return direction * collator.compare(a.name, b.name) || collator.compare(a.id, b.id);
		const first = rank(a), second = rank(b);
		if (first === null && second !== null) return 1;
		if (second === null && first !== null) return -1;
		return (first !== null && second !== null ? direction * (first - second) : 0)
			|| collator.compare(a.name, b.name) || collator.compare(a.id, b.id);
	});
	const total = matches.length;
	const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const page = Math.max(1, Math.min(pages, Math.floor(f.page ?? 1)));
	return { rows: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((entry) => entry.row),
		total, pages, page, clubs: allClubs, competitions: f.world ? [] : index.competitions, worldAvailable: Boolean(index.world),
		nationalities: [...new Set(entries.flatMap(({ row }) => row.nationality ? [row.nationality] : []))].sort(collator.compare) };
}

export function marketProfile(index: Index, id: string): MarketProfile | null {
	const team = currentClubOf(index.ctx, id);
	const entry = index.entriesFor(team ?? '').find(({ row }) => row.id === id);
	if (!entry) return null;
	const { row, athlete } = entry;
	const override = index.ctx.market.players[id];
	return { ...row, appearance: athlete.appearance,
		attributes: Object.fromEntries(ALL_ATTRIBUTES.flatMap((key) => {
			const value = attr(entry, key);
			return value ? [[key, value]] : [];
		})),
		isMine: row.club === index.clubId, humanSeller: index.humans.get(row.club),
		loanFrom: athlete.loan?.from, loanUntil: athlete.loan?.until, loanShare: athlete.loan?.wageShare,
		clause: row.club ? athlete.contract.clause : undefined,
		moveDate: override?.since, contractStart: athlete.contract.since, stats: [], transfers: [] };
}
