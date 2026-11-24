import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import '#lib/data/brasil.ts';
import { createPgliteDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { createCareer, getCareer, listCareers } from '#lib/server/repos/careers.ts';
import { finishSeason, playRound, RoundError } from '#lib/server/rounds.ts';
import { latestValidSave, saveIssue } from '#lib/domain/saves.ts';
import { validateCreateCareer } from '#lib/domain/career.ts';

let db: Db;
beforeAll(async () => {
	db = await createPgliteDb();
	await runMigrations(db);
});
afterAll(() => db.close());

describe('Dev 0.12 · carreira de jogador descontinuada (saves legados)', () => {
	it('não cria carreiras novas de jogador', () => {
		const r = validateCreateCareer({ mode: 'player', personName: 'Léo Atacante', clubId: 'juriti', position: 'ATA' });
		expect(r.ok).toBe(false);
		expect(validateCreateCareer({ personName: 'Ana Técnica', clubId: 'aurora' })).toMatchObject({ ok: true, value: { mode: 'coach' } });
	});

	it('preserva o save antigo sem exclusão silenciosa, mas não o abre nem o joga', async () => {
		const { profile } = await createGuestProfile(db);
		const legacy = await createCareer(db, profile.id, { mode: 'player', personName: 'Léo Atacante', clubId: 'juriti', position: 'ATA' });
		const list = await listCareers(db, profile.id, true);
		const row = list.find((c) => c.id === legacy.id)!;
		expect(row).toBeDefined();
		expect(saveIssue(row)).toMatch(/legado/);
		expect(latestValidSave(list)).toBeUndefined();
		await expect(playRound(db, profile.id, legacy, { version: legacy.version, step: 'league:1' })).rejects.toMatchObject({ status: 410 });
		await expect(finishSeason(db, profile.id, legacy, legacy.version)).rejects.toBeInstanceOf(RoundError);
		// Os dados do atleta continuam intactos no banco.
		const again = (await getCareer(db, profile.id, legacy.id))!;
		expect(again.data.player).toEqual(legacy.data.player);
		expect(again.version).toBe(legacy.version);
	});
});
