import opening2026 from './brasil/2026/elencos-abertura-v1.json' with { type: 'json' };
import type { Position } from '#lib/domain/positions.ts';
import type { FormationId } from '#lib/domain/tactics.ts';

export const ROSTER_CATALOG = 'brasil-2026-abertura-v1' as const;
export type RosterCatalogId = typeof ROSTER_CATALOG;

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

interface ClubRoster {
	formation: FormationId;
	coach: string;
	players: CatalogPlayer[];
}

export const OPENING_2026 = opening2026 as typeof opening2026 & { clubs: Record<string, ClubRoster | undefined> };
const versions = { [ROSTER_CATALOG]: OPENING_2026 };

export function catalogClub(version: RosterCatalogId | undefined, clubId: string): ClubRoster | undefined {
	if (!version) return undefined;
	return versions[version]?.clubs[clubId];
}
