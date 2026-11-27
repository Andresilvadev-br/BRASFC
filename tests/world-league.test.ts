import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateCreateCareer } from '#lib/domain/career.ts';
import { visibleSquadAge } from '#lib/domain/squad.ts';
import { passTurn } from '#lib/server/local-turns.ts';
import { italianPostseason } from '#lib/domain/italian-postseason.ts';
import { activeDivisions, divisionStandings, germanPlayoffs, italianPlayoffs, type DivisionId } from '#lib/domain/league.ts';
import { GERMAN_FIRST, GERMAN_SECOND, GERMAN_THIRD, germanPlayoffPlan, germanPromotionCandidates, sanitizeGermanPlayoffs, settleGermanPlayoffs } from '#lib/domain/german-playoffs.ts';
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
import { initialWorldSupercups, worldSupercupDefinitions } from '#lib/data/world/2026/supercups.ts';
import { settleTournament, tournamentView } from '#lib/domain/tournaments.ts';

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
		expect(playable).toEqual(['league/eng/1', 'league/esp/1', 'league/esp/2', 'league/fra/1', 'league/ger/1', 'league/ger/2', 'league/ger/3', 'league/ita/1', 'league/ita/2']);
		expect(divs.find((d) => d.id === 'league/ned/1')).toMatchObject({ playable: false });
		expect(divs.find((d) => d.id === 'league/esp/2')).toMatchObject({ playable: true, teams: 22 });
		const spain = worldCountries(CATALOG).find((c) => c.code === 'esp')!;
		expect(spain.playable).toBe(true);
		expect(spain.clubCount).toBe(46);
		expect(worldCountries(CATALOG).find((country) => country.code === 'ita')?.clubCount).toBe(44);
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
		expect(Object.keys(ger.league.divisions).sort()).toEqual([GERMAN_FIRST, GERMAN_SECOND, GERMAN_THIRD]);
		expect(ger.league.divisions['league/ger/2' as never]).toHaveLength(18);
		expect(ger.league.divisions['league/ger/3' as never]).toHaveLength(20);
		expect(ger.league.reserves![GERMAN_THIRD]).toHaveLength(4);
		expect(ger.snapshot.players['world/ger/sv-meppen'].some((r) => r[1] === 'Noah Oberbeck' && r[2] === 23 && r[4] === 'GOL')).toBe(true);
		expect(worldCountries(CATALOG).find(({ code }) => code === 'ger')?.load.matches).toBe(997);
	});

	it('pula filiais na 3. Liga e grava a decisão dos dois playoffs empatados', () => {
		const plan = buildWorldPlan(['ger'], CATALOG)!;
		const table = (division: string) => plan.league.divisions[division as DivisionId]!.map((clubId, i, clubs) => ({
			clubId, position: i + 1, played: (clubs.length - 1) * 2, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0
		}));
		const third = table(GERMAN_THIRD);
		const reserves = third.filter((r) => ['world/ger/tsg-1899-hoffenheim-ii', 'world/ger/vfb-stuttgart-ii'].includes(r.clubId));
		const thirdOrder = [...reserves, ...germanPromotionCandidates(third)];
		const tables: Parameters<typeof germanPlayoffPlan>[1] = [table(GERMAN_FIRST), table(GERMAN_SECOND), thirdOrder];
		const rounds: [number, number] = [39, 40];
		const pairs = germanPlayoffPlan(rounds, tables, [], {});
		expect(pairs).toHaveLength(2);
		expect(pairs[1].challenger).toBe(germanPromotionCandidates(third)[2].clubId);
		const tied = pairs.flatMap(({ higher, tie }) => rounds.map((round, index) => ({
			competition: higher, round, home: tie[index], away: tie[1 - index], homeGoals: 0, awayGoals: 0
		})));
		expect(germanPlayoffPlan(rounds, tables, tied, {}).every((series) => series.outcome === null)).toBe(true);
		const settled = settleGermanPlayoffs(pairs, {}, 40, tied, 42, () => 68);
		expect(Object.keys(settled)).toHaveLength(2);
		const reloaded = sanitizeGermanPlayoffs(JSON.parse(JSON.stringify(settled)));
		const decided = germanPlayoffPlan(rounds, tables, tied, reloaded);
		expect(reloaded).toEqual(settled);
		expect(decided.every(({ outcome }) => outcome?.decidedBy === 'penaltis' || outcome?.decidedBy === 'prorrogacao')).toBe(true);
	});

	it('prepara as cinco supercopas oficiais, conserva os cruzamentos e reabre a prorrogação italiana', () => {
		const plan = buildWorldPlan(['eng', 'esp', 'fra', 'ger', 'ita'], CATALOG)!;
		const states = initialWorldSupercups(2026, plan.countries, plan.snapshot.clubs.map(({ id }) => id));
		const cups = worldSupercupDefinitions(2026, states);
		expect(cups).toHaveLength(5);
		const spanish = cups.find(({ competition }) => competition.country === 'esp')!;
		const spanishState = states.find(({ id }) => id === spanish.competition.id)!;
		const semi = tournamentView(spanish, spanishState, [], 2, () => 70, 'world/esp/real-madrid');
		expect(semi.participation).toMatchObject({ status: 'aguardando-estreia', nextDate: '2027-02-03' });
		expect(semi.fixtures.map(({ home, away }) => [home, away])).toEqual([
			['world/esp/fc-barcelona', 'world/esp/atletico-madrid'],
			['world/esp/real-sociedad', 'world/esp/real-madrid']
		]);
		const semifinals = semi.fixtures.map((fixture) => ({ ...fixture, homeGoals: 1, awayGoals: 0 }));
		const spanishFinal = tournamentView(spanish, spanishState, semifinals, 2, () => 70, 'world/esp/fc-barcelona');
		expect(spanishFinal.fixtures[2]).toMatchObject({ home: 'world/esp/fc-barcelona', away: 'world/esp/real-sociedad', round: 3, neutral: true });
		const italian = cups.find(({ competition }) => competition.country === 'ita')!;
		const italianState = states.find(({ id }) => id === italian.competition.id)!;
		const view = tournamentView(italian, italianState, [], 2, () => 70, 'world/ita/inter');
		const result = { ...view.fixtures[0], homeGoals: 0, awayGoals: 0 };
		const resolved = tournamentView(italian, italianState, [result], 2, () => 70, 'world/ita/inter');
		const settled = settleTournament(italianState, resolved, 1);
		expect(Object.values(settled.extraTime ?? {})).toHaveLength(1);
		expect(tournamentView(italian, settled, [result], 2, () => 100, 'world/ita/inter').champion).toBe(resolved.champion);
		expect(worldSupercupDefinitions(2027, states)).toEqual([]);
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
			expect(steps).toBe(season === 2026 ? 49 : 46);
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

	it('carrega o adversário continental de um país inativo e grava a final da UEFA', async () => {
		const plan = buildWorldPlan(['fra'], CATALOG)!;
		const { profile } = await createGuestProfile(db);
		const clubId = 'world/fra/psg';
		const rival = 'world/eng/aston-villa';
		const req = validateCreateCareer({ mode: 'coach', personName: 'Ana Europa', clubId, worldSelection: { countries: ['fra'] } }, plan);
		if (!req.ok) throw new Error(JSON.stringify(req.errors));
		const career = await createCareer(db, profile.id, req.value, 91, [], plan);
		const v = careerView(career);
		expect(v.step?.key).toBe('continental/uefa-super-cup:1');
		expect(v.next).toMatchObject({ home: clubId, away: rival, date: '2026-08-12', neutral: true });
		expect(career.data.worldSnapshot?.players[rival].length).toBeGreaterThanOrEqual(16);
		const played = await playRound(db, profile.id, career, { version: career.version, season: 2026, step: v.step!.key });
		expect(played.match?.fixture.competition).toBe('continental/uefa-super-cup');
		const reopened = (await getCareer(db, profile.id, career.id))!;
		const results = await listResults(db, career.id, 2026);
		expect(reopened.data.worldSelection).toEqual({ countries: ['fra'] });
		expect(reopened.data.league?.divisions).not.toHaveProperty('league/eng/1');
		expect(careerView(reopened, results).tournaments.find(({ competition }) => competition.id === 'continental/uefa-super-cup')?.champion).toMatch(/^world\/(fra\/psg|eng\/aston-villa)$/);
	}, 45_000);

	it('a Recopa entra no save brasileiro com o Lanús e os mandos oficiais', async () => {
		const { profile } = await createGuestProfile(db);
		const req = validateCreateCareer({ mode: 'coach', personName: 'Ana Recopa', clubId: 'flamengo', worldSelection: { countries: ['bra'] } });
		if (!req.ok) throw new Error(JSON.stringify(req.errors));
		const career = await createCareer(db, profile.id, req.value, 91);
		let v = careerView(career);
		const id = 'continental/recopa';
		const tournament = v.tournaments.find(({ competition }) => competition.id === id)!;
		expect(tournament.fixtures.map(({ home, away, time }) => [home, away, time])).toEqual([
			['world/arg/lanus', 'flamengo', '21:30'],
			['flamengo', 'world/arg/lanus', '21:30']
		]);
		expect(career.data.worldSnapshot?.players['world/arg/lanus'].length).toBeGreaterThanOrEqual(16);
		const before: RoundInsert[] = [];
		for (const step of v.steps) {
			if (step.key === id + ':1') break;
			v = careerView(career, before);
			expect(v.step?.key).toBe(step.key);
			before.push(...v.stepMatches.map((match) => ({ ...match, homeGoals: 1, awayGoals: 0, season: 2026, isUser: false, seed: 91 })));
		}
		await insertRound(db, career.id, before, ENGINE_VERSION);
		const played = await playRound(db, profile.id, career, { version: career.version, season: 2026, step: id + ':1' });
		expect(played.match?.fixture).toMatchObject({ home: 'world/arg/lanus', away: 'flamengo', competition: id });
		const reopened = (await getCareer(db, profile.id, career.id))!;
		const results = await listResults(db, career.id, 2026);
		expect(careerView(reopened, results).tournaments.find(({ competition }) => competition.id === id)?.participation.status).toBe('em-disputa');
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
			if (season === 2026) {
				const cup = careerView(career, results);
				expect(cup.step?.key).toBe('cup/ita/supercoppa:1');
				career = (await playRound(db, profile.id, career, { version: career.version, step: cup.step!.key, season })).career;
				results = await listResults(db, career.id, season);
				expect(results.filter(({ competition }) => competition === 'cup/ita/supercoppa')).toHaveLength(1);
			}
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
			expect(ended.moves.filter((move) => move.to === ('league/ita/3' as DivisionId))).toHaveLength(4);
			career = (await getCareer(db, profile.id, career.id))!;
			expect(career.season).toBe(season + 1);
			expect(career.data.league?.divisions[first]).toContain(brackets.promoted);
			expect(career.data.league?.reserves?.[second]).toContain(brackets.relegated);
			expect(career.data.league?.divisions[second]).toHaveLength(20);
			expect(career.data.worldSelection).toEqual({ countries: ['ita'] });
		}
		expect(roundsWithPhases).toBe(10);
	}, 120_000);

	it('Alemanha: carreira na 3. Liga, dois playoffs e movimento entre as três divisões', async () => {
		const plan = buildWorldPlan(['ger'], CATALOG)!;
		const clubId = 'world/ger/sv-meppen';
		const { profile } = await createGuestProfile(db);
		const request = validateCreateCareer({ mode: 'coach', personName: 'Ana Mundo', clubId, worldSelection: { countries: ['ger'] } }, plan);
		if (!request.ok) throw new Error(JSON.stringify(request.errors));
		let career = await createCareer(db, profile.id, request.value, 77, [], plan);
		let steps = 0;
		let leagueSteps = 0;
		for (;;) {
			const v = careerView(career, await listResults(db, career.id, career.season));
			if (!v.step) break;
			if (steps === 0) {
				expect(v.divisionLabel).toBe('3. Liga');
				expect(v.squad.some(({ name }) => name === 'Noah Oberbeck')).toBe(true);
			}
			if (v.step.kind === 'league' && ++leagueSteps > 38) expect(v.stepMatches).toHaveLength(2);
			career = (await playRound(db, profile.id, career, { version: career.version, step: v.step.key })).career;
			steps++;
		}
		expect(steps).toBe(41);
		const results = await listResults(db, career.id, career.season);
		expect(results.filter((r) => r.competition === GERMAN_FIRST)).toHaveLength(308);
		expect(results.filter((r) => r.competition === GERMAN_SECOND)).toHaveLength(308);
		expect(results.filter((r) => r.competition === GERMAN_THIRD)).toHaveLength(380);
		career = (await getCareer(db, profile.id, career.id))!;
		const table = (division: string) => divisionStandings(career.data.league!, division as DivisionId, results);
		const down = table(GERMAN_FIRST).slice(-2).map(({ clubId }) => clubId);
		const lowerDown = table(GERMAN_SECOND).slice(-2).map(({ clubId }) => clubId);
		const regionalDown = table(GERMAN_THIRD).slice(-4).map(({ clubId }) => clubId);
		const playoffs = germanPlayoffs(career.data.league!, results);
		expect(playoffs).toHaveLength(2);
		expect(playoffs.every(({ outcome }) => !!outcome)).toBe(true);
		career = (await finishSeason(db, profile.id, career, career.version)).career;
		const next = career.data.league!.divisions;
		expect(next[GERMAN_FIRST as DivisionId]).toHaveLength(18);
		expect(next[GERMAN_SECOND as DivisionId]).toHaveLength(18);
		expect(next[GERMAN_THIRD as DivisionId]).toHaveLength(20);
		expect(next[GERMAN_SECOND as DivisionId]).toEqual(expect.arrayContaining(down));
		expect(next[GERMAN_THIRD as DivisionId]).toEqual(expect.arrayContaining(lowerDown));
		expect(career.data.league!.reserves![GERMAN_THIRD]).toEqual(expect.arrayContaining(regionalDown));
		for (const { outcome, higher, lower } of playoffs) {
			expect(next[higher as DivisionId]).toContain(outcome!.winner);
			expect(next[lower as DivisionId]).toContain(outcome!.loser);
		}
		expect(career.data.league!.germanPlayoffs).toEqual({});
		expect(career.season).toBe(2027);
	}, 600_000);
});
