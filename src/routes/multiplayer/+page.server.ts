import { getDb } from '#lib/server/db/index.ts';
import { listRoomsForProfile } from '#lib/server/repos/rooms.ts';
import { socialInbox } from '#lib/server/repos/social.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:rooms');
	const profile = locals.profile;
	const offline = process.env.BRASFC_OFFLINE === '1';
	if (offline || !profile) return { rooms: [], social: null, offline };
	const db = await getDb();
	const [rooms, social] = await Promise.all([listRoomsForProfile(db, profile.id, true), profile.username ? socialInbox(db, profile.id) : null]);
	return { rooms, social, offline };
};
