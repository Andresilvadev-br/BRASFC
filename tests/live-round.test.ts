import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPgliteDb, createPostgresDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { createRoom, joinRoom } from '#lib/server/repos/rooms.ts';
import { applyWorldCommand, updateLiveRound, worldSnapshot } from '#lib/server/connected-world.ts';
import { forgetRound } from '#lib/server/live-round.ts';
import { parseClientMessage } from '#lib/realtime/protocol.ts';

let db: Db;
beforeAll(async () => {
	db = process.env.PG_WORLD_URL ? await createPostgresDb(process.env.PG_WORLD_URL) : await createPgliteDb();
	await runMigrations(db);
});
afterAll(async () => { await db.close(); });

it('recupera rodada com vários jogos, aplica substituições reais e espera três participantes', async () => {
	const [coach, assistant, athlete, stranger] = await Promise.all(Array.from({ length: 4 }, async () => (await createGuestProfile(db)).profile.id));
	const room = await createRoom(db, coach, 'Rodada cooperativa');
	await joinRoom(db, room.code, assistant);
	await joinRoom(db, room.code, athlete);
	let now = 1000;
	const connected = new Set([coach, assistant]);
	const connection = { online: () => connected, now: () => now };
	let revision = 0;
	const command = async (profile: string, action: string, options = {}) => {
		const result = await applyWorldCommand(db, room, profile, { action, revision, op: randomUUID(), ...options }, connection);
		revision = result.revision;
	};
	await command(coach, 'assign', { role: 'coach', club: 'flamengo' });
	await command(assistant, 'assign', { role: 'assistant', club: 'flamengo' });
	await command(athlete, 'assign', { role: 'player', club: 'flamengo', personName: 'Atleta Ao Vivo', position: 'ATA' });
	await command(coach, 'delegate', { target: assistant, value: true });
	await command(assistant, 'training', { plan: { sessions: ['posse', 'descanso', 'formacao', 'descanso', 'posse'], intensity: 'normal' } });
	const before = await worldSnapshot(db, room, coach);
	await command(coach, 'ready', { value: true });
	await command(assistant, 'ready', { value: true });
	await expect(command(coach, 'advance')).rejects.toMatchObject({ status: 409 });
	connected.add(athlete);
	await command(athlete, 'ready', { value: true });
	const pulse = (profile = coach) => updateLiveRound(db, room, profile, { action: 'pulse' }, connection);
	await expect(pulse(stranger)).rejects.toMatchObject({ status: 404 });
	let session = (await pulse()).session!;
	const issue = async (profile: string, action: string, options: Record<string, unknown> = {}, op = randomUUID()) => {
		const result = await updateLiveRound(db, room, profile, { action, session: session.id, sequence: session.sequence, op, ...options }, connection);
		session = result.session!;
	};
	expect(session.phase).toBe('LOADING');
	expect(session.fixtures.length).toBeGreaterThan(2);
	await issue(coach, 'loaded');
	await issue(assistant, 'loaded');
	now += 5000;
	expect((await pulse()).session?.phase).toBe('LOADING');
	await issue(athlete, 'loaded');
	now += 4000;
	session = (await pulse()).session!;
	expect(session.phase).toBe('PRESENTATION');
	now += 13000;
	session = (await pulse()).session!;
	expect(session.phase).toBe('FIRST_HALF');
	connected.delete(athlete);
	now += 3000;
	session = (await pulse()).session!;
	expect(session.suspended).toBe(true);
	expect(session.tick).toBe(0);
	connected.add(athlete);
	for (let i = 0; i < 600 && session.phase === 'FIRST_HALF'; i++) {
		now += 1600;
		session = (await pulse()).session!;
	}
	expect(session.phase).toBe('HALF_TIME');
	expect(session.fixtures.every((f) => f.phase === 'half_time')).toBe(true);
	const officialAtHalf = session.relevant!.match.score;
	const side = session.relevant!.side;
	const outgoing = session.relevant!.match.players.filter((p) => p.side === side).slice(1, 3);
	const bench = session.relevant!.match.teams[side].bench.filter((p) => p.position !== 'GOL').slice(0, 2);
	const firstSub = { type: 'sub', outId: outgoing[0].id, inId: bench[0].id };
	await expect(issue(assistant, 'decision', { decision: firstSub })).rejects.toMatchObject({ status: 403 });
	await expect(issue(athlete, 'decision', { decision: firstSub })).rejects.toMatchObject({ status: 403 });
	await issue(assistant, 'suggest', { decision: { type: 'mentality', value: 'ofensiva' } });
	const op = randomUUID();
	await issue(coach, 'decision', { decision: firstSub }, op);
	await issue(coach, 'decision', { decision: firstSub }, op);
	await issue(coach, 'decision', { decision: { type: 'sub', outId: outgoing[1].id, inId: bench[1].id } });
	expect(session.relevant?.match.decisions.filter((item) => item.side === side && item.decision.type === 'sub')).toHaveLength(2);
	expect(session.relevant?.match.score).toEqual(officialAtHalf);
	await issue(coach, 'confirm', { value: true });
	await issue(assistant, 'confirm', { value: true });
	now += 5000;
	session = (await pulse()).session!;
	expect(session.phase).toBe('HALF_TIME');
	const expected = session.relevant?.match;
	forgetRound(session.id);
	expect((await pulse()).session?.relevant?.match).toEqual(expected);
	expect((await worldSnapshot(db, room, coach)).date).toBe(before.date);
	await issue(athlete, 'confirm', { value: true });
	expect(session.phase).toBe('SECOND_HALF');
	for (let i = 0; i < 600 && session.phase === 'SECOND_HALF'; i++) {
		now += 1600;
		session = (await pulse()).session!;
	}
	expect(session.phase).toBe('FULL_TIME');
	const official = session.relevant!.match.score;
	now += 5000;
	const end = await Promise.all([pulse(), pulse(assistant)]);
	expect(end.filter((x) => x.revision)).toHaveLength(1);
	const after = await worldSnapshot(db, room, coach);
	expect(after.live).toBe(false);
	expect(after.date).not.toBe(before.date);
	expect(after.last.some((x) => [x.home, x.away].includes('flamengo') && x.homeGoals === official.home && x.awayGoals === official.away)).toBe(true);
}, 150000);

it('aceita apenas atividades gerais previstas no protocolo de presença', () => {
	expect(parseClientMessage('{"t":"activity","value":"mercado"}')).toEqual({ t: 'activity', value: 'mercado' });
	expect(parseClientMessage('{"t":"activity","value":"meus detalhes privados"}')).toBeNull();
});

it('migra uma cópia de sala da Dev 0.7 sem modificar membros e progresso', async () => {
	const old = await createPgliteDb();
	try {
		const { MIGRATIONS } = await import('#lib/server/db/migrate.ts');
		await runMigrations(old, MIGRATIONS.filter((m) => m.version < '0007'));
		const profile = (await createGuestProfile(old)).profile.id;
		const room = await createRoom(old, profile, 'Universo anterior');
		const saved = { date: '2027-02-04', step: 3, participants: { [profile]: { role: 'coach', ready: false, club: 'flamengo' } } };
		await old.query('INSERT INTO room_worlds (room_id,revision,state) VALUES ($1,4,$2::jsonb)', [room.id, JSON.stringify(saved)]);
		expect(await runMigrations(old)).toEqual(['0007_live_rounds']);
		expect(await old.query('SELECT revision,state FROM room_worlds WHERE room_id=$1', [room.id])).toEqual([{ revision: 4, state: saved }]);
		expect(await old.query('SELECT profile_id FROM room_members WHERE room_id=$1', [room.id])).toEqual([{ profile_id: profile }]);
		expect(await runMigrations(old)).toEqual([]);
	} finally { await old.close(); }
}, 25000);
