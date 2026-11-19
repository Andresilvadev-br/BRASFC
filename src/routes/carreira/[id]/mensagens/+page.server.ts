import { getDb } from '#lib/server/db/index.ts';
import { listMessages } from '#lib/server/repos/careers.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { career } = await parent();
	return { messages: await listMessages(await getDb(), locals.profile!.id, career.id) };
};
