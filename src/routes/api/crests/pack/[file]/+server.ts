import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Repasse dos pacotes oficiais do Brasfoot Next para o botão "Baixar escudos". Só aceita o índice e os
 * pacotes de clubes, sempre da fonte oficial (lista fechada, sem URL livre). O cliente confere o SHA-256
 * de cada pacote contra o índice. Usa a internet só nesta ação, pedida pelo jogador.
 */
const SOURCE = 'https://raw.githubusercontent.com/Brasfoot-Next/database/pack/';
const ALLOWED = /^(index\.json|clubs-[a-z0-9]+\.zip)$/;
const MAX_BYTES = 16 * 1024 * 1024;

export const GET: RequestHandler = async ({ params, fetch }) => {
	if (!ALLOWED.test(params.file)) error(404, 'Pacote desconhecido.');
	let response: Response;
	try {
		response = await fetch(SOURCE + params.file, { signal: AbortSignal.timeout(60_000) });
	} catch {
		error(503, 'Sem conexão com o Brasfoot Next. Verifique a internet e tente de novo.');
	}
	if (!response.ok) error(502, `O Brasfoot Next respondeu ${response.status} para ${params.file}.`);
	const data = await response.arrayBuffer();
	if (data.byteLength > MAX_BYTES) error(502, 'Pacote maior que o esperado.');
	return new Response(data, {
		headers: { 'content-type': params.file.endsWith('.json') ? 'application/json' : 'application/zip', 'cache-control': 'no-store' }
	});
};
