import type { Career } from './career.ts';
import { rosterContext, strengthMemo } from './world.ts';

/** Força de cada clube na carreira (elencos com mercado e evolução), memorizada por processamento. */
export function strengthFor(career: Pick<Career, 'seed' | 'season' | 'clubId' | 'data'>): (clubId: string) => number {
	return strengthMemo(rosterContext(career));
}
