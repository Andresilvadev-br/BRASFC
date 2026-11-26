import { randomUUID } from 'node:crypto';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { closeDb, getDb } from '#lib/server/db/index.ts';
import { noStore, profileFromToken, SESSION_COOKIE } from '#lib/server/http.ts';
import { isTemporaryServiceFailure, logRequestFailure } from '#lib/server/request-error.ts';
import { gameEnabled, sitePathAllowed } from '#lib/server/mode.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const GAME = gameEnabled(process.env, import.meta.env.DEV);

/** Executado uma vez ao iniciar o servidor. No jogo local: abre o save (PGlite) e aplica as migrações. */
export const init: ServerInit = async () => {
	if (!GAME) return; // site público: sem banco
	await getDb();
	(globalThis as Record<symbol, unknown>)[Symbol.for('brasfc.shutdown')] = async () => {
		await closeDb();
	};
};

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const isApi = pathname.startsWith('/api/');
	const method = event.request.method;
	const mutation = isApi && !SAFE_METHODS.has(method);
	const started = performance.now();
	event.locals.requestId = randomUUID();
	event.locals.profile = null;

	function finish(response: Response) {
		response.headers.set('x-request-id', event.locals.requestId);
		response.headers.set('x-content-type-options', 'nosniff');
		response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
		response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
		response.headers.set('cross-origin-opener-policy', 'same-origin');
		if (isApi) response.headers.append('server-timing', `request;dur=${(performance.now() - started).toFixed(1)}`);
		if (event.locals.profile) response.headers.set('cache-control', 'private, no-store');
		else if (isApi && !response.headers.has('cache-control')) response.headers.set('cache-control', 'no-store');
		return response;
	}

	// Site público (VPS): só apresentação e download. O jogo roda apenas no aplicativo do Windows.
	if (!GAME && !sitePathAllowed(pathname)) {
		if (isApi) return finish(noStore({ message: 'O BRASFC agora é jogado no aplicativo do Windows, 100% offline.' }, { status: 410 }));
		return finish(new Response(null, { status: 307, headers: { location: '/' } }));
	}
	// Jogo local: sem limites de requisição (um único jogador no próprio computador), só a checagem de origem.
	if (mutation && event.request.headers.get('origin') !== event.url.origin) {
		return finish(noStore({ message: 'Origem não permitida.' }, { status: 403 }));
	}

	try {
		if (GAME && pathname !== '/api/health') {
			const token = event.cookies.get(SESSION_COOKIE);
			if (token) event.locals.profile = await profileFromToken(token);
		}
		// Clone only the headers when the framework returned an immutable redirect.
		const response = await resolve(event);
		return finish(new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers }));
	} catch (cause) {
		logRequestFailure(event.locals.requestId, event.route.id ?? pathname, method, cause);
		if (!isApi) throw cause;
		const status = isTemporaryServiceFailure(cause) ? 503 : 500;
		return finish(noStore({ id: event.locals.requestId, message: status === 503
			? 'Servidor temporariamente indisponível. Tente novamente.' : 'O servidor não conseguiu concluir a operação.' },
		{ status, headers: status === 503 ? { 'retry-after': '3' } : undefined }));
	}
};

export const handleError: HandleServerError = (input) => {
	if (input.kind === 'framework' && input.error.status === 404) return { message: 'Página não encontrada.' };
	if (input.kind !== 'unknown') return;
	const id = input.event.locals.requestId || randomUUID();
	logRequestFailure(id, input.event.route.id ?? 'rota desconhecida', input.event.request.method, input.error);
	return { message: isTemporaryServiceFailure(input.error) ? 'Servidor temporariamente indisponível. Tente novamente.'
		: 'O servidor não conseguiu concluir a operação.', id };
};
