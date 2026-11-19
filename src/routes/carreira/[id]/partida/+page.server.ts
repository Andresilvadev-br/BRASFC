import { getDb } from '#lib/server/db/index.ts';
import { getCareer } from '#lib/server/repos/careers.ts';
import { matchdayContext } from '#lib/server/rounds.ts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** O navegador precisa do MESMO contexto que o servidor usará para reproduzir a partida. */
export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('app:career');
	if (!locals.profile) error(404, 'Carreira não encontrada.');
	const db = await getDb();
	const career = await getCareer(db, locals.profile.id, params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	const ctx = await matchdayContext(db, career);
	return { observed: ctx.observed };
};
