import { randomInt } from 'node:crypto';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ previewSeed: randomInt(1, 2 ** 31 - 1) });
