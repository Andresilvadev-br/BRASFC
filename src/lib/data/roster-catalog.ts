import opening2026 from './brasil/2026/elencos-abertura-v1.json' with { type: 'json' };
import serieA from './brasil/2026/elencos-abertura-v2-a.json' with { type: 'json' };
import serieB from './brasil/2026/elencos-abertura-v2-b.json' with { type: 'json' };
import serieC from './brasil/2026/elencos-abertura-v2-c.json' with { type: 'json' };
import serieD from './brasil/2026/elencos-abertura-v2-d.json' with { type: 'json' };
import type { Position } from '#lib/domain/positions.ts';
import type { FormationId } from '#lib/domain/tactics.ts';

export const ROSTER_CATALOG = 'brasil-2026-abertura-v3' as const;
export type RosterCatalogId = 'brasil-2026-abertura-v1' | 'brasil-2026-abertura-v2' | typeof ROSTER_CATALOG;

export interface CatalogPlayer {
	playerId: string;
	name: string;
	number: number;
	position: Position;
	/** Posições complementares modeladas no BRASFC, incluindo uso na súmula. */
	secondary?: Position[];
	birthDate?: string;
	nationality?: string;
	profileSource?: string;
	contractUntil?: number;
	matchRole: 'starter' | 'bench' | 'reserve';
}

export interface ClubRoster {
	formation: FormationId;
	coach?: string;
	league: string;
	asOf: string;
	source: string;
	modeledTactics: boolean;
	tacticsSource?: string;
	lineupAdjusted?: boolean;
	players: CatalogPlayer[];
}

const openingV1 = Object.fromEntries(Object.entries(opening2026.clubs).map(([id, roster]) => [id, {
	...roster, league: opening2026.league, asOf: opening2026.asOf, source: opening2026.sources[0], modeledTactics: false
}])) as Record<string, ClubRoster | undefined>;
const openingV2 = { ...serieA, ...serieB, ...serieC, ...serieD } as Record<string, ClubRoster | undefined>;
const versions: Record<RosterCatalogId, Record<string, ClubRoster | undefined>> = {
	'brasil-2026-abertura-v1': openingV1,
	'brasil-2026-abertura-v2': openingV2,
	[ROSTER_CATALOG]: openingV2
};

export function catalogClub(version: RosterCatalogId | undefined, clubId: string): ClubRoster | undefined {
	if (!version) return undefined;
	return versions[version]?.[clubId];
}

/** A súmula sem ficha tática determina a inscrição, mas não a formação da edição atual. */
export function fixedOpeningFormation(version: RosterCatalogId | undefined, roster: ClubRoster): FormationId | undefined {
	return version !== ROSTER_CATALOG || !roster.modeledTactics || roster.tacticsSource ? roster.formation : undefined;
}
