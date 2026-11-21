import { readLeagueConfig } from '#lib/server/league-config.ts';
import { isUuid } from '#lib/server/repos/careers.ts';
import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { limitedResponse, noStore, RateLimiter, readJson, requireProfile } from '#lib/server/http.ts';
import { createRoom, listRoomsForProfile, RoomError } from '#lib/server/repos/rooms.ts';
import type { RequestHandler } from './$types';

const createLimiter = new RateLimiter(10, 10 * 60_000);

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.profile) return noStore({ rooms: [] });
	return noStore({ rooms: await listRoomsForProfile(await getDb(), locals.profile.id) });
};

export const POST: RequestHandler = async (event) => {
	const body = await readJson(event.request);
	const profile = requireProfile(event);
	if (!profile.username) error(401, 'Crie sua conta BRASFC para abrir uma liga.');
	const key = body.creationKey;
	if (key !== undefined && (typeof key !== 'string' || !isUuid(key))) error(400, 'Rascunho inválido.');
	const retry = createLimiter.retryAfter(profile.id);
	if (retry) return limitedResponse(retry, 'Muitas tentativas de criação. Aguarde alguns minutos.');
	try {
		const { name, options } = readLeagueConfig(body);
		return noStore({ room: await createRoom(await getDb(), profile.id, name, options, key) }, { status: 201 });
	} catch (e) {
		if (e instanceof RoomError) error(e.status, e.message);
		throw e;
	}
};
