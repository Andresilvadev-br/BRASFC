import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { getRealtimeHub } from '#lib/server/realtime/hub.ts';
import { getRoomByCode, normalizeCode, RoomError } from '#lib/server/repos/rooms.ts';
import { readRoomChat, writeRoomChat } from '#lib/server/repos/room-chat.ts';
import { sendInvitation } from '#lib/server/repos/social.ts';
import type { RequestHandler } from './$types';

async function context(event: Parameters<RequestHandler>[0]) {
	const profile = requireProfile(event);
	const code = normalizeCode(event.params.code), db = await getDb();
	const room = code && await getRoomByCode(db, code);
	if (!room) error(404, 'Liga indisponível.');
	return { profile, room, db };
}
export const GET: RequestHandler = async (event) => {
	const { profile, room, db } = await context(event);
	try {
		return noStore(await readRoomChat(db, room, profile.id, event.url.searchParams.get('channel'), event.url.searchParams.get('before')));
	} catch (cause) {
		if (cause instanceof RoomError) error(cause.status, cause.message);
		throw cause;
	}
};

export const POST: RequestHandler = async (event) => {
	const { profile, room, db } = await context(event);
	const body = await readJson(event.request);
	const hub = getRealtimeHub();
	try {
		if (body.action === 'invite') {
			if (!profile.username) error(401, 'Entre na sua conta BRASFC.');
			const invite = await sendInvitation(db, room, profile.id, body);
			hub.publishInbox(profile.id, invite.recipient);
			void hub.publishChat(room.id, null).catch(() => {});
			return noStore({ id: invite.id }, { status: 201 });
		}
		const result = await writeRoomChat(db, room, profile.id, body);
		if (result.changed) void hub.publishChat(room.id, result.club).catch(() => {});
		if (result.revision !== undefined) void hub.publishWorldRevision(room.id, result.revision).catch(() => {});
		return noStore({ ok: true });
	} catch (cause) {
		if (cause instanceof RoomError) error(cause.status, cause.message);
		throw cause;
	}
};
