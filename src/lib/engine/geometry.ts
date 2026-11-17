import { PITCH, type Side } from './types.ts';

/**
 * Coordenadas relativas: cada time "ataca para a direita" (x crescente até o gol em x=105).
 * O mandante ataca +x durante toda a partida; o visitante, -x (espelhado).
 */
export function toRel(side: Side, x: number, y: number): [number, number] {
	return side === 'home' ? [x, y] : [PITCH.length - x, PITCH.width - y];
}

export const toAbs = toRel; // a transformação é a própria inversa

export function dist(ax: number, ay: number, bx: number, by: number): number {
	return Math.hypot(ax - bx, ay - by);
}

/** Distância do ponto P ao segmento AB e a fração t ao longo do segmento. */
export function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number } {
	const vx = bx - ax;
	const vy = by - ay;
	const len2 = vx * vx + vy * vy || 1;
	let t = ((px - ax) * vx + (py - ay) * vy) / len2;
	t = Math.max(0, Math.min(1, t));
	return { d: Math.hypot(px - (ax + t * vx), py - (ay + t * vy)), t };
}

/**
 * Probabilidade de gol (xG) de um chute em coordenadas relativas, sem pressão.
 * Curva logística pela distância × fator do ângulo de visão do gol.
 * Referências: ~0,45 a 6 m, ~0,25 na marca do pênalti (11 m), ~0,03 a 25 m.
 */
export function baseXg(ax: number, ay: number): number {
	const dx = Math.max(0.5, PITCH.length - ax);
	const dy = Math.abs(PITCH.width / 2 - ay);
	const d = Math.hypot(dx, dy);
	const byDistance = 1 / (1 + Math.exp(0.18 * (d - 5)));
	const half = PITCH.goalWidth / 2;
	const angle = Math.atan2(PITCH.goalWidth * dx, dx * dx + dy * dy - half * half);
	const central = Math.atan2(PITCH.goalWidth * d, d * d - half * half);
	const angleFactor = Math.max(0.05, Math.min(1, angle / central));
	return byDistance * angleFactor;
}

export function inBox(ax: number, ay: number): boolean {
	return ax >= PITCH.length - PITCH.boxDepth && Math.abs(ay - PITCH.width / 2) <= PITCH.boxWidth / 2;
}

export function clampToPitch(x: number, y: number): [number, number] {
	return [Math.max(0.5, Math.min(PITCH.length - 0.5, x)), Math.max(0.5, Math.min(PITCH.width - 0.5, y))];
}
