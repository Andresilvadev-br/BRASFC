import { error } from '@sveltejs/kit';
import { isShared } from '#lib/domain/turns.ts';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { getCareer, VersionConflictError } from '#lib/server/repos/careers.ts';
import { finishSeason, RoundError, SeasonSelectionRequired } from '#lib/server/rounds.ts';
import { prefetchRound } from '#lib/server/round-prefetch.ts';
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
		const out = await finishSeason(db, profile.id, career, version, body.activateDivisions);
		if (!isShared(out.career)) prefetchRound(db, profile.id, out.career.id);
		return noStore(out);
	} catch (e) {
		if (e instanceof SeasonSelectionRequired) return noStore({ message: e.message, errors: { activateDivisions: e.divisions.join(',') } }, { status: e.status });
		if (e instanceof RoundError) error(e.status, e.message);
		if (e instanceof VersionConflictError) error(409, e.message);
		throw e;
	}
};
