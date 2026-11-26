import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '#lib/data/brasil.ts';
import { createPgliteDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { createCareer, getCareer } from '#lib/server/repos/careers.ts';
import { listResults } from '#lib/server/repos/matches.ts';
import { matchdayContext, playRound, RoundError } from '#lib/server/rounds.ts';
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

	it('reabre save em disco com súmula incompleta, relê o placar e avança sem duplicar', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'brasfc-replay-'));
		let disk = await createPgliteDb(dir);
		try {
			await runMigrations(disk);
			const { profile } = await createGuestProfile(disk);
			const c = await createCareer(disk, profile.id, {
				mode: 'coach', personName: 'Ana Silva', clubId: 'flamengo', world: 'brasil',
				leagueSelection: { divisions: ['serie-a'], cup: false }
			}, 777);
			const step = { version: c.version, season: c.season, step: 'league:1' };
			const first = await playRound(disk, profile.id, c, step);
			const official = await listResults(disk, c.id, c.season);
			await disk.query('UPDATE career_matches SET summary = NULL WHERE career_id = $1 AND round = 1 AND is_user', [c.id]);
			await disk.close();
			disk = await createPgliteDb(dir);
			await runMigrations(disk);
			const opened = (await getCareer(disk, profile.id, c.id))!;
			expect((await matchdayContext(disk, opened)).observed).toEqual([]);
			const replay = await playRound(disk, profile.id, opened, step);
			expect(replay).toMatchObject({ replay: true, match: { homeGoals: first.match?.homeGoals, awayGoals: first.match?.awayGoals, summary: null } });
			expect(await listResults(disk, c.id, c.season)).toEqual(official);
			await expect(playRound(disk, profile.id, opened, { ...step, step: 'league:2' })).rejects.toBeInstanceOf(RoundError);
			const second = await playRound(disk, profile.id, opened, { ...step, version: opened.version, step: 'league:2' });
			expect(second.round).toBe(2);
			expect(await listResults(disk, c.id, c.season)).toHaveLength(20);
		} finally {
			await disk.close();
			await rm(dir, { recursive: true, force: true });
		}
	}, 120_000);
});
