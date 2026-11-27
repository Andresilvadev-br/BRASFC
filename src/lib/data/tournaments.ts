import { tournamentDefinitions as brazilTournamentDefinitions } from './brasil/2026/tournaments.ts';
import { worldSupercupDefinitions } from './world/2026/supercups.ts';
import { continentalSupercupDefinitions } from './world/2026/continental-supercups.ts';
import type { TournamentState } from '#lib/domain/tournaments.ts';

export function tournamentDefinitions(season: number, states: TournamentState[]) {
	return [...brazilTournamentDefinitions(season, states), ...worldSupercupDefinitions(season, states), ...continentalSupercupDefinitions(season, states)];
}
