import { error, json, type Cookies, type RequestEvent } from '@sveltejs/kit';
import { getDb } from './db/index.ts';
import { createGuestProfile, findProfileByToken, type Profile } from './repos/profiles.ts';

export const SESSION_COOKIE = 'brasfc_sid';
const ONE_YEAR = 60 * 60 * 24 * 365;

export function setSessionCookie(cookies: Cookies, token: string, secure: boolean) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: ONE_YEAR
	});
}

const profileLookups = new Map<string, Promise<Profile | null>>();
export async function profileFromToken(token: string | undefined): Promise<Profile | null> {
	if (!token) return null;
	const existing = profileLookups.get(token);
	if (existing) return existing;
	const pending = getDb().then((db) => findProfileByToken(db, token)).finally(() => profileLookups.delete(token));
	profileLookups.set(token, pending);
	return pending;
}

/** Perfil atual; cria um convidado se ainda não existir (somente em mutações/rotas explícitas). */
export async function ensureProfile(event: RequestEvent): Promise<Profile> {
	if (event.locals.profile) return event.locals.profile;
	const { profile, token } = await createGuestProfile(await getDb());
	setSessionCookie(event.cookies, token, event.url.protocol === 'https:');
	event.locals.profile = profile;
	return profile;
}

export function requireProfile(event: RequestEvent): Profile {
	if (!event.locals.profile) error(401, 'Sessão não encontrada. Volte ao início para criar seu perfil.');
	return event.locals.profile;
}

/** Lê JSON com limite de tamanho; corpo inválido vira 400. */
export async function readJson<T = Record<string, unknown>>(request: Request, maxBytes = 16_384): Promise<T> {
	const type = request.headers.get('content-type') ?? '';
	if (!type.includes('application/json')) error(415, 'Envie os dados como JSON.');
	const text = await request.text();
	if (text.length > maxBytes) error(413, 'Requisição muito grande.');
	try {
		const value = JSON.parse(text) as unknown;
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
		return value as T;
	} catch {
		error(400, 'JSON inválido.');
	}
}

export function noStore(data: unknown, init: ResponseInit = {}) {
	return json(data, { ...init, headers: { 'cache-control': 'no-store', ...(init.headers ?? {}) } });
}

/** Limitador simples em memória (janela deslizante por chave). Suficiente para uma instância. */
export class RateLimiter {
	private hits = new Map<string, number[]>();
	constructor(
		private readonly limit: number,
		private readonly windowMs: number
	) {}

	take(key: string, now = Date.now()): boolean {
		return this.retryAfter(key, now) === 0;
	}

	/** Charges one operation when admitted, otherwise returns the real wait in seconds. */
	retryAfter(key: string, now = Date.now()): number {
		const since = now - this.windowMs;
		const list = (this.hits.get(key) ?? []).filter((t) => t > since);
		if (list.length >= this.limit) {
			this.hits.set(key, list);
			return Math.max(1, Math.ceil((list[0] + this.windowMs - now) / 1000));
		}
		list.push(now);
		this.hits.set(key, list);
		if (this.hits.size > 5_000) this.sweep(since);
		return 0;
	}

	private sweep(since: number) {
		for (const [k, v] of this.hits) if (!v.some((t) => t > since)) this.hits.delete(k);
	}
}

export function limitedResponse(seconds: number, message = 'Muitas requisições. Aguarde um instante.') {
	return noStore({ message }, { status: 429, headers: { 'retry-after': String(seconds) } });
}
