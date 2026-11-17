import { describe, expect, it } from 'vitest';
import { HAIR_STYLES } from '#lib/domain/appearance.ts';
import { bodyGrid, bustGrid, palette, toRuns } from '#lib/pixel/sprites.ts';

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
