import { ROLES, roleCompatibility } from '#lib/engine/roles.ts';
import { positionFit, type Position } from './positions.ts';
import type { SquadPlayer } from './squad.ts';
import { FORMATIONS, MATCH_BENCH_SIZE, type FormationId } from './tactics.ts';

/**
 * "Montar melhor 11" (Carreira de Treinador 2.0).
 *
 * Avalia TODO o elenco elegível e escolhe o melhor CONJUNTO para a formação (atribuição ótima,
 * algoritmo húngaro), não os onze maiores overalls nem o primeiro encaixe guloso. Para cada atleta
 * × posição pesam: posição de origem, posições secundárias, atributos da posição (melhor função),
 * overall e condição física. Indisponíveis (suspensos/lesionados) ficam de fora.
 */
export interface LineupOptions {
	fitness?: Record<string, number>;
	unavailable?: Set<string>;
}

/** Encaixe de posição 0–1: origem 1, secundária 0,92, parecida 0,6, fora 0,2. */
export function slotFit(p: Pick<SquadPlayer, 'position' | 'secondary'>, slot: Position): number {
	if (p.position === slot) return 1;
	if (p.secondary?.includes(slot)) return 0.92;
	return positionFit(p.position, slot);
}

/** Valor do atleta na posição (maior = melhor). Exportado para a prévia e para testes. */
export function slotValue(p: SquadPlayer, slot: Position, fitness?: Record<string, number>): number {
	const fit = slotFit(p, slot);
	const attrs = Math.max(...Object.values(ROLES).filter((r) => r.positions.includes(slot)).map((r) => roleCompatibility(p.attributes, r.id, slot)));
	const condition = fitness?.[p.id] ?? p.condition ?? 95;
	const cond = condition >= 85 ? 1 : condition >= 70 ? 0.96 : condition >= 55 ? 0.88 : 0.75;
	// Fora de posição o atleta rende muito menos: um atacante sem marcação não vira zagueiro.
	const quality = p.overall * 0.65 + attrs * 0.35;
	return Math.pow(fit, 1.6) * quality * cond;
}

/** Atribuição ótima (húngaro, minimizando custo) de `rows` posições para `cols` atletas (rows ≤ cols). */
function hungarian(cost: number[][]): number[] {
	const n = cost.length;
	const m = cost[0]?.length ?? 0;
	const INF = 1e18;
	const u = new Array(n + 1).fill(0);
	const v = new Array(m + 1).fill(0);
	const p = new Array(m + 1).fill(0);
	const way = new Array(m + 1).fill(0);
	for (let i = 1; i <= n; i++) {
		p[0] = i;
		let j0 = 0;
		const minv = new Array(m + 1).fill(INF);
		const used = new Array(m + 1).fill(false);
		do {
			used[j0] = true;
			const i0 = p[j0];
			let delta = INF;
			let j1 = 0;
			for (let j = 1; j <= m; j++) {
				if (used[j]) continue;
				const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
				if (cur < minv[j]) {
					minv[j] = cur;
					way[j] = j0;
				}
				if (minv[j] < delta) {
					delta = minv[j];
					j1 = j;
				}
			}
			for (let j = 0; j <= m; j++) {
				if (used[j]) {
					u[p[j]] += delta;
					v[j] -= delta;
				} else minv[j] -= delta;
			}
			j0 = j1;
		} while (p[j0] !== 0);
		do {
			const j1 = way[j0];
			p[j0] = p[j1];
			j0 = j1;
		} while (j0);
	}
	const result = new Array(n).fill(-1);
	for (let j = 1; j <= m; j++) if (p[j] > 0) result[p[j] - 1] = j - 1;
	return result;
}

/** Melhor onze para a formação, entre todos os elegíveis. Devolve os IDs na ordem dos slots. */
export function bestEleven(formation: FormationId, squad: SquadPlayer[], o: LineupOptions = {}): string[] {
	const slots = FORMATIONS[formation];
	const pool = squad.filter((p) => !o.unavailable?.has(p.id));
	if (!pool.length) return new Array(slots.length).fill('');
	// Goleiro só no gol (e ninguém de linha no gol) quando houver goleiros disponíveis.
	const hasKeeper = pool.some((p) => p.position === 'GOL');
	const value = slots.map((s) => pool.map((p) => {
		if (hasKeeper && (s.position === 'GOL') !== (p.position === 'GOL')) return -1000;
		return slotValue(p, s.position, o.fitness);
	}));
	if (pool.length < slots.length) {
		// Elenco curto: preenche as posições mais importantes primeiro.
		const out: string[] = new Array(slots.length).fill('');
		const used = new Set<number>();
		slots.map((_, i) => i).sort((a, b) => Math.max(...value[b]) - Math.max(...value[a])).forEach((i) => {
			const j = value[i].map((v, k) => [v, k] as const).filter(([, k]) => !used.has(k)).sort((a, b) => b[0] - a[0])[0]?.[1];
			if (j !== undefined) {
				used.add(j);
				out[i] = pool[j].id;
			}
		});
		return out;
	}
	const max = Math.max(...value.flat());
	const assignment = hungarian(value.map((row) => row.map((v) => max - v)));
	return assignment.map((j) => (j >= 0 ? pool[j].id : ''));
}

/** Banco: goleiro reserva, cobertura de cada setor e depois os melhores restantes. */
export function bestBench(squad: SquadPlayer[], lineup: string[], o: LineupOptions & { size?: number } = {}): string[] {
	const size = o.size ?? MATCH_BENCH_SIZE;
	const rest = squad.filter((p) => !lineup.includes(p.id) && !o.unavailable?.has(p.id));
	const score = (p: SquadPlayer) => p.overall * ((o.fitness?.[p.id] ?? p.condition ?? 95) >= 70 ? 1 : 0.9);
	const sorted = [...rest].sort((a, b) => score(b) - score(a));
	const out: string[] = [];
	const take = (pred: (p: SquadPlayer) => boolean) => {
		const p = sorted.find((x) => pred(x) && !out.includes(x.id));
		if (p && out.length < size) out.push(p.id);
	};
	take((p) => p.position === 'GOL');
	take((p) => ['ZAG', 'LD', 'LE'].includes(p.position));
	take((p) => ['VOL', 'MC', 'MEI'].includes(p.position));
	take((p) => ['PD', 'PE', 'ATA'].includes(p.position));
	for (const p of sorted) {
		if (out.length >= size) break;
		if (!out.includes(p.id) && p.position !== 'GOL') out.push(p.id);
	}
	return out;
}

/** Nota do onze (para comparar a escalação atual com a sugerida na prévia). */
export function lineupScore(formation: FormationId, lineup: string[], squad: SquadPlayer[], fitness?: Record<string, number>): number {
	const byId = new Map(squad.map((p) => [p.id, p]));
	const slots = FORMATIONS[formation];
	const total = lineup.reduce((s, id, i) => s + (byId.get(id) ? slotValue(byId.get(id)!, slots[i].position, fitness) : 0), 0);
	return Math.round((total / slots.length) * 10) / 10;
}
