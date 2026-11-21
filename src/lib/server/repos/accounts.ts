import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db/index.ts';
import { hashToken, normalizeDisplayName } from './profiles.ts';

export class AccountError extends Error {
	constructor(readonly status: number, message: string) { super(message); }
}

export const ACCOUNT_MAX_AGE = 60 * 60 * 24 * 30;
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 48 * 1024 * 1024 };
const dummySalt = Buffer.alloc(16);
const dummy = `${dummySalt.toString('hex')}:${Buffer.alloc(64).toString('hex')}`;
let derivations = 0;

async function derive(password: string, salt: Buffer): Promise<Buffer> {
	if (derivations >= 3) throw new AccountError(503, 'Autenticação ocupada. Tente novamente em instantes.');
	derivations++;
	try {
		return await new Promise((resolve, reject) => scrypt(password, salt, 64, SCRYPT,
			(err, key) => err ? reject(err) : resolve(key)));
	} finally { derivations--; }
}

async function encodePassword(password: string) {
	const salt = randomBytes(16);
	return `${salt.toString('hex')}:${(await derive(password, salt)).toString('hex')}`;
}

async function matches(password: string, encoded = dummy) {
	const [salt, verifier] = encoded.split(':');
	return timingSafeEqual(await derive(password, Buffer.from(salt, 'hex')), Buffer.from(verifier, 'hex'));
}

export function usernameOf(value: unknown) {
	const name = typeof value === 'string' ? value.trim().toLowerCase() : '';
	return /^[a-z0-9][a-z0-9_]{2,23}$/.test(name) ? name : null;
}

function newPassword(value: unknown) {
	if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value) > 128) {
		throw new AccountError(400, 'Use uma senha de pelo menos 12 caracteres e até 128 bytes.');
	}
	return value;
}

function deviceName(agent: string) {
	if (/Electron\//.test(agent)) return 'Aplicativo BRASFC';
	const device = /Android|iPhone|iPad/.exec(agent)?.[0] ?? (/Windows/.test(agent) ? 'Windows' : /Macintosh/.test(agent) ? 'macOS' : 'Computador');
	const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Navegador';
	return `${browser} · ${device}`;
}

async function issue(tx: Db, profile: string, agent: string) {
	const token = randomBytes(32).toString('base64url');
	await tx.query('DELETE FROM profile_sessions WHERE profile_id=$1 AND expires_at <= now()', [profile]);
	await tx.query(`INSERT INTO profile_sessions (id,profile_id,token_hash,device,expires_at)
		VALUES ($1,$2,$3,$4,now()+interval '30 days')`, [randomUUID(), profile, hashToken(token), deviceName(agent)]);
	return token;
}

export async function registerAccount(db: Db, guest: string | null, body: Record<string, unknown>, agent: string) {
	const name = usernameOf(body.username), displayName = normalizeDisplayName(body.displayName);
	if (!name || !displayName) throw new AccountError(400, 'Informe um usuário válido e um nome de exibição.');
	const password = await encodePassword(newPassword(body.password));
	const recovery = randomBytes(24).toString('base64url');
	const id = guest ?? randomUUID();
	const retiredToken = hashToken(randomBytes(32).toString('base64url'));
	try {
		return await db.transaction(async (tx) => {
			if (guest) {
				const rows = await tx.query(`UPDATE profiles SET username=$2, display_name=$3, password_hash=$4, recovery_hash=$5, token_hash=$6
					WHERE id=$1 AND username IS NULL RETURNING id`, [id, name, displayName, password, hashToken(recovery), retiredToken]);
				if (!rows.length) throw new AccountError(409, 'Este perfil já possui conta.');
			} else {
				await tx.query(`INSERT INTO profiles (id,username,display_name,password_hash,recovery_hash,token_hash)
					VALUES ($1,$2,$3,$4,$5,$6)`, [id, name, displayName, password, hashToken(recovery), retiredToken]);
			}
			return { token: await issue(tx, id, agent), recovery };
		});
	} catch (cause) {
		if (typeof cause === 'object' && cause && 'code' in cause && cause.code === '23505') throw new AccountError(409, 'Este nome de usuário já está em uso.');
		throw cause;
	}
}

type Credential = { id: string; password_hash: string; recovery_hash: string };
export async function loginAccount(db: Db, body: Record<string, unknown>, agent: string) {
	const name = usernameOf(body.username);
	const password = typeof body.password === 'string' && Buffer.byteLength(body.password) <= 128 ? body.password : '';
	const [row] = name ? await db.query<Credential>('SELECT id,password_hash FROM profiles WHERE username=$1', [name]) : [];
	if (!(await matches(password, row?.password_hash)) || !row) throw new AccountError(401, 'Usuário ou senha inválidos.');
	return db.transaction(async (tx) => {
		const [current] = await tx.query<Credential>('SELECT password_hash FROM profiles WHERE id=$1 FOR UPDATE', [row.id]);
		if (current?.password_hash !== row.password_hash) throw new AccountError(409, 'A senha mudou. Faça login novamente.');
		return issue(tx, row.id, agent);
	});
}

export async function rotateCredentials(db: Db, id: string | null, body: Record<string, unknown>, agent: string) {
	const name = usernameOf(body.username);
	const [row] = id
		? await db.query<Credential>('SELECT id,password_hash,recovery_hash FROM profiles WHERE id=$1 AND username IS NOT NULL', [id])
		: name ? await db.query<Credential>('SELECT id,password_hash,recovery_hash FROM profiles WHERE username=$1', [name]) : [];
	const supplied = typeof body.current === 'string' && Buffer.byteLength(body.current) <= 128 ? body.current : '';
	const valid = id ? await matches(supplied, row?.password_hash) : row?.recovery_hash === hashToken(supplied);
	if (!row || !valid) throw new AccountError(401, 'Credencial inválida.');
	const encoded = await encodePassword(newPassword(body.password));
	const recovery = randomBytes(24).toString('base64url');
	return db.transaction(async (tx) => {
		const updated = await tx.query(`UPDATE profiles SET password_hash=$2, recovery_hash=$3
			WHERE id=$1 AND password_hash=$4 AND recovery_hash=$5 RETURNING id`,
		[row.id, encoded, hashToken(recovery), row.password_hash, row.recovery_hash]);
		if (!updated.length) throw new AccountError(409, 'Credenciais alteradas em outra sessão.');
		await tx.query('DELETE FROM profile_sessions WHERE profile_id=$1', [row.id]);
		return { token: await issue(tx, row.id, agent), recovery, profileId: row.id };
	});
}

export async function listSessions(db: Db, id: string, token: string) {
	return db.query<{ id: string; device: string; created_at: Date; current: boolean }>(`SELECT id, device, created_at, token_hash=$2 AS current
		FROM profile_sessions WHERE profile_id=$1 AND expires_at>now() ORDER BY created_at DESC`, [id, hashToken(token)]);
}
