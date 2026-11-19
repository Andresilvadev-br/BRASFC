import { error } from '@sveltejs/kit';
import { careerCalendar } from '#lib/domain/view.ts';
import { universePreview } from '#lib/domain/universe.ts';
import { getDb } from '#lib/server/db/index.ts';
import { getCareer, isUuid, listMessages, touchCareer } from '#lib/server/repos/careers.ts';
import { listResults, recentUserMatches } from '#lib/server/repos/matches.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params, depends }) => {
	depends('app:career');
	if (!locals.profile || !isUuid(params.id)) error(404, 'Carreira não encontrada.');
	const db = await getDb();
	const career = await getCareer(db, locals.profile.id, params.id);
	if (!career) error(404, 'Carreira não encontrada neste perfil.');
	const [messages, results, recentMatches] = await Promise.all([
		listMessages(db, locals.profile.id, career.id, 4),
		listResults(db, career.id, career.season),
		recentUserMatches(db, career.id, 5),
		touchCareer(db, locals.profile.id, career.id)
	]);
	if (career.data.universe) {
		const { next, upcoming } = careerCalendar(career, results);
		const clubs = [career.clubId, ...[next, upcoming].flatMap((fixture) => fixture ? [fixture.home, fixture.away] : [])];
		career.data = { ...career.data, universe: universePreview(career.data.universe, [...new Set(clubs)]) };
	}
	const recent = recentMatches.map(({ home, away, summary }) => ({ home, away, summary }));
	return { career, messages, results, recent };
};
