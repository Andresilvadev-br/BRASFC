import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import '#lib/data/brasil.ts';
import { createPgliteDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { createCareer } from '#lib/server/repos/careers.ts';
import { listResults } from '#lib/server/repos/matches.ts';
import { playRound, RoundError } from '#lib/server/rounds.ts';
import { careerView } from '#lib/domain/view.ts';

let db: Db;
beforeAll(async () => {
	db = await createPgliteDb();
	await runMigrations(db);
});
afterAll(() => db.close());

describe('reenvio de um passo já gravado', () => {
	it('devolve o resultado oficial guardado, sem gravar de novo', async () => {
		const { profile } = await createGuestProfile(db);
		const career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Reenvio', clubId: 'palmeiras', world: 'brasil' });
		const step = careerView(career, await listResults(db, career.id, career.season)).step!.key;
		const first = await playRound(db, profile.id, career, { version: career.version, step });
		const stored = (await listResults(db, career.id, career.season)).length;

		// Mesmo passo de novo, já com a versão nova (o que o navegador faz depois de recarregar a versão).
		const again = await playRound(db, profile.id, first.career, { version: first.career.version, step });
		expect('replay' in again && again.replay).toBe(true);
		expect(again.career.version).toBe(first.career.version);
		expect(again.match?.homeGoals).toBe(first.match?.homeGoals);
		expect(again.match?.awayGoals).toBe(first.match?.awayGoals);
		expect(again.match?.fixture.home).toBe(first.match?.fixture.home);
		expect(again.results.length).toBe(first.results.length);
		expect((await listResults(db, career.id, career.season)).length).toBe(stored);

		// Um passo que ainda não chegou continua sendo recusado.
		await expect(playRound(db, profile.id, first.career, { version: first.career.version, step: 'league:30' })).rejects.toBeInstanceOf(RoundError);
	}, 120_000);
});
