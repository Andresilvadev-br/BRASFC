import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgliteDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import {
	cleanCareerLabel,
	createCareer,
	deleteCareer,
	getCareer,
	listCareers,
	listMessages,
	patchCareerData,
	renameCareer,
	saveCareerProgress,
	touchCareer,
	VersionConflictError
} from '#lib/server/repos/careers.ts';
import { createRoom, getRoomByCode, joinRoom, leaveRoom } from '#lib/server/repos/rooms.ts';
import { latestValidSave, saveCompetition, saveIssue, saveTitle, sortSaves } from '#lib/domain/saves.ts';

/** Central de carreiras (0.10): vários saves por perfil, isolamento, exclusão segura e compatibilidade. */
let db: Db;
beforeAll(async () => {
	db = await createPgliteDb();
	await runMigrations(db);
});
afterAll(() => db.close());

const tick = () => new Promise((r) => setTimeout(r, 15));

async function twoCareers() {
	const { profile } = await createGuestProfile(db);
	const coach = await createCareer(db, profile.id, { mode: 'coach', personName: 'Ana Técnica', clubId: 'fortaleza', world: 'brasil' });
	await tick();
	const player = await createCareer(db, profile.id, { mode: 'player', personName: 'Léo Atacante', clubId: 'juriti', position: 'ATA' });
	return { profile, coach, player };
}

describe('biblioteca de carreiras', () => {
	it('mantém duas carreiras independentes com progresso diferente', async () => {
		const { profile, coach, player } = await twoCareers();
		expect(coach.id).not.toBe(player.id);
		await patchCareerData(db, profile.id, coach.id, { trainingFocus: 'tatico' } as never, coach.version);
		await saveCareerProgress(db, profile.id, player.id, { gameDate: '2026-02-15', data: { playerFocus: 'finalizacao' } }, player.version);

		const a = (await getCareer(db, profile.id, coach.id))!;
		const b = (await getCareer(db, profile.id, player.id))!;
		expect(a.data.trainingFocus).toBe('tatico');
		expect(a.data.playerFocus).toBeUndefined();
		expect(a.gameDate).toBe(coach.gameDate);
		expect(b.data.playerFocus).toBe('finalizacao');
		expect(b.data.trainingFocus).toBeUndefined();
		expect(b.gameDate).toBe('2026-02-15');
		// Alternar entre elas não mistura nada: cada leitura devolve o próprio save.
		for (let i = 0; i < 3; i++) {
			expect((await getCareer(db, profile.id, coach.id))!.clubId).toBe('fortaleza');
			expect((await getCareer(db, profile.id, player.id))!.clubId).toBe('juriti');
		}
	});

	it('"Continuar" abre a carreira de treinador usada por último; save de jogador fica como legado', async () => {
		const { profile, coach, player } = await twoCareers();
		let list = await listCareers(db, profile.id, true);
		// O save de jogador é o mais recente, mas é legado (0.12): continua guardado e não é oferecido.
		expect(list.some((c) => c.id === player.id)).toBe(true);
		expect(latestValidSave(list)?.id).toBe(coach.id);
		const second = await createCareer(db, profile.id, { mode: 'coach', personName: 'Bia Técnica', clubId: 'aurora' });
		await tick();
		expect(await touchCareer(db, profile.id, coach.id)).toBe(true);
		list = await listCareers(db, profile.id, true);
		expect(latestValidSave(list)?.id).toBe(coach.id);
		await tick();
		expect(await touchCareer(db, profile.id, second.id)).toBe(true);
		list = await listCareers(db, profile.id, true);
		expect(latestValidSave(list)?.id).toBe(second.id);
	});

	it('sobrevive a fechar e reabrir o banco (modo offline em disco)', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'brasfc-saves-'));
		try {
			let disk = await createPgliteDb(dir);
			await runMigrations(disk);
			const { profile } = await createGuestProfile(disk);
			const first = await createCareer(disk, profile.id, { mode: 'coach', personName: 'Primeira', clubId: 'aurora' });
			await tick();
			const second = await createCareer(disk, profile.id, { mode: 'coach', personName: 'Segunda', clubId: 'juriti' });
			await saveCareerProgress(disk, profile.id, second.id, { gameDate: '2026-03-01', data: {} }, second.version);
			const interrupted = new Error('Falha após a atualização, antes do commit');
			await expect(disk.transaction(async (tx) => {
				await saveCareerProgress(tx, profile.id, first.id, { gameDate: '2026-04-01', data: {} }, first.version);
				throw interrupted;
			})).rejects.toBe(interrupted);
			await disk.close();

			disk = await createPgliteDb(dir);
			await runMigrations(disk);
			const list = await listCareers(disk, profile.id, true);
			expect(list.map((c) => c.id).sort()).toEqual([first.id, second.id].sort());
			expect(latestValidSave(list)?.id).toBe(second.id);
			expect(list.find((c) => c.id === second.id)?.gameDate).toBe('2026-03-01');
			expect(list.find((c) => c.id === first.id)).toMatchObject({ gameDate: first.gameDate, version: first.version });
			await disk.close();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('exclui só a carreira escolhida, com os dados dela, sem tocar em outras nem nas ligas', async () => {
		const { profile, coach, player } = await twoCareers();
		const room = await createRoom(db, profile.id, 'Liga dos Amigos');
		expect((await listMessages(db, profile.id, coach.id)).length).toBeGreaterThan(0);

		expect(await deleteCareer(db, profile.id, coach.id)).toBe(true);
		expect(await getCareer(db, profile.id, coach.id)).toBeNull();
		const orphans = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM career_messages WHERE career_id = $1', [coach.id]);
		expect(orphans[0].n).toBe(0);

		expect((await getCareer(db, profile.id, player.id))?.personName).toBe('Léo Atacante');
		expect((await listMessages(db, profile.id, player.id)).length).toBeGreaterThan(0);
		expect(await getRoomByCode(db, room.code)).not.toBeNull();
		// Repetir a exclusão não apaga mais nada.
		expect(await deleteCareer(db, profile.id, coach.id)).toBe(false);
	});

	it('um perfil não exclui nem renomeia a carreira de outro', async () => {
		const { profile, coach } = await twoCareers();
		const intruder = (await createGuestProfile(db)).profile;
		expect(await deleteCareer(db, intruder.id, coach.id)).toBe(false);
		expect(await renameCareer(db, intruder.id, coach.id, 'Invadida')).toBe(false);
		expect(await getCareer(db, profile.id, coach.id)).not.toBeNull();
		expect(await deleteCareer(db, profile.id, 'nao-e-uuid')).toBe(false);
	});

	it('renomeia sem mudar identificador, versão nem progresso', async () => {
		const { profile, coach } = await twoCareers();
		expect(await renameCareer(db, profile.id, coach.id, 'Projeto Leão')).toBe(true);
		const renamed = (await getCareer(db, profile.id, coach.id))!;
		expect(renamed.id).toBe(coach.id);
		expect(renamed.version).toBe(coach.version);
		expect(renamed.label).toBe('Projeto Leão');
		expect(saveTitle(renamed)).toBe('Projeto Leão');
		// Uma aba aberta antes do nome novo continua salvando com a versão que tinha.
		await patchCareerData(db, profile.id, coach.id, { dismissedTips: ['x'] }, coach.version);
		expect((await getCareer(db, profile.id, coach.id))!.label).toBe('Projeto Leão');
		await renameCareer(db, profile.id, coach.id, null);
		expect(saveTitle((await getCareer(db, profile.id, coach.id))!)).toMatch(/Fortaleza/);
	});

	it('valida o nome do save', () => {
		expect(cleanCareerLabel('  Minha   carreira ')).toBe('Minha carreira');
		expect(cleanCareerLabel('')).toBeNull();
		expect(cleanCareerLabel(null)).toBeNull();
		expect(cleanCareerLabel('x'.repeat(41))).toBeUndefined();
		expect(cleanCareerLabel(42)).toBeUndefined();
		expect(cleanCareerLabel('linha\nquebrada')).toBe('linha quebrada');
	});

	it('recusa gravação com versão antiga (falha de salvamento não sobrescreve)', async () => {
		const { profile, coach } = await twoCareers();
		await patchCareerData(db, profile.id, coach.id, { dismissedTips: ['a'] }, coach.version);
		await expect(patchCareerData(db, profile.id, coach.id, { dismissedTips: ['b'] }, coach.version)).rejects.toBeInstanceOf(VersionConflictError);
		expect((await getCareer(db, profile.id, coach.id))!.data.dismissedTips).toEqual(['a']);
	});

	it('marca saves incompatíveis e não os oferece em "Continuar"', async () => {
		const { profile, coach } = await twoCareers();
		await tick();
		await db.query("UPDATE careers SET club_id = 'clube-removido', updated_at = now() WHERE id = $1", [coach.id]);
		const list = await listCareers(db, profile.id, true);
		const broken = list.find((c) => c.id === coach.id)!;
		expect(saveIssue(broken)).toMatch(/clube/);
		expect(latestValidSave(list)?.id).not.toBe(coach.id);
		expect(saveIssue({ ...list[1], mode: 'player', data: {} })).toMatch(/legado/);
		expect(latestValidSave([broken])).toBeUndefined();
	});

	it('mostra saves antigos (sem nome) e a competição real do clube', async () => {
		const { profile } = await twoCareers();
		const list = await listCareers(db, profile.id, true);
		for (const c of list) {
			expect(c.label).toBeNull();
			expect(saveCompetition(c)).toBeTruthy();
		}
		expect(list.find((c) => c.clubId === 'fortaleza')?.division).toMatch(/^serie-/);
	});

	it('organiza por data, tipo e nome', async () => {
		const { profile, coach, player } = await twoCareers();
		const list = await listCareers(db, profile.id, true);
		expect(sortSaves(list, 'recentes')[0].id).toBe(player.id);
		expect(sortSaves(list, 'antigos')[0].id).toBe(coach.id);
		expect(sortSaves(list, 'tipo')[0].mode).toBe('coach');
		expect(sortSaves(list, 'nome').map((c) => c.id)).toHaveLength(2);
	});
});

describe('carreiras compartilhadas', () => {
	it('participante que sai da liga não apaga o universo', async () => {
		const owner = (await createGuestProfile(db)).profile;
		const guest = (await createGuestProfile(db)).profile;
		const room = await createRoom(db, owner.id, 'Liga Compartilhada');
		const own = await createCareer(db, guest.id, { mode: 'coach', personName: 'Convidado', clubId: 'aurora' });
		await joinRoom(db, room.code, guest.id);
		expect(await leaveRoom(db, room, guest.id)).toBe('left');
		expect((await getRoomByCode(db, room.code))?.status).toBe('open');
		// A carreira individual do participante também não é afetada.
		expect(await getCareer(db, guest.id, own.id)).not.toBeNull();
		// E excluir a carreira individual não mexe na liga.
		expect(await deleteCareer(db, guest.id, own.id)).toBe(true);
		expect((await getRoomByCode(db, room.code))?.status).toBe('open');
	});
});
