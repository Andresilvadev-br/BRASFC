import { sanitizeUniverse } from '#lib/domain/universe.ts';
import { getDb } from '#lib/server/db/index.ts';
import { getCareer } from '#lib/server/repos/careers.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { career } = await parent();
	const full = await getCareer(await getDb(), locals.profile!.id, career.id);
	return { universe: sanitizeUniverse(full?.data.universe) };
};
