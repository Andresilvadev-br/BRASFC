import type { Career } from './career.ts';
import { careerWorld } from './career.ts';
import { ctDevelopment } from './club.ts';
import { divisionOf, sanitizeLeague, type LeagueState } from './league.ts';
import { sanitizeClubState, sanitizeMarket } from './management.ts';
import { rosterOf, type RosterContext } from './market.ts';
import { squadStrength } from './squad.ts';

/**
 * Contexto de elencos da carreira: base determinística + evolução por temporada + mercado persistido.
 * Usado igual no servidor e no navegador (as partidas são reproduzidas dos dois lados).
 */
export function rosterContext(career: Pick<Career, 'seed' | 'season' | 'clubId' | 'data'> & { mode?: Career['mode'] }, league?: LeagueState): RosterContext {
	const lg = league ?? sanitizeLeague(career.data.league, careerWorld(career as Career), career.season);
	const ct = (career.data.club as { infra?: { ct?: { level?: number } } } | undefined)?.infra?.ct?.level ?? 2;
	return {
		seed: career.seed,
		firstSeason: career.data.firstSeason ?? career.season,
		season: career.season,
		market: sanitizeMarket(career.data.market),
		divisionOf: (id) => divisionOf(lg, id),
		// No modo jogador o clube é gerido pela IA (renova contratos e repõe aposentados).
		userClub: career.mode === 'player' ? undefined : career.clubId,
		userDevBoost: Math.round(ctDevelopment(ct) * 100) / 100
	};
}

/** Força (média dos 11 melhores) de cada clube, memorizada durante um processamento. */
export function strengthMemo(ctx: RosterContext): (clubId: string) => number {
	const cache = new Map<string, number>();
	return (id) => {
		let v = cache.get(id);
		if (v === undefined) {
			v = squadStrength(rosterOf(ctx, id));
			cache.set(id, v);
		}
		return v;
	};
}

export function clubStateOf(career: Pick<Career, 'seed' | 'season' | 'clubId' | 'data'>, league?: LeagueState) {
	const lg = league ?? sanitizeLeague(career.data.league, careerWorld(career as Career), career.season);
	return sanitizeClubState(career.data.club, career.seed, career.clubId, divisionOf(lg, career.clubId), career.season);
}
