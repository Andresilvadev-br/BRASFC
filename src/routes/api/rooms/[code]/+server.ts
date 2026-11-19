import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { ensureProfile, limitedResponse, noStore, RateLimiter, requireProfile } from '#lib/server/http.ts';
import { getRealtimeHub } from '#lib/server/realtime/hub.ts';
import { getRoomByCode, isMember, joinRoom, leaveRoom, listMembers, normalizeCode, RoomError } from '#lib/server/repos/rooms.ts';
import type { RequestHandler } from './$types';

const joinLimiter = new RateLimiter(20, 60_000);

function codeOf(raw: string): string {
	const code = normalizeCode(raw);
	if (!code) error(400, 'Código de sala inválido. Ele tem 6 letras e números.');
	return code;
}

export const GET: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const room = await getRoomByCode(db, codeOf(event.params.code));
	if (!room || !(await isMember(db, room.id, profile.id))) error(404, 'Sala não encontrada.');
	return noStore({ room, members: await listMembers(db, room.id) });
};

/** Entrar na sala pelo código. */
export const POST: RequestHandler = async (event) => {
	const code = codeOf(event.params.code);
	const profile = await ensureProfile(event);
	// Limite por perfil: dificulta tentativas de adivinhar códigos.
	const retry = joinLimiter.retryAfter(profile.id);
	if (retry) return limitedResponse(retry, 'Muitas tentativas de entrar em uma sala.');
	try {
		const room = await joinRoom(await getDb(), code, profile.id);
		void getRealtimeHub().broadcastRoom(room.id).catch(() => {});
		return noStore({ room });
	} catch (e) {
		if (e instanceof RoomError) error(e.status, e.message);
		throw e;
	}
};

/** Sair da sala (o anfitrião, ao sair, encerra a sala). */
export const DELETE: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const room = await getRoomByCode(db, codeOf(event.params.code));
	if (!room || !(await isMember(db, room.id, profile.id))) error(404, 'Sala não encontrada.');
	try {
		const result = await leaveRoom(db, room, profile.id);
		void getRealtimeHub().broadcastRoom(room.id).catch(() => {});
		return noStore({ result });
	} catch (e) {
		if (e instanceof RoomError) error(e.status, e.message);
		throw e;
	}
};
