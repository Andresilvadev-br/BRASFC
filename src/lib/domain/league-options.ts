export const LEAGUE_SEASONS = [2026, 2027, 2028, 2029, 2030] as const;

export const DEFAULT_LEAGUE_OPTIONS = {
	season: 2026, calendar: 'sunday', competition: 'league-and-cup', difficulty: 'standard'
} as const;

export type LeagueOptions = {
	season: number;
	calendar: 'sunday' | 'saturday';
	competition: 'league-and-cup' | 'league';
	difficulty: 'accessible' | 'standard' | 'advanced';
};

export function leagueOptions(raw: unknown): LeagueOptions | null {
	if (raw === undefined || raw === null) return { ...DEFAULT_LEAGUE_OPTIONS };
	if (typeof raw !== 'object' || Array.isArray(raw)) return null;
	const { season, calendar, competition, difficulty } = raw as Partial<LeagueOptions>;
	if (!LEAGUE_SEASONS.some((year) => year === season) || (calendar !== 'sunday' && calendar !== 'saturday') ||
		(competition !== 'league-and-cup' && competition !== 'league') ||
		(difficulty !== 'accessible' && difficulty !== 'standard' && difficulty !== 'advanced')) return null;
	return { season: season!, calendar, competition, difficulty };
}
