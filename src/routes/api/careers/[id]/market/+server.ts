import { sharedClub } from '#lib/domain/turns.ts';
import { error } from '@sveltejs/kit';
import { careerWorld } from '#lib/domain/career.ts';
import { sanitizeCup } from '#lib/domain/cup.ts';
import { CLUBES_2026 } from '#lib/data/brasil.ts';
import { sanitizeLeague } from '#lib/domain/league.ts';
import { playerHistory } from '#lib/domain/playerstats.ts';
import { clubStateOf, rosterContext } from '#lib/domain/world.ts';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, requireProfile } from '#lib/server/http.ts';
import { marketIndex, marketProfile, queryMarket, readMarketFilters } from '#lib/server/market-search.ts';
import { getCareerForMarket } from '#lib/server/repos/careers.ts';
import { listTransfers } from '#lib/server/repos/management.ts';
import { listStatMatches } from '#lib/server/repos/matches.ts';
import type { RequestHandler } from './$types';

const knownClubs = new Set(CLUBES_2026.map((club) => club.id));

export const GET: RequestHandler = async (event) => {
	const owner = requireProfile(event);
	const db = await getDb();
	const career = await getCareerForMarket(db, owner.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	if (career.mode !== 'coach') error(403, 'O mercado do clube é gerenciado pelo treinador.');
	const league = sanitizeLeague(career.data.league, careerWorld(career), career.season);
	const cup = league.world === 'brasil' ? sanitizeCup(career.data.cup, knownClubs) : null;
	const entrants = cup?.season === career.season ? Object.values(cup.entrants).flat() : [];
	const index = marketIndex(`career:${career.id}:${career.version}`, career.clubId, rosterContext(career, league), league, clubStateOf(career, league), undefined, entrants);
	const id = event.url.searchParams.get('player');
	if (!id) return noStore(queryMarket(index, readMarketFilters(event.url.searchParams)));
	const profile = marketProfile(index, id);
	if (!profile) error(404, 'Atleta indisponível neste mercado.');
	const [matches, transfers] = await Promise.all([listStatMatches(db, career.id, id, sharedClub(career)), listTransfers(db, career.id, 30, id)]);
	const { seasons } = playerHistory(matches, id);
	profile.stats = seasons.map(({ season, totals: { games, minutes, goals, assists, yellow, red } }) => ({ season, games, minutes, goals, assists, yellow, red }));
	profile.transfers = transfers.map(({ gameDate, from, to, kind, fee }) => ({ gameDate, from, to, kind, fee }));
	return noStore(profile);
};
