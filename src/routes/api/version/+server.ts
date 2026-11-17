import { noStore } from '#lib/server/http.ts';
import { BUILD } from '#lib/server/version.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => noStore(BUILD);
