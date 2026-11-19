import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { ensureProfile, noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { getRealtimeHub } from '#lib/server/realtime/hub.ts';
import { normalizeDisplayName, renameProfile } from '#lib/server/repos/profiles.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => noStore({ profile: locals.profile });

/** Garante um perfil de convidado (chamado durante o carregamento da abertura). */
export const POST: RequestHandler = async (event) => {
	const profile = await ensureProfile(event);
	return noStore({ profile });
};

export const PATCH: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const body = await readJson(event.request);
	const name = normalizeDisplayName(body.displayName);
	if (!name) error(400, 'Use de 2 a 32 caracteres (letras, números, espaço, ponto, hífen).');
	const updated = await renameProfile(await getDb(), profile.id, name);
	void getRealtimeHub().profileRenamed(profile.id).catch(() => {});
	return noStore({ profile: updated });
};
