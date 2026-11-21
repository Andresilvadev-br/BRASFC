import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initialCareerData, validateCreateCareer } from '#lib/domain/career.ts';
import { addDays } from '#lib/domain/dates.ts';
import { CAREER_PLAYER_ID, fixtureSetup, selectionOf } from '#lib/domain/matchday.ts';
import { SOUTH_AMERICAN_COUNTRIES, playerDevelopmentFactor } from '#lib/domain/player-profile.ts';
import { adjustedOverall, playerAttributes, advancePlayerDays, playerState, trainBlock } from '#lib/domain/player-development.ts';
import { playerHistory } from '#lib/domain/playerstats.ts';
import { careerView } from '#lib/domain/view.ts';
import { createPgliteDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { applyPlayerAction } from '#lib/server/player-actions.ts';
import { createCareer, getCareer, saveCareerProgress, VersionConflictError } from '#lib/server/repos/careers.ts';
import { listResults, listStatMatches, listUserMatches } from '#lib/server/repos/matches.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { finishSeason, matchdayContext, playRound } from '#lib/server/rounds.ts';

let db: Db;
beforeAll(async () => {
	db = await createPgliteDb();
	await runMigrations(db);
});
afterAll(() => db?.close());

const input = {
	mode: 'player', personName: 'Lia Prates', clubId: 'juriti', world: 'brasfc',
	position: 'GOL', nationality: 'Uruguai', foot: 'esquerdo', age: 29,
	appearance: { skin: 2, hairColor: 0, hairStyle: 'longo', sleeves: 'longa', shirt: 'fora', socks: 'alto' }
};

describe('Dev 0.6 · Carreira de Jogador', () => {
	it('aceita somente as nacionalidades sul-americanas, idades inteiras dentro da faixa e os três pés', () => {
		expect(SOUTH_AMERICAN_COUNTRIES).toHaveLength(12);
		for (const nationality of SOUTH_AMERICAN_COUNTRIES) {
			expect(validateCreateCareer({ ...input, nationality, foot:'ambidestro', age:16 })).toMatchObject({
				ok:true, value:{ nationality, foot:'ambidestro', age:16 }
			});
		}
		expect(validateCreateCareer({ ...input, nationality:'Portugal', age:'35', foot:'nenhum' })).toMatchObject({
			ok:false, errors:{ nationality:expect.any(String), age:expect.any(String), foot:expect.any(String) }
		});
		expect(validateCreateCareer({ ...input, age:35 }).ok).toBe(true);
		expect(validateCreateCareer({ ...input, age:36 }).ok).toBe(false);
		expect(validateCreateCareer({ ...input, age:18.5 }).ok).toBe(false);
		const right = initialCareerData({ ...input, mode:'player', world:'brasfc', position:'PD', foot:'direito', appearance:undefined, age:17 }, 532).player!;
		const both = playerAttributes(532, 'PD', { ...right, foot:'ambidestro' }).attributes;
		const open = playerAttributes(532, 'PD', right).attributes;
		expect(both.cruzamento).toBe(open.cruzamento - 1);
		expect(both.finalizacao).toBe(open.finalizacao + 1);
		const older = initialCareerData({ ...input, mode:'player', world:'brasfc', position:'PD', foot:'direito', appearance:undefined, age:34 }, 532).player!;
		expect(older.overall).toBeGreaterThan(right.overall);
		expect(right.potential - right.overall).toBeGreaterThan(older.potential - older.overall);
		expect(playerDevelopmentFactor(right.age)).toBeGreaterThan(playerDevelopmentFactor(older.age));
	});

	it('salva treinos, registra avaliação no motor, negocia e recarrega após transferência', async () => {
		const parsed = validateCreateCareer(input);
		if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
		expect(validateCreateCareer({ ...input, age: 12 }).ok).toBe(false);
		const { profile } = await createGuestProfile(db);
		let c = await createCareer(db, profile.id, parsed.value);
		expect(c.data.player).toMatchObject({ age: 29, nationality: 'Uruguai', foot: 'esquerdo' });
		expect(c.data.appearance).toMatchObject({ sleeves: 'longa', shirt: 'fora' });
		const coach = await createCareer(db, profile.id, { ...parsed.value, mode: 'coach' });

		const view = () => listResults(db, c.id, c.season).then((results) => careerView(c, results));
		const act = async (body: Record<string, unknown>) => {
			const out = applyPlayerAction(c, await view(), body);
			c = await saveCareerProgress(db, profile.id, c.id, { gameDate: c.gameDate, clubId: out.clubId, data: { playerCareer: out.state } }, c.version);
		};
		const v0 = await view();
		const previousVersion = c.version;
		await act({ action: 'jogador-treinar', date: c.gameDate, focus: 'goleiro' });
		await act({ action: 'jogador-treinar', date: addDays(c.gameDate, 1), focus: 'goleiro' });
		expect(() => applyPlayerAction(c, v0, { action: 'jogador-treinar', date: addDays(c.gameDate, 2), focus: 'goleiro' })).toThrow(/duas sessões/);
		await expect(saveCareerProgress(db, profile.id, c.id, { gameDate: c.gameDate, data: {} }, previousVersion)).rejects.toBeInstanceOf(VersionConflictError);

		const ctx = await matchdayContext(db, c, v0);
		const fixture = v0.next!;
		const setup = fixtureSetup(c, fixture, v0.tactic, ctx);
		const initial = playerState(c, v0.division)!;
		const projected = advancePlayerDays(c, initial, fixture.date, v0.clubFixtures.map((f) => f.date));
		expect(projected.daily.gains.reflexos).toBeGreaterThan(0);
		expect(adjustedOverall(c, projected)).toBeGreaterThanOrEqual(adjustedOverall(c, initial));
		const round = await playRound(db, profile.id, c, { version: c.version, step: v0.step!.key });
		expect(round.match?.summary.assessment?.selection).toBe(selectionOf(setup[setup.mySide]));
		const matches = await listUserMatches(db, c.id);
		expect(matches[0]?.summary.assessment?.objective).toMatch(/defesas/);
		const stats = await listStatMatches(db, c.id, CAREER_PLAYER_ID);
		expect(playerHistory(stats, CAREER_PLAYER_ID)).toEqual(playerHistory(matches, CAREER_PLAYER_ID));
		expect(Object.keys(stats[0].summary.players).every((id) => id === CAREER_PLAYER_ID)).toBe(true);
		c = round.career;
		expect(c.data.playerCareer!.daily.earnings).toBeGreaterThan(0);

		const origin = c.clubId;
		await act({ action: 'jogador-sondar', kind: 'compra' });
		const offer = c.data.playerCareer!.offers.find((o) => o.countered === undefined && o.kind === 'compra')!;
		const oldWage = offer.wage;
		await act({ action: 'jogador-contraproposta', offerId: offer.id });
		expect(c.data.playerCareer!.offers.find((o) => o.id === offer.id)?.wage).toBeGreaterThan(oldWage);
		expect(offer.wage).toBe(oldWage);
		expect(offer.countered).toBeUndefined();
		await act({ action: 'jogador-aceitar', offerId: offer.id });
		expect(c.clubId).not.toBe(origin);
		expect(c.clubId).toBe(offer.clubId);
		const loaded = await getCareer(db, profile.id, c.id);
		expect(loaded?.data.playerCareer?.daily.clubs.at(-1)).toMatchObject({ clubId: c.clubId, kind: 'compra' });
		expect(loaded?.data.playerCareer?.daily.gains.reflexos).toBeGreaterThan(0);
		expect(await getCareer(db, profile.id, coach.id)).toMatchObject({ clubId: origin, mode: 'coach', version: coach.version });
	});

	it('persiste a resposta da imprensa e o patrocínio e recusa ações duplicadas', async () => {
		const { profile } = await createGuestProfile(db);
		const parsed = validateCreateCareer(input);
		if (!parsed.ok) throw new Error('Perfil inválido.');
		const c = await createCareer(db, profile.id, parsed.value);
		const v = careerView(c);
		const state = playerState(c, v.division)!;
		state.reputation = 50;
		state.daily.support.fans = 60;
		state.daily.press = { date: c.gameDate, kind: 'espaco' };
		const initial = await saveCareerProgress(db, profile.id, c.id, { gameDate: c.gameDate, data: { playerCareer: state } }, c.version);
		const response = applyPlayerAction(initial, v, { action: 'jogador-entrevista', date: c.gameDate, choice: 'ambicao' });
		expect(response.state.reputation).toBeGreaterThan(state.reputation);
		expect(response.state.daily.press).toBeNull();
		const interviewed = await saveCareerProgress(db, profile.id, c.id, { gameDate: c.gameDate, data: { playerCareer: response.state } }, initial.version);
		expect(() => applyPlayerAction(interviewed, v, { action: 'jogador-entrevista', date: c.gameDate, choice: 'ambicao' })).toThrow(/indisponível/);
		const branded = applyPlayerAction(interviewed, v, { action: 'jogador-patrocinio' });
		await saveCareerProgress(db, profile.id, c.id, { gameDate: c.gameDate, data: { playerCareer: branded.state } }, interviewed.version);
		const loaded = (await getCareer(db, profile.id, c.id))!;
		expect(loaded.data.playerCareer?.daily.sponsor?.monthly).toBeGreaterThan(0);
		expect(() => applyPlayerAction(loaded, v, { action: 'jogador-patrocinio' })).toThrow(/Nenhuma proposta/);
		const tomorrow = addDays(c.gameDate, 1);
		expect(advancePlayerDays(loaded, branded.state, tomorrow, []).daily.earnings)
			.toBeGreaterThan(advancePlayerDays(interviewed, response.state, tomorrow, []).daily.earnings);
	});

	it('usa os dados do save antigo e afasta o jogador lesionado da convocação', async () => {
		const { profile } = await createGuestProfile(db);
		const parsed = validateCreateCareer(input);
		if (!parsed.ok) throw new Error('Perfil inválido.');
		const c = await createCareer(db, profile.id, parsed.value);
		const current = c.data.playerCareer!;
		const old = { ...c, data: { ...c.data, playerCareer: { ...current, daily: undefined }, fitness: { eu: 68 } } } as unknown as typeof c;
		expect(playerState(old, 'liga-brasfc')?.daily.condition).toBe(68);

		const v = careerView(c);
		const state = playerState(c, v.division)!;
		state.daily.injuryUntil = addDays(v.next!.date, 8);
		expect(trainBlock(c.gameDate, c.gameDate, [], state, v.step!.date)).toMatch(/médica/);
		const injured = { ...c, data: { ...c.data, playerCareer: state } };
		const ctx = await matchdayContext(db, injured, v);
		const setup = fixtureSetup(injured, v.next!, v.tactic, ctx);
		expect(selectionOf(setup[setup.mySide])).toBe('fora');
		expect(setup[setup.mySide].players.some((p) => p.id === CAREER_PLAYER_ID)).toBe(false);
	});

	it('registra o empréstimo no save e retorna ao clube de origem ao fechar a temporada', async () => {
		const { profile } = await createGuestProfile(db);
		const parsed = validateCreateCareer(input);
		if (!parsed.ok) throw new Error('Perfil inválido.');
		let c = await createCareer(db, profile.id, parsed.value);
		const v = careerView(c);
		const search = applyPlayerAction(c, v, { action: 'jogador-sondar', kind: 'emprestimo' });
		c = await saveCareerProgress(db, profile.id, c.id, { gameDate: c.gameDate, data: { playerCareer: search.state } }, c.version);
		const move = applyPlayerAction(c, careerView(c), { action: 'jogador-aceitar', offerId: search.state.offers[0].id });
		c = await saveCareerProgress(db, profile.id, c.id, { gameDate: c.gameDate, clubId: move.clubId, data: { playerCareer: move.state } }, c.version);
		expect(c.data.playerCareer?.daily.loan).toEqual({ parent: input.clubId, until: c.season });

		// Registra os resultados da liga para exercitar o fechamento, sem executar 38 rodadas.
		for (const fixture of careerView(c).fixtures) {
			await db.query(`INSERT INTO career_matches (career_id, season, round, competition, home, away, home_goals, away_goals, seed, engine_version) VALUES ($1,$2,$3,$4,$5,$6,0,0,0,'teste')`, [c.id, c.season, fixture.round, fixture.competition, fixture.home, fixture.away]);
		}
		const closed = await finishSeason(db, profile.id, c, c.version);
		expect(closed.career.clubId).toBe(input.clubId);
		expect(closed.career.data.playerCareer?.daily.loan).toBeNull();
		expect(closed.career.data.playerCareer?.daily.clubs.at(-1)?.kind).toBe('retorno');
		expect(closed.career.data.player?.age).toBe(input.age + 1);
		const renewed = applyPlayerAction(closed.career, careerView(closed.career), { action: 'jogador-negociar', years: 3 });
		const pending = await saveCareerProgress(db, profile.id, c.id, { gameDate: closed.career.gameDate, data: { playerCareer: renewed.state } }, closed.career.version);
		const signed = applyPlayerAction(pending, careerView(pending), { action: 'jogador-renovar' });
		expect(signed.state.contract.until).toBe(closed.career.season + 2);
		expect(signed.state.daily.renewal).toBeNull();
	});
});
