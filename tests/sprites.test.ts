import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, HAIR_STYLES, isAppearance } from '#lib/domain/appearance.ts';
import { defaultOutfit, WARDROBE, type WardrobeCategory } from '#lib/domain/wardrobe.ts';
import { bodyGrid, bustGrid, palette, toRuns, wardrobeKit } from '#lib/pixel/sprites.ts';

describe('sprites em pixel art', () => {
	for (const style of HAIR_STYLES) {
		it(`grades retangulares e com cores definidas — ${style}`, () => {
			const bust = bustGrid(style);
			expect(bust).toHaveLength(18);
			for (const row of bust) expect(row).toHaveLength(18);
			for (const ball of [true, false]) {
				const body = bodyGrid(style, { ball });
				expect(body).toHaveLength(35);
				for (const row of body) expect(row).toHaveLength(30);
			}
			const colors = palette(
				{ skin: 0, hairColor: 0, hairStyle: style },
				{ shirt: '#ff0000', trim: '#ffffff', shorts: '#0000ff', socks: '#ff0000' }
			);
			for (const row of bodyGrid(style)) for (const ch of row) if (ch !== '.') expect(colors[ch], `cor para "${ch}"`).toBeDefined();
		});
	}

	it('todos os penteados possuem desenhos distintos', () => {
		expect(new Set(HAIR_STYLES.map((hair) => bustGrid(hair).join(''))).size).toBe(HAIR_STYLES.length);
	});

	it('valida as peças da coleção, preserva looks antigos e usa o clube atual', () => {
		for (const category of Object.keys(WARDROBE) as WardrobeCategory[]) {
			const wardrobe = defaultOutfit(category);
			expect(isAppearance({ ...DEFAULT_APPEARANCE, wardrobe })).toBe(true);
			expect(bodyGrid('curto', { outfit: wardrobe }).every((row) => row.length === 30)).toBe(true);
		}
		const wardrobe = defaultOutfit('clube');
		const first = { shirt: '#004411', trim: '#eeeeee', shorts: '#222222', socks: '#bbbbbb' };
		const moved = { ...first, shirt: '#aa1122' };
		expect(wardrobeKit(wardrobe, first).shirt).toBe(first.shirt);
		expect(wardrobeKit(wardrobe, moved).shirt).toBe(moved.shirt);
		expect(isAppearance(DEFAULT_APPEARANCE)).toBe(true);
		expect(isAppearance({ ...DEFAULT_APPEARANCE, wardrobe: { ...wardrobe, top: 'polo' } })).toBe(false);
	});

	it('o treinador não carrega a bola', () => {
		expect(bodyGrid('curto').join('')).toContain('L');
		expect(bodyGrid('curto', { ball: false }).join('')).not.toContain('L');
	});

	it('agrupa pixels em sequências horizontais', () => {
		expect(toRuns(['.OO.', 'S..S'], { O: '#000', S: '#fff' })).toEqual([
			{ x: 1, y: 0, w: 2, color: '#000' },
			{ x: 0, y: 1, w: 1, color: '#fff' },
			{ x: 3, y: 1, w: 1, color: '#fff' }
		]);
	});
});
