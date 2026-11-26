import { getDb } from '#lib/server/db/index.ts';
import { listCareers } from '#lib/server/repos/careers.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:careers');
	if (!locals.profile) return { careers: [] };
	return { careers: await listCareers(await getDb(), locals.profile.id, true) };
};
