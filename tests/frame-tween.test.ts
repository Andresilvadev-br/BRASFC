import { describe, expect, it } from 'vitest';
import { MAX_TWEEN_MS, MIN_TWEEN_MS, shownPositions, SNAP_DISTANCE, tweenDuration, tweenFrame } from '#lib/ui/match/frame-tween.ts';

/** Campo 2D ao vivo: interpolação só entre o que está na tela e o quadro oficial. */
const p = (id: string, x: number, y: number) => ({ id, x, y, px: x, py: y, onPitch: true });
const ball = (x: number, y: number) => ({ x, y, px: x, py: y, owner: null });

describe('interpolação entre quadros oficiais', () => {
	it('parte do que está na tela e termina exatamente na posição oficial', () => {
		const shown = shownPositions([p('a', 10, 10)], ball(50, 34), 1);
		const next = tweenFrame(shown, [p('a', 14, 12)], ball(52, 34));
		expect(next.players[0]).toMatchObject({ x: 14, y: 12, px: 10, py: 10 });
		expect(next.ball).toMatchObject({ x: 52, px: 50 });
		// No fim da transição (alpha 1) a posição exibida é a oficial, sem arredondar nem desviar.
		expect(shownPositions(next.players, next.ball, 1).players.get('a')).toEqual({ x: 14, y: 12 });
	});

	it('encadeia um quadro que chega no meio da transição sem salto', () => {
		const first = tweenFrame(shownPositions([p('a', 0, 0)], ball(0, 0), 1), [p('a', 10, 0)], ball(0, 0));
		const mid = shownPositions(first.players, first.ball, 0.5);
		expect(mid.players.get('a')).toEqual({ x: 5, y: 0 });
		const second = tweenFrame(mid, [p('a', 12, 0)], ball(0, 0));
		expect(second.players[0]).toMatchObject({ px: 5, x: 12 });
	});

	it('não inventa trajetória para quem entrou em campo nem para reposições', () => {
		const shown = shownPositions([p('a', 10, 10)], ball(10, 10), 1);
		const next = tweenFrame(shown, [p('a', 10 + SNAP_DISTANCE + 5, 10), p('novo', 40, 40)], ball(52.5, 34));
		expect(next.players[0]).toMatchObject({ px: next.players[0].x, py: next.players[0].y });
		expect(next.players[1]).toMatchObject({ px: 40, py: 40 });
		expect(next.ball).toMatchObject({ px: 52.5, py: 34 });
		expect(tweenFrame(null, [p('a', 3, 4)], ball(1, 1)).players[0]).toMatchObject({ px: 3, py: 4 });
	});

	it('usa o intervalo real entre chegadas, com limites', () => {
		expect(tweenDuration(1000, 1950)).toBe(950);
		expect(tweenDuration(1000, 1010)).toBe(MIN_TWEEN_MS);
		expect(tweenDuration(1000, 9000)).toBe(MAX_TWEEN_MS);
	});
});
