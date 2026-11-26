import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seasonSteps } from '#lib/domain/calendar.ts';
import { initialCareerData, validateCreateCareer, type CreateCareerInput } from '#lib/domain/career.ts';
import { CUP_ID, initialCup } from '#lib/domain/cup.ts';
import { closeSeason, divisionOf, initialLeague, prepareRound, sanitizeLeague, seasonFixtures, type LeagueSelection } from '#lib/domain/league.ts';
import { projectCoach } from '#lib/domain/turns.ts';
import { careerView } from '#lib/domain/view.ts';
import { clubStateOf, rosterContext } from '#lib/domain/world.ts';
import { ENGINE_VERSION } from '#lib/engine/types.ts';
import { createPgliteDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { passTurn } from '#lib/server/local-turns.ts';
import { marketIndex, marketProfile, queryMarket } from '#lib/server/market-search.ts';
import { CareerLimitError, createCareer, getCareer } from '#lib/server/repos/careers.ts';
import { insertRound, listResults } from '#lib/server/repos/matches.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { finishSeason, planRound, playRound, SeasonSelectionRequired } from '#lib/server/rounds.ts';

const selectedA: LeagueSelection = { divisions: ['serie-a'], cup: false };
const input: CreateCareerInput = { world: 'brasil', mode: 'coach', clubId: 'flamengo', personName: 'Ana Silva', leagueSelection: selectedA };

describe('seleção de divisões do save', () => {
	it('normaliza as divisões e rejeita escalação inicial fora do calendário', () => {
		expect(validateCreateCareer({ ...input, leagueSelection: { divisions: ['serie-c', 'serie-a'], cup: true } }))
			.toMatchObject({ ok: true, value: { leagueSelection: { divisions: ['serie-a', 'serie-c'], cup: true } } });
		for (const divisions of [[], ['serie-a', 'serie-a'], ['liga-brasfc'], ['inventada']]) {
			expect(validateCreateCareer({ ...input, leagueSelection: { divisions, cup: false } })).toMatchObject({ ok: false, errors: { leagueSelection: expect.any(String) } });
		}
		expect(validateCreateCareer({ ...input, clubId: 'sport' })).toMatchObject({ ok: false, errors: { clubId: expect.any(String) } });
		expect(initialCareerData(input, 111).cup).toBeUndefined();
	});

	it('agenda só a Série D ativa e mantém a Copa até a final quando selecionada', () => {
		const league = initialLeague('brasil', 2026, { divisions: ['serie-d'], cup: true });
		expect(new Set(seasonFixtures(league, 777).map((f) => f.competition))).toEqual(new Set(['serie-d']));
		const steps = seasonSteps(league, initialCup(2026));
		expect(steps.filter((s) => s.kind === 'league')).toHaveLength(22);
		expect(steps.at(-1)?.key).toBe('cup:13');
		expect(prepareRound(league, 20, [], 777, () => 70).cGroups).toBeNull();
		const legacy = sanitizeLeague(initialLeague('brasil', 2026), 'brasil', 2026);
		expect(seasonSteps(legacy, null)).toHaveLength(38);
		expect(new Set(seasonFixtures(legacy, 777).map((f) => f.competition)).size).toBe(4);
	});

	it('resolve acessos e quedas sem estatísticas de divisões inativas', () => {
		let league = initialLeague('brasil', 2026, selectedA);
		for (const expectedC of [24, 28, 28]) {
			const year = closeSeason(league, [], 777);
			expect(closeSeason(league, [], 777)).toEqual(year);
			expect(Object.keys(year.tables)).toEqual(['serie-a']);
			expect(Object.keys(year.champions)).toEqual(['serie-a']);
			const { divisions } = year.next;
			expect(Object.values(divisions).map((ids) => ids.length)).toEqual([20, 20, expectedC, 96]);
			const ids = Object.values(divisions).flat();
			expect(new Set(ids).size).toBe(ids.length);
			expect(year.next.selection).toEqual(selectedA);
			league = year.next;
		}
	});
});

describe('carreira offline com seleção persistida', () => {
	let db: Db;
	beforeAll(async () => {
		db = await createPgliteDb();
		await runMigrations(db);
	});
	afterAll(async () => db?.close());

	it('filtra todos os treinadores, simula apenas as divisões escolhidas e negocia com o catálogo inativo', async () => {
		const { profile } = await createGuestProfile(db);
		const selection: LeagueSelection = { divisions: ['serie-a', 'serie-c'], cup: true };
		const draft = { ...input, leagueSelection: selection };
		await expect(createCareer(db, profile.id, draft, 777, [{ personName: 'Bia', clubId: 'sport' }])).rejects.toBeInstanceOf(CareerLimitError);
		const clubC = initialLeague('brasil', 2026).divisions['serie-c']![0];
		const created = await createCareer(db, profile.id, draft, 777, [{ personName: 'Bia', clubId: clubC }]);
		const turn = await passTurn(db, profile.id, created, created.version);
		expect(turn.career.clubId).toBe(clubC);
		const restored = (await getCareer(db, profile.id, created.id))!;
		expect(projectCoach(restored, 0).data.league?.selection).toEqual(selection);
		const results = await listResults(db, restored.id, restored.season);
		const plan = planRound(restored, results)!;
		expect(new Set(plan.fixtures.map((f) => f.competition))).toEqual(new Set(['serie-a', 'serie-c']));
		expect(plan.fixtures.every(plan.full)).toBe(true);
		const played = await playRound(db, profile.id, restored, { version: restored.version, step: plan.step.key });
		expect(played.career.clubId).toBe('flamengo');
		const saved = await listResults(db, created.id, 2026);
		expect(saved).toHaveLength(plan.fixtures.length);
		expect(new Set(saved.map((r) => r.competition))).toEqual(new Set(['serie-a', 'serie-c']));

		const view = careerView(played.career, saved);
		expect(Object.keys(played.career.data.universe!.clubs)).toHaveLength(40);
		const index = marketIndex('test:active-leagues:1', played.career.clubId, rosterContext(played.career, view.league), view.league, clubStateOf(played.career, view.league));
		const market = queryMarket(index, { club: 'sport', division: 'serie-b' });
		expect(market.rows.length).toBeGreaterThan(0);
		expect(marketProfile(index, market.rows[0].id)?.club).toBe('sport');

		const beforeCup = view.fixtures.filter((f) => f.round <= 3).map((f) => ({ ...f, homeGoals: 1, awayGoals: 0 }));
		const cupPlan = planRound(played.career, beforeCup)!;
		expect(cupPlan.fixtures.every((f) => f.competition === CUP_ID)).toBe(true);
		expect(cupPlan.fixtures.some((f) => !selection.divisions.includes(divisionOf(cupPlan.league, f.home)!))).toBe(true);
	});

	it('confirma a divisão de destino antes de gravar a nova temporada', async () => {
		const { profile } = await createGuestProfile(db);
		const career = await createCareer(db, profile.id, input, 777);
		const fixtures = seasonFixtures(career.data.league!, career.seed);
		await insertRound(db, career.id, fixtures.map((f) => ({
			...f, season: career.season, homeGoals: f.home === career.clubId ? 0 : 1,
			awayGoals: f.home === career.clubId ? 3 : 0, seed: career.seed, isUser: false
		})), ENGINE_VERSION);
		await expect(finishSeason(db, profile.id, career, career.version)).rejects.toBeInstanceOf(SeasonSelectionRequired);
		expect(await getCareer(db, profile.id, career.id)).toMatchObject({ season: 2026, version: career.version });
		const ended = await finishSeason(db, profile.id, career, career.version, ['serie-b']);
		expect(ended.summary.outcome).toBe('rebaixado');
		expect(ended.career).toMatchObject({ season: 2027, data: { league: { selection: { divisions: ['serie-a', 'serie-b'], cup: false } } } });
		expect(careerView(ended.career).next?.competition).toBe('serie-b');
		expect(ended.career.data.cup).toBeUndefined();
	});
});
