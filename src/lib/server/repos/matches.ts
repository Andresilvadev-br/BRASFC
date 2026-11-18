import type { MatchResult } from '#lib/domain/season.ts';
import type { MatchSummary } from '#lib/domain/matchday.ts';
import type { AppliedDecision } from '#lib/engine/types.ts';
import type { Db } from '../db/index.ts';

export interface StoredResult extends MatchResult {
	round: number;
	isUser: boolean;
}

export interface UserMatch extends StoredResult {
	summary: MatchSummary;
}

type Row = { round: number; home: string; away: string; home_goals: number; away_goals: number; is_user: boolean; summary?: unknown };

const map = (r: Row): StoredResult => ({
	round: Number(r.round),
	home: r.home,
	away: r.away,
	homeGoals: Number(r.home_goals),
	awayGoals: Number(r.away_goals),
	isUser: !!r.is_user
});

export async function listResults(db: Db, careerId: string): Promise<StoredResult[]> {
	const rows = await db.query<Row>(
		'SELECT round, home, away, home_goals, away_goals, is_user FROM career_matches WHERE career_id = $1 ORDER BY round, home',
		[careerId]
	);
	return rows.map(map);
}

export async function listUserMatches(db: Db, careerId: string): Promise<UserMatch[]> {
	const rows = await db.query<Row>(
		'SELECT round, home, away, home_goals, away_goals, is_user, summary FROM career_matches WHERE career_id = $1 AND is_user ORDER BY round',
		[careerId]
	);
	return rows.map((r) => ({ ...map(r), summary: (typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary) as MatchSummary }));
}

export interface RoundInsert {
	round: number;
	home: string;
	away: string;
	homeGoals: number;
	awayGoals: number;
	seed: number;
	isUser: boolean;
	decisions?: AppliedDecision[];
	summary?: MatchSummary;
}

/** Grava uma rodada inteira; falha (sem gravar nada) se a rodada já existir. */
export async function insertRound(tx: Db, careerId: string, rows: RoundInsert[], engineVersion: string): Promise<void> {
	for (const r of rows) {
		await tx.query(
			`INSERT INTO career_matches (career_id, round, home, away, home_goals, away_goals, seed, is_user, decisions, summary, engine_version)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)`,
			[careerId, r.round, r.home, r.away, r.homeGoals, r.awayGoals, r.seed, r.isUser, r.decisions ? JSON.stringify(r.decisions) : null, r.summary ? JSON.stringify(r.summary) : null, engineVersion]
		);
	}
}
