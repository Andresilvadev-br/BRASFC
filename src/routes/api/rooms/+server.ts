import { leagueOptions } from '#lib/domain/league-options.ts';
import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { ensureProfile, limitedResponse, noStore, RateLimiter, readJson } from '#lib/server/http.ts';
import { createRoom, listRoomsForProfile, normalizeRoomName, RoomError } from '#lib/server/repos/rooms.ts';
import type { RequestHandler } from './$types';

const createLimiter = new RateLimiter(10, 10 * 60_000);

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.profile) return noStore({ rooms: [] });
	return noStore({ rooms: await listRoomsForProfile(await getDb(), locals.profile.id) });
};

export const POST: RequestHandler = async (event) => {
	const body = await readJson(event.request);
	const name = normalizeRoomName(body.name);
	if (!name) error(400, 'Dê um nome de 2 a 40 caracteres para a sala.');
	const profile = await ensureProfile(event);
	const configured = body.mode !== undefined;
	if (configured && !profile.username) error(401, 'Crie sua conta BRASFC para abrir uma liga.');
	const mode = body.mode, max = body.max;
	if (configured && ((mode !== 'coach' && mode !== 'player') || typeof max !== 'number' || !Number.isInteger(max) || max < 2 || max > 16)) {
		error(400, 'Escolha um modo e de 2 a 16 vagas.');
	}
	const rules = leagueOptions(body.rules);
	if (configured && !rules) error(400, 'Configuração de temporada inválida.');
	const options: Parameters<typeof createRoom>[3] = (mode === 'coach' || mode === 'player') && typeof max === 'number'
		? { mode, max, inviteOnly: body.inviteOnly === true, assistantsRequired: body.assistantsRequired === true, leagueOptions: rules ?? undefined } : undefined;
	const retry = createLimiter.retryAfter(profile.id);
	if (retry) return limitedResponse(retry, 'Você criou muitas salas em pouco tempo.');
	try {
		return noStore({ room: await createRoom(await getDb(), profile.id, name, options) }, { status: 201 });
	} catch (e) {
		if (e instanceof RoomError) error(e.status, e.message);
		throw e;
	}
};
