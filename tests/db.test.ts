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
		career = await patchCareerData(db, profile.id, career.id, { trainingPlan: { sessions: ['formacao', 'posse', 'descanso', 'defesa', 'funcoes'], intensity: 'normal' } }, career.version);
		const reloaded = (await getCareer(db, profile.id, career.id))!;
		expect(reloaded.data.trainingPlan?.sessions).toContain('funcoes');
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

	it('carreira Brasil: passos de liga e de Copa em ordem, sem duplicar, com Série D e Copa gravadas', async () => {
		const { careerView } = await import('#lib/domain/view.ts');
		const { playRound, RoundError } = await import('#lib/server/rounds.ts');
		const { listResults } = await import('#lib/server/repos/matches.ts');
		const { profile } = await createGuestProfile(db);
		let career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Técnico Copa', clubId: 'fortaleza', world: 'brasil' });
		expect(career.data.cup?.entrants['2']).toContain('fortaleza');
		const seen: string[] = [];
		// Até a 2ª fase da Copa (quarta após a 5ª rodada), onde o Fortaleza estreia.
		for (let i = 0; i < 8; i++) {
			const v = careerView(career, await listResults(db, career.id, career.season));
			const res = await playRound(db, profile.id, career, { version: career.version, step: v.step!.key });
			seen.push(res.step);
			career = res.career;
		}
		expect(seen).toEqual(['league:1', 'league:2', 'league:3', 'cup:1', 'league:4', 'league:5', 'cup:2', 'league:6']);
		const results = await listResults(db, career.id, career.season);
		const cupRows = results.filter((r) => r.competition === 'copa-do-brasil');
		expect(cupRows.filter((r) => r.round === 1)).toHaveLength(14);
		expect(cupRows.filter((r) => r.round === 2)).toHaveLength(44);
		expect(cupRows.some((r) => r.round === 2 && (r.home === 'fortaleza' || r.away === 'fortaleza'))).toBe(true);
		expect(results.filter((r) => r.competition === 'serie-d' && r.round === 1)).toHaveLength(48);
		// Passo repetido ou fora de ordem é recusado (nada é gravado duas vezes).
		await expect(playRound(db, profile.id, career, { version: career.version, step: 'cup:2' })).rejects.toBeInstanceOf(RoundError);
		await expect(playRound(db, profile.id, career, { version: career.version, step: 'league:8' })).rejects.toBeInstanceOf(RoundError);
		expect((await listResults(db, career.id, career.season)).length).toBe(results.length);
		const v = careerView(career, results);
		expect(v.cup!.stages).toHaveLength(2);
		expect(v.step!.key).toBe('league:7');
	}, 120_000);

	it('temporada inteira pelo servidor: saldo bate com os lançamentos, títulos e artilharia gravados, próxima temporada com Série C de 24', async () => {
		const { careerView } = await import('#lib/domain/view.ts');
		const { playRound, finishSeason } = await import('#lib/server/rounds.ts');
		const { listResults } = await import('#lib/server/repos/matches.ts');
		const { listLedger, listHistory } = await import('#lib/server/repos/management.ts');
		const { clubStateOf } = await import('#lib/domain/world.ts');
		const { profile } = await createGuestProfile(db);
		let career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Técnico Temporada', clubId: 'mirassol', world: 'brasil' });
		const start = clubStateOf(career).balance;
		let steps = 0;
		for (;;) {
			const v = careerView(career, await listResults(db, career.id, career.season));
			if (!v.step) break;
			career = (await playRound(db, profile.id, career, { version: career.version, step: v.step.key })).career;
			steps++;
		}
		expect(steps).toBe(38 + 13);
		const ledger = await listLedger(db, career.id, 2026);
		const end = clubStateOf(career).balance;
		expect(end).toBe(start + ledger.reduce((s, l) => s + l.amount, 0));
		expect(ledger.some((l) => l.category === 'salarios')).toBe(true);
		expect(ledger.some((l) => l.category === 'bilheteria')).toBe(true);
		const res = await finishSeason(db, profile.id, career, career.version);
		expect(res.career.season).toBe(2027);
		expect(res.career.data.league!.divisions['serie-c']).toHaveLength(24);
		expect(res.career.data.cup?.season).toBe(2027);
		const history = await listHistory(db, career.id);
		expect(history.filter((h) => h.kind === 'campeao').map((h) => h.competition).sort()).toEqual(['copa-do-brasil', 'serie-a', 'serie-b', 'serie-c', 'serie-d']);
		expect(history.some((h) => h.kind === 'artilharia')).toBe(true);
		const after = clubStateOf(res.career);
		expect(after.board.objectives.length).toBeGreaterThan(0);
		// Saldo após o fechamento = saldo anterior + lançamentos do fechamento.
		const all = await listLedger(db, career.id, 2026);
		expect(after.balance).toBe(start + all.reduce((s, l) => s + l.amount, 0));
		// Dev 0.5: universo vivo, gabinete e comissão técnica persistidos e consistentes.
		const { universeIssues } = await import('#lib/domain/universe.ts');
		const u = res.career.data.universe!;
		const { universePreview } = await import('#lib/domain/universe.ts');
		const { universeCoach } = await import('#lib/domain/matchday.ts');
		const { clubId } = res.career;
		const opponent = Object.keys(u.clubs).find((id) => id !== clubId && u.clubs[id].coachId)!;
		const preview = universePreview(u, [clubId, opponent])!;
		expect(Buffer.byteLength(JSON.stringify(preview))).toBeLessThan(Buffer.byteLength(JSON.stringify(u)) / 10);
		expect(universeCoach({ data: { universe: preview } }, opponent)).toEqual(universeCoach(res.career, opponent));
		const reloaded = (await getCareer(db, profile.id, career.id))!;
		expect(reloaded.data.universe).toEqual(u);
		expect((await listCareers(db, profile.id, true))[0].data.universe).toBeUndefined();
		expect(u.season).toBe(2027);
		expect(universeIssues(u)).toEqual([]);
		expect(u.news.length).toBeGreaterThan(0);
		expect(u.log).toHaveLength(1);
		expect(Object.values(u.records.titles).reduce((a, b) => a + b, 0)).toBe(5);
		const office = res.career.data.office!;
		expect(office.history).toHaveLength(1);
		const userGames = (await listResults(db, career.id, 2026)).filter((r) => r.home === 'mirassol' || r.away === 'mirassol').length;
		expect(office.totals.games).toBe(userGames);
		expect(office.history[0].games).toBe(userGames);
		expect(ledger.some((l) => l.description === 'Salários da comissão técnica')).toBe(true);
	}, 400_000);

	it('save da Dev 0.3 (Brasil sem Série D e sem Copa) continua e ganha a Série D na troca de temporada', async () => {
		const { careerView } = await import('#lib/domain/view.ts');
		const { closeSeason } = await import('#lib/domain/league.ts');
		const { profile } = await createGuestProfile(db);
		const c = await createCareer(db, profile.id, { mode: 'coach', personName: 'Save 0.3', clubId: 'bahia', world: 'brasil' });
		const legacyLeague = { ...c.data.league!, divisions: { 'serie-a': c.data.league!.divisions['serie-a'], 'serie-b': c.data.league!.divisions['serie-b'], 'serie-c': c.data.league!.divisions['serie-c'] }, groups: undefined, pool: undefined, cGroups: null };
		await db.query(`UPDATE careers SET data = data - 'cup' || jsonb_build_object('league', $2::jsonb) WHERE id = $1`, [c.id, JSON.stringify(legacyLeague)]);
		const legacy = (await getCareer(db, profile.id, c.id))!;
		const v = careerView(legacy);
		expect(v.cup).toBeNull();
		expect(v.steps.every((s) => s.kind === 'league')).toBe(true);
		expect(v.fixtures.some((f) => f.competition === 'serie-d')).toBe(false);
		const out = closeSeason(v.league, []);
		expect(out.next.divisions['serie-c']).toHaveLength(24);
		expect(out.next.divisions['serie-d']).toHaveLength(96);
		// Sem Série D simulada em 2026, sobem os acessos REAIS da Série D 2026.
		expect(out.moves.filter((m) => m.to === 'serie-c' && m.reason === 'acesso').map((m) => m.clubId).sort()).toEqual(['abc', 'asa', 'gama', 'goiatuba', 'nacional-am', 'uberlandia']);
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
