import { error } from '@sveltejs/kit';
import { validateCreateCareer } from '#lib/domain/career.ts';
import { getDb } from '#lib/server/db/index.ts';
import { ensureProfile, noStore, readJson } from '#lib/server/http.ts';
import { CareerLimitError, createCareer, listCareers } from '#lib/server/repos/careers.ts';
import { MAX_LOCAL_COACHES, type CoachDraft } from '#lib/domain/turns.ts';
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
	// 0.13: demais treinadores locais (mesmo mundo, cada um com o próprio clube), na ordem de criação.
	const others: CoachDraft[] = [];
	if (body.others !== undefined) {
		if (!Array.isArray(body.others) || body.others.length > MAX_LOCAL_COACHES - 1) error(400, `No máximo ${MAX_LOCAL_COACHES} treinadores por carreira.`);
		for (const [i, raw] of body.others.entries()) {
			const r = validateCreateCareer({ ...(raw as object), mode: 'coach', world: result.value.world, leagueSelection: result.value.leagueSelection, worldSelection: result.value.worldSelection });
			if (!r.ok) return noStore({ message: `Revise os dados do treinador ${i + 2}.`, errors: r.errors }, { status: 400 });
			others.push({ personName: r.value.personName, clubId: r.value.clubId, appearance: r.value.appearance });
		}
		const clubs = [result.value.clubId, ...others.map((o) => o.clubId)];
		if (new Set(clubs).size !== clubs.length) error(400, 'Dois treinadores não podem comandar o mesmo clube.');
	}
	const profile = await ensureProfile(event);
	try {
		const career = await createCareer(await getDb(), profile.id, result.value, seed, others);
		return noStore({ career }, { status: 201 });
	} catch (e) {
		if (e instanceof CareerLimitError) error(409, e.message);
		throw e;
	}
};
