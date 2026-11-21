import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { limitedResponse, noStore, RateLimiter, readJson, requireProfile, SESSION_COOKIE, setSessionCookie } from '#lib/server/http.ts';
import { ACCOUNT_MAX_AGE, AccountError, listSessions, loginAccount, registerAccount, rotateCredentials } from '#lib/server/repos/accounts.ts';
import { hashToken, normalizeDisplayName } from '#lib/server/repos/profiles.ts';
import { getRealtimeHub } from '#lib/server/realtime/hub.ts';
import type { RequestHandler } from './$types';

const attempts = new RateLimiter(12, 10 * 60_000);
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
export const GET: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	return noStore({ sessions: profile.username ? await listSessions(await getDb(), profile.id, event.cookies.get(SESSION_COOKIE) ?? '') : [] });
};

export const POST: RequestHandler = async (event) => {
	const db = await getDb(), body = await readJson(event.request, 2048);
	const existing = event.locals.profile, token = event.cookies.get(SESSION_COOKIE);
	const hub = getRealtimeHub();
	if (body.action === 'logout' || body.action === 'revoke') {
		if (!existing?.username) error(401, 'Entre na sua conta.');
		const revoked = body.action === 'logout'
			? await db.query<{ token_hash: string }>('DELETE FROM profile_sessions WHERE profile_id=$1 AND token_hash=$2 RETURNING token_hash', [existing.id, hashToken(token ?? '')])
			: typeof body.id === 'string' && uuid.test(body.id)
				? await db.query<{ token_hash: string }>('DELETE FROM profile_sessions WHERE profile_id=$1 AND id=$2 RETURNING token_hash', [existing.id, body.id])
				: [];
		if (body.action === 'logout' || revoked[0]?.token_hash === hashToken(token ?? '')) event.cookies.delete(SESSION_COOKIE, { path: '/' });
		for (const row of revoked) hub.revokeSession(row.token_hash);
		return noStore({ ok: true });
	}
	if (body.action === 'profile') {
		if (!existing?.username) error(401, 'Entre na sua conta.');
		const name = normalizeDisplayName(body.displayName), avatar = body.avatar;
		if (!name || typeof avatar !== 'number' || !Number.isInteger(avatar) || avatar < 0 || avatar > 5) error(400, 'Perfil inválido.');
		await db.query('UPDATE profiles SET display_name=$2, avatar=$3 WHERE id=$1', [existing.id, name, avatar]);
		void hub.profileRenamed(existing.id).catch(() => {});
		return noStore({ ok: true });
	}
	const retry = attempts.retryAfter(event.getClientAddress());
	if (retry) return limitedResponse(retry, 'Muitas tentativas de autenticação. Aguarde para tentar novamente.');
	const agent = event.request.headers.get('user-agent') ?? '';
	const secure = event.url.protocol === 'https:';
	try {
		switch (body.action) {
			case 'register': {
				if (existing?.username) error(409, 'Saia da conta atual antes de cadastrar outra.');
				const result = await registerAccount(db, existing?.id ?? null, body, agent);
				if (token) hub.revokeSession(hashToken(token));
				setSessionCookie(event.cookies, result.token, secure, ACCOUNT_MAX_AGE);
				return noStore({ recovery: result.recovery }, { status: 201 });
			}
			case 'login': {
				const next = await loginAccount(db, body, agent);
				if (existing?.username && token) {
					await db.query('DELETE FROM profile_sessions WHERE profile_id=$1 AND token_hash=$2', [existing.id, hashToken(token)]);
					hub.revokeSession(hashToken(token));
				}
				setSessionCookie(event.cookies, next, secure, ACCOUNT_MAX_AGE);
				return noStore({ ok: true });
			}
			case 'password':
			case 'recover': {
				if (body.action === 'password' && !existing?.username) error(401, 'Entre na sua conta.');
				const result = await rotateCredentials(db, body.action === 'password' ? existing!.id : null, body, agent);
				hub.revokeProfile(result.profileId);
				setSessionCookie(event.cookies, result.token, secure, ACCOUNT_MAX_AGE);
				return noStore({ recovery: result.recovery });
			}
			default: error(400, 'Ação de conta desconhecida.');
		}
	} catch (cause) {
		if (cause instanceof AccountError) error(cause.status, cause.message);
		throw cause;
	}
};
