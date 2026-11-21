import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Db } from '../db/index.ts';

export interface Profile {
	id: string;
	displayName: string;
	createdAt: string;
	username?: string;
	avatar?: number;
}

type Row = { id: string; display_name: string; created_at: Date | string; username?: string | null; avatar?: number };

const map = (r: Row): Profile => ({
	id: r.id,
	displayName: r.display_name,
	...(r.username ? { username: r.username, avatar: r.avatar } : {}),
	createdAt: new Date(r.created_at).toISOString()
});

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function normalizeDisplayName(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const name = value.normalize('NFC').replace(/\s+/g, ' ').trim();
	if (name.length < 2 || name.length > 32) return null;
	if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._'-]*$/u.test(name)) return null;
	return name;
}

/** Cria um perfil de convidado. O token puro vai só para o cookie; o banco guarda o hash. */
export async function createGuestProfile(db: Db): Promise<{ profile: Profile; token: string }> {
	const token = randomBytes(32).toString('base64url');
	const id = randomUUID();
	const name = `Convidado ${Math.floor(1000 + Math.random() * 9000)}`;
	const rows = await db.query<Row>(
		'INSERT INTO profiles (id, display_name, token_hash) VALUES ($1, $2, $3) RETURNING id, display_name, created_at',
		[id, name, hashToken(token)]
	);
	return { profile: map(rows[0]), token };
}

export async function findProfileByToken(db: Db, token: string): Promise<Profile | null> {
	if (!token || token.length > 128) return null;
	const rows = await db.query<Row>(
		`SELECT p.id, p.display_name, p.created_at, p.username, p.avatar
		 FROM profile_sessions s JOIN profiles p ON p.id=s.profile_id
		 WHERE s.token_hash=$1 AND s.expires_at>now()
		 UNION ALL
		 SELECT id, display_name, created_at, username, avatar FROM profiles WHERE token_hash=$1 AND username IS NULL`,
		[hashToken(token)]
	);
	return rows[0] ? map(rows[0]) : null;
}

export async function renameProfile(db: Db, id: string, displayName: string): Promise<Profile | null> {
	const rows = await db.query<Row>(
		'UPDATE profiles SET display_name = $2 WHERE id = $1 RETURNING id, display_name, created_at, username, avatar',
		[id, displayName]
	);
	return rows[0] ? map(rows[0]) : null;
}
