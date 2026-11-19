import { randomUUID } from 'node:crypto';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { closeDb, getDb } from '#lib/server/db/index.ts';
import { profileFromToken, RateLimiter, SESSION_COOKIE } from '#lib/server/http.ts';
import { getRealtimeHub } from '#lib/server/realtime/hub.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const mutationLimiter = new RateLimiter(90, 60_000);
const livePulseLimiter = new RateLimiter(900, 60_000);

/** Executado uma vez ao iniciar o servidor: migrações + hub de tempo real. */
export const init: ServerInit = async () => {
	await getDb();
	const hub = getRealtimeHub();
	(globalThis as Record<symbol, unknown>)[Symbol.for('brasfc.shutdown')] = async () => {
		await hub.close();
		await closeDb();
	};
};

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const isApi = pathname.startsWith('/api/');
	const started = performance.now();
	if (process.env.BRASFC_OFFLINE === '1' && pathname.startsWith('/api/rooms')) {
		return new Response(JSON.stringify({ message: 'Universos compartilhados exigem o modo online.' }), {
			status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		});
	}
	event.locals.profile = null;

	if (isApi && !SAFE_METHODS.has(event.request.method)) {
		// Proteção CSRF para a API JSON: a origem precisa ser o próprio site.
		const origin = event.request.headers.get('origin');
		if (origin !== event.url.origin) {
			return new Response(JSON.stringify({ message: 'Origem não permitida.' }), {
				status: 403,
				headers: { 'content-type': 'application/json' }
			});
		}
		let ip = 'local';
		try {
			ip = event.getClientAddress();
		} catch {
			/* ambiente sem endereço (testes) */
		}
		// A sala pode reunir vários perfis atrás do mesmo NAT. Pulsos têm orçamento próprio.
		const pulse = event.request.method === 'POST' && /^\/api\/rooms\/[^/]+\/world$/.test(pathname) && event.url.searchParams.get('live') === 'pulse';
		if (!(pulse ? livePulseLimiter : mutationLimiter).take(ip)) {
			return new Response(JSON.stringify({ message: 'Muitas requisições. Aguarde um instante.' }), {
				status: 429,
				headers: { 'content-type': 'application/json', 'retry-after': '30' }
			});
		}
	}

	if (pathname !== '/api/health') {
		const token = event.cookies.get(SESSION_COOKIE);
		if (token) event.locals.profile = await profileFromToken(token);
	}

	const response = await resolve(event);
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
	response.headers.set('cross-origin-opener-policy', 'same-origin');
	if (isApi) response.headers.append('server-timing', `request;dur=${(performance.now() - started).toFixed(1)}`);
	if (isApi && !response.headers.has('cache-control')) response.headers.set('cache-control', 'no-store');
	return response;
};

/**
 * No SvelteKit 3 este hook recebe todos os erros. Mensagens de `error(...)` (kind "app")
 * já são seguras e seguem como estão; erros inesperados são registrados com um id
 * e chegam ao usuário apenas como mensagem genérica.
 */
export const handleError: HandleServerError = (input) => {
	if (input.kind === 'framework' && input.error.status === 404) return { message: 'Página não encontrada.' };
	if (input.kind !== 'unknown') return;
	const id = randomUUID().slice(0, 8);
	console.error(`[erro ${id}] ${input.event.request.method} ${input.event.url.pathname}`, input.error);
	return { message: 'Algo deu errado do nosso lado. Tente novamente.', id };
};
