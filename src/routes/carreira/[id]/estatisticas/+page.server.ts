import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { getCareer } from '#lib/server/repos/careers.ts';
import { listUserMatches } from '#lib/server/repos/matches.ts';
import type { PageServerLoad } from './$types';

/** Todas as partidas do usuário (com resumo) — base das estatísticas acumuladas. */
export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('app:career');
	if (!locals.profile) error(404, 'Carreira não encontrada.');
	const db = await getDb();
	const career = await getCareer(db, locals.profile.id, params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	const matches = await listUserMatches(db, career.id);
	return { matches: matches.map((m) => ({ season: m.season, round: m.round, home: m.home, away: m.away, homeGoals: m.homeGoals, awayGoals: m.awayGoals, summary: m.summary })) };
};
