import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgliteDb, type Db } from '#lib/server/db/index.ts';
import { currentMigration, MIGRATIONS, runMigrations } from '#lib/server/db/migrate.ts';
import { createGuestProfile, findProfileByToken, renameProfile } from '#lib/server/repos/profiles.ts';
import {
	createCareer,
	deleteCareer,
	getCareer,
	listCareers,
	listMessages,
	markMessagesRead,
	patchCareerData,
	VersionConflictError
} from '#lib/server/repos/careers.ts';
import { createRoom, getRoomByCode, joinRoom, leaveRoom, listMembers, RoomError } from '#lib/server/repos/rooms.ts';

let db: Db;

beforeAll(async () => {
	db = await createPgliteDb();
	await runMigrations(db);
});
afterAll(() => db.close());

describe('migrações', () => {
	it('aplica todas e é idempotente', async () => {
		expect(await currentMigration(db)).toBe(MIGRATIONS.at(-1)!.version);
		expect(await runMigrations(db)).toEqual([]);
	});
});

describe('perfis', () => {
	it('cria convidado, encontra pelo token e nunca guarda o token puro', async () => {
		const { profile, token } = await createGuestProfile(db);
		expect((await findProfileByToken(db, token))?.id).toBe(profile.id);
		expect(await findProfileByToken(db, 'token-invalido')).toBeNull();
		const raw = await db.query<{ token_hash: string }>('SELECT token_hash FROM profiles WHERE id = $1', [profile.id]);
		expect(raw[0].token_hash).not.toBe(token);
		expect((await renameProfile(db, profile.id, 'Técnico Teste'))?.displayName).toBe('Técnico Teste');
	});
});

describe('carreiras', () => {
	it('cria, lista, atualiza com versão e exclui — isoladas por perfil', async () => {
		const a = (await createGuestProfile(db)).profile;
		const b = (await createGuestProfile(db)).profile;
		const career = await createCareer(db, a.id, { mode: 'coach', personName: 'Ana Souza', clubId: 'aurora' });
		expect(career.gameDate).toBe('2027-01-11');
		expect(career.unreadMessages).toBeGreaterThan(0);

		expect((await listCareers(db, a.id)).map((c) => c.id)).toEqual([career.id]);
		expect(await listCareers(db, b.id)).toEqual([]);
		expect(await getCareer(db, b.id, career.id)).toBeNull();

		const updated = await patchCareerData(db, a.id, career.id, { trainingFocus: 'fisico' }, career.version);
		expect(updated.version).toBe(career.version + 1);
		expect(updated.data.trainingFocus).toBe('fisico');
		await expect(patchCareerData(db, a.id, career.id, { trainingFocus: 'tatico' }, career.version)).rejects.toBeInstanceOf(
			VersionConflictError
		);

		const messages = await listMessages(db, a.id, career.id);
		expect(messages.length).toBeGreaterThan(0);
		expect(await markMessagesRead(db, b.id, career.id, null)).toBe(0);
		expect(await markMessagesRead(db, a.id, career.id, messages[0].id)).toBe(1);
		expect(await markMessagesRead(db, a.id, career.id, null)).toBe(messages.length - 1);
		expect((await getCareer(db, a.id, career.id))?.unreadMessages).toBe(0);

		expect(await deleteCareer(db, b.id, career.id)).toBe(false);
		expect(await deleteCareer(db, a.id, career.id)).toBe(true);
		expect(await listMessages(db, a.id, career.id)).toEqual([]);
	});

	it('guarda os atributos iniciais da carreira de jogador', async () => {
		const p = (await createGuestProfile(db)).profile;
		const c = await createCareer(db, p.id, {
			mode: 'player',
			personName: 'Léo Prado',
			clubId: 'juriti',
			position: 'ATA',
			appearance: { skin: 1, hairColor: 2, hairStyle: 'cacheado' }
		});
		expect(c.data.player?.age).toBe(18);
		expect(c.data.position).toBe('ATA');
		expect(c.data.appearance?.hairStyle).toBe('cacheado');
	});
});

describe('salas', () => {
	it('cria com código, aceita membros e encerra quando o dono sai', async () => {
		const owner = (await createGuestProfile(db)).profile;
		const guest = (await createGuestProfile(db)).profile;
		const room = await createRoom(db, owner.id, 'Liga dos Amigos');
		expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
		await joinRoom(db, room.code, guest.id);
		await joinRoom(db, room.code, guest.id); // idempotente
		expect((await listMembers(db, room.id)).map((m) => m.role)).toEqual(['owner', 'member']);

		expect(await leaveRoom(db, room, guest.id)).toBe('left');
		expect(await leaveRoom(db, room, owner.id)).toBe('closed');
		expect((await getRoomByCode(db, room.code))?.status).toBe('closed');
		await expect(joinRoom(db, room.code, guest.id)).rejects.toBeInstanceOf(RoomError);
		await expect(joinRoom(db, 'ZZZZZZ', guest.id)).rejects.toMatchObject({ status: 404 });
	});
});

describe('partidas da carreira (Dev 0.2/0.3)', () => {
	it('tática salva sobrevive ao jsonb; servidor reproduz a rodada e ignora adulteração', async () => {
		const { careerView } = await import('#lib/domain/view.ts');
		const { fixtureSetup, newFixtureMatch } = await import('#lib/domain/matchday.ts');
		const { sameTactic } = await import('#lib/domain/tactics.ts');
		const { playRound, matchdayContext, RoundError } = await import('#lib/server/rounds.ts');
		const { listResults, listUserMatches } = await import('#lib/server/repos/matches.ts');

		const { profile } = await createGuestProfile(db);
		let career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Técnico Partida', clubId: 'aurora' });
		const v0 = careerView(career);
		const tactic = { ...v0.tactic, mentality: 'ofensiva' as const, style: 'pressao' as const };
		career = await patchCareerData(db, profile.id, career.id, { tactic }, career.version);
		const reloaded = (await getCareer(db, profile.id, career.id))!;
		const view = careerView(reloaded, await listResults(db, career.id, reloaded.season));
		expect(view.tacticSaved).toBe(true);
		expect(sameTactic(view.tactic, { ...tactic, roles: view.tactic.roles })).toBe(true);

		// "Cliente": joga com uma substituição usando o MESMO contexto que o servidor usa.
		const ctx = await matchdayContext(db, reloaded);
		const fixture = view.next!;
		const setup = fixtureSetup(reloaded, fixture, view.tactic, ctx);
		const live = newFixtureMatch(reloaded, fixture, view.tactic, ctx);
		for (let i = 0; i < 55 * 60; i++) live.step();
		const side = setup.control!;
		live.submit(side, { type: 'sub', outId: live.onPitch(side).find((s) => s.slot === 10)!.id, inId: live.bench(side)[2].id });
		const played = live.runToEnd();
		const mine = played.decisions.filter((d) => d.side === side);

		// Adulteração: decisões do lado da IA e um "placar" no corpo não têm efeito.
		const forged = [...mine, { tick: 100, side: side === 'home' ? 'away' : 'home', decision: { type: 'mentality', value: 'defensiva' } }];
		const res = await playRound(db, profile.id, reloaded, { version: reloaded.version, round: fixture.round, decisions: forged as never });
		expect([res.match!.homeGoals, res.match!.awayGoals]).toEqual([played.homeGoals, played.awayGoals]);
		await expect(playRound(db, profile.id, res.career, { version: res.career.version - 1, round: fixture.round + 1 })).rejects.toBeInstanceOf(RoundError);
		await expect(playRound(db, profile.id, res.career, { version: res.career.version, round: fixture.round })).rejects.toBeInstanceOf(RoundError);

		const results = await listResults(db, career.id, reloaded.season);
		expect(results).toHaveLength(10);
		const after = careerView(res.career, results);
		expect(after.nextRound).toBe(fixture.round + 1);
		expect(after.standings.reduce((s, r) => s + r.played, 0)).toBe(20);
		// aprendizado e condição física persistidos
		expect(after.tactical.formations[tactic.formation]).toBeGreaterThan(view.tactical.formations[tactic.formation]);
		expect(Object.keys(res.career.data.fitness ?? {}).length).toBeGreaterThan(15);
		const [userMatch] = await listUserMatches(db, career.id);
		expect(userMatch.summary.tactic?.formation).toBe(tactic.formation);
	});

	it('save da Dev 0.2 (sem mundo/tático) abre e continua na liga fictícia', async () => {
		const { careerView } = await import('#lib/domain/view.ts');
		const { profile } = await createGuestProfile(db);
		const c = await createCareer(db, profile.id, { mode: 'coach', personName: 'Save Antigo', clubId: 'cerrado' });
		// simula o formato antigo: só tática + foco de treino
		await db.query(`UPDATE careers SET data = '{"trainingFocus":"tatico","tactic":{"style":"jogo-direto","lineup":[],"formation":"4-4-2","mentality":"cautelosa"}}'::jsonb WHERE id = $1`, [c.id]);
		const legacy = (await getCareer(db, profile.id, c.id))!;
		const v = careerView(legacy);
		expect(v.world).toBe('brasfc');
		expect(v.division).toBe('liga-brasfc');
		expect(v.next?.round).toBe(1);
		expect(v.tactical.formations['4-3-3']).toBeGreaterThan(0);
	});
});
