/**
 * Interpolação visual entre quadros OFICIAIS da transmissão ao vivo (contrato da Equipe A):
 * posições em metros (105 × 68), interpolação só entre o que está na tela e o último quadro
 * recebido. Nada aqui altera a simulação, o placar ou os eventos: só a origem (px/py) do desenho.
 */
export type Point = { x: number; y: number };
type Positioned = { id: string; x: number; y: number; px: number; py: number };
type BallLike = { x: number; y: number; px: number; py: number };

/** Acima disso (metros) o movimento entre dois quadros é reposição (gol, saída), não corrida: corta direto. */
export const SNAP_DISTANCE = 22;
export const MIN_TWEEN_MS = 180;
export const MAX_TWEEN_MS = 1200;

export const easeOut = (a: number) => 1 - (1 - a) ** 2;

/** Duração da transição: o intervalo real entre as duas últimas chegadas, dentro de limites. */
export function tweenDuration(lastArrival: number, now: number, fallback = 900): number {
	const gap = lastArrival > 0 ? now - lastArrival : fallback;
	return Math.max(MIN_TWEEN_MS, Math.min(MAX_TWEEN_MS, gap));
}

/** Posições exibidas num instante da transição (para encadear quadros que chegam no meio dela). */
export function shownPositions<P extends Positioned, B extends BallLike>(players: P[], ball: B, alpha: number): { players: Map<string, Point>; ball: Point } {
	const at = (p: BallLike) => ({ x: p.px + (p.x - p.px) * alpha, y: p.py + (p.y - p.py) * alpha });
	return { players: new Map(players.map((p) => [p.id, at(p)])), ball: at(ball) };
}

/**
 * Monta o quadro a desenhar: destino = posição oficial; origem = o que estava na tela.
 * Sem origem conhecida (entrou em campo, primeira imagem, nova sessão) ou com salto grande, começa no destino.
 */
export function tweenFrame<P extends Positioned, B extends BallLike>(from: { players: Map<string, Point>; ball: Point } | null, players: P[], ball: B): { players: P[]; ball: B } {
	const origin = (target: Point, seen: Point | undefined) =>
		seen && Math.hypot(target.x - seen.x, target.y - seen.y) <= SNAP_DISTANCE ? seen : target;
	return {
		players: players.map((p) => {
			const o = origin(p, from?.players.get(p.id));
			return { ...p, px: o.x, py: o.y };
		}),
		ball: (() => {
			const o = origin(ball, from?.ball);
			return { ...ball, px: o.x, py: o.y };
		})()
	};
}
