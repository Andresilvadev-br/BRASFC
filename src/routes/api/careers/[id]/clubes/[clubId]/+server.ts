import { error } from '@sveltejs/kit';
import { careerWorld } from '#lib/domain/career.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { sanitizeLeague } from '#lib/domain/league.ts';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, requireProfile } from '#lib/server/http.ts';
import { clubPreview } from '#lib/server/coach-market.ts';
import { getCareer } from '#lib/server/repos/careers.ts';
import { listResults } from '#lib/server/repos/matches.ts';
import { ensureUniverse } from '#lib/server/universe.ts';
import type { RequestHandler } from './$types';

/**
 * Prévia detalhada de um clube interessado (Central de Propostas). Carregada só quando o treinador
 * abre a proposta: elenco, projeto, finanças e objetivos com os mesmos números que ele encontrará
 * ao assumir.
 */
export const GET: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	if (career.mode !== 'coach') error(403, 'A prévia de clubes é da carreira de treinador.');
	const clubId = event.params.clubId;
	if (!getClub(clubId)) error(404, 'Clube não encontrado.');
	const league = sanitizeLeague(career.data.league, careerWorld(career), career.season);
	const inLeague = Object.values(league.divisions).some((ids) => (ids as string[] | undefined)?.includes(clubId));
	if (!inLeague) error(404, 'Clube fora das divisões desta carreira.');
	const results = await listResults(db, career.id, career.season);
	return noStore({ preview: clubPreview(career, league, results, clubId, ensureUniverse(career, league)) });
};
