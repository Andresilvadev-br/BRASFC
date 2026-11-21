import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { getRealtimeHub } from '#lib/server/realtime/hub.ts';
import { RoomError } from '#lib/server/repos/rooms.ts';
import { answerInvitation, friendship, searchProfiles, socialInbox } from '#lib/server/repos/social.ts';
import type { RequestHandler } from './$types';

function account(event: Parameters<RequestHandler>[0]) {
	const profile = requireProfile(event);
	if (!profile.username) error(401, 'Entre na sua conta BRASFC.');
	return profile.id;
}

export const GET: RequestHandler = async (event) => {
	const profile = account(event);
	const db = await getDb();
	const query = event.url.searchParams.get('q');
	return noStore(query === null ? await socialInbox(db, profile) : { users: await searchProfiles(db, profile, query) });
};

export const POST: RequestHandler = async (event) => {
	const profile = account(event);
	const body = await readJson(event.request, 2048);
	const db = await getDb(), hub = getRealtimeHub();
	try {
		if (body.action === 'accept' || body.action === 'decline') {
			const result = await answerInvitation(db, profile, body.id, body.action === 'accept');
			hub.publishInbox(profile, result.sender);
			if (body.action === 'accept') void hub.broadcastRoom(result.room_id).catch(() => {});
			return noStore({ code: result.code });
		}
		const result = await friendship(db, profile, body.action, body.target);
		if (result.changed) hub.publishInbox(profile, result.target);
		return noStore({ ok: true });
	} catch (e) {
		if (e instanceof RoomError) error(e.status, e.message);
		throw e;
	}
};
