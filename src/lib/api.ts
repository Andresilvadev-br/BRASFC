import { pendingWrites } from '#lib/stores/unsaved.svelte.ts';

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly errors?: Record<string, string>,
		readonly retryAfterMs?: number,
		readonly requestId?: string
	) { super(message); }
}

export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
	if (!value) return undefined;
	if (/^\d+$/.test(value)) return Number(value) * 1000;
	const date = Date.parse(value);
	return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export function retryDelay(attempt: number, retryAfter = 0, random = Math.random) {
	return Math.max(retryAfter, Math.min(20_000, 750 * 2 ** Math.min(attempt, 6))) + Math.round(random() * 300);
}

export function connectionIssue(error: unknown): 'limited' | 'server' | 'offline' | 'reconnecting' | null {
	if (!(error instanceof ApiError)) return null;
	if (error.status === 429) return 'limited';
	if (error.status >= 500) return 'server';
	if (error.status === 0) return typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'reconnecting';
	return null;
}

export const connectionText = {
	limited: 'Aguarde para repetir a operação.',
	server: 'Servidor temporariamente indisponível.',
	offline: 'Sem conexão de rede.',
	reconnecting: 'Tentando alcançar o servidor…'
};

type ApiOptions = { method?: string; body?: unknown; fetch?: typeof fetch; signal?: AbortSignal };
const reads = new Map<string, Promise<unknown>>();
const backoffs = new Map<string, { until: number; error: ApiError }>();
let generation = 0;

export async function api<T>(path: string, init: ApiOptions = {}): Promise<T> {
	const method = init.method ?? (init.body !== undefined ? 'POST' : 'GET');
	const browser = typeof window !== 'undefined';
	const writing = browser && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
	const shared = browser && method === 'GET' && !init.fetch && !init.signal;
	const scope = `${method}:${path}`;
	const key = `${generation}:${path}`;
	const blocked = browser && backoffs.get(scope);
	if (blocked) {
		const left = blocked.until - Date.now();
		if (left > 0) throw new ApiError(blocked.error.message, 429, blocked.error.errors, left, blocked.error.requestId);
		backoffs.delete(scope);
	}
	const active = shared && reads.get(key);
	if (active) return active as Promise<T>;
	if (writing) { generation++; pendingWrites.count++; }
	const request = async () => {
		let response: Response;
		try {
			response = await (init.fetch ?? fetch)(path, {
				method, signal: init.signal, credentials: 'same-origin',
				headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
				body: init.body !== undefined ? JSON.stringify(init.body) : undefined
			});
		} catch (cause) {
			if (init.signal?.aborted) throw cause;
			throw new ApiError(typeof navigator !== 'undefined' && navigator.onLine === false
				? connectionText.offline : 'Não foi possível alcançar o servidor. Confira a conexão e tente novamente.', 0);
		}
		const id = response.headers.get('x-request-id') ?? undefined;
		if (response.status === 204) return undefined as T;
		const data = (await response.json().catch(() => null)) as { message?: string; id?: string; errors?: Record<string, string> } | null;
		if (!response.ok) {
			const delay = retryAfterMs(response.headers.get('retry-after'));
			const failure = new ApiError(data?.message ?? (response.status >= 500 ? connectionText.server : `Erro ${response.status}`),
				response.status, data?.errors, delay, id ?? data?.id);
			if (browser && response.status === 429 && delay) backoffs.set(scope, { until: Date.now() + delay, error: failure });
			throw failure;
		}
		if (data === null) throw new ApiError('O servidor não confirmou a operação.', 502, undefined, undefined, id);
		return data as T;
	};
	const pending = request().finally(() => {
		if (shared) reads.delete(key);
		if (writing) { generation++; pendingWrites.count--; }
	});
	if (shared) reads.set(key, pending);
	return pending;
}

export function isVersionConflict(e: unknown): boolean {
	return e instanceof ApiError && e.status === 409 && /outra janela/.test(e.message);
}

/** Retries a write only once the server explicitly rejected it before changing the version. */
export async function withCareerVersion<T>(careerId: string, version: number, run: (version: number) => Promise<T>): Promise<T> {
	try {
		return await run(version);
	} catch (e) {
		if (!isVersionConflict(e)) throw e;
		const { career } = await api<{ career: { version: number } }>(`/api/careers/${careerId}`);
		return run(career.version);
	}
}
