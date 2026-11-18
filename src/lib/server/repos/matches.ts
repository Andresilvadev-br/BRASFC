import type { MatchSummary } from '#lib/domain/matchday.ts';
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

/** Partidas do usuário (com resumo), de todas as temporadas ou de uma. */
export async function listUserMatches(db: Db, careerId: string, season?: number): Promise<UserMatch[]> {
	const rows = await db.query<Row>(
		`SELECT ${COLS}, summary FROM career_matches WHERE career_id = $1 AND is_user ${season === undefined ? '' : 'AND season = $2'} ORDER BY season, round`,
		season === undefined ? [careerId] : [careerId, season]
	);
	return rows.map((r) => ({ ...map(r), summary: (typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary) as MatchSummary }));
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

/** Grava uma rodada inteira; falha (sem gravar nada, dentro da transação) se ela já existir. */
export async function insertRound(tx: Db, careerId: string, rows: RoundInsert[], engineVersion: string): Promise<void> {
	for (const r of rows) {
		await tx.query(
			`INSERT INTO career_matches (career_id, season, round, competition, home, away, home_goals, away_goals, seed, is_user, decisions, summary, engine_version)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13)`,
			[careerId, r.season, r.round, r.competition, r.home, r.away, r.homeGoals, r.awayGoals, r.seed, r.isUser, r.decisions ? JSON.stringify(r.decisions) : null, r.summary ? JSON.stringify(r.summary) : null, engineVersion]
		);
	}
}
