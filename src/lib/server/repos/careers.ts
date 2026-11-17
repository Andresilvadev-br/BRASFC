import { randomUUID, randomInt } from 'node:crypto';
import {
	CAREER_START,
	initialCareerData,
	welcomeMessages,
	type Career,
	type CareerData,
	type CreateCareerInput
} from '#lib/domain/career.ts';
import type { Db } from '../db/index.ts';

type CareerRow = {
	id: string;
	mode: Career['mode'];
	person_name: string;
	club_id: string;
	seed: string | number | bigint;
	season: number;
	game_date: string;
	data: CareerData | string;
	version: number;
	created_at: Date | string;
	updated_at: Date | string;
	unread?: string | number | bigint | null;
};

const COLUMNS = `c.id, c.mode, c.person_name, c.club_id, c.seed, c.season, c.game_date::text AS game_date,
	c.data, c.version, c.created_at, c.updated_at`;

function mapCareer(r: CareerRow): Career {
	return {
		id: r.id,
		mode: r.mode,
		personName: r.person_name,
		clubId: r.club_id,
		seed: Number(r.seed),
		season: Number(r.season),
		gameDate: r.game_date,
		data: typeof r.data === 'string' ? (JSON.parse(r.data) as CareerData) : r.data,
		version: Number(r.version),
		createdAt: new Date(r.created_at).toISOString(),
		updatedAt: new Date(r.updated_at).toISOString(),
		unreadMessages: r.unread == null ? undefined : Number(r.unread)
	};
}

export const MAX_CAREERS_PER_PROFILE = 12;

export class CareerLimitError extends Error {}
export class VersionConflictError extends Error {}

export async function createCareer(db: Db, profileId: string, input: CreateCareerInput): Promise<Career> {
	const id = randomUUID();
	const seed = randomInt(1, 2 ** 31 - 1);
	const data = initialCareerData(input, seed);
	return db.transaction(async (tx) => {
		const [{ count }] = await tx.query<{ count: string | number }>(
			'SELECT count(*)::int AS count FROM careers WHERE profile_id = $1',
			[profileId]
		);
		if (Number(count) >= MAX_CAREERS_PER_PROFILE) {
			throw new CareerLimitError(`Limite de ${MAX_CAREERS_PER_PROFILE} carreiras por perfil.`);
		}
		const rows = await tx.query<CareerRow>(
			`INSERT INTO careers (id, profile_id, mode, person_name, club_id, seed, season, game_date, data)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::jsonb)
			 RETURNING ${COLUMNS.replaceAll('c.', '')}`,
			[id, profileId, input.mode, input.personName, input.clubId, seed, CAREER_START.season, CAREER_START.date, JSON.stringify(data)]
		);
		const messages = welcomeMessages(input);
		for (const [seq, m] of messages.entries()) {
			await tx.query(
				`INSERT INTO career_messages (id, career_id, kind, sender, subject, body, game_date, seq)
				 VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8)`,
				[randomUUID(), id, m.kind, m.sender, m.subject, m.body, m.gameDate, seq]
			);
		}
		return { ...mapCareer(rows[0]), unreadMessages: messages.length };
	});
}

export async function listCareers(db: Db, profileId: string): Promise<Career[]> {
	const rows = await db.query<CareerRow>(
		`SELECT ${COLUMNS},
			(SELECT count(*) FROM career_messages m WHERE m.career_id = c.id AND m.read_at IS NULL) AS unread
		 FROM careers c WHERE c.profile_id = $1 ORDER BY c.updated_at DESC`,
		[profileId]
	);
	return rows.map(mapCareer);
}

export async function getCareer(db: Db, profileId: string, id: string): Promise<Career | null> {
	if (!isUuid(id)) return null;
	const rows = await db.query<CareerRow>(
		`SELECT ${COLUMNS},
			(SELECT count(*) FROM career_messages m WHERE m.career_id = c.id AND m.read_at IS NULL) AS unread
		 FROM careers c WHERE c.id = $1 AND c.profile_id = $2`,
		[id, profileId]
	);
	return rows[0] ? mapCareer(rows[0]) : null;
}

/**
 * Mescla campos em `data` com controle otimista de versão:
 * se outra aba salvou antes, a gravação é recusada em vez de sobrescrever.
 */
export async function patchCareerData(
	db: Db,
	profileId: string,
	id: string,
	patch: Partial<CareerData>,
	expectedVersion: number
): Promise<Career> {
	const rows = await db.query<CareerRow>(
		`UPDATE careers c SET data = c.data || $3::jsonb, version = c.version + 1, updated_at = now()
		 WHERE c.id = $1 AND c.profile_id = $2 AND c.version = $4
		 RETURNING ${COLUMNS}`,
		[id, profileId, JSON.stringify(patch), expectedVersion]
	);
	if (!rows[0]) {
		const exists = await getCareer(db, profileId, id);
		if (!exists) throw new Error('Carreira não encontrada');
		throw new VersionConflictError('A carreira foi alterada em outra janela. Recarregue para continuar.');
	}
	return mapCareer(rows[0]);
}

export async function touchCareer(db: Db, profileId: string, id: string): Promise<void> {
	await db.query('UPDATE careers SET updated_at = now() WHERE id = $1 AND profile_id = $2', [id, profileId]);
}

export async function deleteCareer(db: Db, profileId: string, id: string): Promise<boolean> {
	if (!isUuid(id)) return false;
	const rows = await db.query('DELETE FROM careers WHERE id = $1 AND profile_id = $2 RETURNING id', [id, profileId]);
	return rows.length > 0;
}

export interface CareerMessage {
	id: string;
	kind: 'important' | 'normal';
	sender: string;
	subject: string;
	body: string;
	gameDate: string;
	read: boolean;
}

type MessageRow = {
	id: string;
	kind: CareerMessage['kind'];
	sender: string;
	subject: string;
	body: string;
	game_date: string;
	read_at: Date | string | null;
};

export async function listMessages(db: Db, profileId: string, careerId: string): Promise<CareerMessage[]> {
	if (!isUuid(careerId)) return [];
	const rows = await db.query<MessageRow>(
		`SELECT m.id, m.kind, m.sender, m.subject, m.body, m.game_date::text AS game_date, m.read_at
		 FROM career_messages m JOIN careers c ON c.id = m.career_id
		 WHERE m.career_id = $1 AND c.profile_id = $2
		 ORDER BY m.game_date DESC, m.seq ASC`,
		[careerId, profileId]
	);
	return rows.map((r) => ({
		id: r.id,
		kind: r.kind,
		sender: r.sender,
		subject: r.subject,
		body: r.body,
		gameDate: r.game_date,
		read: r.read_at != null
	}));
}

/** Marca uma mensagem (ou todas, com messageId = null) como lida. Retorna quantas mudaram. */
export async function markMessagesRead(db: Db, profileId: string, careerId: string, messageId: string | null): Promise<number> {
	if (!isUuid(careerId) || (messageId !== null && !isUuid(messageId))) return 0;
	const rows = await db.query(
		`UPDATE career_messages m SET read_at = now()
		 FROM careers c
		 WHERE c.id = m.career_id AND c.profile_id = $2 AND m.career_id = $1
		   AND m.read_at IS NULL AND ($3::uuid IS NULL OR m.id = $3::uuid)
		 RETURNING m.id`,
		[careerId, profileId, messageId]
	);
	return rows.length;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
	return typeof v === 'string' && UUID.test(v);
}
