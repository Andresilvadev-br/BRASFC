/**
 * Gerador pseudoaleatório determinístico (mulberry32).
 * Mesma semente → mesmos dados: elencos e calendários demonstrativos
 * são reproduzíveis sem precisar armazená-los no banco.
 */
export interface Rng {
	next(): number;
	int(min: number, max: number): number;
	pick<T>(list: readonly T[]): T;
	chance(probability: number): boolean;
	shuffle<T>(list: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
	let a = seed >>> 0;
	const next = () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return {
		next,
		int: (min, max) => min + Math.floor(next() * (max - min + 1)),
		pick: (list) => list[Math.floor(next() * list.length)] as (typeof list)[number],
		chance: (p) => next() < p,
		shuffle(list) {
			const out = [...list];
			for (let i = out.length - 1; i > 0; i--) {
				const j = Math.floor(next() * (i + 1));
				[out[i], out[j]] = [out[j], out[i]];
			}
			return out;
		}
	};
}

/** Hash FNV-1a de 32 bits para derivar sementes a partir de textos. */
export function hashString(text: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

export function deriveSeed(seed: number, ...parts: Array<string | number>): number {
	return hashString(`${seed}:${parts.join(':')}`);
}
