import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import { initialCareerData, type CreateCareerInput } from '#lib/domain/career.ts';
import { askingPrice, rosterOf, wageDemand } from '#lib/domain/market.ts';
import { makeOffer } from '#lib/domain/management.ts';
import { clubStateOf, rosterContext } from '#lib/domain/world.ts';
import { actionContext } from '#lib/server/management.ts';
import { marketIndex, marketProfile, queryMarket } from '#lib/server/market-search.ts';
import { newestWorldCatalog, worldCatalog } from '#lib/server/world-catalog.ts';

afterEach(() => vi.unstubAllEnvs());

it('abre o catálogo local por versão, consulta só quando pedido e persiste uma contratação estrangeira', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'brasfc-world-'));
	const id = '1234567890abcdef12345678';
	try {
		vi.stubEnv('BRASFC_WORLD_CATALOGS', dir);
		const writer = new DatabaseSync(join(dir, id + '.sqlite'));
		writer.exec(`
			CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT);
			INSERT INTO metadata VALUES ('format','1'),('catalog_id','${id}');
			CREATE TABLE club(id TEXT PRIMARY KEY, name TEXT, search_name TEXT, country TEXT, stadium TEXT, reputation INT, colors TEXT);
			INSERT INTO club VALUES ('arg/ferro','Ferro','ferro','arg','Campo',2,'[]');
			CREATE TABLE player(id TEXT PRIMARY KEY, name TEXT, search_name TEXT, age INT, country TEXT, position TEXT, club TEXT, starter INT, overall_estimate INT, potential_estimate INT, traits TEXT);
			INSERT INTO player VALUES
				('arg/ferro-111','René Médio','rene medio',22,'arg','MC','arg/ferro',0,58,65,'["passe"]'),
				('arg/ferro-222','Mario Médio','mario medio',24,'arg','MC','arg/ferro',1,66,69,'["visao"]');
		`);
		writer.close();
		const seed = 42;
		const input: CreateCareerInput = { world: 'brasil', personName: 'Ana Silva', mode: 'coach', clubId: 'bahia', leagueSelection: { divisions: ['serie-a'], cup: false } };
		const data = { ...initialCareerData(input, seed), worldCatalog: id };
		const league = data.league!;
		const career = { ...input, id: 'world-test', data, seed, version: 1, season: 2026, gameDate: '2026-01-11', createdAt: '', updatedAt: '' };
		expect(newestWorldCatalog()).toBe(id);
		const pack = worldCatalog(career)!;
		const base = rosterContext(career, league);
		const roster = { ...base, externalRoster: pack.roster };
		const club = { ...clubStateOf(career, league), balance: 1e9, transferBudget: 1e9, wageBudget: 1e8 };
		const market = marketIndex('test:world:1', career.clubId, roster, league, club, undefined, [], pack);
		expect(queryMarket(market, { world: true }).rows).toEqual([]);
		const found = queryMarket(market, { world: true, q: 'René' });
		const [player] = found.rows;
		expect(player).toMatchObject({ name: 'René Médio', club: 'world/arg/ferro' });
		expect(queryMarket(market, { q: 'René' }).rows).not.toContainEqual(player);
		expect(marketProfile(market, player.id)?.attributes.passe).toBeDefined();

		const sellers = rosterOf(roster, player.club);
		const target = sellers.find((p) => p.id === player.id)!;
		const context = actionContext(career, league, roster, 1);
		const hired = makeOffer(club, roster.market, context, {
			playerId: player.id, fee: askingPrice(target, sellers, 1), wage: wageDemand(target, 'A', 1, 'rotacao', 3) * 2,
			kind: 'compra', years: 3, role: 'rotacao'
		});
		expect(hired.negotiation?.done).toBe(true);
		const recovered = JSON.parse(JSON.stringify(hired.market));
		expect(rosterOf({ ...base, market: recovered }, career.clubId).find((p) => p.id === player.id)?.name).toBe('René Médio');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
