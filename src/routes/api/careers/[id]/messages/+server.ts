import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { getCareer, isUuid, listMessages, markMessagesRead } from '#lib/server/repos/careers.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	return noStore({ messages: await listMessages(await getDb(), profile.id, event.params.id) });
};

/** { action: "read", id } marca uma; { action: "read-all" } marca todas. */
export const POST: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	if (!(await getCareer(db, profile.id, event.params.id))) error(404, 'Carreira não encontrada.');
	const body = await readJson(event.request);
	let changed: number;
	if (body.action === 'read' && isUuid(body.id)) changed = await markMessagesRead(db, profile.id, event.params.id, body.id);
	else if (body.action === 'read-all') changed = await markMessagesRead(db, profile.id, event.params.id, null);
	else error(400, 'Ação inválida.');
	return noStore({ changed });
};
