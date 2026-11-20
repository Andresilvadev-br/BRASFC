import { describe, expect, it } from 'vitest';
import '#lib/data/brasil.ts';
import { attendance, clubEconomy, confidenceAfterMatch, DISMISSAL_THRESHOLD, upgradeCost } from '#lib/domain/club.ts';
import { developYouth, youthIntakeFor } from '#lib/domain/academy.ts';
import { initialLeague, divisionOf } from '#lib/domain/league.ts';
import {
	answerIncoming,
	initialClubState,
	makeOffer,
	ManagementError,
	payroll,
	processWeek,
	promote,
	releasePlayer,
	renewContract,
	sanitizeClubState,
	signSponsor,
	startUpgrade,
	type ActionContext
} from '#lib/domain/management.ts';
import { askingPrice, emptyMarket, evolve, formatExactMoney, evolvedBase, freeAgents, marketValue, retires, rosterOf, wageDemand, type MarketState, type RosterContext } from '#lib/domain/market.ts';

const league = initialLeague('brasil', 2026);
const SEED = 2468;

it('preserva valores mensais de temporadas antigas sem detalhamento por categoria', () => {
	const club = initialClubState(SEED, 'bahia', 'serie-a', 2027);
	const january = { season: 2027, month: 12, income: 750_000, expense: -330_000, balance: 4_950_000 };
	const february = { ...january, month: 13, byCategory: { tv: 800_000, salarios: -330_000, invalido: null } };
	const restored = sanitizeClubState({ ...club, months: [null, january, february, { ...february, balance: 5_000_000 }] }, SEED, 'bahia', 'serie-a', 2027);
	expect(restored.months).toEqual([
		{ ...january, byCategory: {} },
		{ ...february, balance: 5_000_000, byCategory: { tv: 800_000, salarios: -330_000 } }
	]);
});
function ctxWith(market: MarketState, season = 2026): RosterContext {
	return { seed: SEED, firstSeason: 2026, season, market, divisionOf: (id) => divisionOf(league, id), userClub: 'bahia', userDevBoost: 1 };
}
function action(market: MarketState, window: string | null = 'pre-temporada'): ActionContext {
	return { seed: SEED, season: 2026, round: 3, clubId: 'bahia', tier: 'A', division: 'serie-a', roster: ctxWith(market), window, gameDate: '2026-02-10' };
}

describe('valor de mercado e salários', () => {
	it('valor cresce com o overall, jovens com potencial valem mais, contrato no fim vale menos', () => {
		const base = { overall: 70, potential: 72, age: 26, condition: 95 };
		expect(marketValue({ ...base, overall: 78 }, 3)).toBeGreaterThan(marketValue(base, 3));
		expect(marketValue({ ...base, age: 19, potential: 84 }, 3)).toBeGreaterThan(marketValue(base, 3));
		expect(marketValue(base, 0)).toBeLessThan(marketValue(base, 3) * 0.6);
		expect(marketValue({ ...base, age: 34 }, 3)).toBeLessThan(marketValue(base, 3) * 0.4);
	});
	it('clube menor precisa pagar mais para convencer; promessa de reserva encarece', () => {
		const p = { overall: 72, age: 25 };
		expect(wageDemand(p, 'A', 2, 'rotacao', 3)).toBeGreaterThan(wageDemand(p, 'A', 5, 'rotacao', 3));
		expect(wageDemand(p, 'A', 3, 'reserva', 3)).toBeGreaterThan(wageDemand(p, 'A', 3, 'titular', 3));
	});
});

describe('contratos na pré-temporada', () => {
	it('bloqueia duração e salário inválidos e calcula o teto antes da primeira rodada', () => {
		const market = emptyMarket();
		const ctx = action(market);
		const club = initialClubState(SEED, 'bahia', 'serie-a', 2026);
		const player = rosterOf(ctx.roster, 'bahia').sort((a, b) => a.contract.wage - b.contract.wage)[0];
		const wage = wageDemand(player, 'A', 3, 'titular', 2) + 1000;
		expect(() => renewContract(club, market, ctx, player.id, NaN, 2, 'titular')).toThrow(/Salário/);
		expect(() => renewContract(club, market, ctx, player.id, wage, 2.5, 'titular')).toThrow(/temporadas/);
		const renewed = renewContract(club, market, ctx, player.id, wage, 2, 'titular');
		expect(renewed.club.wageBudget).toBeGreaterThan(0);
		expect(renewed.transfers[0]?.kind).toBe('renovacao');
		expect(formatExactMoney(1_025_500)).toBe('R$ 1.025.500');
	});
});

describe('elencos, evolução e aposentadoria', () => {
	it('jovens evoluem e veteranos caem; ninguém joga para sempre', () => {
		const squad = evolvedBase(SEED, 'santos', 2026, 2026, true);
		const young = squad.filter((p) => p.age <= 20 && p.potential > p.overall + 4)[0];
		if (young) expect(evolve(young, SEED, 2026, 2028).overall).toBeGreaterThan(young.overall);
		const old = { ...squad[0], age: 33, overall: 70, potential: 70 };
		expect(evolve(old, SEED, 2026, 2028).overall).toBeLessThan(70);
		expect(retires({ age: 37, overall: 80 })).toBe(true);
		// Clubes da IA repõem aposentados com jovens: elenco não encolhe ao longo de 8 temporadas.
		expect(evolvedBase(SEED, 'santos', 2026, 2034, true).length).toBe(squad.length);
	});

	it('um atleta transferido aparece em um único clube', () => {
		const market = emptyMarket();
		const target = rosterOf(ctxWith(market), 'santos')[5];
		market.players[target.id] = { club: 'bahia', contract: { wage: 100_000, until: 2028, role: 'titular' }, since: '2026-02-01' };
		const ctx = ctxWith(market);
		expect(rosterOf(ctx, 'santos').some((p) => p.id === target.id)).toBe(false);
		expect(rosterOf(ctx, 'bahia').some((p) => p.id === target.id)).toBe(true);
		const all = ['santos', 'bahia', 'flamengo'].flatMap((c) => rosterOf(ctx, c).map((p) => p.id));
		expect(new Set(all).size).toBe(all.length);
	});
});

describe('negociações do usuário', () => {
	const club = () => ({ ...initialClubState(SEED, 'bahia', 'serie-a', 2026), transferBudget: 80_000_000, balance: 120_000_000, wageBudget: 40_000_000 });

	it('compra aceita com valor e salário suficientes: elenco, orçamento e caixa mudam', () => {
		const market = emptyMarket();
		const ctx = action(market);
		const santos = rosterOf(ctx.roster, 'santos');
		const target = santos.filter((p) => p.position === 'ZAG').sort((a, b) => a.overall - b.overall)[0];
		const asking = askingPrice(target, santos, 0);
		const demand = wageDemand(target, 'A', 3, 'rotacao', 3);
		const c0 = club();
		const out = makeOffer(c0, market, ctx, { playerId: target.id, fee: asking + 100_000, kind: 'compra', wage: demand + 1000, years: 3, role: 'rotacao' });
		expect(out.transfers).toHaveLength(1);
		expect(out.club.transferBudget).toBe(c0.transferBudget - (asking + 100_000));
		expect(out.club.balance).toBe(c0.balance - (asking + 100_000));
		expect(rosterOf(ctxWith(out.market), 'bahia').some((p) => p.id === target.id)).toBe(true);
		expect(rosterOf(ctxWith(out.market), 'santos').some((p) => p.id === target.id)).toBe(false);
	});

	it('proposta baixa é recusada ou contraproposta; nada muda no elenco', () => {
		const market = emptyMarket();
		const ctx = action(market);
		const target = rosterOf(ctx.roster, 'santos')[3];
		const out = makeOffer(club(), market, ctx, { playerId: target.id, fee: 1000, kind: 'compra', wage: 10_000_000, years: 3, role: 'titular' });
		expect(out.transfers).toHaveLength(0);
		expect(out.negotiation?.club_answer).not.toBe('aceita');
		expect(out.market.players[target.id]).toBeUndefined();
	});

	it('janela fechada, orçamento e teto salarial são respeitados', () => {
		const market = emptyMarket();
		const target = rosterOf(ctxWith(market), 'santos')[3];
		expect(() => makeOffer(club(), market, action(market, null), { playerId: target.id, fee: 1e6, kind: 'compra', wage: 1e5, years: 2, role: 'rotacao' })).toThrow(ManagementError);
		expect(() => makeOffer({ ...club(), transferBudget: 10 }, market, action(market), { playerId: target.id, fee: 1e6, kind: 'compra', wage: 1e5, years: 2, role: 'rotacao' })).toThrow(/orçamento/);
		const ctx = action(market);
		const santos = rosterOf(ctx.roster, 'santos');
		const cheap = santos.filter((p) => p.position === 'ATA')[0];
		const big = { ...club(), wageBudget: payroll(rosterOf(ctx.roster, 'bahia')) + 10 };
		expect(() => makeOffer(big, market, ctx, { playerId: cheap.id, fee: askingPrice(cheap, santos, 0) * 2, kind: 'compra', wage: 5e6, years: 2, role: 'titular' })).toThrow(/teto/);
	});

	it('renovação abaixo do pedido não muda nada; acima, grava o novo contrato', () => {
		const market = emptyMarket();
		const ctx = action(market);
		const p = rosterOf(ctx.roster, 'bahia')[4];
		const low = renewContract(club(), market, ctx, p.id, 1000, 3, 'rotacao');
		expect(low.transfers).toHaveLength(0);
		const demand = wageDemand(p, 'A', 3, 'rotacao', 3);
		const ok = renewContract(club(), market, ctx, p.id, demand, 3, 'rotacao');
		expect(ok.market.players[p.id]?.contract?.until).toBe(2029);
	});

	it('rescisão custa metade do restante e o atleta vira jogador livre', () => {
		const market = emptyMarket();
		const ctx = action(market);
		const p = rosterOf(ctx.roster, 'bahia').find((x) => x.contract.until > 2026)!;
		const out = releasePlayer(club(), market, ctx, p.id);
		expect(out.ledger[0].amount).toBeLessThan(0);
		expect(freeAgents(ctxWith(out.market)).some((x) => x.id === p.id)).toBe(true);
	});

	it('venda aceita: atleta sai, caixa entra, proposta some (não dá para aceitar duas vezes)', () => {
		const market = emptyMarket();
		const ctx = action(market);
		const p = rosterOf(ctx.roster, 'bahia')[10];
		const c = { ...club(), incoming: [{ id: 'x1', playerId: p.id, club: 'palmeiras', fee: 5_000_000, kind: 'compra' as const, expiresRound: 5, season: 2026 }] };
		const out = answerIncoming(c, market, ctx, 'x1', true);
		expect(out.club.balance).toBe(c.balance + 5_000_000);
		expect(rosterOf(ctxWith(out.market), 'palmeiras').some((x) => x.id === p.id)).toBe(true);
		expect(() => answerIncoming(out.club, out.market, ctx, 'x1', true)).toThrow(ManagementError);
	});
});

describe('gestão semanal, diretoria, estrutura e base', () => {
	it('semana movimenta caixa: TV e patrocínio entram, salários saem; jogo em casa gera bilheteria', () => {
		const st = signSponsor(initialClubState(SEED, 'bahia', 'serie-a', 2026), 2026, initialClubState(SEED, 'bahia', 'serie-a', 2026).sponsorOffers[0].id);
		const roster = rosterOf(ctxWith(emptyMarket()), 'bahia');
		const w = processWeek(st, { seed: SEED, clubId: 'bahia', season: 2026, round: 2, tier: 'A', division: 'serie-a', roster, match: { home: true, opponent: 'vitoria', goalsFor: 2, goalsAgainst: 0, competition: 'serie-a', opponentStrength: 70, myStrength: 72, youthMinutes: 0 }, fullWeek: true, firstSeasonOfCareer: true, cupPrize: 0 });
		const cat = (c: string) => w.ledger.filter((l) => l.category === c).reduce((s, l) => s + l.amount, 0);
		expect(cat('tv')).toBeGreaterThan(0);
		expect(cat('patrocinio')).toBeGreaterThan(0);
		expect(cat('salarios')).toBeLessThan(0);
		expect(cat('bilheteria')).toBeGreaterThan(0);
		expect(w.attendance).toBeGreaterThan(0);
		expect(w.state.balance).toBe(st.balance + w.ledger.reduce((s, l) => s + l.amount, 0));
		expect(w.state.board.confidence).toBeGreaterThan(st.board.confidence);
	});

	it('ingresso caro reduz o público; clássico enche o estádio', () => {
		const base = { capacity: 40000, fanMood: 60, price: 60, ticketRef: 60, opponentReputation: 3, derby: false, competitionWeight: 1 };
		expect(attendance({ ...base, price: 150 })).toBeLessThan(attendance(base));
		expect(attendance({ ...base, derby: true })).toBeGreaterThan(attendance(base));
	});

	it('diretoria imediatista cobra mais as derrotas; abaixo do limite após a 10ª rodada vem a demissão', () => {
		expect(confidenceAfterMatch('imediatista', 'd', 0, false)).toBeLessThan(confidenceAfterMatch('projeto', 'd', 0, false));
		const st = { ...initialClubState(SEED, 'bahia', 'serie-a', 2026), board: { ...initialClubState(SEED, 'bahia', 'serie-a', 2026).board, confidence: DISMISSAL_THRESHOLD - 1 } };
		const roster = rosterOf(ctxWith(emptyMarket()), 'bahia');
		const w = processWeek(st, { seed: SEED, clubId: 'bahia', season: 2026, round: 12, tier: 'A', division: 'serie-a', roster, match: null, fullWeek: true, firstSeasonOfCareer: false, cupPrize: 0 });
		expect(w.dismissed).toBe(true);
		expect(w.state.board.dismissed).toBe(true);
	});

	it('obra custa, leva semanas e só então sobe o nível', () => {
		let st = { ...initialClubState(SEED, 'bahia', 'serie-a', 2026), balance: 500_000_000 };
		const before = st.infra.ct.level;
		const { cost, weeks } = upgradeCost('ct', before, 'A');
		const r = startUpgrade(st, 'ct', 'A');
		expect(r.state.balance).toBe(st.balance - cost);
		expect(() => startUpgrade(r.state, 'ct', 'A')).toThrow(ManagementError);
		st = r.state;
		const roster = rosterOf(ctxWith(emptyMarket()), 'bahia');
		for (let i = 0; i < weeks; i++) st = processWeek(st, { seed: SEED, clubId: 'bahia', season: 2026, round: i + 1, tier: 'A', division: 'serie-a', roster, match: null, fullWeek: true, firstSeasonOfCareer: true, cupPrize: 0 }).state;
		expect(st.infra.ct.level).toBe(before + 1);
		expect(st.infra.ct.project).toBeNull();
	});

	it('base: turma limitada, craques raros, jovens evoluem com treino e podem subir ao profissional', () => {
		const turmas = Array.from({ length: 40 }, (_, k) => youthIntakeFor(SEED + k, 'bahia', 2026, 3));
		const all = turmas.flat();
		expect(turmas.every((t) => t.length === youthIntakeFor(SEED, 'bahia', 2026, 3).length)).toBe(true);
		expect(all.filter((y) => y.potential >= 80).length / all.length).toBeLessThan(0.1);
		let y = all.find((x) => x.potential - x.overall >= 10)!;
		const start = y.overall;
		for (let w = 0; w < 40; w++) y = developYouth(y, 3, 3, 1, SEED, 2026, w);
		expect(y.overall).toBeGreaterThan(start);
		expect(y.overall).toBeLessThanOrEqual(y.potential);
		const st = { ...initialClubState(SEED, 'bahia', 'serie-a', 2026), academy: [y] };
		const out = promote(st, emptyMarket(), action(emptyMarket()), y.id);
		expect(out.club.academy).toHaveLength(0);
		expect(rosterOf(ctxWith(out.market), 'bahia').some((p) => p.id === y.id)).toBe(true);
	});

	it('economia diferente por porte: clube grande da Série A recebe muito mais que um da Série D', () => {
		expect(clubEconomy('flamengo', 'A').tvAnnual).toBeGreaterThan(clubEconomy('gama', 'D').tvAnnual * 50);
	});
});
