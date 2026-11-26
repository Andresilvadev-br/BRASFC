import type { MatchSummary } from '#lib/domain/matchday.ts';
import type { MatchRow } from '#lib/domain/playerstats.ts';
import type { MatchResult } from '#lib/domain/season.ts';
import type { AppliedDecision } from '#lib/engine/types.ts';
import type { Db } from '../db/index.ts';

export interface StoredResult extends MatchResult {
	season: number;
	round: number;
	competition: string;
	isUser: boolean;
}

export interface UserMatch extends StoredResult {
	summary: MatchSummary;
}

type Row = {
	season: number;
	round: number;
	competition: string;
	home: string;
	away: string;
	home_goals: number;
	away_goals: number;
	is_user: boolean;
	summary?: unknown;
};

const map = (r: Row): StoredResult => ({
	season: Number(r.season),
	round: Number(r.round),
	competition: r.competition,
	home: r.home,
	away: r.away,
	homeGoals: Number(r.home_goals),
	awayGoals: Number(r.away_goals),
	isUser: !!r.is_user
});

const COLS = 'season, round, competition, home, away, home_goals, away_goals, is_user';

/** Resultados de uma temporada (todas as competições). */
export async function listResults(db: Db, careerId: string, season: number): Promise<StoredResult[]> {
	const rows = await db.query<Row>(`SELECT ${COLS} FROM career_matches WHERE career_id = $1 AND season = $2 ORDER BY round, home`, [careerId, season]);
	return rows.map(map);
}

/**
 * 0.13: numa carreira com vários treinadores há várias partidas "do usuário" por rodada; `club` filtra
 * as do clube do treinador da vez e a súmula é lida do lado dele (no confronto entre humanos a súmula
 * gravada é a do mandante).
 */
function ofClub(club: string | null | undefined) {
	return (m: UserMatch): UserMatch => (club && m.summary && (m.home === club || m.away === club) ? { ...m, summary: { ...m.summary, mySide: m.home === club ? 'home' : 'away' } } : m);
}
const parseSummary = (r: Row) => (typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary) as MatchSummary;

/** Partidas do usuário (com resumo), de todas as temporadas ou de uma. */
export async function listUserMatches(db: Db, careerId: string, season?: number, club: string | null = null): Promise<UserMatch[]> {
	const rows = await db.query<Row>(
		`SELECT ${COLS}, summary FROM career_matches WHERE career_id = $1 AND is_user AND ($2::int IS NULL OR season = $2) AND ($3::text IS NULL OR home = $3 OR away = $3) ORDER BY season, played_at, round`,
		[careerId, season ?? null, club]
	);
	return rows.map((r) => ofClub(club)({ ...map(r), summary: parseSummary(r) }));
}

/** Histórico estatístico sem transportar táticas, eventos e súmulas inteiras do banco. */
export async function listStatMatches(db: Db, careerId: string, playerId?: string, club: string | null = null): Promise<MatchRow[]> {
	const rows = await db.query<Row>(
		`SELECT ${COLS}, jsonb_build_object(
			'players', CASE WHEN $2::text IS NULL THEN COALESCE(summary->'players', '{}'::jsonb)
				WHEN summary->'players'->($2::text) IS NULL THEN '{}'::jsonb
				ELSE jsonb_build_object($2::text, summary->'players'->($2::text)) END,
			'starters', summary->'starters', 'mySide', summary->'mySide') AS summary
		FROM career_matches WHERE career_id = $1 AND is_user AND ($3::text IS NULL OR home = $3 OR away = $3) ORDER BY season, played_at, round`,
		[careerId, playerId ?? null, club]
	);
	return rows.map((r) => {
		const summary = (typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary) as MatchRow['summary'];
		const m = map(r);
		return { ...m, summary: club && summary ? { ...summary, mySide: m.home === club ? 'home' : 'away' } : summary } as MatchRow;
	});
}

/** Últimas súmulas, em ordem cronológica, sem carregar a carreira inteira. */
export async function recentUserMatches(db: Db, careerId: string, limit: number, club: string | null = null): Promise<UserMatch[]> {
	const rows = await db.query<Row>(
		`SELECT ${COLS}, summary FROM career_matches WHERE career_id = $1 AND is_user AND ($3::text IS NULL OR home = $3 OR away = $3) ORDER BY played_at DESC, season DESC, round DESC LIMIT $2`,
		[careerId, limit, club]
	);
	return rows.reverse().map((r) => ofClub(club)({ ...map(r), summary: parseSummary(r) }));
}

export interface RoundInsert {
	season: number;
	round: number;
	competition: string;
	home: string;
	away: string;
	homeGoals: number;
	awayGoals: number;
	seed: number;
	isUser: boolean;
	decisions?: AppliedDecision[];
	summary?: MatchSummary;
}

/**
 * Grava um passo inteiro em lotes (uma instrução por até 100 partidas); falha sem gravar nada
 * (dentro da transação) se alguma partida já existir — a chave impede rodadas duplicadas.
 */
export async function insertRound(tx: Db, careerId: string, rows: RoundInsert[], engineVersion: string): Promise<void> {
	const COLS = 13;
	for (let i = 0; i < rows.length; i += 100) {
		const chunk = rows.slice(i, i + 100);
		const params: unknown[] = [];
		const values = chunk.map((r, k) => {
			params.push(careerId, r.season, r.round, r.competition, r.home, r.away, r.homeGoals, r.awayGoals, r.seed, r.isUser, r.decisions ? JSON.stringify(r.decisions) : null, r.summary ? JSON.stringify(r.summary) : null, engineVersion);
			const p = (n: number) => '$' + (k * COLS + n);
			return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)}, ${p(10)}, ${p(11)}::jsonb, ${p(12)}::jsonb, ${p(13)})`;
		});
		await tx.query(
			`INSERT INTO career_matches (career_id, season, round, competition, home, away, home_goals, away_goals, seed, is_user, decisions, summary, engine_version) VALUES ${values.join(', ')}`,
			params
		);
	}
}

/** Gols com autor de todas as partidas com súmula da temporada (usuário + motor completo). */
export async function listSeasonGoals(db: Db, careerId: string, season: number): Promise<Array<{ competition: string; home: string; away: string; goals: Array<{ side: 'home' | 'away'; player: string }> }>> {
	const rows = await db.query<{ competition: string; home: string; away: string; summary: { goals?: Array<{ side: 'home' | 'away'; player: string }> } | string | null }>(
		`SELECT competition, home, away, summary FROM career_matches WHERE career_id = $1 AND season = $2 AND summary IS NOT NULL`,
		[careerId, season]
	);
	return rows.map((r) => {
		const s = typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary;
		return { competition: r.competition, home: r.home, away: r.away, goals: (s?.goals ?? []).map((g: { side: 'home' | 'away'; player: string }) => ({ side: g.side, player: g.player })) };
	});
}
