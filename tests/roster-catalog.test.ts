import { afterAll, beforeAll, expect, it } from 'vitest';
import { OPENING_2026, ROSTER_CATALOG } from '#lib/data/roster-catalog.ts';
import { TEMPORADA_2026 } from '#lib/data/brasil.ts';
import { computeOverall } from '#lib/engine/attributes.ts';
import { careerView } from '#lib/domain/view.ts';
import { clubLineup, initialClubTactic } from '#lib/domain/club-selection.ts';
import { careerBaseSquad, generateSquad } from '#lib/domain/squad.ts';
import { rosterContext } from '#lib/domain/world.ts';
import { emptyMarket, rosterOf } from '#lib/domain/market.ts';
import { createPgliteDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { createCareer, getCareer, patchCareerData } from '#lib/server/repos/careers.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';

let db: Db;
beforeAll(async () => { db = await createPgliteDb(); await runMigrations(db); });
afterAll(() => db.close());

it('usa a súmula por clube, posição e atleta único, com notas derivadas dos atributos', () => {
	const clubs = new Set(TEMPORADA_2026.competicoes.find((item) => item.id === 'serie-a')?.clubes);
	const players = new Set<string>();
	for (const id of ['palmeiras', 'atletico-mg'] as const) {
		expect(clubs.has(id)).toBe(true);
		const roster = careerBaseSquad(id, 11, ROSTER_CATALOG);
		expect(roster).toEqual(careerBaseSquad(id, 77, ROSTER_CATALOG));
		for (const player of roster) {
			expect(player.cbfId).toBeDefined();
			expect(players.has(player.cbfId!)).toBe(false);
			expect(computeOverall(player.attributes, player.position)).toBe(player.overall);
			players.add(player.cbfId!);
		}
		const preview = clubLineup(roster, initialClubTactic(ROSTER_CATALOG, id, roster));
		expect(preview.formation).toBe(OPENING_2026.clubs[id].formation);
		expect(preview.starters.map((slot) => slot.player?.cbfId)).toEqual(OPENING_2026.clubs[id].players.slice(0, 11).map((player) => player.playerId));
		expect(preview.starters.every(({ player, position }) => player?.position === position || player?.secondary?.includes(position))).toBe(true);
		expect(preview.bench).toHaveLength(12);
	}
	expect(players.size).toBe(46);
	const uncovered = careerBaseSquad('flamengo', 11, ROSTER_CATALOG);
	expect(uncovered.every((player) => player.pending && /^Vaga simulada/.test(player.name))).toBe(true);
	expect(clubLineup(uncovered)).toMatchObject({ coverage: 'incomplete', strength: null, bench: [] });
});

it('fixa catálogo no banco, isola transação entre saves e mantém elenco legado', async () => {
	const { profile } = await createGuestProfile(db);
	const coach = await createCareer(db, profile.id, { mode: 'coach', personName: 'Ana Souza', clubId: 'palmeiras', world: 'brasil' }, 15);
	const player = await createCareer(db, profile.id, { mode: 'player', personName: 'Léo Souza', clubId: 'palmeiras', world: 'brasil', position: 'ATA' }, 15);
	expect(careerView(coach).tactic.formation).toBe('4-2-3-1');
	expect(careerView(player).squad.filter((member) => member.id === 'eu')).toHaveLength(1);
	const roster = rosterOf(rosterContext(coach), 'palmeiras');
	const moved = roster.find((member) => member.cbfId === '633571')!;
	const saved = await patchCareerData(db, profile.id, coach.id, {
		market: { ...emptyMarket(), players: { [moved.id]: { club: 'atletico-mg', since: '2026-01-28', contract: moved.contract } } }
	}, coach.version);
	const reopened = (await getCareer(db, profile.id, saved.id))!;
	expect(reopened.data.rosterCatalog).toBe(ROSTER_CATALOG);
	expect(rosterOf(rosterContext(reopened), 'palmeiras').some((member) => member.id === moved.id)).toBe(false);
	expect(rosterOf(rosterContext(reopened), 'atletico-mg').filter((member) => member.id === moved.id)).toHaveLength(1);
	expect(rosterOf(rosterContext(player), 'palmeiras').some((member) => member.id === moved.id)).toBe(true);
	await db.query("UPDATE careers SET data = data - 'rosterCatalog' - 'market' WHERE id = $1", [coach.id]);
	const legacy = (await getCareer(db, profile.id, coach.id))!;
	expect(rosterOf(rosterContext(legacy), 'palmeiras').map((member) => member.id)).toEqual(generateSquad('palmeiras', 15).map((member) => member.id));
});
