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
	const result = validateCreateCareer(await readJson(event.request));
	if (!result.ok) return noStore({ message: 'Revise os dados da carreira.', errors: result.errors }, { status: 400 });
	const profile = await ensureProfile(event);
	try {
		const career = await createCareer(await getDb(), profile.id, result.value);
		return noStore({ career }, { status: 201 });
	} catch (e) {
		if (e instanceof CareerLimitError) error(409, e.message);
		throw e;
	}
};
