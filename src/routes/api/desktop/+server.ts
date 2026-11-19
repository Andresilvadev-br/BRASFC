import { json } from '@sveltejs/kit';
import { desktopRelease } from '#lib/server/desktop.ts';
import type { RequestHandler } from './$types';

/** Link do instalador para Windows (somente se publicado de verdade). */
export const GET: RequestHandler = async ({ fetch }) => json(await desktopRelease(fetch), { headers: { 'cache-control': 'public, max-age=300' } });
