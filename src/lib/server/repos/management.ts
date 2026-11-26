import { randomUUID } from 'node:crypto';
import type { LedgerLine } from '#lib/domain/management.ts';
import type { Db } from '../db/index.ts';

/**
 * Históricos da gestão (somente acréscimo). Cada linha tem uma chave de idempotência por carreira:
 * repetir a mesma operação (rede instável, clique duplo) não duplica receitas, despesas ou transferências.
 */

export interface TransferRow {
	playerId: string;
	playerName: string;
	from: string | null;
	to: string | null;
	kind: string;
	fee: number;
	wage: number;
}

/** `coach`: dono do lançamento numa carreira com vários treinadores (a chave também leva o id). */
export async function insertLedger(tx: Db, careerId: string, season: number, gameDate: string, lines: LedgerLine[], keyPrefix: string, coach: string | null = null): Promise<void> {
	for (const [i, l] of lines.entries()) {
		await tx.query(
			`INSERT INTO career_ledger (career_id, season, game_date, category, amount, description, op_key, coach)
			 VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8) ON CONFLICT (career_id, op_key) DO NOTHING`,
			[careerId, season, gameDate, l.category, Math.round(l.amount), l.description.slice(0, 200), `${coach ? `${coach}:` : ''}${keyPrefix}:${i}`, coach]
		);
	}
}

export async function insertTransfers(tx: Db, careerId: string, season: number, gameDate: string, rows: TransferRow[], keyPrefix: string): Promise<void> {
	for (const [i, t] of rows.entries()) {
		await tx.query(
			`INSERT INTO career_transfers (career_id, season, game_date, player_id, player_name, from_club, to_club, kind, fee, wage, op_key)
			 VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (career_id, op_key) DO NOTHING`,
			[careerId, season, gameDate, t.playerId, t.playerName.slice(0, 80), t.from, t.to, t.kind, Math.max(0, Math.round(t.fee)), Math.max(0, Math.round(t.wage)), `${keyPrefix}:${i}`]
		);
	}
}

export async function insertMessages(tx: Db, careerId: string, gameDate: string, msgs: Array<{ subject: string; body: string; important?: boolean; sender?: string }>, coach: string | null = null): Promise<void> {
	if (!msgs.length) return;
	const [{ seq }] = await tx.query<{ seq: number | null }>('SELECT max(seq) AS seq FROM career_messages WHERE career_id = $1', [careerId]);
	let n = Number(seq ?? 0) + 1;
	for (const m of msgs) {
		await tx.query(
			`INSERT INTO career_messages (id, career_id, kind, sender, subject, body, game_date, seq, coach) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9)`,
			[randomUUID(), careerId, m.important ? 'important' : 'normal', (m.sender ?? 'Diretoria').slice(0, 60), m.subject.slice(0, 120), m.body.slice(0, 1000), gameDate, n++, coach]
		);
	}
}

export async function upsertHistory(tx: Db, careerId: string, season: number, kind: string, competition: string, data: unknown): Promise<void> {
	await tx.query(
		`INSERT INTO career_history (career_id, season, kind, competition, data) VALUES ($1, $2, $3, $4, $5::jsonb)
		 ON CONFLICT (career_id, season, kind, competition) DO UPDATE SET data = EXCLUDED.data`,
		[careerId, season, kind, competition, JSON.stringify(data)]
	);
}

export interface LedgerEntry {
	season: number;
	gameDate: string;
	category: string;
	amount: number;
	description: string;
}

/** `coach`: só os lançamentos desse treinador (carreira com vários treinadores). */
export async function listLedger(db: Db, careerId: string, season?: number, coach: string | null = null): Promise<LedgerEntry[]> {
	const rows = await db.query<{ season: number; game_date: string; category: string; amount: string | number; description: string }>(
		`SELECT season, game_date::text AS game_date, category, amount, description FROM career_ledger
		 WHERE career_id = $1 AND ($2::int IS NULL OR season = $2) AND ($3::text IS NULL OR coach = $3) ORDER BY game_date, id`,
		[careerId, season ?? null, coach]
	);
	return rows.map((r) => ({ season: r.season, gameDate: r.game_date, category: r.category, amount: Number(r.amount), description: r.description }));
}

export interface TransferEntry extends TransferRow {
	season: number;
	gameDate: string;
}

export async function listTransfers(db: Db, careerId: string, limit = 200, playerId?: string): Promise<TransferEntry[]> {
	const rows = await db.query<{ season: number; game_date: string; player_id: string; player_name: string; from_club: string | null; to_club: string | null; kind: string; fee: string | number; wage: string | number }>(
		`SELECT season, game_date::text AS game_date, player_id, player_name, from_club, to_club, kind, fee, wage FROM career_transfers
		 WHERE career_id = $1 AND ($3::text IS NULL OR player_id = $3) ORDER BY id DESC LIMIT $2`,
		[careerId, limit, playerId ?? null]
	);
	return rows.map((r) => ({ season: r.season, gameDate: r.game_date, playerId: r.player_id, playerName: r.player_name, from: r.from_club, to: r.to_club, kind: r.kind, fee: Number(r.fee), wage: Number(r.wage) }));
}

export interface HistoryEntry {
	season: number;
	kind: string;
	competition: string;
	data: Record<string, unknown>;
}

/** `coach`: numa carreira com vários treinadores, as temporadas pessoais ("divisão@treinador") são só as dele. */
export async function listHistory(db: Db, careerId: string, coach: string | null = null): Promise<HistoryEntry[]> {
	const rows = await db.query<{ season: number; kind: string; competition: string; data: Record<string, unknown> }>(
		'SELECT season, kind, competition, data FROM career_history WHERE career_id = $1 ORDER BY season DESC, kind, competition',
		[careerId]
	);
	return rows.flatMap((r) => {
		const at = r.competition.indexOf('@');
		if (at >= 0 && r.competition.slice(at + 1) !== coach) return [];
		return [{ season: r.season, kind: r.kind, competition: at >= 0 ? r.competition.slice(0, at) : r.competition, data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data }];
	});
}

/** Troca de clube (demissão + nova proposta aceita), com versão otimista. */
export async function changeCareerClub(tx: Db, profileId: string, id: string, clubId: string, data: Record<string, unknown>, expectedVersion: number): Promise<boolean> {
	const rows = await tx.query(
		`UPDATE careers SET club_id = $3, data = data || $4::jsonb, version = version + 1, updated_at = now()
		 WHERE id = $1 AND profile_id = $2 AND version = $5 RETURNING id`,
		[id, profileId, clubId, JSON.stringify(data), expectedVersion]
	);
	return rows.length > 0;
}
