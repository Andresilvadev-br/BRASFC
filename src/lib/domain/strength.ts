import type { Career } from './career.ts';
import { generateSquad, squadStrength } from './squad.ts';

/**
 * Força de cada clube (média dos 11 melhores do elenco). Memorizada por semente da carreira:
 * os elencos são determinísticos. O mercado (Dev 0.4) substitui por `rosterStrength`.
 */
const cache = new Map<string, number>();
export function baseStrength(seed: number, clubId: string): number {
	const key = `${seed}:${clubId}`;
	let v = cache.get(key);
	if (v === undefined) {
		v = squadStrength(generateSquad(clubId, seed));
		if (cache.size > 4000) cache.clear();
		cache.set(key, v);
	}
	return v;
}

export function strengthFor(career: Pick<Career, 'seed'>): (clubId: string) => number {
	return (id) => baseStrength(career.seed, id);
}
