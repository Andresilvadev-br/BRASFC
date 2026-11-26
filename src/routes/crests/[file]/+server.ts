import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CREST_FILE, crestDirectory } from '#lib/server/crests.ts';
import type { RequestHandler } from './$types';

/** Escudo importado: arquivo local endereçado pelo conteúdo, logo nunca muda (cache permanente). */
export const GET: RequestHandler = async ({ params }) => {
	if (!CREST_FILE.test(params.file)) error(404, 'Escudo não encontrado.');
	try {
		const data = await readFile(join(crestDirectory(), params.file));
		return new Response(new Uint8Array(data), { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' } });
	} catch {
		error(404, 'Escudo não encontrado.');
	}
};
