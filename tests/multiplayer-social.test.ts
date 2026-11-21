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
import { createRoom, getRoomByCode, joinRoom } from '#lib/server/repos/rooms.ts';
import { applyWorldCommand, worldSnapshot } from '#lib/server/connected-world.ts';
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

	it('forma duas comissões, restringe privacidade e confirma sugestões e permissões sem duplicar ações', async () => {
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
		const privateInvite = await invite(a.id, b, 'assistant');
		await expect(answerInvitation(db, outsider.id, privateInvite.id, true)).rejects.toMatchObject({ status: 404 });
		await answerInvitation(db, b.id, privateInvite.id, true);
		await answerInvitation(db, b.id, privateInvite.id, true);
		const rivalInvite = await invite(a.id, c, 'coach', rival);
		await answerInvitation(db, c.id, rivalInvite.id, true);
		const rivalAssistant = await invite(c.id, d, 'assistant');
		await answerInvitation(db, d.id, rivalAssistant.id, true);
		expect((await get(b.id)).current).toMatchObject({ role:'assistant', club:mine });
		expect((await get(d.id)).current).toMatchObject({ role:'assistant', club:rival });
		await send(a.id, 'start');
		expect((await getRoomByCode(db, room.code))?.started).toBe(true);

		const text = { channel:'staff', action:'message', text:'Treino às oito', op:randomUUID() };
		await Promise.all([writeRoomChat(db, room, b.id, text), writeRoomChat(db, room, b.id, text)]);
		expect((await readRoomChat(db, room, a.id, 'staff')).messages).toHaveLength(1);
		expect((await readRoomChat(db, room, c.id, 'staff')).messages).toHaveLength(0);
		await expect(readRoomChat(db, room, outsider.id, 'league')).rejects.toMatchObject({ status: 404 });
		const snapshot = await get(b.id);
		const tactic = { ...snapshot.tactic!, mentality:'ofensiva' };
		await expect(send(b.id, 'tactic', { tactic })).rejects.toMatchObject({ status: 403 });
		await writeRoomChat(db, room, b.id, { action:'suggest', channel:'staff', tactic, text:'Sugestão de tática', op:randomUUID(), revision:snapshot.revision });
		const chat = await readRoomChat(db, room, a.id, 'staff');
		const decision = { action:'approve', channel:'staff', seq:chat.messages.at(-1)!.seq };
		const results = await Promise.all([writeRoomChat(db, room, a.id, decision), writeRoomChat(db, room, a.id, decision)]);
		expect(results.filter((item) => item.changed)).toHaveLength(1);
		expect((await get(b.id)).tactic?.mentality).toBe('ofensiva');
		await send(a.id, 'delegate', { area:'match', target:b.id, value:true });
		await send(b.id, 'tactic', { tactic: { ...tactic, mentality:'defensiva' } });
		await send(a.id, 'delegate', { area:'match', target:b.id, value:false });
		await expect(send(b.id, 'tactic', { tactic })).rejects.toMatchObject({ status: 403 });
		await writeRoomChat(db, room, a.id, { action:'read', channel:'staff', seq:decision.seq });
		expect((await readRoomChat(db, room, a.id, 'staff')).lastRead).toBe(decision.seq);
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
