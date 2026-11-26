import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countryFlag, countryName, KNOWN_COUNTRIES } from '#lib/world/countries.ts';
import { rulesMatchCount, worldCountries } from '#lib/server/world-countries.ts';

describe('World Database · interface', () => {
	it('todo país conhecido tem bandeira local e nome em português', () => {
		for (const code of KNOWN_COUNTRIES) {
			const flag = countryFlag(code)!;
			expect(existsSync(`static/flags/${flag}.webp`), code).toBe(true);
			expect(countryName(code)).not.toBe(code.toUpperCase());
		}
		expect(countryName('esp')).toBe('Espanha');
		expect(countryName('eng')).toBe('Inglaterra');
	});

	it('estima jogos pelo regulamento da fonte', () => {
		expect(rulesMatchCount({ teams: 20, two_rounds: true })).toBe(380);
		expect(rulesMatchCount({ teams: 22, two_rounds: true, knockout_teams: 4 })).toBe(462 + 6);
		expect(rulesMatchCount({ teams: 10, two_rounds: false })).toBe(45);
	});

	it('sem catálogo instalado: só o Brasil nativo, jogável', () => {
		const list = worldCountries(null);
		expect(list.map((c) => c.code)).toEqual(['bra']);
		expect(list[0].divisions.map((d) => d.id)).toEqual(['serie-a', 'serie-b', 'serie-c', 'serie-d']);
		expect(list[0].playable).toBe(true);
		expect(list[0].load.matches).toBeGreaterThan(1000);
	});

	const catalog = process.env.BRASFC_WORLD_CATALOGS;
	it.skipIf(!catalog)('com o catálogo 2026/27: 34 países com ligas, estrangeiros ainda sem inscrições confirmadas', () => {
		const list = worldCountries('00b10fbcb9d42242ac8aec75');
		expect(list).toHaveLength(34);
		const spain = list.find((c) => c.code === 'esp')!;
		expect(spain.divisions.map((d) => d.id)).toEqual(['league/esp/1', 'league/esp/2']);
		expect(spain.playable).toBe(false);
		expect(spain.clubCount).toBe(42);
		expect(spain.load.matches).toBeGreaterThan(800);
	});
});

describe('Escudos · padronização e correspondência', async () => {
	const { placement, visibleBox, isWebp, CREST_SIZE } = await import('#lib/crests/normalize.ts');
	const { buildCrestIndex, matchCrest, groupCrests, normalizeName } = await import('#lib/crests/match.ts');

	const rgba = (w: number, h: number, paint: (x: number, y: number) => number) => {
		const d = new Uint8ClampedArray(w * h * 4);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[(y * w + x) * 4 + 3] = paint(x, y);
		return d;
	};

	it('recorta só a borda transparente; imagem opaca fica inteira; vazia é descartada', () => {
		expect(visibleBox(rgba(60, 60, (x, y) => (x >= 10 && x < 50 && y >= 5 && y < 55 ? 255 : 0)), 60, 60)).toEqual({ x: 10, y: 5, w: 40, h: 50 });
		expect(visibleBox(rgba(30, 20, () => 255), 30, 20)).toEqual({ x: 0, y: 0, w: 30, h: 20 });
		expect(visibleBox(rgba(10, 10, () => 0), 10, 10)).toBeNull();
		// halo quase invisível (alfa 4) não conta como arte
		expect(visibleBox(rgba(20, 20, (x, y) => (x === 0 ? 4 : x >= 5 && x < 15 && y >= 5 && y < 15 ? 255 : 0)), 20, 20)).toEqual({ x: 5, y: 5, w: 10, h: 10 });
	});

	it('enquadra com escala uniforme, centraliza e mantém margem igual (sem distorcer)', () => {
		const tall = placement({ w: 40, h: 50 });
		expect(tall.h).toBeCloseTo(CREST_SIZE * 0.88);
		expect(tall.w / tall.h).toBeCloseTo(40 / 50);
		expect(tall.x + tall.w / 2).toBeCloseTo(CREST_SIZE / 2);
		expect(tall.y).toBeCloseTo(CREST_SIZE * 0.06);
		const wide = placement({ w: 300, h: 100 });
		expect(wide.w).toBeCloseTo(CREST_SIZE * 0.88);
		expect(wide.y + wide.h / 2).toBeCloseTo(CREST_SIZE / 2);
	});

	it('aceita só WebP', () => {
		expect(isWebp(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe(true);
		expect(isWebp(new TextEncoder().encode('\x89PNG\r\n\x1a\n0000'))).toBe(false);
	});

	const index = buildCrestIndex(
		[{ id: 'athletico-pr', name: 'Athletico Paranaense', country: 'bra' }, { id: 'sport', name: 'Sport', country: 'bra' },
			{ id: 'botafogo', name: 'Botafogo', country: 'bra' }, { id: 'botafogo-sp', name: 'Botafogo-SP', country: 'bra' }],
		[{ id: 'world/bra/athletico-paranaense', name: 'Athletico Paranaense', country: 'bra' }, { id: 'world/esp/real-madrid', name: 'Real Madrid', country: 'esp' },
			{ id: 'world/eng/arsenal', name: 'Arsenal FC', country: 'eng' }, { id: 'world/eng/everton', name: 'Everton', country: 'eng' }, { id: 'world/bol/everton', name: 'Everton', country: 'bol' }]
	);

	it('normaliza acentos e termos genéricos', () => {
		expect(normalizeName('Sport Club do Recife')).toBe('recife');
		expect(normalizeName('Sport')).toBe('sport');
		expect(normalizeName('Grêmio Foot-Ball Porto Alegrense')).toBe('gremio foot ball porto alegrense');
		expect(normalizeName('Arsenal F.C.')).toBe('arsenal');
	});

	it('Brasfoot Next: caminho exato; clube brasileiro aponta para o nativo', () => {
		expect(matchCrest(index, 'database/clubs/bra/athletico-paranaense/crest.png')).toEqual({ path: 'database/clubs/bra/athletico-paranaense/crest.png', club: 'athletico-pr', source: 'brasfoot-next' });
		expect(matchCrest(index, 'database/clubs/esp/real-madrid/crest.png')?.club).toBe('world/esp/real-madrid');
		expect(matchCrest(index, 'database/clubs/esp/real-madrid/kit.png')).toBeNull();
		expect(matchCrest(index, 'database/clubs/esp/inexistente/crest.png')).toBeNull();
	});

	it('Megapatch/pasta solta: por nome; ambiguidade não importa; uniformes e troféus ignorados', () => {
		expect(matchCrest(index, 'Brasfoot/escudos/Arsenal.png')).toMatchObject({ club: 'world/eng/arsenal', source: 'megapatch' });
		expect(matchCrest(index, 'meus/Real Madrid.png')).toMatchObject({ club: 'world/esp/real-madrid', source: 'pasta-local' });
		expect(matchCrest(index, 'escudos/Everton.png')).toBeNull();
		expect(matchCrest(index, 'Brasfoot/camisas/Arsenal.png')).toBeNull();
		expect(matchCrest(index, 'escudos/Arsenal.txt')).toBeNull();
		expect(matchCrest(index, 'escudos/Botafogo-SP.png')?.club).toBe('botafogo-sp');
		expect(matchCrest(index, 'escudos/Botafogo.png')?.club).toBe('botafogo');
	});

	it('agrupa candidatos por clube, Brasfoot Next primeiro no desempate', () => {
		const groups = groupCrests([
			{ path: 'a/escudos/Arsenal.png', club: 'world/eng/arsenal', source: 'megapatch' },
			{ path: 'db/clubs/eng/arsenal/crest.png', club: 'world/eng/arsenal', source: 'brasfoot-next' }
		]);
		expect(groups.get('world/eng/arsenal')!.map((m) => m.source)).toEqual(['brasfoot-next', 'megapatch']);
	});
});

describe('Participação · Copa do Brasil', async () => {
	const { CUP_ID, cupParticipation, initialCup, prepareCup } = await import('#lib/domain/cup.ts');
	const cup = initialCup(2026);
	const strength = () => 70;

	it('diferencia clube inscrito numa fase futura de clube sem inscrição', () => {
		const phase5 = cup.entrants['5'][0];
		expect(cupParticipation(cup, [], 7, strength, phase5)).toMatchObject({ status: 'aguardando-estreia', stage: '5ª fase', nextDate: expect.stringMatching(/^2026-/) });
		expect(cupParticipation(cup, [], 7, strength, 'clube-que-nao-existe').status).toBe('nao-classificado');
	});

	it('da estreia sorteada à classificação e eliminação', () => {
		const seeded = prepareCup(cup, 1, [], 7, strength);
		const [home, away] = seeded.stages[0][0];
		expect(cupParticipation(seeded, [], 7, strength, home).status).toBe('aguardando-estreia');
		const results = [{ competition: CUP_ID, round: 1, home, away, homeGoals: 2, awayGoals: 0 }];
		expect(cupParticipation(seeded, results, 7, strength, home)).toMatchObject({ status: 'classificado', stage: '2ª fase' });
		expect(cupParticipation(seeded, results, 7, strength, away)).toMatchObject({ status: 'eliminado', eliminatedStage: '1ª fase', eliminatedBy: home });
	});
});

describe('Navegação de competições', async () => {
	const { groupCompetitions } = await import('#lib/world/competitions.ts');
	it('agrupa por país e deixa as continentais no fim', () => {
		const mk = (id: string, kind: 'league' | 'national-cup' | 'continental', country: string | null, confederation: 'UEFA' | 'CONMEBOL' | null = null) =>
			({ id, kind, name: id, short: id, country, confederation, season: 2026, playable: true });
		const groups = groupCompetitions([
			mk('continental/ucl', 'continental', null, 'UEFA'), mk('cup/esp', 'national-cup', 'esp'), mk('league/esp/1', 'league', 'esp'),
			mk('serie-a', 'league', 'bra'), mk('copa-do-brasil', 'national-cup', 'bra')
		], (c) => c.toUpperCase());
		expect(groups.map((g) => g.key)).toEqual(['country:esp', 'country:bra', 'conf:UEFA']);
		expect(groups[0].items.map((i) => i.id)).toEqual(['league/esp/1', 'cup/esp']);
		expect(groups[2].label).toBe('Continentais · UEFA');
	});
});
