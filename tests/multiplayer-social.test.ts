import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCareer, listCareers } from '#lib/server/repos/careers.ts';
import { applyCareerReset, inspectReset } from '#lib/server/career-reset.ts';
import { wageDemand, tierOfDivision } from '#lib/domain/market.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgliteDb, createPostgresDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { loginAccount, registerAccount, rotateCredentials, listSessions } from '#lib/server/repos/accounts.ts';
import { createGuestProfile, findProfileByToken } from '#lib/server/repos/profiles.ts';
import { configureLeagueDraft, createRoom, deleteOnlineLeague, getRoomByCode, joinRoom, listRoomsForProfile } from '#lib/server/repos/rooms.ts';
import { applyWorldCommand, updateLiveRound, worldSnapshot } from '#lib/server/connected-world.ts';
import { answerInvitation, friendship, searchProfiles, sendInvitation, socialInbox } from '#lib/server/repos/social.ts';
import { readRoomChat, writeRoomChat } from '#lib/server/repos/room-chat.ts';

let db: Db;
beforeAll(async () => {
	db = process.env.PG_WORLD_URL ? await createPostgresDb(process.env.PG_WORLD_URL) : await createPgliteDb();
	await runMigrations(db);
}, 30_000);
afterAll(async () => { await db?.close(); });
const password = 'tabela de futebol 385';
const prefix = randomUUID().slice(0, 6);
const account = (user: string) => ({ username: prefix + '_' + user, displayName: user, password });
async function registered(user: string) {
	const body = account(user);
	const { token } = await registerAccount(db, null, body, 'Chrome/130 Android');
	const profile = (await findProfileByToken(db, token))!;
	return profile;
}

describe('contas e ligas', () => {
	it('converte um convidado, mantém sua liga e recupera a conta em outro dispositivo', async () => {
		const { profile: guest, token: guestToken } = await createGuestProfile(db);
		const room = await createRoom(db, guest.id, 'Liga anterior');
		const body = account('titular');
		const { token, recovery } = await registerAccount(db, guest.id, body, 'BRASFC Electron/42');
		expect(await findProfileByToken(db, guestToken)).toBeNull();
		await expect(loginAccount(db, { ...body, password: 'senha incorreta' }, 'Chrome/130')).rejects.toMatchObject({ status: 401 });
		const mobile = await loginAccount(db, body, 'Safari/21 iPhone');
		expect(await findProfileByToken(db, mobile)).toMatchObject({ id: guest.id, username: body.username });
		expect(await listSessions(db, guest.id, mobile)).toHaveLength(2);
		expect((await worldSnapshot(db, room, guest.id)).ownerId).toBe(guest.id);
		const rotated = await rotateCredentials(db, null, { username: body.username, current: recovery, password: password + ' nova' }, 'Chrome/130');
		expect(await findProfileByToken(db, token)).toBeNull();
		expect(await findProfileByToken(db, mobile)).toBeNull();
		expect(await findProfileByToken(db, rotated.token)).toMatchObject({ id: guest.id });
		await expect(rotateCredentials(db, null, { username: body.username, current: recovery, password }, '')).rejects.toMatchObject({ status: 401 });
	});

	it('recupera a mesma liga ao repetir a criação, salva o rascunho e recusa ligas e funções descontinuadas', async () => {
		const host = await registered('modos_host'), guest = await registered('modos_guest');
		const config = { mode:'coach', max:4, inviteOnly:true, assistantsRequired:true } as const;
		const key = randomUUID();
		const created = await Promise.all([
			createRoom(db, host.id, 'Treinadores online', config, key),
			createRoom(db, host.id, 'Treinadores online', config, key)
		]);
		const [room] = created;
		expect(created[1].id).toBe(room.id);
		const leagueOptions = { season:2028, calendar:'saturday', competition:'league', difficulty:'advanced' } as const;
		await expect(configureLeagueDraft(db, room.code, guest.id, 'Sem permissão', config)).rejects.toMatchObject({ status:404 });
		const patched = await configureLeagueDraft(db, room.code, host.id, 'Treinadores 2028', { ...config, leagueOptions });
		expect(patched).toMatchObject({ id:room.id, name:'Treinadores 2028', entryMode:'coach' });
		expect(await listRoomsForProfile(db, host.id)).toMatchObject([{ code:room.code, season:2028, editable:true }]);
		const send = async (profile: string, body: Record<string, unknown>) => applyWorldCommand(db, room, profile, {
			...body, revision:(await worldSnapshot(db, room, profile)).revision, op:randomUUID()
		});
		await send(host.id, { action:'assign', role:'coach', club:'atletico-mg' });
		expect(await worldSnapshot(db, patched, host.id)).toMatchObject({ season:2028, editableDraft:false, current:{ role:'coach' } });
		await expect(configureLeagueDraft(db, room.code, host.id, 'Mudança tardia', config)).rejects.toMatchObject({ status:409 });
		const invite = await sendInvitation(db, room, host.id, { role:'member', username:guest.username });
		await answerInvitation(db, guest.id, invite.id, true);
		// Carreira de jogador e auxiliar humano foram descontinuados na 0.12.
		await expect(send(guest.id, { action:'assign', role:'player', club:'santos', personName:'Atleta', position:'ATA' })).rejects.toMatchObject({ status:410 });
		await expect(send(guest.id, { action:'assign', role:'assistant', club:'atletico-mg' })).rejects.toMatchObject({ status:410 });
		await expect(sendInvitation(db, room, host.id, { role:'assistant', username:guest.username })).rejects.toMatchObject({ status:410 });
		await expect(createRoom(db, host.id, 'Atletas online', { ...config, mode:'player' as never }, randomUUID())).rejects.toMatchObject({ status:410 });
		// Clube já assumido não aceita outro treinador.
		await expect(send(guest.id, { action:'assign', role:'coach', club:'atletico-mg' })).rejects.toMatchObject({ status:409 });
		await send(guest.id, { action:'assign', role:'coach', club:'santos' });
		expect((await worldSnapshot(db, patched, guest.id)).members.map((member) => member.assignment?.role)).toEqual(['coach','coach']);
	});

	it('persiste regras de criação e restringe a exclusão individual ao anfitrião com confirmação', async () => {
		const a = await registered('apagar'), b = await registered('visitante');
		const options = { season: 2028, calendar: 'saturday', competition: 'league', difficulty: 'advanced' } as const;
		const room = await createRoom(db, a.id, 'Liga para exclusão', { mode:'coach', max:4, inviteOnly:false, assistantsRequired:false, leagueOptions:options });
		const kept = await createRoom(db, a.id, 'Liga preservada');
		await friendship(db, a.id, 'friend', b.id);
		await friendship(db, b.id, 'friend-accept', a.id);
		await joinRoom(db, room.code, b.id);
		const opening = await worldSnapshot(db, (await getRoomByCode(db, room.code))!, a.id);
		expect(opening).toMatchObject({ season:2028, options });
		expect(new Date(opening.next!.date + 'T12:00:00Z').getUTCDay()).toBe(6);
		await applyWorldCommand(db, room, a.id, { action:'assign', role:'coach', club:'atletico-mg', op:randomUUID(), revision:0 });
		const assigned = await worldSnapshot(db, room, a.id);
		expect(assigned.calendar.length).toBeGreaterThan(0);
		expect(assigned.calendar.every(({ fixture }) => fixture.competition !== 'copa-do-brasil')).toBe(true);
		await writeRoomChat(db, room, b.id, { action:'message', channel:'league', text:'Somente nesta liga', op:randomUUID() });
		const pending = await registered('pendente');
		await sendInvitation(db, room, a.id, { role:'member', username:pending.username });
		await expect(deleteOnlineLeague(db, room.id, b.id, room.code)).rejects.toMatchObject({ status:404 });
		await expect(deleteOnlineLeague(db, room.id, a.id, '000000')).rejects.toMatchObject({ status:400 });
		await applyWorldCommand(db, room, a.id, { action:'archive', op:randomUUID(), revision:assigned.revision });
		expect((await listRoomsForProfile(db, a.id, true)).map((league) => league.id)).toContain(room.id);
		expect((await listRoomsForProfile(db, b.id, true)).map((league) => league.id)).not.toContain(room.id);
		const deleted = await deleteOnlineLeague(db, room.id, a.id, room.code);
		expect(deleted.recipients).toEqual(expect.arrayContaining([a.id, b.id, pending.id]));
		expect(await getRoomByCode(db, room.code)).toBeNull();
		expect(await getRoomByCode(db, kept.code)).toMatchObject({ ownerId:a.id });
		expect((await socialInbox(db, a.id)).friends).toMatchObject([{ id:b.id, accepted:true }]);
		expect((await socialInbox(db, pending.id)).invites).toHaveLength(0);
		expect(await db.query('SELECT 1 FROM room_chat WHERE room_id=$1', [room.id])).toHaveLength(0);
		expect(await db.query('SELECT 1 FROM room_worlds WHERE room_id=$1', [room.id])).toHaveLength(0);
		expect(await db.query('SELECT 1 FROM room_deletion_audit WHERE room_id=$1 AND actor=$2', [room.id, a.id])).toHaveLength(1);
	});

	it('dois treinadores convidados, privacidade e negociação sem duplicar ações', async () => {
		const a = await registered('alberto'), b = await registered('bruno'), c = await registered('caio'), d = await registered('davi');
		const outsider = await registered('edson');
		await friendship(db, a.id, 'friend', b.id);
		expect((await socialInbox(db, b.id)).friends[0]).toMatchObject({ id: a.id, incoming: true, accepted: false });
		await friendship(db, b.id, 'friend-accept', a.id);
		expect((await socialInbox(db, a.id)).friends[0].accepted).toBe(true);
		expect(await searchProfiles(db, b.id, a.username)).toMatchObject([{ id: a.id }]);
		const room = await createRoom(db, a.id, 'Duas comissões', { mode: 'coach', max: 4, inviteOnly: true, assistantsRequired: false });
		const get = (id: string) => worldSnapshot(db, room, id);
		const send = async (id: string, action: string, body = {}) => applyWorldCommand(db, room, id,
			{ op: randomUUID(), revision: (await get(id)).revision, action, ...body });
		const invite = (sender: string, recipient: typeof b, role: string, club?: string) =>
			sendInvitation(db, room, sender, { username: recipient.username, role, club });
		const mine = 'atletico-mg', rival = 'santos';
		await expect(joinRoom(db, room.code, outsider.id)).rejects.toMatchObject({ status: 403 });
		await expect(send(a.id, 'advance')).rejects.toMatchObject({ status: 409 });
		const clubs = (await get(a.id)).clubs;
		expect(clubs.some((club) => club.id === mine)).toBe(true);
		await send(a.id, 'assign', { role:'coach', club:mine });
		const rivalInvite = await invite(a.id, c, 'coach', rival);
		await expect(answerInvitation(db, outsider.id, rivalInvite.id, true)).rejects.toMatchObject({ status: 404 });
		await answerInvitation(db, c.id, rivalInvite.id, true);
		await answerInvitation(db, c.id, rivalInvite.id, true);
		expect((await get(c.id)).current).toMatchObject({ role:'coach', club:rival });
		void b; void d;
		await send(a.id, 'start');
		expect((await getRoomByCode(db, room.code))?.started).toBe(true);

		await expect(readRoomChat(db, room, outsider.id, 'league')).rejects.toMatchObject({ status: 404 });
		const tactic = { ...(await get(a.id)).tactic!, mentality:'ofensiva' };
		await send(a.id, 'tactic', { tactic });
		expect((await get(a.id)).tactic?.mentality).toBe('ofensiva');
		const buyer = await get(a.id), seller = await get(c.id);
		const target = seller.roster.find((player) => 'contract' in player && !player.loan && !player.pending && player.age > 0)!;
		const tier = tierOfDivision(buyer.clubs.find((club) => club.id === mine)?.division);
		const wage = wageDemand(target, tier, getClub(mine)?.reputation ?? 2, 'rotacao', 3);
		await send(a.id, 'deal', { target:c.id, player:target.id, fee:2000 });
		const deal = (await get(c.id)).deals[0];
		await send(c.id, 'counter-deal', { id:deal.id, fee:2500 });
		await send(a.id, 'accept-deal', { id:deal.id });
		expect((await get(a.id)).management?.budget).toBe(buyer.management?.budget);
		await expect(send(c.id, 'contract-deal', { id:deal.id, wage, years:3, role:'rotacao' })).rejects.toMatchObject({ status:409 });
		await send(a.id, 'contract-deal', { id:deal.id, wage:500, years:3, role:'rotacao' });
		expect((await get(a.id)).deals[0].contractMessage).toContain('empresário');
		await send(a.id, 'contract-deal', { id:deal.id, wage, years:3, role:'rotacao' });
		const completed = await get(a.id);
		expect(completed.roster.find((player) => player.id === target.id)).toMatchObject({ contract: { wage } });
		expect(completed.management?.budget).toBe(buyer.management!.budget - 2500);
		expect((await get(c.id)).management?.budget).toBe(seller.management!.budget + 1250);
		expect(completed.dealHistory[0].status).toBe('aceita');
		const connection = { online: () => new Set([a.id, c.id]), now: () => 1000 };
		await applyWorldCommand(db, room, a.id, { action:'ready', value:true, op:randomUUID(), revision:completed.revision }, connection);
		const prepared = await get(c.id);
		expect(prepared.live).toBe(false);
		await applyWorldCommand(db, room, c.id, { action:'ready', value:true, op:randomUUID(), revision:prepared.revision }, connection);
		const { session } = await updateLiveRound(db, room, a.id, { action:'pulse' }, connection);
		expect(new Set(session?.required)).toEqual(new Set([a.id,c.id]));
		expect(session?.waiting).toEqual([]);
	}, 30_000);
});

it('restaura a cópia de um banco isolado e remove somente carreiras e ligas anteriores ao corte', async () => {
	const folder = await mkdtemp(join(tmpdir(), 'brasfc-reset-'));
	const origin = join(folder, 'source');
	const backup = join(folder, 'backup');
	let resetDb = await createPgliteDb(origin);
	try {
		await runMigrations(resetDb);
		const { profile } = await createGuestProfile(resetDb);
		const body = account('reset');
		const { token } = await registerAccount(resetDb, profile.id, body, '');
		const old = await createRoom(resetDb, profile.id, 'Liga antiga');
		const career = await createCareer(resetDb, profile.id, { mode:'coach', personName:'Treinador', clubId:'santos', world:'brasil' });
		await resetDb.query("UPDATE rooms SET created_at='2020-01-01' WHERE id=$1", [old.id]);
		await resetDb.query("UPDATE careers SET created_at='2020-01-01' WHERE id=$1", [career.id]);
		const fresh = await createRoom(resetDb, profile.id, 'Liga recente');
		const oldDate = '2021-01-01T00:00:00Z';
		const before = await inspectReset(resetDb, 'both', oldDate);
		expect(before.counts).toMatchObject({ careers: 1, rooms: 1, room_members:1 });
		await resetDb.close();
		await cp(origin, backup, { recursive:true });
		resetDb = await createPgliteDb(origin);
		await expect(applyCareerReset(resetDb, 'both', oldDate, 'errado', 'a'.repeat(64), 'teste')).rejects.toThrow('inventário mudou');
		await applyCareerReset(resetDb, 'both', oldDate, before.hash, 'a'.repeat(64), 'teste');
		expect(await getRoomByCode(resetDb, old.code)).toBeNull();
		expect(await getRoomByCode(resetDb, fresh.code)).not.toBeNull();
		expect(await listCareers(resetDb, profile.id)).toHaveLength(0);
		expect((await findProfileByToken(resetDb, token))?.id).toBe(profile.id);
		expect(await resetDb.query('SELECT id FROM career_reset_audit')).toHaveLength(1);
		expect(await createRoom(resetDb, profile.id, 'Liga após o reset')).toHaveProperty('code');
		await resetDb.close();
		resetDb = await createPgliteDb(backup);
		expect((await inspectReset(resetDb, 'both', oldDate)).hash).toBe(before.hash);
		expect(await listCareers(resetDb, profile.id)).toHaveLength(1);
		expect((await findProfileByToken(resetDb, token))?.id).toBe(profile.id);
	} finally {
		await resetDb.close();
		await rm(folder, { recursive: true, force: true });
	}
}, 20_000);
