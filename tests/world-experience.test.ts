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
