import { getClub } from '#lib/domain/clubs.ts';
import { generateLeagueFixtures } from '#lib/domain/season.ts';
import type { Tie } from '#lib/domain/league.ts';
import type { TournamentDefinition, TournamentState, TournamentView } from '#lib/domain/tournaments.ts';

export const NORDESTE_ID = 'cup/bra/nordeste';
export const VERDE_ID = 'cup/bra/verde';
export const SUL_SUDESTE_ID = 'cup/bra/sul-sudeste';
export const SUPERCOPA_ID = 'cup/bra/supercopa';
export const BRAZIL_TOURNAMENT_NAMES: Record<string, string> = {
	[NORDESTE_ID]: 'Copa do Nordeste',
	[VERDE_ID]: 'Copa Verde',
	[SUL_SUDESTE_ID]: 'Copa Sul-Sudeste',
	[SUPERCOPA_ID]: 'Supercopa Rei'
};

const nordeste = [
	['vitoria', 'asa', 'sousa', 'itabaiana', 'fluminense-pi'],
	['juazeirense', 'crb', 'botafogo-pb', 'confianca', 'piaui'],
	['ceara', 'sport', 'america-de-natal', 'imperatriz', 'ferroviario'],
	['fortaleza', 'retro', 'abc', 'maranhao', 'jacuipense']
];

const verde = [
	['gas', 'guapore', 'independencia', 'nacional-am', 'paysandu', 'trem'],
	['aguia-de-maraba', 'amazonas', 'galvez', 'monte-roraima', 'gazin-porto-velho', 'remo'],
	['araguaina', 'capital-df', 'operario-ms', 'primavera-mt', 'rio-branco-es', 'vila-nova'],
	['anapolis', 'atletico-go', 'cuiaba', 'gama', 'porto-vitoria', 'tocantinopolis']
];

// Clubes de cada estado ocupam o mesmo índice nos dois grupos.
const sulSudeste = [
	['sampaio-correa-rj', 'novorizontino', 'caxias', 'tombense', 'cianorte', 'chapecoense'],
	['volta-redonda', 'sao-bernardo', 'juventude', 'america-mg', 'operario-pr', 'avai']
];
const sulSudesteRounds = Array.from({ length: 6 }, (_, round) => sulSudeste[0].map((home, i): Tie => {
	const away = sulSudeste[1][(i + round) % 6];
	return round % 2 === 0 ? [home, away] : [away, home];
}));

const dates = ['03-25', '03-28', '04-08', '04-15', '04-29', '05-06', '05-20', '05-27', '06-03', '06-07'].map((day) => '2026-' + day);
const group = (group: number, place: number) => ({ group, place });
const winner = (phase: number, tie: number) => ({ phase, tie });

/** CBF, edição 2026. Os mandos da primeira fase usam a mesma proporção da tabela básica. */
const cross = [[2, 4, 3, 1, 0], [1, 2, 4, 0, 3], [0, 1, 2, 3, 4], [4, 3, 0, 2, 1], [3, 0, 1, 4, 2]];
const nordesteRounds = cross.map((opponents, r) => [0, 2].flatMap((g) => opponents.map((opponent, i): Tie => {
	const a = nordeste[g][i];
	const b = nordeste[g + 1][opponent];
	return [1, 4].includes(r) ? [b, a] : [a, b];
})));

const intraGroup = verde.map((clubs, i) => generateLeagueFixtures(100 + i, clubs, 3).filter((f) => f.round <= 5));
const verdeRounds = Array.from({ length: 5 }, (_, i) => intraGroup.flatMap((fixtures) =>
	fixtures.filter((f) => f.round === i + 1).map((f): Tie => [f.home, f.away])));

const tournament = (id: string, name: string, short: string, groups: string[][], groupRounds: Tie[][], quarters: TournamentDefinition['phases'][number]['seeds'], semis: TournamentDefinition['phases'][number]['seeds']): TournamentDefinition => ({
	competition: { id, name, short, kind: 'regional-cup', country: 'bra', confederation: 'CONMEBOL', season: 2026, playable: true },
	dates, groups, groupRounds,
	phases: [
		{ name: 'Quartas de final', legs: 1, seeds: quarters },
		{ name: id === VERDE_ID ? 'Finais da Copa Norte e Copa Centro-Oeste' : 'Semifinais', legs: 2, seeds: semis },
		{ name: 'Final', legs: 2, seeds: [[winner(1, 0), winner(1, 1)]] }
	]
});

const definitions: TournamentDefinition[] = [
	tournament(NORDESTE_ID, BRAZIL_TOURNAMENT_NAMES[NORDESTE_ID], 'Nordestão', nordeste, nordesteRounds,
		[[group(0, 1), group(2, 2)], [group(1, 1), group(3, 2)], [group(2, 1), group(0, 2)], [group(3, 1), group(1, 2)]],
		[[winner(0, 0), winner(0, 3)], [winner(0, 1), winner(0, 2)]]),
	tournament(VERDE_ID, BRAZIL_TOURNAMENT_NAMES[VERDE_ID], 'Copa Verde', verde, verdeRounds,
		[[group(0, 1), group(1, 2)], [group(1, 1), group(0, 2)], [group(2, 1), group(3, 2)], [group(3, 1), group(2, 2)]],
		[[winner(0, 0), winner(0, 1)], [winner(0, 2), winner(0, 3)]]),
	{
		competition: { id: SUL_SUDESTE_ID, name: BRAZIL_TOURNAMENT_NAMES[SUL_SUDESTE_ID], short: 'Sul-Sudeste', kind: 'regional-cup', country: 'bra', confederation: 'CONMEBOL', season: 2026, playable: true },
		dates, groups: sulSudeste, groupRounds: sulSudesteRounds,
		phases: [
			{ name: 'Semifinais', legs: 2, seeds: [[group(0, 1), group(1, 2)], [group(1, 1), group(0, 2)]] },
			{ name: 'Final', legs: 2, seeds: [[winner(0, 0), winner(0, 1)]] }
		]
	}
];

export function initialBrazilTournaments(season: number): TournamentState[] {
	if (season !== 2026) return [];
	return [...definitions.map((d) => ({ id: d.competition.id })), { id: SUPERCOPA_ID, entrants: ['flamengo', 'corinthians'] }];
}

export function nextBrazilTournaments(leagueChampion: string | undefined, leagueRunnerUp: string | undefined, cupChampion: string | undefined): TournamentState[] {
	if (!leagueChampion || !cupChampion) return [];
	const rival = leagueChampion === cupChampion ? leagueRunnerUp : cupChampion;
	return rival ? [{ id: SUPERCOPA_ID, entrants: [leagueChampion, rival] }] : [];
}

export function tournamentDefinitions(season: number, states: TournamentState[]): TournamentDefinition[] {
	const ids = new Set(states.map((state) => state.id));
	const active = definitions.filter((d) => d.competition.season === season && ids.has(d.competition.id));
	const supercopa = states.find(({ id }) => id === SUPERCOPA_ID);
	const pair = supercopa?.entrants;
	if (Array.isArray(pair) && pair.length === 2 && pair[0] !== pair[1] && pair.every((id) => getClub(id))) {
		active.push({
			competition: { id: SUPERCOPA_ID, name: BRAZIL_TOURNAMENT_NAMES[SUPERCOPA_ID], short: 'Supercopa', kind: 'super-cup', country: 'bra', confederation: 'CONMEBOL', season, playable: true },
			dates: [season === 2026 ? '2026-02-01' : `${season}-01-24`],
			groups: [pair], groupRounds: [],
			phases: [{ name: 'Final', legs: 1, neutral: true, seeds: [[group(0, 1), group(0, 2)]] }]
		});
	}
	return active;
}

/** Quatro classificações próprias: a Copa Verde concede vagas pelos dois blocos regionais. */
export function regionalCupRankings(tournaments: TournamentView[]): string[][] | undefined {
	const byId = new Map(tournaments.map((t) => [t.competition.id, t]));
	const nordeste = byId.get(NORDESTE_ID);
	const verdeCup = byId.get(VERDE_ID);
	const sulSudeste = byId.get(SUL_SUDESTE_ID);
	if (!nordeste?.champion || !verdeCup?.champion || !sulSudeste?.champion) return undefined;
	return [
		nordeste.ranking,
		...([0, 1].map((i) => {
			const final = verdeCup.phases[1].outcomes[i]!;
			const clubs = new Set(verde.slice(i * 2, i * 2 + 2).flat());
			return [final.winner, final.loser, ...verdeCup.ranking.filter((id) => clubs.has(id) && id !== final.winner && id !== final.loser)];
		})),
		sulSudeste.ranking
	];
}
