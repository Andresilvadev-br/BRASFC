import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { getCareer, isUuid, listMessages, touchCareer } from '#lib/server/repos/careers.ts';
import { listResults, listUserMatches } from '#lib/server/repos/matches.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params, depends }) => {
	depends('app:career');
	if (!locals.profile || !isUuid(params.id)) error(404, 'Carreira não encontrada.');
	const db = await getDb();
	const career = await getCareer(db, locals.profile.id, params.id);
	if (!career) error(404, 'Carreira não encontrada neste perfil.');
	const messages = await listMessages(db, locals.profile.id, career.id);
	const results = await listResults(db, career.id, career.season);
	// Últimos jogos do usuário (resumos) para o auxiliar técnico analisar.
	const recent = (await listUserMatches(db, career.id)).slice(-5).map((m) => ({ home: m.home, away: m.away, summary: m.summary }));
	await touchCareer(db, locals.profile.id, career.id); // "Continuar" abre a última jogada
	return { career, messages, results, recent };
};
