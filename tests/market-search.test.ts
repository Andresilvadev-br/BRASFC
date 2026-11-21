import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ROSTER_CATALOG } from '#lib/data/roster-catalog.ts';
import { initialCup } from '#lib/domain/cup.ts';
import { divisionOf, initialLeague } from '#lib/domain/league.ts';
import { clubEconomy } from '#lib/domain/club.ts';
import { initialClubState, makeOffer, payroll, type ActionContext } from '#lib/domain/management.ts';
import { askingPrice, emptyMarket, rosterOf, wageDemand, type NegotiationOffer, type RosterContext } from '#lib/domain/market.ts';
import { marketIndex, marketProfile, queryMarket, readMarketFilters } from '#lib/server/market-search.ts';

const league = initialLeague('brasil', 2026);
const cup = Object.values(initialCup(2026).entrants).flat();
const seed = 2468;
const club = initialClubState(seed, 'bahia', 'serie-a', 2026);
const ctx: RosterContext = { catalog: ROSTER_CATALOG, seed, season: 2026, firstSeason: 2026, market: emptyMarket(), divisionOf: (id) => divisionOf(league, id), userClub: 'bahia' };
const index = marketIndex('test:market:1', 'bahia', ctx, league, club, undefined, cup);

describe('busca do mercado', () => {
	it('pesquisa nomes com ou sem acento, clube, nacionalidade e campeonatos cadastrados', () => {
		const full = queryMarket(index, { q: 'Raphael Veiga' });
		expect(full.rows.some((row) => row.name.includes('Veiga'))).toBe(true);
		const accented = queryMarket(index, { q: 'Gustávo Góméz' });
		expect(accented.rows).toEqual(queryMarket(index, { q: 'gustavo gomez' }).rows);
		expect(accented.rows.some((p) => p.club === 'palmeiras')).toBe(true);
		const partial = queryMarket(index, { q: 'gomez palmeir' });
		expect(partial.rows).toEqual(accented.rows.filter((p) => p.club === 'palmeiras'));
		expect(queryMarket(index, { q: 'argentina', nationality: 'Argentina', division: 'serie-a' }).rows.every((p) => p.nationality === 'Argentina')).toBe(true);
		for (const division of ['serie-a', 'serie-b', 'serie-c', 'serie-d'] as const) {
			const rows = queryMarket(index, { division }).rows;
			expect(rows.length).toBeGreaterThan(10);
			expect(rows.every((p) => p.division === division)).toBe(true);
		}
		const copa = queryMarket(index, { division: 'copa-do-brasil' });
		expect(copa.total).toBeGreaterThan(20);
		expect(copa.rows.every((p) => cup.includes(p.club))).toBe(true);
	});

	it('combina intervalos, preserva zero e pagina com ordenação estável', () => {
		const source = queryMarket(index, { q: 'Gustavo Gómez' }).rows[0];
		const estimate = (source.overall.min + source.overall.max) / 2;
		const filtered = queryMarket(index, { club: source.club, position: source.position, nationality: source.nationality,
			ageMin: source.age ?? undefined, overallMin: estimate, overallMax: estimate, valueMax: source.value, wageMin: source.wage ?? undefined });
		expect(filtered.rows.some((p) => p.id === source.id)).toBe(true);
		const zero = readMarketFilters(new URLSearchParams('valueMax=0&ageMin=&wageMax=0'));
		expect(zero).toMatchObject({ valueMax: 0, ageMin: undefined, wageMax: 0 });
		expect(queryMarket(index, zero).total).toBe(0);
		const page1 = queryMarket(index, { sort: 'value', direction: 'desc' });
		const page2 = queryMarket(index, { sort: 'value', direction: 'desc', page: 2 });
		expect(page1.total).toBeGreaterThanOrEqual(3442);
		expect(page1.rows).toHaveLength(24);
		expect(page2.rows.every((p) => !page1.rows.some((q) => p.id === q.id))).toBe(true);
		const combined = [...page1.rows, ...page2.rows].map((p) => p.value);
		expect(combined).toEqual([...combined].sort((a, b) => b - a));
	});

	it('preserva incerteza e acha atletas livres ou observados em outra divisão', () => {
		const target = rosterOf(ctx, 'palmeiras')[0];
		const orig = marketProfile(index, target.id)!;
		expect(orig.potential).toBeNull();
		expect(orig.overall.min).toBeLessThan(orig.overall.max);
		expect(orig.attributes.reflexos).toBeDefined();
		const clubPlayer = queryMarket(index, { club: 'bahia' }).rows[0];
		const own = marketProfile(index, clubPlayer.id)!;
		expect(own.isMine).toBe(true);
		expect(own.overall.min).toBe(own.overall.max);
		const updated = { ...ctx, market: { ...ctx.market, players: { [target.id]: { club: null, since: '2026-02-01', contract: null } }, shortlist: [target.id] } };
		const fresh = marketIndex('test:market:2', 'bahia', updated, league, club);
		expect(queryMarket(fresh, { status: 'livre', valueMax: 0, observed: true }).rows).toMatchObject([{ id: target.id, club: '', value: 0, wage: null }]);
		expect(queryMarket(fresh, { status: 'livre', wageMax: 0 }).total).toBe(0);
	});
});

it('retoma contraproposta e contrato em operações distintas e não duplica uma compra repetida', () => {
	const seller = 'palmeiras';
	const roster = rosterOf(ctx, seller);
	const target = roster.find((p) => roster.filter((x) => x.position === p.position).length > 1)!;
	const cash = clubEconomy(seller, 'A').tvAnnual * 0.05;
	const asking = askingPrice(target, roster, cash);
	const wage = wageDemand(target, 'A', 3, 'rotacao', 3) + 20000;
	const action: ActionContext = { seed, season: 2026, round: 3, clubId: 'bahia', tier: 'A', division: 'serie-a', roster: ctx, window: 'pre-temporada', gameDate: '2026-02-01' };
	const buyer = { ...club, transferBudget: 1e9, wageBudget: 1e8, balance: 1e9 };
	const offer: NegotiationOffer = { playerId: target.id, fee: Math.round(asking * 0.9), wage: 500, kind: 'compra', years: 3, role: 'rotacao' };
	const counter = makeOffer(buyer, ctx.market, action, offer, randomUUID());
	expect(counter.negotiation?.club_answer).toBe('contraproposta');
	expect(counter.negotiation?.asking).toBe(asking);
	const contract = makeOffer(counter.club, ctx.market, action, { ...offer, fee: asking }, randomUUID());
	expect(contract.negotiation?.player_answer).toBe('recusada');
	expect(contract.negotiation?.demand).toBeGreaterThan(500);
	const op = randomUUID();
	const final = { ...offer, fee: asking, wage };
	const signed = makeOffer(contract.club, ctx.market, action, final, op);
	expect(signed.negotiation?.done).toBe(true);
	expect(signed.transfers).toHaveLength(1);
	expect(signed.club.transferBudget).toBe(buyer.transferBudget - asking);
	expect(signed.club.balance).toBe(buyer.balance - asking);
	const changed = { ...ctx, market: signed.market };
	expect(payroll(rosterOf(changed, 'bahia'))).toBe(payroll(rosterOf(ctx, 'bahia')) + wage);
	expect(rosterOf(changed, seller).some((p) => p.id === target.id)).toBe(false);
	expect(signed.market.players[target.id].contract).toMatchObject({ since: action.gameDate, wage });
	expect(makeOffer(signed.club, signed.market, { ...action, roster: changed }, final, op).transfers).toEqual([]);
});
