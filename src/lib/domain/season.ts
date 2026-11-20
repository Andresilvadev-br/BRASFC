import { CLUBS, LEAGUE } from './clubs.ts';
import { addDays } from './dates.ts';
import { createRng, deriveSeed } from './rng.ts';

/** Data inicial de toda carreira nova (pré-temporada). */
export const SEASON_START = '2027-01-11';
/** Primeira rodada da Liga BRASFC (domingo). */
export const FIRST_ROUND = '2027-01-24';

export interface Fixture {
	round: number;
	date: string;
	time: string;
	home: string;
	away: string;
	/** id da competição: 'liga-brasfc' (fictícia) ou 'serie-a' | 'serie-b' | 'serie-c' */
	competition: string;
	/** grupo (1ª fase com grupos ou quadrangular da Série C) */
	group?: number;
	/** fase (ex.: "Quadrangular", "Semifinal", "3ª fase") */
	phase?: string;
}

export interface MatchResult {
	home: string;
	away: string;
	homeGoals: number;
	awayGoals: number;
}

export interface StandingRow {
	clubId: string;
	played: number;
	won: number;
	drawn: number;
	lost: number;
	goalsFor: number;
	goalsAgainst: number;
	goalDiff: number;
	points: number;
	position: number;
}

const KICKOFFS = ['16:00', '18:30', '20:00', '11:00'];

export type ScheduleVersion = 1 | 2 | 3;

/**
 * Turno e returno pelo método do círculo: cada clube enfrenta todos os
 * outros duas vezes, uma em casa e outra fora. Determinístico pela semente.
 */
export function generateLeagueFixtures(seed: number, clubIds: string[] = CLUBS.map((c) => c.id), version: ScheduleVersion = 3): Fixture[] {
	if (clubIds.length % 2 !== 0) throw new Error('Número de clubes deve ser par');
	const rng = createRng(deriveSeed(seed, 'fixtures'));
	const teams = rng.shuffle(clubIds);
	const n = teams.length;
	const half = n - 1;
	const fixtures: Fixture[] = [];
	const rotating = teams.slice(1);

	for (let r = 0; r < half; r++) {
		const round: Array<[string, string]> = [];
		const fixed = teams[0];
		const opponent = rotating[rotating.length - 1];
		round.push(r % 2 === 0 ? [fixed, opponent] : [opponent, fixed]);
		for (let i = 0; i < n / 2 - 1; i++) {
			const a = rotating[i];
			const b = rotating[rotating.length - 2 - i];
			// Os clubes já trocam de lado ao girar. Alternar também pela rodada
			// anulava essa troca e criava blocos inteiros de jogos em casa ou fora.
			const homeOnLeft = i % 2 === (version === 1 ? r % 2 : 0);
			round.push(homeOnLeft ? [a, b] : [b, a]);
		}
		round.forEach(([home, away], idx) => {
			fixtures.push(makeFixture(r + 1, home, away, idx));
		});
		rotating.unshift(rotating.pop()!);
	}
	// Jogar a revanche da primeira rodada no encerramento evita trincas de mandos
	// na virada do turno sem repetir de imediato o último adversário.
	const gamesPerRound = n / 2;
	const returnOrder = version === 3 ? [...fixtures.slice(gamesPerRound), ...fixtures.slice(0, gamesPerRound)] : [...fixtures];
	returnOrder.forEach((f, i) => fixtures.push(makeFixture(half + 1 + Math.floor(i / gamesPerRound), f.away, f.home, i % gamesPerRound)));
	return fixtures;
}

function makeFixture(round: number, home: string, away: string, slot: number): Fixture {
	return {
		round,
		date: addDays(FIRST_ROUND, (round - 1) * 7),
		time: KICKOFFS[slot % KICKOFFS.length],
		home,
		away,
		competition: LEAGUE.id
	};
}

export function clubFixtures(fixtures: Fixture[], clubId: string): Fixture[] {
	return fixtures.filter((f) => f.home === clubId || f.away === clubId).sort((a, b) => a.round - b.round);
}

export function nextFixture(fixtures: Fixture[], clubId: string, gameDate: string): Fixture | null {
	return clubFixtures(fixtures, clubId).find((f) => f.date >= gameDate) ?? null;
}

/** Classificação: pontos, vitórias, saldo, gols pró e, por fim, nome. */
export function computeStandings(clubIds: string[], results: MatchResult[]): StandingRow[] {
	const rows = new Map<string, StandingRow>();
	for (const id of clubIds) {
		rows.set(id, { clubId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0, position: 0 });
	}
	for (const r of results) {
		const h = rows.get(r.home);
		const a = rows.get(r.away);
		if (!h || !a) continue;
		h.played++; a.played++;
		h.goalsFor += r.homeGoals; h.goalsAgainst += r.awayGoals;
		a.goalsFor += r.awayGoals; a.goalsAgainst += r.homeGoals;
		if (r.homeGoals > r.awayGoals) { h.won++; a.lost++; h.points += 3; }
		else if (r.homeGoals < r.awayGoals) { a.won++; h.lost++; a.points += 3; }
		else { h.drawn++; a.drawn++; h.points++; a.points++; }
	}
	const names = new Map(CLUBS.map((c) => [c.id, c.name]));
	const sorted = [...rows.values()]
		.map((r) => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst }))
		.sort(
			(x, y) =>
				y.points - x.points ||
				y.won - x.won ||
				y.goalDiff - x.goalDiff ||
				y.goalsFor - x.goalsFor ||
				(names.get(x.clubId) ?? x.clubId).localeCompare(names.get(y.clubId) ?? y.clubId, 'pt-BR')
		);
	sorted.forEach((r, i) => (r.position = i + 1));
	return sorted;
}
