import { CAREER_PLAYER_ID } from '#lib/domain/matchday.ts';
import { playerHistory } from '#lib/domain/playerstats.ts';
import { getDb } from '#lib/server/db/index.ts';
import { listStatMatches } from '#lib/server/repos/matches.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, url }) => {
	const { career } = await parent();
	if (career.mode !== 'player' || url.searchParams.get('secao') !== 'historico') return { playerHistory: null };
	const history = playerHistory(await listStatMatches(await getDb(), career.id, CAREER_PLAYER_ID), CAREER_PLAYER_ID);
	return {
		playerHistory: {
			all: history.all,
			seasons: history.seasons,
			records: history.games.reduce((best, game) => ({
				rating: Math.max(best.rating, game.stats.rating),
				goals: Math.max(best.goals, game.stats.goals),
				assists: Math.max(best.assists, game.stats.assists)
			}), { rating: 0, goals: 0, assists: 0 })
		}
	};
};
