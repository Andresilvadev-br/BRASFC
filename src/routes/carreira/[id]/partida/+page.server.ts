import { observedFrom } from '#lib/domain/matchday.ts';
import type { PageServerLoad } from './$types';

/** A leitura da carreira já traz as últimas súmulas necessárias ao adversário. */
export const load: PageServerLoad = async ({ parent }) => {
	const { recent } = await parent();
	return { observed: recent.slice(-3).map((m) => observedFrom(m.summary)).filter((m) => m !== null) };
};
