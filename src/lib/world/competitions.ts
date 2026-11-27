import { activeDivisions, divisionLabel, type LeagueState } from '#lib/domain/league.ts';
import type { CompetitionId, WorldCompetition } from './contract.ts';
import { countryConfederation } from './countries.ts';

/**
 * PROVISÓRIO (interface): competições da carreira para a navegação. Hoje cobre o Brasil nativo
 * (Séries ativas + Copa do Brasil). A engine fornece `competitionsOf(career)` com as ligas estrangeiras,
 * copas nacionais e continentais no mesmo formato (docs/WORLD-CONTRACT.md).
 */
export function nativeCompetitions(league: LeagueState, hasCup: boolean): WorldCompetition[] {
	const out: WorldCompetition[] = activeDivisions(league).map((id) => {
		// Divisões do World Database trazem o país no regulamento; o Brasil nativo é 'bra'.
		const country = league.world === 'mundo' ? (league.rules?.[id]?.country ?? null) : league.world === 'brasil' ? 'bra' : null;
		const name = divisionLabel(league, id);
		return { id, kind: 'league' as const, name, short: name.replace('Série ', 'S'), season: league.season, country, confederation: country ? countryConfederation(country) : null, playable: true };
	});
	if (hasCup) out.push({ id: 'copa-do-brasil', kind: 'national-cup', name: 'Copa do Brasil', short: 'CdB', country: 'bra', confederation: 'CONMEBOL', season: league.season, playable: true });
	return out;
}

export interface CompetitionGroup {
	key: string;
	/** país (bandeira) ou confederação (continentais) */
	country: string | null;
	label: string;
	items: WorldCompetition[];
}

const KIND_ORDER: Record<WorldCompetition['kind'], number> = { league: 0, 'national-cup': 1, 'regional-cup': 1, state: 2, 'super-cup': 3, continental: 4 };

/** Agrupa por país (ligas, copas, estaduais) e põe as continentais num grupo por confederação, no fim. */
export function groupCompetitions(list: WorldCompetition[], countryName: (code: string) => string): CompetitionGroup[] {
	const groups = new Map<string, CompetitionGroup>();
	for (const comp of list) {
		const key = comp.kind === 'continental' ? `conf:${comp.confederation ?? '—'}` : `country:${comp.country ?? '—'}`;
		const group = groups.get(key) ?? { key, country: comp.kind === 'continental' ? null : comp.country, label: comp.kind === 'continental' ? `Continentais · ${comp.confederation ?? ''}` : comp.country ? countryName(comp.country) : 'Universo fictício', items: [] };
		group.items.push(comp);
		groups.set(key, group);
	}
	for (const g of groups.values()) g.items.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
	return [...groups.values()].sort((a, b) => Number(a.key.startsWith('conf:')) - Number(b.key.startsWith('conf:')));
}

export function isCup(id: CompetitionId) {
	return id === 'copa-do-brasil' || id.startsWith('cup/') || id.startsWith('state/') || id.startsWith('continental/');
}
