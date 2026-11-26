import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { careerView } from '#lib/domain/view.ts';
import { europeanRoundDates, worldStandings } from '#lib/domain/world-league.ts';
import { createPgliteDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { listResults } from '#lib/server/repos/matches.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { createCareer, getCareer } from '#lib/server/repos/careers.ts';
import { finishSeason, playRound } from '#lib/server/rounds.ts';
import { buildWorldPlan, worldDivisions } from '#lib/server/world-league.ts';
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
		expect(playable).toEqual(['league/esp/1', 'league/ita/1']);
		expect(divs.find((d) => d.id === 'league/esp/2')).toMatchObject({ playable: false, teams: 22 });
		const spain = worldCountries(CATALOG).find((c) => c.code === 'esp')!;
		expect(spain.playable).toBe(true);
		expect(spain.divisions.find((d) => d.id === 'league/esp/1')!.clubs).toHaveLength(20);
	});

	it('monta a liga da carreira: elite jogável, 2ª divisão como reserva de acesso, regras e elencos no save', () => {
		const plan = buildWorldPlan(['esp'], CATALOG)!;
		expect(plan.league.world).toBe('mundo');
		expect(plan.league.divisions['league/esp/1' as never]).toHaveLength(20);
		expect(plan.league.reserves!['league/esp/1']).toHaveLength(18);
		expect(plan.league.rules!['league/esp/1']).toMatchObject({ name: 'LaLiga', legs: 2, relegated: 3, tiebreak: 'confronto-direto' });
		expect(plan.snapshot.clubs).toHaveLength(38);
		expect(Object.values(plan.snapshot.players).every((p) => p.length >= 16)).toBe(true);
		expect(buildWorldPlan(['bra'], CATALOG)).toBeNull();
		expect(buildWorldPlan(['eng'], CATALOG)).toBeNull();
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
			expect(steps).toBe(38);
			const results = await listResults(db, career.id, career.season);
			expect(results.filter((r) => r.competition === 'league/esp/1')).toHaveLength(380);
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
			expect(career.data.league!.reserves!['league/esp/1']).toEqual(expect.arrayContaining(last));
		}
		// Reaberto do banco: mesma liga, mesmo elenco.
		const reloaded = (await getCareer(db, profile.id, career.id))!;
		expect(careerView(reloaded).squad.map((p) => p.id)).toEqual(careerView(career).squad.map((p) => p.id));
	}, 600_000);
});
