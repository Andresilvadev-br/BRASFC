import { error } from '@sveltejs/kit';
import { careerView } from '#lib/domain/view.ts';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, requireProfile } from '#lib/server/http.ts';
import { getCareer } from '#lib/server/repos/careers.ts';
import { listResults } from '#lib/server/repos/matches.ts';
import type { RequestHandler } from './$types';

/** Próximo passo do calendário (domingo de liga ou quarta de Copa) e se o usuário joga nele. */
export const GET: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	const view = careerView(career, await listResults(db, career.id, career.season));
	return noStore({ step: view.step?.key ?? null, date: view.step?.date ?? null, plays: !!view.next, seasonOver: view.seasonOver, version: career.version });
};
