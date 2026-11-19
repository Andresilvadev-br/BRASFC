import { CAREER_PLAYER_ID } from '#lib/domain/matchday.ts';
import { getDb } from '#lib/server/db/index.ts';
import { listStatMatches } from '#lib/server/repos/matches.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { career } = await parent();
	return { matches: await listStatMatches(await getDb(), career.id, career.mode === 'player' ? CAREER_PLAYER_ID : undefined) };
};
