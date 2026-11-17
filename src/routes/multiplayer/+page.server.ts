import { getDb } from '#lib/server/db/index.ts';
import { listRoomsForProfile } from '#lib/server/repos/rooms.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:rooms');
	return { rooms: locals.profile ? await listRoomsForProfile(await getDb(), locals.profile.id) : [] };
};
