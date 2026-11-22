import { getDb } from '#lib/server/db/index.ts';
import { listCareers } from '#lib/server/repos/careers.ts';
import { listRoomsForProfile } from '#lib/server/repos/rooms.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:careers');
	const offline = process.env.BRASFC_OFFLINE === '1';
	if (!locals.profile) return { careers: [], shared: [], sharedFailed: false, offline };
	const db = await getDb();
	const [careers, rooms] = await Promise.all([
		listCareers(db, locals.profile.id, true),
		// Ligas só aparecem como atalho: a gestão (e a exclusão, pelo anfitrião) fica no multiplayer.
		offline ? Promise.resolve([]) : listRoomsForProfile(db, locals.profile.id).catch(() => null)
	]);
	const shared = (rooms ?? []).filter((room) => room.status === 'open').slice(0, 6).map((room) => ({
		code: room.code, name: room.name, entryMode: room.entryMode, season: room.season, club: room.club,
		members: Number(room.members), maxMembers: room.maxMembers, started: room.started, owner: room.ownerId === locals.profile!.id
	}));
	return { careers, shared, sharedFailed: rooms === null, offline };
};
