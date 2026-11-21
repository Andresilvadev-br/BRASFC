import { error } from '@sveltejs/kit';
import { worldSnapshot } from '#lib/server/connected-world.ts';
import { getDb } from '#lib/server/db/index.ts';
import { getRoomByCode, isMember, normalizeCode } from '#lib/server/repos/rooms.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (process.env.BRASFC_OFFLINE === '1') error(503, 'Entre no modo online para acessar suas ligas.');
	const code = normalizeCode(params.code);
	if (!code || !locals.profile) error(404, 'Sala não encontrada.');
	const db = await getDb();
	const room = await getRoomByCode(db, code);
	if (!room || !(await isMember(db, room.id, locals.profile.id))) error(404, 'Sala não encontrada ou você ainda não entrou nela.');
	if (room.status !== 'open') error(410, 'Esta sala foi encerrada.');
	return { room, world: await worldSnapshot(db, room, locals.profile.id), profileId: locals.profile.id };
};
