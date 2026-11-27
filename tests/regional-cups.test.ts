import { describe, expect, it } from 'vitest';
import { initialBrazilTournaments, nextBrazilTournaments, NORDESTE_ID, regionalCupRankings, SUL_SUDESTE_ID, SUPERCOPA_ID, tournamentDefinitions, VERDE_ID } from '#lib/data/brasil/2026/tournaments.ts';
import { fixtureStepKey, seasonSteps } from '#lib/domain/calendar.ts';
import { validateCreateCareer } from '#lib/domain/career.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { cupMatchCount, initialCup, projectedCup } from '#lib/domain/cup.ts';
import { initialLeague, type StoredRoundResult } from '#lib/domain/league.ts';
import { settleTournament, tournamentView, type TournamentView } from '#lib/domain/tournaments.ts';
import { careerView } from '#lib/domain/view.ts';
import { createPgliteDb } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { createCareer, getCareer } from '#lib/server/repos/careers.ts';
import { insertRound, listResults, type RoundInsert } from '#lib/server/repos/matches.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { playRound } from '#lib/server/rounds.ts';
import { ENGINE_VERSION } from '#lib/engine/types.ts';

describe('Copas regionais offline', () => {
	it('completa as três chaves, incluindo pênaltis recuperados do save', () => {
		const states = initialBrazilTournaments(2026);
		const definitions = tournamentDefinitions(2026, states);
		const sizes = { [NORDESTE_ID]: [20, 60], [VERDE_ID]: [24, 70], [SUL_SUDESTE_ID]: [12, 42] };
		expect(definitions).toHaveLength(4);
		const steps = seasonSteps(initialLeague('brasil', 2026), initialCup(2026), definitions);
		const tours: TournamentView[] = [];
		expect(new Set(steps.map((step) => step.date)).size).toBe(steps.length);
		expect(new Set(steps.map((step) => step.key)).size).toBe(steps.length);
		for (const definition of definitions.filter((d) => d.competition.id !== SUPERCOPA_ID)) {
			const id = definition.competition.id as keyof typeof sizes;
			const clubs = definition.groups.flat();
			expect(clubs.every((club) => !!getClub(club))).toBe(true);
			expect(new Set(clubs).size).toBe(sizes[id][0]);
			let state = states.find((state) => state.id === id)!;
			const results: StoredRoundResult[] = [];
			const build = (strength = () => 70) => tournamentView(definition, state, results, 91, strength, clubs[0]);
			expect(build().participation.status).toBe('aguardando-estreia');
			for (let round = 1; round <= definition.dates.length; round++) {
				const fixtures = build().fixtures.filter((match) => match.round === round);
				expect(fixtures.length).toBeGreaterThan(0);
				expect(new Set(fixtures.flatMap(({ home, away }) => [home, away])).size).toBe(fixtures.length * 2);
				results.push(...fixtures.map((match) => ({ ...match, homeGoals: 0, awayGoals: 0 })));
				state = settleTournament(state, build(), round);
			}
			const outcome = build();
			tours.push(outcome);
			expect(results).toHaveLength(sizes[id][1]);
			expect(outcome.tables.flat().every((row) => row.played === definition.groupRounds.length)).toBe(true);
			expect(clubs).toContain(outcome.champion);
			expect(outcome.runnerUp).not.toBe(outcome.champion);
			expect(build(() => { throw new Error('pênaltis já decididos'); }).phases).toEqual(outcome.phases);
		}
		const next = initialLeague('brasil', 2027);
		const regionalRankings = regionalCupRankings(tours)!;
		expect(regionalRankings).toHaveLength(4);
		const projected = projectedCup(next, { regionalRankings, cChampion: 'confianca', cRunnerUp: 'guarani', dChampion: 'abc', dRunnerUp: 'ferroviario' });
		const registrations = Object.values(projected.entrants).flat();
		expect(projected.entrants['3']).toHaveLength(6);
		for (const list of regionalRankings) expect(projected.entrants['3']).toContain(list.find((club) => !projected.entrants['5'].includes(club)));
		expect(new Set(registrations).size).toBe(128);
		expect(cupMatchCount(projected)).toBe(157);

		const supercopa = nextBrazilTournaments('flamengo', 'vasco', 'flamengo');
		const final = tournamentDefinitions(2027, supercopa)[0];
		expect(final.dates).toEqual(['2027-01-24']);
		expect(final.groups).toEqual([['flamengo', 'vasco']]);
		expect(tournamentView(final, supercopa[0], [], 91, () => 70, 'vasco').fixtures[0]).toMatchObject({ neutral: true });
	});

	it('oferece, grava e reabre a estreia do Sport e repete o pedido sem duplicar placares', async () => {
		const db = await createPgliteDb();
		try {
			await runMigrations(db);
			const { profile } = await createGuestProfile(db);
			const valid = validateCreateCareer({ mode: 'coach', personName: 'Ana Silva', clubId: 'sport', worldSelection: { countries: ['bra'] } });
			if (!valid.ok) throw new Error(JSON.stringify(valid.errors));
			const career = await createCareer(db, profile.id, valid.value, 91);
			let view = careerView(career);
			const target = fixtureStepKey(NORDESTE_ID, 1);
			const first = view.steps.findIndex((step) => step.key === target);
			const played: RoundInsert[] = [];
			for (const step of view.steps.slice(0, first)) {
				view = careerView(career, played);
				expect(view.step?.key).toBe(step.key);
				played.push(...view.stepMatches.map((match) => ({ ...match, season: 2026, homeGoals: 1, awayGoals: 0, seed: 91, isUser: false })));
			}
			await insertRound(db, career.id, played, ENGINE_VERSION);
			view = careerView(career, played);
			expect(view.step?.key).toBe(target);
			expect(view.next?.competition).toBe(NORDESTE_ID);
			const playedStep = await playRound(db, profile.id, career, { version: career.version, step: target, season: 2026 });
			expect(playedStep.match?.fixture.competition).toBe(NORDESTE_ID);
			const reopened = (await getCareer(db, profile.id, career.id))!;
			expect(reopened.data.tournaments).toHaveLength(4);
			const results = await listResults(db, career.id, 2026);
			expect(results.filter((match) => match.competition === NORDESTE_ID)).toHaveLength(10);
			expect(careerView(reopened, results).step?.key).not.toBe(target);
			const replay = await playRound(db, profile.id, reopened, { version: career.version, step: target, season: 2026 });
			expect(replay.match?.fixture.competition).toBe(NORDESTE_ID);
			expect(replay.match?.homeGoals).toBe(playedStep.match?.homeGoals);
			expect(await listResults(db, career.id, 2026)).toHaveLength(results.length);
		} finally {
			await db.close();
		}
	}, 30_000);
});
