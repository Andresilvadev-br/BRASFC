import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { getCareer, VersionConflictError } from '#lib/server/repos/careers.ts';
import { finishSeason, RoundError } from '#lib/server/rounds.ts';
import type { RequestHandler } from './$types';

/** Encerra a temporada (acesso, rebaixamento) e começa a próxima. */
export const POST: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	const body = await readJson(event.request);
	const version = Number(body.version);
	if (!Number.isInteger(version)) error(400, 'Versão da carreira ausente.');
	try {
		return noStore(await finishSeason(db, profile.id, career, version));
	} catch (e) {
		if (e instanceof RoundError) error(e.status, e.message);
		if (e instanceof VersionConflictError) error(409, e.message);
		throw e;
	}
};
