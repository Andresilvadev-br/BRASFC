import { afterAll, beforeAll, expect, it } from 'vitest';
import { catalogClub, ROSTER_CATALOG } from '#lib/data/roster-catalog.ts';
import { TEMPORADA_2026 } from '#lib/data/brasil.ts';
import { computeOverall } from '#lib/engine/attributes.ts';
import { aiTeam } from '#lib/domain/matchday.ts';
import { ensureUniverse } from '#lib/server/universe.ts';
import { careerView } from '#lib/domain/view.ts';
import { clubLineup, initialClubTactic } from '#lib/domain/club-selection.ts';
import { careerBaseSquad, generateSquad } from '#lib/domain/squad.ts';
import { rosterContext } from '#lib/domain/world.ts';
import { emptyMarket, rosterOf } from '#lib/domain/market.ts';
import { initialLeague } from '#lib/domain/league.ts';
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
		const opening = catalogClub(ROSTER_CATALOG, id)!;
		expect(preview.formation).toBe(opening.formation);
		expect(preview.starters.map((slot) => slot.player?.cbfId)).toEqual(opening.players.slice(0, 11).map((player) => player.playerId));
		expect(preview.starters.every(({ player, position }) => player?.position === position || player?.secondary?.includes(position))).toBe(true);
		expect(preview.bench).toHaveLength(12);
	}
	expect(players.size).toBe(46);
	const uncovered = careerBaseSquad('flamengo', 11, 'brasil-2026-abertura-v1');
	expect(uncovered.every((player) => player.pending && /^Vaga simulada/.test(player.name))).toBe(true);
	expect(clubLineup(uncovered)).toMatchObject({ coverage: 'incomplete', strength: null, bench: [] });
});

it('carrega os clubes A–D, sem inscrições duplicadas, com titulares e fontes por clube', () => {
	const divisions = initialLeague('brasil', 2026).divisions;
	expect(Object.values(divisions).map((clubs) => clubs.length)).toEqual([20, 20, 20, 96]);
	const cbfIds = new Set<string>();
	const sources = new Set<string>();
	for (const [division, clubs] of Object.entries(divisions)) {
		for (const id of clubs) {
			const opening = catalogClub(ROSTER_CATALOG, id)!;
			expect(opening.league, id).toBe(division);
			expect(opening.source, id).toMatch(/^https:\/\/conteudo\.cbf\.com\.br\/sumulas\/2026\/\d+se\.pdf$/);
			expect(opening.asOf, id).toMatch(/^2026-\d\d-\d\d$/);
			sources.add(opening.source);
			const squad = careerBaseSquad(id, 15, ROSTER_CATALOG);
			const preview = clubLineup(squad, initialClubTactic(ROSTER_CATALOG, id, squad), opening);
			expect(preview.coverage, id).toBe('documented');
			expect(preview.starters, id).toHaveLength(11);
			const legacy = initialClubTactic('brasil-2026-abertura-v2', id, squad);
			expect(clubLineup(squad, legacy).starters.map((slot) => slot.player?.cbfId), id)
				.toEqual(opening.players.filter((player) => player.matchRole === 'starter').map((player) => player.playerId));
			expect(new Set(preview.starters.map((slot) => slot.player?.cbfId)).size, id).toBe(11);
			expect(preview.bench.length + preview.starters.length, id).toBe(squad.length);
			for (const player of squad) {
				expect(player.cbfId, player.name).toMatch(/^\d+$/);
				expect(cbfIds.has(player.cbfId!), player.name).toBe(false);
				cbfIds.add(player.cbfId!);
			}
		}
	}
	expect(cbfIds.size).toBe(3442);
	expect(sources.size).toBe(78);
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
	await db.query("UPDATE careers SET data = jsonb_set(data, '{rosterCatalog}', '\"brasil-2026-abertura-v1\"') WHERE id = $1", [coach.id]);
	const versionOne = (await getCareer(db, profile.id, coach.id))!;
	expect(rosterOf(rosterContext(versionOne), 'flamengo').every((member) => member.pending)).toBe(true);
	expect(rosterOf(rosterContext(versionOne), 'atletico-mg').filter((member) => member.id === moved.id)).toHaveLength(1);
	await db.query("UPDATE careers SET data = data - 'rosterCatalog' - 'market' WHERE id = $1", [coach.id]);
	const legacy = (await getCareer(db, profile.id, coach.id))!;
	expect(rosterOf(rosterContext(legacy), 'palmeiras').map((member) => member.id)).toEqual(generateSquad('palmeiras', 15).map((member) => member.id));
});

it('seleciona mais de uma formação pelo elenco, mantém as referências e aplica o plano à IA', async () => {
	const divisions = initialLeague('brasil', 2026).divisions;
	const clubs = Object.values(divisions).flat();
	const choices = clubs.map((id) => initialClubTactic(ROSTER_CATALOG, id, careerBaseSquad(id, 15, ROSTER_CATALOG)).formation);
	expect(new Set(choices).size).toBeGreaterThan(2);
	for (const id of ['palmeiras', 'atletico-mg', 'flamengo']) {
		expect(choices[clubs.indexOf(id)]).toBe(catalogClub(ROSTER_CATALOG, id)?.formation);
	}
	const { profile } = await createGuestProfile(db);
	const career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Ana Souza', clubId: 'palmeiras', world: 'brasil' }, 15);
	const universe = ensureUniverse(career, initialLeague('brasil', 2026));
	const ctx = { season: 2026, firstSeason: 2026 };
	const modeled = clubs.filter((id) => catalogClub(ROSTER_CATALOG, id)?.modeledTactics && !catalogClub(ROSTER_CATALOG, id)?.tacticsSource);
	const aiChoices = modeled.map((id) => {
		const plan = aiTeam({ ...career, data: { ...career.data, universe } }, id, ctx, 1).setup.tactic;
		expect(plan.formation, id).toBe(universe.clubs[id].formation);
		return plan.formation;
	});
	expect(new Set(aiChoices).size).toBeGreaterThan(2);
});
