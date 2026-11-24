import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgliteDb, createPostgresDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { createRoom, getRoomByCode, joinRoom, leaveRoom } from '#lib/server/repos/rooms.ts';
import { applyWorldCommand, worldClubLineup, worldMarket, worldReplay, worldSnapshot } from '#lib/server/connected-world.ts';
import { clubLineup } from '#lib/domain/club-selection.ts';
import { catalogClub, fixedOpeningFormation, ROSTER_CATALOG } from '#lib/data/roster-catalog.ts';
import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
import { defaultOutfit } from '#lib/domain/wardrobe.ts';
import { simulateMatch } from '#lib/engine/match.ts';

let db: Db;
beforeAll(async () => { db = process.env.PG_WORLD_URL ? await createPostgresDb(process.env.PG_WORLD_URL) : await createPgliteDb(); await runMigrations(db); });
afterAll(async () => { await db.close(); });

describe('universo compartilhado', () => {
	it('persiste papéis, treino, mercado, convocação e uma rodada autoritativa com repetição segura', async () => {
		const [owner, rival, assistant, player, teammate, outsider] = await Promise.all(Array.from({ length: 6 }, () => createGuestProfile(db).then((p) => p.profile.id)));
		const room = await createRoom(db, owner, 'Campeonato de amigos');
		const empty = await worldSnapshot(db, room, owner);
		const first = empty.clubs.find((c) => c.id === 'flamengo')!.id;
		expect(new Set(empty.clubs.map((club) => club.division))).toEqual(new Set(['serie-a', 'serie-b', 'serie-c', 'serie-d']));
		for (const division of ['serie-a', 'serie-b', 'serie-c', 'serie-d']) {
			const id = empty.clubs.find((club) => club.division === division)!.id;
			const opening = catalogClub(ROSTER_CATALOG, id)!;
			const lineup = await worldClubLineup(db, room, owner, id);
			expect(lineup.opening?.source).toBe(opening.source);
			const starters = lineup.starters.map((slot) => slot.player?.cbfId);
			expect(new Set(starters).size).toBe(11);
			expect(starters.every((id) => opening.players.some((player) => player.playerId === id))).toBe(true);
			if (fixedOpeningFormation(ROSTER_CATALOG, opening)) {
				expect(starters).toEqual(opening.players.filter((player) => player.matchRole === 'starter').map((player) => player.playerId));
			}
		}
		await expect(worldClubLineup(db, room, outsider, first)).rejects.toMatchObject({ status: 404 });
		await expect(worldClubLineup(db, room, owner, 'inexistente')).rejects.toMatchObject({ status: 404 });
		for (const profile of [rival, assistant, player, teammate]) await joinRoom(db, room.code, profile);
		const get = (profile: string) => worldSnapshot(db, room, profile);
		const command = async (profile: string, action: string, params: Record<string, unknown> = {}) =>
			applyWorldCommand(db, room, profile, { ...params, action, op: randomUUID(), revision: (await get(profile)).revision });
		await expect(get(outsider)).rejects.toMatchObject({ status: 404 });
		await command(owner, 'assign', { role: 'coach', club: first });
		const look = { ...DEFAULT_APPEARANCE, wardrobe: defaultOutfit('clube') };
		await command(owner, 'appearance', { appearance: look });
		expect((await get(owner)).current?.appearance).toEqual(look);
		const opponent = (await get(owner)).fixture!;
		const second = opponent.home === first ? opponent.away : opponent.home;
		await command(rival, 'assign', { role: 'coach', club: second });
		const flamengoMarket = await worldMarket(db, room, rival, new URLSearchParams('club=flamengo'));
		if (!('rows' in flamengoMarket)) throw new Error('Pesquisa indisponível');
		expect(flamengoMarket.total).toBeGreaterThan(11);
		expect(flamengoMarket.rows.every((player) => player.age === null)).toBe(true);
		await expect(worldMarket(db, room, outsider, new URLSearchParams())).rejects.toMatchObject({ status: 404 });
		// Dev 0.12: não existe mais auxiliar ou atleta humano.
		await expect(command(assistant, 'assign', { role: 'assistant', club: first })).rejects.toMatchObject({ status: 410 });
		const tactic = { ...(await get(owner)).tactic!, mentality: 'ofensiva' };
		await expect(command(rival, 'tactic', { tactic })).rejects.toBeInstanceOf(Error);
		await command(owner, 'tactic', { tactic });
		const saved = await get(owner);
		expect(saved.tactic?.mentality).toBe('ofensiva');
		const preview = await worldClubLineup(db, room, player, first);
		expect(preview).toMatchObject(clubLineup(saved.roster, saved.tactic));
		expect(preview.starters).toHaveLength(11);
		expect(preview.coverage).toBe('documented');
		expect(preview.starters.every((starter) => starter.player?.cbfId)).toBe(true);
		expect(preview.opening?.source).toContain('/1423se.pdf');
		const confirmed = await worldClubLineup(db, room, player, 'palmeiras');
		expect(confirmed.starters.map((starter) => starter.player?.cbfId)).toContain('633571');
		expect(confirmed.bench).toHaveLength(12);
		await command(owner, 'training', { plan: { sessions: ['posse', 'descanso', 'posse', 'descanso', 'posse'], intensity: 'normal' } });
		expect((await get(owner)).plan?.sessions[0]).toBe('posse');
		await expect(command(player, 'assign', { role: 'player', club: first, personName: 'Atleta Um', position: 'ATA', age: 28 })).rejects.toMatchObject({ status: 410 });
		const search = await worldMarket(db, room, owner, new URLSearchParams({ club: second }));
		if (!('rows' in search)) throw new Error('Pesquisa indisponível');
		const talent = search.rows[0];
		const details = await worldMarket(db, room, owner, new URLSearchParams({ player: talent.id }));
		expect(details).toMatchObject({ id: talent.id, humanSeller: rival, isMine: false });
		await command(owner, 'club', { request: { action: 'observar', playerId: talent.id, value: true } });
		expect(await worldMarket(db, room, owner, new URLSearchParams('observed=true'))).toMatchObject({ total: 1 });
		expect(await worldMarket(db, room, rival, new URLSearchParams('observed=true'))).toMatchObject({ total: 0 });
		await command(owner, 'deal', { target: rival, fee: 1000, player: talent.id });
		await expect(command(owner, 'deal', { target: rival, fee: 1000, player: talent.id })).rejects.toMatchObject({ status: 422 });
		const deal = (await get(rival)).deals[0];
		await expect(command(owner, 'accept-deal', { id: deal.id })).rejects.toMatchObject({ status: 409 });
		await command(rival, 'counter-deal', { id: deal.id, fee: 2500 });
		await expect(command(rival, 'accept-deal', { id: deal.id })).rejects.toMatchObject({ status: 409 });
		const buyerBefore = await get(owner);
		const sellerBefore = await get(rival);
		const approval = { action: 'accept-deal', id: deal.id, op: randomUUID(), revision: buyerBefore.revision };
		const attempts = await Promise.all([applyWorldCommand(db, room, owner, approval), applyWorldCommand(db, room, owner, approval)]);
		expect(attempts.filter((item) => item.duplicate)).toHaveLength(1);
		expect((await get(owner)).management?.budget).toBe(buyerBefore.management!.budget - 2500);
		expect((await get(rival)).management?.budget).toBe(sellerBefore.management!.budget + 1250);
		expect(await worldMarket(db, room, owner, new URLSearchParams({ player: talent.id }))).toMatchObject({
			club: first, isMine: true, transfers: [{ from: second, to: first, fee: 2500 }]
		});
		expect((await get(owner)).roster.some((p) => p.id === talent.id)).toBe(true);
		expect((await get(rival)).roster.some((p) => p.id === talent.id)).toBe(false);
		expect((await get(rival)).dealHistory.find((entry) => entry.id === deal.id)?.status).toBe('aceita');
		await expect(command(owner, 'advance')).rejects.toMatchObject({ status: 409 });
		for (const profile of [owner, rival]) await command(profile, 'ready', { value: true });
		const request = { action: 'advance', op: randomUUID(), revision: (await get(owner)).revision };
		const competing = { ...request, op: randomUUID() };
		const race = await Promise.allSettled([
			applyWorldCommand(db, room, owner, request),
			applyWorldCommand(db, room, owner, competing)
		]);
		expect(race.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
		const repeat = await applyWorldCommand(db, room, owner, race[0].status === 'fulfilled' ? request : competing);
		expect(repeat.duplicate).toBe(true);
		const view = await get(owner), rivalView = await get(rival);
		expect(view.revision).toBe(request.revision + 1);
		expect(view.management?.office.totals.games).toBe(1);
		expect(view.calendar.some((item) => item.score?.length === 2)).toBe(true);
		expect(rivalView.members.find((member) => member.profileId === owner)?.assignment?.appearance).toEqual(look);
		expect(view.standings).toEqual(rivalView.standings);
		const latest = view.last.find((r) => r.home === opponent.home && r.away === opponent.away)!;
		const replay = await worldReplay(db, room, owner, latest.home, latest.away);
		const replayed = simulateMatch({ ...replay, ...(replay.neutral ? { rules: { homeAdvantage: false } } : {}) });
		expect([replayed.homeGoals, replayed.awayGoals]).toEqual([latest.homeGoals, latest.awayGoals]);
		await expect(leaveRoom(db, room, owner)).rejects.toMatchObject({ status: 409 });
		await command(owner, 'transfer-owner', { target: rival });
		expect((await getRoomByCode(db, room.code))?.ownerId).toBe(rival);
		await command(rival, 'settings', { allowAbsent: false, inviteOpen: false });
		await expect(joinRoom(db, room.code, outsider)).rejects.toMatchObject({ status: 403 });
	}, 30000);
	it('fecha duas temporadas com dois treinadores, súmulas persistidas e participantes ausentes', async () => {
		const [owner, rival] = await Promise.all(Array.from({ length: 2 }, () => createGuestProfile(db).then((p) => p.profile.id)));
		const room = await createRoom(db, owner, 'Universo de temporadas');
		await joinRoom(db, room.code, rival);
		let revision = 0;
		const execute = async (action: string, parameters: Record<string, unknown> = {}, profile = owner) => {
			const out = await applyWorldCommand(db, room, profile, { revision, op: randomUUID(), action, ...parameters });
			revision = out.revision;
		};
		await execute('assign', { role: 'coach', club: 'flamengo' });
		await execute('assign', { role: 'coach', club: 'palmeiras' }, rival);
		await expect(execute('assign', { role: 'coach', club: 'flamengo' }, rival)).rejects.toMatchObject({ status: 409 });
		await execute('settings', { inviteOpen: true, allowAbsent: true });
		const start = (await worldSnapshot(db, room, owner)).season;
		// O calendário atual contém 38 datas de liga e 13 da Copa, mais a transição.
		for (let i = 0; i < 52; i++) await execute('advance');
		for (let i = 0; i < 52; i++) await execute('advance');
		const after = await worldSnapshot(db, room, owner);
		expect(after.season).toBe(start + 2);
		expect(after.champions.map((year) => year.season)).toEqual([start, start + 1]);
		expect((await worldSnapshot(db, room, rival)).current?.club).toBe('palmeiras');
		const rows = await db.query<{ season: number; fixtures: number }>(`SELECT season, count(*)::int AS fixtures FROM room_world_matches WHERE room_id=$1 GROUP BY season ORDER BY season`, [room.id]);
		expect(rows.map((r) => r.season)).toEqual([start, start + 1]);
		expect(rows.every((r) => r.fixtures > 500)).toBe(true);
	}, 180000);
	it('delegação temporária à IA: só o próprio treinador autoriza e a rodada deixa de esperar por ele', async () => {
		const [owner, rival] = await Promise.all(Array.from({ length: 2 }, () => createGuestProfile(db).then((p) => p.profile.id)));
		const room = await createRoom(db, owner, 'Liga com ausente');
		await joinRoom(db, room.code, rival);
		const get = (profile: string) => worldSnapshot(db, room, profile);
		const command = async (profile: string, action: string, params: Record<string, unknown> = {}) =>
			applyWorldCommand(db, room, profile, { ...params, action, op: randomUUID(), revision: (await get(profile)).revision });
		await command(owner, 'assign', { role: 'coach', club: 'flamengo' });
		await command(rival, 'assign', { role: 'coach', club: 'palmeiras' });
		await command(owner, 'ready', { value: true });
		// Sem delegação, a rodada espera o rival.
		await expect(command(owner, 'advance')).rejects.toMatchObject({ status: 409 });
		// O administrador não delega pelo rival: o comando vale só para quem o envia.
		await command(owner, 'ai-cover', { value: true });
		await command(owner, 'ai-cover', { value: false });
		await command(owner, 'ready', { value: true });
		expect((await get(owner)).members.find((m) => m.profileId === rival)?.assignment).toMatchObject({ aiCover: false });
		await command(rival, 'ai-cover', { value: true });
		expect((await get(owner)).members.find((m) => m.profileId === rival)?.assignment).toMatchObject({ aiCover: true, ready: false });
		const before = (await get(owner)).date;
		await command(owner, 'advance');
		expect((await get(owner)).date).not.toBe(before);
		// De volta: desliga a delegação e a rodada volta a esperar por ele.
		await command(rival, 'ai-cover', { value: false });
		await command(owner, 'ready', { value: true });
		await expect(command(owner, 'advance')).rejects.toMatchObject({ status: 409 });
	}, 60000);
	it('Dev 0.12: a carreira online entrega a mesma projeção da carreira individual e as telas calculam o mesmo elenco oficial', async () => {
		const { careerView } = await import('#lib/domain/view.ts');
		const { manageView } = await import('#lib/domain/manageview.ts');
		const { officeView } = await import('#lib/domain/officeview.ts');
		const [owner] = await Promise.all([createGuestProfile(db).then((p) => p.profile.id)]);
		const room = await createRoom(db, owner, 'Telas iguais');
		const get = () => worldSnapshot(db, room, owner);
		const command = async (action: string, params: Record<string, unknown> = {}) =>
			applyWorldCommand(db, room, owner, { ...params, action, op: randomUUID(), revision: (await get()).revision });
		await command('assign', { role: 'coach', club: 'flamengo' });
		await command('ready', { value: true });
		await command('advance');
		const snap = await get();
		expect(snap.career?.data.sharedWorld).toBe(true);
		const view = careerView(snap.career!, snap.seasonResults);
		// O elenco calculado pela tela é exatamente o elenco oficial da liga.
		expect(view.squad.map((p) => p.id).sort()).toEqual(snap.roster.map((p) => p.id).sort());
		expect(view.club.id).toBe('flamengo');
		expect(view.tactic.formation).toBe(snap.tactic!.formation);
		const manage = manageView(snap.career!, view);
		expect(manage.club.balance).toBe(snap.balance);
		expect(officeView(snap.career!, view, manage).office.contract.until).toBeGreaterThan(0);
		// Biblioteca de táticas e dicas também na carreira online (mesmas regras do servidor individual).
		await command('preset', { preset: { op: 'save', name: 'Online 4-3-3', tactic: { ...snap.tactic, formation: '4-3-3', lineup: snap.tactic!.lineup.slice(0, 11) } } }).catch(async () => {
			const { autoLineup } = await import('#lib/domain/tactics.ts');
			await command('preset', { preset: { op: 'save', name: 'Online 4-3-3', tactic: { ...snap.tactic, formation: '4-3-3', lineup: autoLineup('4-3-3', view.squad), bench: undefined } } });
		});
		const after = await get();
		expect(after.career?.data.tacticPresets?.map((p) => p.name)).toEqual(['Online 4-3-3']);
		await expect(command('preset', { preset: { op: 'save', name: 'Online 4-3-3', tactic: snap.tactic } })).rejects.toMatchObject({ status: 422 });
		await command('dismiss-tip', { tip: 'formacao-ruim' });
		expect((await get()).career?.data.dismissedTips).toEqual(['formacao-ruim']);
		// Ação de gestão pela mesma via das telas (comando "club"): preço do ingresso.
		await command('club', { request: { action: 'ingresso', price: 55 } });
		expect((await get()).career?.data.club?.ticketPrice).toBe(55);
	}, 60000);

	it('Dev 0.12 · Hybrid Save: reenviar da fila local com o mesmo id não duplica, mesmo com revisão antiga', async () => {
		const owner = (await createGuestProfile(db)).profile.id;
		const room = await createRoom(db, owner, 'Fila local');
		const get = () => worldSnapshot(db, room, owner);
		const command = async (action: string, params: Record<string, unknown> = {}, op = randomUUID(), revision?: number) =>
			applyWorldCommand(db, room, owner, { ...params, action, op, revision: revision ?? (await get()).revision });
		await command('assign', { role: 'coach', club: 'palmeiras' });
		const before = await get();
		const { autoLineup } = await import('#lib/domain/tactics.ts');
		const { careerView } = await import('#lib/domain/view.ts');
		const squad = careerView(before.career!, before.seasonResults).squad;
		const op = randomUUID();
		const preset = { op: 'save', name: 'Offline 4-4-2', tactic: { ...before.tactic, formation: '4-4-2', lineup: autoLineup('4-4-2', squad), bench: undefined } };
		// 1ª entrega chega ao servidor, mas a resposta "se perde" (o cliente não sabe que deu certo).
		await command('preset', { preset }, op, before.revision);
		// Enquanto isso, outra gravação muda a revisão do universo.
		await command('dismiss-tip', { tip: 'formacao-ruim' });
		// A fila reenvia a MESMA operação com a revisão antiga: o servidor reconhece e não duplica.
		await expect(command('preset', { preset }, op, before.revision)).resolves.toBeDefined();
		const after = await get();
		expect(after.career?.data.tacticPresets?.map((p) => p.name)).toEqual(['Offline 4-4-2']);
		expect(after.career?.data.dismissedTips).toEqual(['formacao-ruim']);
		// Uma operação NOVA com revisão antiga continua bloqueada (409): a fila atualiza e reenvia.
		await expect(command('dismiss-tip', { tip: 'outra' }, randomUUID(), before.revision)).rejects.toMatchObject({ status: 409 });
	}, 60000);
});
