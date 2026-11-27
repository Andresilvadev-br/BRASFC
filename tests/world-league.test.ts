import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateCreateCareer } from '#lib/domain/career.ts';
import { visibleSquadAge } from '#lib/domain/squad.ts';
import { passTurn } from '#lib/server/local-turns.ts';
import { italianPostseason } from '#lib/domain/italian-postseason.ts';
import { activeDivisions, divisionStandings, italianPlayoffs, type DivisionId } from '#lib/domain/league.ts';
import { careerView } from '#lib/domain/view.ts';
import { europeanRoundDates, worldStandings } from '#lib/domain/world-league.ts';
import { createPgliteDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { insertRound, listResults, type RoundInsert } from '#lib/server/repos/matches.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { createCareer, getCareer } from '#lib/server/repos/careers.ts';
import { finishSeason, playRound } from '#lib/server/rounds.ts';
import { buildWorldPlan, worldDivisions } from '#lib/server/world-league.ts';
import { ENGINE_VERSION } from '#lib/engine/types.ts';
import { worldCountries } from '#lib/server/world-countries.ts';

/** Catálogo embutido no instalador (desktop/assets/world), instalado como o app faz na primeira abertura. */
const require = createRequire(import.meta.url);
const { installBundledCatalog } = require('../desktop/world-catalog-install.js') as { installBundledCatalog: (src: string, dest: string) => { id: string } };
const catalogs = join(mkdtempSync(join(tmpdir(), 'brasfc-world-')), 'world-catalogs');
process.env.BRASFC_WORLD_CATALOGS = catalogs;
const { id: CATALOG } = installBundledCatalog('desktop/assets/world', catalogs);

describe('World Database · calendário e critérios', () => {
	it('temporada europeia: 38 rodadas de meados de agosto ao fim de maio, sem datas FIFA', () => {
		const dates = europeanRoundDates(2026, 38);
		expect(dates).toHaveLength(38);
		expect(dates[0]).toBe('2026-08-16');
		expect(dates.at(-1)! <= '2027-05-30').toBe(true);
		expect(new Set(dates).size).toBe(38);
		for (const fifa of ['2026-09-06', '2026-10-11', '2026-11-15', '2027-03-28']) expect(dates).not.toContain(fifa);
	});

	it('confronto direto decide empate em pontos (Espanha/Itália); saldo nas demais', () => {
		const results = [
			{ home: 'a', away: 'b', homeGoals: 1, awayGoals: 0 }, { home: 'b', away: 'a', homeGoals: 0, awayGoals: 0 },
			{ home: 'a', away: 'c', homeGoals: 1, awayGoals: 0 }, { home: 'c', away: 'a', homeGoals: 1, awayGoals: 0 },
			{ home: 'b', away: 'c', homeGoals: 5, awayGoals: 0 }, { home: 'c', away: 'b', homeGoals: 0, awayGoals: 1 }
		];
		// a e b com 7 pontos; b tem saldo melhor (+5 x +1), a venceu o confronto direto (4 x 1).
		expect(worldStandings(['a', 'b', 'c'], results, 'confronto-direto').map((r) => r.clubId)).toEqual(['a', 'b', 'c']);
		expect(worldStandings(['a', 'b', 'c'], results, 'saldo').map((r) => r.clubId)).toEqual(['b', 'a', 'c']);
	});
});

describe('World Database · divisões jogáveis', () => {
	it('só divisões com todos os inscritos 2026/27 conferidos', () => {
		const divs = worldDivisions(CATALOG);
		const playable = divs.filter((d) => d.playable).map((d) => d.id).sort();
		expect(playable).toEqual(['league/eng/1', 'league/esp/1', 'league/esp/2', 'league/fra/1', 'league/ger/1', 'league/ger/2', 'league/ita/1', 'league/ita/2']);
		expect(divs.find((d) => d.id === 'league/ned/1')).toMatchObject({ playable: false });
		expect(divs.find((d) => d.id === 'league/esp/2')).toMatchObject({ playable: true, teams: 22 });
		const spain = worldCountries(CATALOG).find((c) => c.code === 'esp')!;
		expect(spain.playable).toBe(true);
		expect(spain.divisions.find((d) => d.id === 'league/esp/1')!.clubs).toHaveLength(20);
	});

	it('monta a liga da carreira: elite e 2ª divisão jogáveis, regras e elencos no save', () => {
		const plan = buildWorldPlan(['esp'], CATALOG)!;
		expect(plan.league.world).toBe('mundo');
		expect(plan.league.divisions['league/esp/1' as never]).toHaveLength(20);
		expect(plan.league.divisions['league/esp/2' as never]).toHaveLength(22);
		expect(plan.league.reserves!['league/esp/2']).toHaveLength(4);
		expect(plan.league.rules!['league/esp/1']).toMatchObject({ name: 'LaLiga', legs: 2, relegated: 3, tiebreak: 'confronto-direto' });
		expect(plan.snapshot.clubs).toHaveLength(46);
		expect(Object.values(plan.snapshot.players).every((p) => p.length >= 16)).toBe(true);
		expect(buildWorldPlan(['bra'], CATALOG)).toBeNull();
		expect(buildWorldPlan(['ned'], CATALOG)).toBeNull();
		const eng = buildWorldPlan(['eng'], CATALOG)!;
		expect(eng.league.rules!['league/eng/1']).toMatchObject({ name: 'Premier League', relegated: 3, tiebreak: 'saldo' });
		expect(eng.league.divisions['league/eng/1' as never]).toContain('world/eng/coventry-city');
		expect(eng.league.reserves!['league/eng/1']).toContain('world/eng/west-ham-united');
		const ger = buildWorldPlan(['ger'], CATALOG)!;
		expect(Object.keys(ger.league.divisions).sort()).toEqual(['league/ger/1', 'league/ger/2']);
		expect(ger.league.divisions['league/ger/2' as never]).toHaveLength(18);
	});
});

describe('World Database · duas temporadas na Espanha pelo servidor', () => {
	let db: Db;
	beforeAll(async () => {
		db = await createPgliteDb();
		await runMigrations(db);
	});
	afterAll(() => db.close());

	it('LaLiga 2026/27 e 2027/28: calendário, tabela, rebaixamento e acesso, save reaberto', async () => {
		const plan = buildWorldPlan(['esp'], CATALOG)!;
		const clubId = 'world/esp/real-madrid';
		expect(plan.league.divisions['league/esp/1' as never]).toContain(clubId);
		const { profile } = await createGuestProfile(db);
		let career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Ana Mundo', clubId, world: 'mundo', worldSelection: { countries: ['esp'] } }, 4242, [], plan);
		expect(career.season).toBe(2026);
		expect(career.gameDate).toBe('2026-08-02');

		for (const season of [2026, 2027]) {
			let steps = 0;
			for (;;) {
				const v = careerView(career, await listResults(db, career.id, career.season));
				if (!v.step) break;
				if (steps === 0) {
					expect(v.divisionLabel).toBe('LaLiga');
					expect(v.step.date.startsWith(`${season}-08`)).toBe(true);
					expect(v.squad.length).toBeGreaterThanOrEqual(16);
				}
				career = (await playRound(db, profile.id, career, { version: career.version, step: v.step.key })).career;
				steps++;
			}
			expect(steps).toBe(46);
			const results = await listResults(db, career.id, career.season);
			expect(results.filter((r) => r.competition === 'league/esp/1')).toHaveLength(380);
			expect(results.filter((r) => r.competition === 'league/esp/2')).toHaveLength(468);
			const before = careerView(career, results);
			expect(before.standings.every((r) => r.played === 38)).toBe(true);
			const last = [...before.standings].slice(-3).map((r) => r.clubId);
			const res = await finishSeason(db, profile.id, career, career.version);
			career = res.career;
			expect(career.season).toBe(season + 1);
			expect(career.gameDate).toBe(`${season + 1}-08-02`);
			const elite = career.data.league!.divisions['league/esp/1' as never] as string[];
			expect(elite).toHaveLength(20);
			for (const id of last) expect(elite).not.toContain(id);
			expect(career.data.league!.divisions['league/esp/2' as never]).toEqual(expect.arrayContaining(last));
			expect(career.data.league!.divisions['league/esp/2' as never]).toHaveLength(22);
		}
		// Reaberto do banco: mesma liga, mesmo elenco.
		const reloaded = (await getCareer(db, profile.id, career.id))!;
		expect(careerView(reloaded).squad.map((p) => p.id)).toEqual(careerView(career).squad.map((p) => p.id));
	}, 600_000);

	it('permite começar com o Tenerife e compartilhar a Espanha com um segundo treinador', async () => {
		const plan = buildWorldPlan(['esp'], CATALOG)!;
		const { profile } = await createGuestProfile(db);
		const request = validateCreateCareer({ mode: 'coach', personName: 'Ana Mundo', clubId: 'world/esp/cd-tenerife', worldSelection: { countries: ['esp'] } }, plan);
		if (!request.ok) throw new Error(JSON.stringify(request.errors));
		const created = await createCareer(db, profile.id, request.value, 91, [{ personName: 'Bruno Mundo', clubId: 'world/esp/real-madrid' }], plan);
		const view = careerView(created);
		expect(view.divisionLabel).toBe('LaLiga Hypermotion');
		expect(view.squad.length).toBeGreaterThanOrEqual(22);
		expect(view.squad.every((player) => visibleSquadAge(player) === null)).toBe(true);
		const turn = await passTurn(db, profile.id, created, created.version);
		expect(turn.career.data.worldSelection).toEqual({ countries: ['esp'] });
		const played = await playRound(db, profile.id, turn.career, { version: turn.career.version, step: 'league:1' });
		expect(played.coaches?.map(({ match }) => match?.fixture.competition)).toEqual(['league/esp/2', 'league/esp/1']);
		const reloaded = (await getCareer(db, profile.id, created.id))!;
		expect(reloaded.data.worldSelection).toEqual({ countries: ['esp'] });
		expect(reloaded.clubId).toBe(created.clubId);
	}, 45_000);

	it('Serie B: dois anos com acesso, play-out e gravação da rodada', async () => {
		const plan = buildWorldPlan(['ita'], CATALOG)!;
		const { profile } = await createGuestProfile(db);
		const first = 'league/ita/1' as DivisionId;
		const second = 'league/ita/2' as DivisionId;
		const input = validateCreateCareer({ mode: 'coach', personName: 'Ana Italia', clubId: 'world/ita/ascoli-calcio', worldSelection: { countries: ['ita'] } }, plan);
		if (!input.ok) throw new Error(JSON.stringify(input.errors));
		let career = await createCareer(db, profile.id, input.value, 777, [], plan);
		let roundsWithPhases = 0;
		for (const season of [2026, 2027]) {
			const initial = careerView(career);
			expect(activeDivisions(initial.league)).toEqual([first, second]);
			const simulated: RoundInsert[] = initial.fixtures.map((fixture) => ({
				...fixture, season, homeGoals: 1, awayGoals: 1, isUser: false, seed: 777
			}));
			expect(simulated).toHaveLength(760);
			await insertRound(db, career.id, simulated, ENGINE_VERSION);
			let results = await listResults(db, career.id, season);
			const split = careerView(career, results);
			expect(split.step?.key).toBe('league:39');
			expect(italianPlayoffs(split.league, results)).toMatchObject({ complete: true, promotion: true, playout: true });
			while (true) {
				const view = careerView(career, results);
				if (!view.step) break;
				expect(view.stepMatches.every((fixture) => fixture.competition === second)).toBe(true);
				career = (await playRound(db, profile.id, career, { version: career.version, step: view.step.key })).career;
				results = await listResults(db, career.id, season);
				roundsWithPhases++;
			}
			const played = careerView(career, results);
			const brackets = italianPlayoffs(played.league, results)!;
			expect(brackets.promoted).toBeTruthy();
			expect(brackets.relegated).toBeTruthy();
			expect(results.filter((result) => result.competition === second)).toHaveLength(390);
			const table = divisionStandings(played.league, second, results);
			const automatic = table.map((row) => ({ ...row }));
			automatic[2].points = automatic[3].points + 15;
			automatic[15].points = automatic[16].points + 5;
			expect(italianPostseason(automatic, 38, [], {})).toMatchObject({ promotion: false, playout: false, series: [], promoted: automatic[2].clubId, relegated: automatic[16].clubId });
			const ended = await finishSeason(db, profile.id, career, career.version);
			expect(ended.moves.filter((move) => move.to === first)).toHaveLength(3);
			expect(ended.moves.filter((move) => move.to === 'league/ita/3')).toHaveLength(4);
			career = (await getCareer(db, profile.id, career.id))!;
			expect(career.season).toBe(season + 1);
			expect(career.data.league?.divisions[first]).toContain(brackets.promoted);
			expect(career.data.league?.reserves?.[second]).toContain(brackets.relegated);
			expect(career.data.league?.divisions[second]).toHaveLength(20);
			expect(career.data.worldSelection).toEqual({ countries: ['ita'] });
		}
		expect(roundsWithPhases).toBe(10);
	}, 120_000);

	it('Alemanha: Bundesliga e 2. Bundesliga jogáveis, acesso e rebaixamento entre elas', async () => {
		const plan = buildWorldPlan(['ger'], CATALOG)!;
		const clubId = 'world/ger/fc-schalke-04';
		const { profile } = await createGuestProfile(db);
		let career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Ana Mundo', clubId, world: 'mundo', worldSelection: { countries: ['ger'] } }, 77, [], plan);
		let steps = 0;
		for (;;) {
			const v = careerView(career, await listResults(db, career.id, career.season));
			if (!v.step) break;
			if (steps === 0) expect(v.divisionLabel).toBe('Bundesliga');
			career = (await playRound(db, profile.id, career, { version: career.version, step: v.step.key })).career;
			steps++;
		}
		expect(steps).toBe(34);
		const results = await listResults(db, career.id, career.season);
		expect(results.filter((r) => r.competition === 'league/ger/1')).toHaveLength(306);
		expect(results.filter((r) => r.competition === 'league/ger/2')).toHaveLength(306);
		const elite = careerView(career, results).standings.map((r) => r.clubId);
		const down = elite.slice(-2);
		career = (await finishSeason(db, profile.id, career, career.version)).career;
		const next = career.data.league!.divisions;
		expect(next['league/ger/1' as never]).toHaveLength(18);
		expect(next['league/ger/2' as never]).toHaveLength(18);
		for (const id of down) expect(next['league/ger/2' as never]).toContain(id);
	}, 600_000);
});
