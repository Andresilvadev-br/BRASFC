import { error } from '@sveltejs/kit';
import { validateCreateCareer } from '#lib/domain/career.ts';
import { getDb } from '#lib/server/db/index.ts';
import { ensureProfile, noStore, readJson } from '#lib/server/http.ts';
import { CareerLimitError, createCareer, listCareers } from '#lib/server/repos/careers.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.profile) return noStore({ careers: [] });
	return noStore({ careers: await listCareers(await getDb(), locals.profile.id) });
};

export const POST: RequestHandler = async (event) => {
	const body = await readJson(event.request);
	const result = validateCreateCareer(body);
	if (!result.ok) return noStore({ message: 'Revise os dados da carreira.', errors: result.errors }, { status: 400 });
	const seed = body.previewSeed;
	if (seed !== undefined && (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 1 || seed >= 2 ** 31 - 1)) {
		error(400, 'Prévia de elenco inválida.');
	}
	const profile = await ensureProfile(event);
	try {
		const career = await createCareer(await getDb(), profile.id, result.value, seed);
		return noStore({ career }, { status: 201 });
	} catch (e) {
		if (e instanceof CareerLimitError) error(409, e.message);
		throw e;
	}
};
