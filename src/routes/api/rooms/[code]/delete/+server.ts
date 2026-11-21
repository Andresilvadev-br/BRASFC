import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { getRealtimeHub } from '#lib/server/realtime/hub.ts';
import { deleteOnlineLeague, getRoomByCode, normalizeCode, RoomError } from '#lib/server/repos/rooms.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const code = normalizeCode(event.params.code);
	const room = code && await getRoomByCode(db, code);
	if (!room) error(404, 'Liga não encontrada.');
	try {
		const { confirmation } = await readJson(event.request);
		const result = await deleteOnlineLeague(db, room.id, profile.id, confirmation);
		const hub = getRealtimeHub();
		hub.closeLeague(room.id, result.code, 'A liga foi excluída pelo anfitrião.');
		hub.publishInbox(...result.recipients);
		return noStore({ deleted: true });
	} catch (e) {
		if (e instanceof RoomError) error(e.status, e.message);
		throw e;
	}
};
