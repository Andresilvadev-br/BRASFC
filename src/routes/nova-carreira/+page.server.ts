import { randomInt } from 'node:crypto';
import { careerStart } from '#lib/domain/career.ts';
import { MAX_LOCAL_COACHES } from '#lib/domain/turns.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	previewSeed: randomInt(1, 2 ** 31 - 1),
	seasons: { brasil: careerStart('brasil').season, brasfc: careerStart('brasfc').season },
	maxCoaches: MAX_LOCAL_COACHES
});
