import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresDb, type Db } from '#lib/server/db/index.ts';
import { MIGRATIONS, runMigrations } from '#lib/server/db/migrate.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { createCareer, getCareer, patchCareerData } from '#lib/server/repos/careers.ts';
import { careerView } from '#lib/domain/view.ts';

/**
 * Regressão do PostgreSQL de produção (o PGlite dos outros testes não reproduz):
 * JSON enviado em `$n::jsonb` era codificado duas vezes pelo driver.
 * Roda só com um banco descartável: PG_TEST_URL=postgres://usuario@host:porta/banco
 */
const URL = process.env.PG_TEST_URL;

describe.skipIf(!URL)('PostgreSQL real', () => {
	let db: Db;
	beforeAll(async () => {
		db = await createPostgresDb(URL!);
		await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
		await runMigrations(db);
	});
	afterAll(() => db?.close());

	it('grava a carreira como objeto (criação e atualização)', async () => {
		const { profile } = await createGuestProfile(db);
		const c = await createCareer(db, profile.id, { mode: 'coach', personName: 'Teste PG', clubId: 'sport', world: 'brasil' });
		const p = await patchCareerData(db, profile.id, c.id, { dismissedTips: ['x'] }, c.version);
		const [row] = await db.query<{ t: string }>('SELECT jsonb_typeof(data) AS t FROM careers WHERE id = $1', [c.id]);
		expect(row.t).toBe('object');
		expect(p.data.world).toBe('brasil');
		expect(p.data.dismissedTips).toEqual(['x']);
	});

	it('a migração 0005 recupera saves gravados com codificação dupla', async () => {
		const { profile } = await createGuestProfile(db);
		const c = await createCareer(db, profile.id, { mode: 'coach', personName: 'Save Quebrado', clubId: 'sport', world: 'brasil' });
		const lineup = careerView(c).tactic.lineup;
		const tactic = { formation: '4-3-3', lineup, mentality: 'cautelosa', style: 'posse' };
		// Exatamente o que o driver antigo gravava: string JSON e, depois, lista de strings.
		await db.query('UPDATE careers SET data = to_jsonb($2::text) WHERE id = $1', [c.id, JSON.stringify(c.data)]);
		await db.query('UPDATE careers SET data = data || to_jsonb($2::text) WHERE id = $1', [c.id, JSON.stringify({ tactic })]);
		await db.query('UPDATE careers SET data = data || to_jsonb($2::text) WHERE id = $1', [c.id, JSON.stringify({ dismissedTips: ['a'] })]);
		const [broken] = await db.query<{ t: string }>('SELECT jsonb_typeof(data) AS t FROM careers WHERE id = $1', [c.id]);
		expect(broken.t).toBe('array');

		await db.exec(MIGRATIONS.find((m) => m.version.startsWith('0005'))!.sql);

		const fixed = (await getCareer(db, profile.id, c.id))!;
		expect(fixed.data.world).toBe('brasil');
		expect(fixed.data.league).toEqual(c.data.league);
		expect(fixed.data.tactic).toEqual(tactic);
		expect(fixed.data.dismissedTips).toEqual(['a']);
		const v = careerView(fixed);
		expect(v.division).toBe('serie-b');
		expect(v.tactic.mentality).toBe('cautelosa');
		expect(v.tacticSaved).toBe(true);
	});

	it('a migração não mexe em dados corretos', async () => {
		const { profile } = await createGuestProfile(db);
		const c = await createCareer(db, profile.id, { mode: 'coach', personName: 'Save Bom', clubId: 'aurora' });
		await db.exec(MIGRATIONS.find((m) => m.version.startsWith('0005'))!.sql);
		expect((await getCareer(db, profile.id, c.id))!.data).toEqual(c.data);
	});
});
