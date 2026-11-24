import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import '#lib/data/brasil.ts';
import { createPgliteDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { createCareer, patchCareerData } from '#lib/server/repos/careers.ts';
import { listResults } from '#lib/server/repos/matches.ts';
import { planRound, playRound } from '#lib/server/rounds.ts';
import { prefetchRound, prefetchState } from '#lib/server/round-prefetch.ts';
import { careerView } from '#lib/domain/view.ts';
import { simulateOtherFixtures } from '#lib/domain/matchday.ts';

let db: Db;
beforeAll(async () => {
	db = await createPgliteDb();
	await runMigrations(db);
});
afterAll(() => db.close());

const until = async (fn: () => boolean) => {
	for (let i = 0; i < 600 && !fn(); i++) await new Promise((r) => setTimeout(r, 25));
};

describe('Dev 0.12 · pré-cálculo dos demais jogos da rodada', () => {
	it('usa os jogos pré-calculados só com a mesma versão e chega ao mesmo resultado oficial', async () => {
		const { profile } = await createGuestProfile(db);
		let career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Rápido', clubId: 'palmeiras', world: 'brasil' });
		const results = await listResults(db, career.id, career.season);
		const view = careerView(career, results);
		const plan = planRound(career, results, view);
		const mine = plan.fixtures.find((f) => f.home === career.clubId || f.away === career.clubId) ?? null;
		const others = plan.fixtures.filter((f) => f !== mine);
		const expected = simulateOtherFixtures(career, others, { season: career.season, firstSeason: view.firstSeason }, { full: plan.full, strengthOf: plan.strengthOf })
			.map((r) => `${r.home}-${r.away}:${r.homeGoals}x${r.awayGoals}`).sort();

		prefetchRound(db, profile.id, career.id);
		await until(() => prefetchState(career, view.step!.key) === 'pronto');
		expect(prefetchState(career, view.step!.key)).toBe('pronto');
		const fast = await playRound(db, profile.id, career, { version: career.version, step: view.step!.key });
		expect(fast.timings.reaproveitado).toBe(1);
		expect(fast.results.map((r) => `${r.home}-${r.away}:${r.homeGoals}x${r.awayGoals}`).sort()).toEqual(expected);
		career = fast.career;

		// Pré-cálculo feito numa versão e save alterado depois (ex.: tática salva): é descartado.
		const v2 = careerView(career, await listResults(db, career.id, career.season));
		prefetchRound(db, profile.id, career.id);
		await until(() => prefetchState(career, v2.step!.key) === 'pronto');
		career = await patchCareerData(db, profile.id, career.id, { trainingFocus: 'fisico' as never }, career.version);
		const slow = await playRound(db, profile.id, career, { version: career.version, step: v2.step!.key });
		expect(slow.timings.reaproveitado).toBe(0);
	}, 120_000);
});
