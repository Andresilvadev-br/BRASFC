import { pendingWrites } from '#lib/stores/unsaved.svelte.ts';

/** Cliente HTTP da API do BRASFC: JSON, mensagens de erro em português, sem exceções silenciosas. */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly errors?: Record<string, string>
	) {
		super(message);
	}
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; fetch?: typeof fetch } = {}): Promise<T> {
	const f = init.fetch ?? fetch;
	const method = init.method ?? (init.body ? 'POST' : 'GET');
	const writing = typeof window !== 'undefined' && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
	if (writing) pendingWrites.count++;
	try {
	let res: Response;
	try {
		res = await f(path, {
			method,
			headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
			body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
			credentials: 'same-origin'
		});
	} catch {
		throw new ApiError('Sem conexão com o servidor. Verifique sua internet e tente de novo.', 0);
	}
	const data = (await res.json().catch(() => ({}))) as { message?: string; errors?: Record<string, string> };
	if (!res.ok) throw new ApiError(data.message ?? `Erro ${res.status}`, res.status, data.errors);
	return data as T;
	} finally { if (writing) pendingWrites.count--; }
}

/** Conflito de versão: outra tela/aba (ou o app) gravou a carreira antes deste pedido. */
export function isVersionConflict(e: unknown): boolean {
	return e instanceof ApiError && e.status === 409 && /outra janela/.test(e.message);
}

/**
 * Executa uma gravação com a versão conhecida da carreira; se outra tela gravou antes,
 * busca a versão atual e tenta mais uma vez. É seguro: no conflito o servidor não gravou
 * nada, e ele continua validando tudo (o passo do calendário, a tática, o elenco).
 */
export async function withCareerVersion<T>(careerId: string, version: number, run: (version: number) => Promise<T>): Promise<T> {
	try {
		return await run(version);
	} catch (e) {
		if (!isVersionConflict(e)) throw e;
		const { career } = await api<{ career: { version: number } }>(`/api/careers/${careerId}`);
		return run(career.version);
	}
}
