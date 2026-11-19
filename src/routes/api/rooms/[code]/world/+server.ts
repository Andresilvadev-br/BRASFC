import { error } from '@sveltejs/kit';
import { applyWorldCommand, updateLiveRound, worldReplay, worldRevision, worldSnapshot } from '#lib/server/connected-world.ts';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, RateLimiter, readJson, requireProfile } from '#lib/server/http.ts';
import { getRealtimeHub } from '#lib/server/realtime/hub.ts';
import { getRoomByCode, normalizeCode, RoomError } from '#lib/server/repos/rooms.ts';
import { ManagementError } from '#lib/domain/management.ts';
import type { RequestHandler } from './$types';

const limiter = new RateLimiter(90, 60_000);
const liveLimiter = new RateLimiter(180, 60_000);

async function roomOf(db: Awaited<ReturnType<typeof getDb>>, raw: string) {
	const code = normalizeCode(raw);
	const room = code && await getRoomByCode(db, code);
	if (!room) error(404, 'Universo não encontrado.');
	return room;
}

export const GET: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	try {
		const room = await roomOf(db, event.params.code);
		if (event.url.searchParams.has('revision')) return noStore(await worldRevision(db, room, profile.id));
		const home = event.url.searchParams.get('home'), away = event.url.searchParams.get('away');
		return noStore(home && away ? await worldReplay(db, room, profile.id, home, away) : await worldSnapshot(db, room, profile.id));
	} catch (e) {
		if (e instanceof RoomError) error(e.status, e.message);
		throw e;
	}
};

export const POST: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const live = event.url.searchParams.has('live');
	if (!(live ? liveLimiter : limiter).take(profile.id)) error(429, 'Muitas ações. Aguarde alguns instantes.');
	const db = await getDb();
	const room = await roomOf(db, event.params.code);
	try {
		const t = performance.now();
		const command = await readJson(event.request);
		const hub = getRealtimeHub();
		const connection = { online: () => hub.onlineProfiles(room.id) };
		if (live) {
			const result = await updateLiveRound(db, room, profile.id, command, connection);
			if (result.revision) void hub.publishWorldRevision(room.id, result.revision).catch(() => {});
			return noStore(result);
		}
		const committed = await applyWorldCommand(db, room, profile.id, command, connection);
		if (!committed.duplicate) {
			const publish = ['remove', 'archive', 'transfer-owner'].includes(String(command.action))
				? hub.broadcastRoom(room.id) : hub.publishWorldRevision(room.id, committed.revision);
			void publish.catch(() => {});
		}
		const timing = [`world;dur=${(performance.now() - t).toFixed(1)}`];
		if (committed.timing) timing.push(`simulation;dur=${committed.timing.simulationMs.toFixed(1)}`, `round-write;dur=${committed.timing.roundWriteMs.toFixed(1)}`);
		return noStore(committed, { headers: { 'Server-Timing': timing.join(', ') } });
	} catch (e) {
		if (e instanceof RoomError) error(e.status, e.message);
		if (e instanceof ManagementError) error(422, e.message);
		throw e;
	}
};
