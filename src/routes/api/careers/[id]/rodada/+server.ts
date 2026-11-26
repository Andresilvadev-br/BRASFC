import { error } from '@sveltejs/kit';
import { localGroup } from '#lib/domain/turns.ts';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, requireProfile } from '#lib/server/http.ts';
import { getCareer } from '#lib/server/repos/careers.ts';
import { roundPreview } from '#lib/server/rounds.ts';
import type { RequestHandler } from './$types';

/**
 * 0.13 · Central da rodada (vários treinadores): as partidas dos treinadores, montadas com a tática
 * de cada um, e os demais jogos já simulados pelo motor. Só depois de todos confirmarem a preparação.
 */
export const GET: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	const g = localGroup(career);
	if (!g) error(409, 'Esta carreira tem um treinador só.');
	if (!g.coaches.every((c, i) => i === g.active || g.ready.includes(c.id))) error(409, 'Ainda há treinadores preparando o clube para esta rodada.');
	const preview = await roundPreview(db, career);
	if (!preview) error(409, 'A temporada terminou. Encerre-a para começar a próxima.');
	return noStore({ version: career.version, ...preview });
};
