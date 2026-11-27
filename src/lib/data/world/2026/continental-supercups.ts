import type { TournamentDefinition, TournamentState } from '#lib/domain/tournaments.ts';

const astonVilla = 'world/eng/aston-villa';
const psg = 'world/fra/psg';
const lanus = 'world/arg/lanus';
const uefa: TournamentDefinition = {
	competition: { id: 'continental/uefa-super-cup', kind: 'continental', name: 'Supercopa da UEFA', short: 'UEFA SC', country: null, confederation: 'UEFA', season: 2026, playable: true },
	groups: [[psg, astonVilla]],
	dates: ['2026-08-12'],
	groupRounds: [],
	phases: [{ name: 'Final', legs: 1, neutral: true, time: '21:00', seeds: [[{ group: 0, place: 1 }, { group: 0, place: 2 }]] }]
};
const recopa: TournamentDefinition = {
	competition: { id: 'continental/recopa', kind: 'continental', name: 'Recopa Sul-Americana', short: 'Recopa', country: null, confederation: 'CONMEBOL', season: 2026, playable: true },
	groups: [[lanus, 'flamengo']],
	dates: ['2026-02-19', '2026-02-26'],
	groupRounds: [],
	phases: [{ name: 'Final', legs: 2, extraTime: true, time: '21:30', seeds: [[{ group: 0, place: 1 }, { group: 0, place: 2 }]] }]
};

const entries = [
	{ definition: uefa, activeCountries: ['eng', 'fra'], externalClubs: [astonVilla, psg] },
	{ definition: recopa, activeCountries: ['bra', 'arg'], externalClubs: [lanus] }
];
export const CONTINENTAL_SUPERCUP_NAMES = Object.fromEntries(entries.map(({ definition }) => [definition.competition.id, definition.competition.name]));

export function continentalSupercupClubs(season: number, countries: string[]): string[] {
	return entries.filter(({ definition, activeCountries }) =>
		definition.competition.season === season && activeCountries.some((code) => countries.includes(code))
	).flatMap(({ externalClubs }) => externalClubs);
}

export function initialContinentalSupercups(season: number, countries: string[], clubs: string[]): TournamentState[] {
	const known = new Set(clubs);
	return entries.filter(({ definition, activeCountries }) =>
		definition.competition.season === season && activeCountries.some((code) => countries.includes(code)) &&
		definition.groups.every((group) => group.every((club) => known.has(club)))
	).map(({ definition }) => ({ id: definition.competition.id }));
}

export function continentalSupercupDefinitions(season: number, states: TournamentState[]): TournamentDefinition[] {
	const active = new Set(states.map(({ id }) => id));
	return entries.map(({ definition }) => definition).filter(({ competition }) => competition.season === season && active.has(competition.id));
}
