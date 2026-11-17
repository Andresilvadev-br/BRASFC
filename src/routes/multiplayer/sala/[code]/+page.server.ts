import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { getRoomByCode, isMember, normalizeCode } from '#lib/server/repos/rooms.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const code = normalizeCode(params.code);
	if (!code || !locals.profile) error(404, 'Sala não encontrada.');
	const db = await getDb();
	const room = await getRoomByCode(db, code);
	if (!room || !(await isMember(db, room.id, locals.profile.id))) error(404, 'Sala não encontrada ou você ainda não entrou nela.');
	if (room.status !== 'open') error(410, 'Esta sala foi encerrada.');
	return { room };
};
