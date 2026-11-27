import type { TournamentDefinition, TournamentState } from '#lib/domain/tournaments.ts';

const seed = (place: number) => ({ group: 0, place });
const winner = (phase: number) => ({ phase, tie: 0 });

function oneMatch(
	country: string, slug: string, name: string, short: string, date: string, clubs: [string, string],
	options: { neutral?: boolean; extraTime?: boolean } = {}
): TournamentDefinition {
	return {
		competition: { id: `cup/${country}/${slug}`, name, short, kind: 'super-cup', country, confederation: 'UEFA', season: 2026, playable: true },
		groups: [clubs.map((id) => `world/${country}/${id}`)],
		dates: [date],
		groupRounds: [],
		phases: [{ name: 'Final', legs: 1, seeds: [[seed(1), seed(2)]], ...options }]
	};
}

const cups: TournamentDefinition[] = [
	oneMatch('eng', 'community-shield', 'FA Community Shield', 'Community Shield', '2026-08-16', ['arsenal', 'manchester-city'], { neutral: true }),
	oneMatch('fra', 'trophee-des-champions', 'Trophée des Champions', 'Trophée', '2026-08-16', ['lens', 'psg']),
	oneMatch('ger', 'supercup', 'Franz Beckenbauer Supercup', 'Supercup', '2026-08-22', ['borussia-dortmund', 'fc-bayern-munchen']),
	oneMatch('ita', 'supercoppa', 'Supercoppa Italiana', 'Supercoppa', '2026-12-22', ['inter', 'lazio'], { extraTime: true }),
	{
		competition: { id: 'cup/esp/supercopa', name: 'Supercopa de España', short: 'Supercopa', kind: 'super-cup', country: 'esp', confederation: 'UEFA', season: 2026, playable: true },
		dates: ['2027-02-02', '2027-02-03', '2027-02-06'],
		groups: [['fc-barcelona', 'atletico-madrid', 'real-sociedad', 'real-madrid'].map((id) => `world/esp/${id}`)],
		groupRounds: [],
		phases: [
			{ name: 'Semifinal', legs: 1, neutral: true, seeds: [[seed(1), seed(2)]] },
			{ name: 'Semifinal', legs: 1, neutral: true, seeds: [[seed(3), seed(4)]] },
			{ name: 'Final', legs: 1, neutral: true, seeds: [[winner(0), winner(1)]] }
		]
	}
];

export const WORLD_SUPERCUP_NAMES = Object.fromEntries(cups.map(({ competition }) => [competition.id, competition.name]));

export function initialWorldSupercups(season: number, countries: string[], clubs: string[]): TournamentState[] {
	const eligible = new Set(clubs);
	return cups.filter(({ competition, groups }) =>
		competition.season === season && countries.includes(competition.country!) && groups.every((group) => group.every((id) => eligible.has(id)))
	).map(({ competition }) => ({ id: competition.id }));
}

export function worldSupercupDefinitions(season: number, states: TournamentState[]): TournamentDefinition[] {
	const active = new Set(states.map(({ id }) => id));
	return cups.filter(({ competition }) => competition.season === season && active.has(competition.id));
}
