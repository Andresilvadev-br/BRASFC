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
	let res: Response;
	try {
		res = await f(path, {
			method: init.method ?? (init.body ? 'POST' : 'GET'),
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
}
