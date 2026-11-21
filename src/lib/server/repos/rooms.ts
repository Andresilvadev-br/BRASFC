import { randomInt, randomUUID } from 'node:crypto';
import { leagueOptions, type LeagueOptions } from '#lib/domain/league-options.ts';
import type { Db } from '../db/index.ts';

/** Sem caracteres ambíguos (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const MAX_OPEN_ROOMS_PER_PROFILE = 3;

export interface Room {
	id: string;
	code: string;
	name: string;
	ownerId: string;
	status: 'open' | 'closed';
	maxMembers: number;
	entryMode?: 'mixed' | 'coach' | 'player';
	inviteOnly?: boolean;
	started?: boolean;
	assistantsRequired?: boolean;
	leagueOptions?: LeagueOptions;
	createdAt: string;
}

export interface RoomMember {
	profileId: string;
	displayName: string;
	role: 'owner' | 'member';
	joinedAt: string;
}

type RoomRow = {
	id: string;
	code: string;
	name: string;
	owner_id: string;
	status: Room['status'];
	max_members: number;
	entry_mode?: Room['entryMode'];
	invite_only?: boolean;
	started?: boolean;
	assistants_required?: boolean;
	league_options?: LeagueOptions | string | null;
	created_at: Date | string;
};

const mapRoom = (r: RoomRow): Room => ({
	id: r.id,
	code: r.code,
	name: r.name,
	ownerId: r.owner_id,
	status: r.status,
	maxMembers: Number(r.max_members),
	entryMode: r.entry_mode, inviteOnly: r.invite_only, started: r.started, assistantsRequired: r.assistants_required,
	leagueOptions: leagueOptions(typeof r.league_options === 'string' ? JSON.parse(r.league_options) : r.league_options) ?? undefined,
	createdAt: new Date(r.created_at).toISOString()
});

export class RoomError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

export function generateCode(): string {
	let code = '';
	for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
	return code;
}

export function normalizeCode(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const code = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (code.length !== CODE_LENGTH) return null;
	for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
	return code;
}

export function normalizeRoomName(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const name = value.normalize('NFC').replace(/\s+/g, ' ').trim();
	if (name.length < 2 || name.length > 40) return null;
	if (/[<>]/.test(name)) return null;
	return name;
}

export async function createRoom(db: Db, ownerId: string, name: string, options?: { mode: 'coach' | 'player'; max: number; inviteOnly: boolean; assistantsRequired: boolean; leagueOptions?: LeagueOptions }): Promise<Room> {
	return db.transaction(async (tx) => {
		await tx.query('SELECT id FROM profiles WHERE id=$1 FOR UPDATE', [ownerId]);
		const [{ count }] = await tx.query<{ count: number | string }>(
			`SELECT count(*)::int AS count FROM rooms WHERE owner_id = $1 AND status = 'open'`,
			[ownerId]
		);
		if (Number(count) >= MAX_OPEN_ROOMS_PER_PROFILE) {
			throw new RoomError(`Você já tem ${MAX_OPEN_ROOMS_PER_PROFILE} salas abertas. Feche uma para criar outra.`, 409);
		}
		for (let attempt = 0; attempt < 6; attempt++) {
			const code = generateCode();
			const rows = await tx.query<RoomRow>(
				`INSERT INTO rooms (id,code,name,owner_id,entry_mode,max_members,invite_only,started,assistants_required,league_options)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(code) DO NOTHING RETURNING *`,
				[randomUUID(), code, name, ownerId, options?.mode ?? 'mixed', options?.max ?? 8,
				 options?.inviteOnly ?? false, !options, options?.assistantsRequired ?? true, options?.leagueOptions ? JSON.stringify(options.leagueOptions) : null]
			);
			if (!rows.length) continue;
			await tx.query(`INSERT INTO room_members (room_id, profile_id, role) VALUES ($1, $2, 'owner')`, [rows[0].id, ownerId]);
			return mapRoom(rows[0]);
		}
		throw new RoomError('Não foi possível gerar um código de sala. Tente novamente.', 503);
	});
}

export async function getRoomByCode(db: Db, code: string): Promise<Room | null> {
	const rows = await db.query<RoomRow>(
		'SELECT * FROM rooms WHERE code = $1',
		[code]
	);
	return rows[0] ? mapRoom(rows[0]) : null;
}

export async function listMembers(db: Db, roomId: string): Promise<RoomMember[]> {
	const rows = await db.query<{ profile_id: string; display_name: string; role: RoomMember['role']; joined_at: Date | string }>(
		`SELECT rm.profile_id, p.display_name, rm.role, rm.joined_at
		 FROM room_members rm JOIN profiles p ON p.id = rm.profile_id
		 WHERE rm.room_id = $1 ORDER BY rm.role DESC, rm.joined_at ASC`,
		[roomId]
	);
	return rows.map((r) => ({
		profileId: r.profile_id,
		displayName: r.display_name,
		role: r.role,
		joinedAt: new Date(r.joined_at).toISOString()
	}));
}

export async function isMember(db: Db, roomId: string, profileId: string): Promise<boolean> {
	const rows = await db.query('SELECT 1 FROM room_members WHERE room_id = $1 AND profile_id = $2', [roomId, profileId]);
	return rows.length > 0;
}

export async function joinRoom(db: Db, code: string, profileId: string, invited = false): Promise<Room> {
	return db.transaction(async (tx) => {
		const rows = await tx.query<RoomRow>(
			`SELECT * FROM rooms WHERE code = $1 FOR UPDATE`,
			[code]
		);
		const room = rows[0] ? mapRoom(rows[0]) : null;
		if (!room) throw new RoomError('Sala não encontrada. Confira o código.', 404);
		if (room.status !== 'open') throw new RoomError('Esta sala foi encerrada.', 410);
		const already = await tx.query('SELECT 1 FROM room_members WHERE room_id = $1 AND profile_id = $2', [room.id, profileId]);
		if (already.length) return room;
		const [world] = await tx.query<{ invite: string | null }>("SELECT state->>'inviteOpen' AS invite FROM room_worlds WHERE room_id=$1", [room.id]);
		if (room.entryMode !== 'mixed' && !(await tx.query('SELECT 1 FROM profiles WHERE id=$1 AND username IS NOT NULL', [profileId])).length) {
			throw new RoomError('Entre na sua conta BRASFC antes de entrar na liga.', 401);
		}
		if (!invited && (room.inviteOnly || world?.invite === 'false')) throw new RoomError('Este universo fechou os convites.', 403);
		const [{ count }] = await tx.query<{ count: number | string }>(
			'SELECT count(*)::int AS count FROM room_members WHERE room_id = $1',
			[room.id]
		);
		if (Number(count) >= room.maxMembers) throw new RoomError('A sala está cheia.', 409);
		await tx.query(`INSERT INTO room_members (room_id, profile_id, role) VALUES ($1, $2, 'member')`, [room.id, profileId]);
		return room;
	});
}

/** Sai da sala. Se o dono sair, a sala é encerrada para todos. */
export async function leaveRoom(db: Db, room: Room, profileId: string): Promise<'left' | 'closed'> {
	return db.transaction(async (tx) => {
		const [locked] = await tx.query<{ owner_id: string }>('SELECT owner_id FROM rooms WHERE id=$1 FOR UPDATE', [room.id]);
		const [world] = await tx.query('SELECT 1 FROM room_worlds WHERE room_id=$1', [room.id]);
		const [live] = await tx.query("SELECT 1 FROM room_live_rounds WHERE room_id=$1 AND state->'required' ? $2", [room.id, profileId]);
		if (live) throw new RoomError('Conclua a rodada em andamento antes de sair do universo.', 409);
		if (locked?.owner_id === profileId) {
			if (world) throw new RoomError('Transfira a administração ou arquive o universo.', 409);
			await closeRoom(tx, room.id);
			return 'closed';
		}
		if (world) await tx.query(`
			UPDATE room_worlds AS w SET revision=w.revision+1, state=w.state || jsonb_build_object(
				'participants', COALESCE((
					SELECT jsonb_object_agg(entry.key,
						CASE WHEN entry.value->>'financeIssuer'=$2 THEN entry.value - 'finance' - 'financeIssuer'
							ELSE entry.value END)
					FROM jsonb_each(w.state->'participants') entry WHERE entry.key<>$2
				), '{}'::jsonb),
				'alumniHistory', COALESCE(w.state->'alumniHistory','{}'::jsonb) || jsonb_build_object(
					$2::text, w.state->'participants'->$2::text->'history'),
				'financeDrafts', COALESCE((
					SELECT jsonb_agg(CASE WHEN (draft.value->>'author'=$2 OR
						w.state->'participants'->(draft.value->>'author')->>'financeIssuer'=$2)
						AND draft.value->>'status'='pending' THEN draft.value || '{"status":"cancelled"}'::jsonb ELSE draft.value END
						ORDER BY draft.ordinality)
					FROM jsonb_array_elements(w.state->'financeDrafts') WITH ORDINALITY AS draft
				), '[]'::jsonb),
				'vacancies', COALESCE(w.state->'vacancies','{}'::jsonb)-$2::text)
			WHERE w.room_id=$1 AND w.state->'participants' ? $2`, [room.id, profileId]);
		await tx.query('DELETE FROM room_members WHERE room_id = $1 AND profile_id = $2', [room.id, profileId]);
		return 'left';
	});
}

/** Exclui apenas a liga indicada. As FKs removem somente os registros que pertencem a ela. */
export async function deleteOnlineLeague(db: Db, roomId: string, profileId: string, confirmation: unknown) {
	return db.transaction(async (tx) => {
		const [room] = await tx.query<{ code: string; owner_id: string }>(
			'SELECT code, owner_id FROM rooms WHERE id=$1 FOR UPDATE', [roomId]);
		if (!room || room.owner_id !== profileId) throw new RoomError('Liga não encontrada.', 404);
		if (confirmation !== room.code) throw new RoomError('Confirme o código da liga para excluí-la.', 400);
		const recipients = await tx.query<{ profile_id: string }>(`
			SELECT profile_id FROM room_members WHERE room_id=$1
			UNION SELECT recipient FROM room_invitations WHERE room_id=$1 AND status='pending'`, [roomId]);
		await tx.query('INSERT INTO room_deletion_audit(room_id,actor) VALUES ($1,$2)', [roomId, profileId]);
		await tx.query('DELETE FROM rooms WHERE id=$1', [roomId]);
		return { code: room.code, recipients: recipients.map((row) => row.profile_id) };
	});
}

export async function closeRoom(db: Db, roomId: string): Promise<void> {
	await db.query(`UPDATE rooms SET status = 'closed', closed_at = now() WHERE id = $1 AND status = 'open'`, [roomId]);
}

export async function listRoomsForProfile(db: Db, profileId: string, includeOwnedArchives = false): Promise<Array<Room & { members: number }>> {
	const rows = await db.query<RoomRow & { members: number | string }>(
		`SELECT r.*,
			(SELECT count(*)::int FROM room_members x WHERE x.room_id = r.id) AS members
		 FROM rooms r JOIN room_members rm ON rm.room_id = r.id
		 WHERE rm.profile_id = $1 AND (r.status = 'open' OR ($2::boolean AND r.owner_id = $1))
		 ORDER BY r.created_at DESC`,
		[profileId, includeOwnedArchives]
	);
	return rows.map((r) => ({ ...mapRoom(r), members: Number(r.members) }));
}
