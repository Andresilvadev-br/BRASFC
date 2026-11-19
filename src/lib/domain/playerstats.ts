import type { PlayerStats } from '#lib/engine/types.ts';
import type { MatchSummary } from './matchday.ts';

/**
 * Estatísticas acumuladas (Dev 0.3) — derivadas apenas dos resumos gravados de cada
 * partida (que por sua vez vêm dos eventos do motor). Nada é somado "por fora".
 */
export interface Totals {
	games: number;
	starts: number;
	minutes: number;
	goals: number;
	assists: number;
	shots: number;
	shotsOnTarget: number;
	passes: number;
	passesCompleted: number;
	keyPasses: number;
	dribbles: number;
	tackles: number;
	interceptions: number;
	yellow: number;
	red: number;
	ratingSum: number;
	/** média das notas (0 sem jogos) */
	rating: number;
}

export function emptyTotals(): Totals {
	return { games: 0, starts: 0, minutes: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, passes: 0, passesCompleted: 0, keyPasses: 0, dribbles: 0, tackles: 0, interceptions: 0, yellow: 0, red: 0, ratingSum: 0, rating: 0 };
}

export function addMatch(t: Totals, s: PlayerStats, started: boolean): Totals {
	const n = { ...t };
	n.games++;
	if (started) n.starts++;
	n.minutes += s.minutes;
	n.goals += s.goals;
	n.assists += s.assists;
	n.shots += s.shots;
	n.shotsOnTarget += s.shotsOnTarget;
	n.passes += s.passes;
	n.passesCompleted += s.passesCompleted;
	n.keyPasses += s.keyPasses;
	n.dribbles += s.dribbles;
	n.tackles += s.tackles;
	n.interceptions += s.interceptions;
	n.yellow += s.yellow;
	n.red += s.red;
	n.ratingSum += s.rating;
	n.rating = Math.round((n.ratingSum / n.games) * 100) / 100;
	return n;
}

export interface MatchRow {
	season: number;
	round: number;
	home: string;
	away: string;
	homeGoals: number;
	awayGoals: number;
	summary: MatchSummary;
}

/** Totais por atleta numa lista de partidas. */
export function playerTotals(matches: MatchRow[]): Record<string, Totals> {
	const out: Record<string, Totals> = {};
	for (const m of matches) {
		const starters = new Set(m.summary.starters ?? []);
		for (const [id, s] of Object.entries(m.summary.players)) {
			if (s.minutes <= 0) continue;
			out[id] = addMatch(out[id] ?? emptyTotals(), s, starters.has(id));
		}
	}
	return out;
}

/** Totais de um atleta por temporada + histórico jogo a jogo. */
export function playerHistory(matches: MatchRow[], playerId: string) {
	const seasons = new Map<number, Totals>();
	const games: Array<{ season: number; round: number; home: string; away: string; score: string; stats: PlayerStats; started: boolean }> = [];
	for (const m of matches) {
		const s = m.summary.players[playerId];
		if (!s || s.minutes <= 0) continue;
		const started = (m.summary.starters ?? []).includes(playerId);
		seasons.set(m.season, addMatch(seasons.get(m.season) ?? emptyTotals(), s, started));
		games.push({ season: m.season, round: m.round, home: m.home, away: m.away, score: `${m.homeGoals}×${m.awayGoals}`, stats: s, started });
	}
	const all = games.reduce((t, g) => addMatch(t, g.stats, g.started), emptyTotals());
	return { all, seasons: [...seasons.entries()].sort((a, b) => b[0] - a[0]).map(([season, totals]) => ({ season, totals })), games: games.reverse() };
}
