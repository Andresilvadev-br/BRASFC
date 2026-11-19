import { describe, expect, it } from 'vitest';
import '../src/lib/data/brasil.ts';
import { COACH_PROFILES } from '../src/lib/engine/ai-coach.ts';
import type { Career } from '../src/lib/domain/career.ts';
import { allFixtures, seasonSteps, stepFixtures } from '../src/lib/domain/calendar.ts';
import { getClub } from '../src/lib/domain/clubs.ts';
import { CUP_ID, cupView, initialCup, prepareCup, projectedCup, type CupState } from '../src/lib/domain/cup.ts';
import { closeSeason, divisionOf, divisionStandings, initialLeague, prepareRound, seasonFixtures, type DivisionId, type StoredRoundResult } from '../src/lib/domain/league.ts';
import { simulateOtherFixtures, universeCoach } from '../src/lib/domain/matchday.ts';
import { strengthFor } from '../src/lib/domain/strength.ts';
import { initialUniverse, universeAfterRound, universeIssues, universeSeasonEnd, type UniverseState } from '../src/lib/domain/universe.ts';
import { coachOffers, initialOffice, maybeMeeting, maybePress, recordGame, resolveMeeting, resolvePress } from '../src/lib/domain/office.ts';
import { applyTrainingWeek, DEFAULT_PLAN, suggestPlan } from '../src/lib/domain/drills.ts';
import { initialTacticalState } from '../src/lib/domain/tactical.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { autoLineup } from '../src/lib/domain/tactics.ts';
import { staffEffects } from '../src/lib/domain/staff.ts';
import { developYouth, youthIntakeFor } from '../src/lib/domain/academy.ts';
import { tierOfDivision } from '../src/lib/domain/market.ts';

const formationFor = (_: string, style: keyof typeof COACH_PROFILES) => COACH_PROFILES[style].formations[0];

describe('futebol brasileiro vivo — dez temporadas (Dev 0.5)', () => {
	it('técnicos, demissões, projetos, recordes e notícias evoluem com invariantes preservados', () => {
		const career = { seed: 20260005, season: 2026, clubId: 'flamengo', data: { world: 'brasil' } } as unknown as Career;
		const strengthOf = strengthFor(career);
		let league = initialLeague('brasil', 2026);
		let cup: CupState | null = initialCup(2026);
		let u: UniverseState = initialUniverse({ seed: career.seed, season: 2026, firstSeason: 2026, divisions: league.divisions as Record<string, string[]>, userClub: null, formationFor });
		expect(universeIssues(u)).toEqual([]);
		let sackings = 0;
		let moves = 0;
		const t0 = performance.now();
		for (let s = 0; s < 10; s++) {
			const season = league.season;
			const results: StoredRoundResult[] = [];
			for (const step of seasonSteps(league, cup)) {
				let fx;
				if (step.kind === 'league') {
					league = prepareRound(league, step.round, results, career.seed, strengthOf);
					fx = seasonFixtures(league, career.seed).filter((f) => f.round === step.round);
				} else {
					cup = prepareCup(cup!, step.matchday, results, career.seed, strengthOf);
					fx = stepFixtures(step, allFixtures([], cup));
				}
				const round = step.kind === 'league' ? step.round : step.matchday;
				const fresh = simulateOtherFixtures({ ...career, season } as Career, fx, { season, firstSeason: 2026 }, { full: () => false, strengthOf }).map((r) => ({ ...r, round }));
				results.push(...fresh);
				const tables: Record<string, string[]> = {};
				if (step.kind === 'league') for (const d of Object.keys(league.divisions)) tables[d] = divisionStandings(league, d as DivisionId, results).map((r) => r.clubId);
				u = universeAfterRound(u, { seed: career.seed, season, round, league: step.kind === 'league', results: fresh, tables, divisionOf: (id) => divisionOf(league, id), strengthOf, userClub: null, formationFor });
			}
			const out = closeSeason(league, results.filter((r) => r.competition !== CUP_ID), career.seed, strengthOf);
			const cv = cup ? cupView(cup, results, career.seed, strengthOf) : null;
			const points: Record<string, { points: number; games: number }> = {};
			for (const rows of Object.values(out.tables)) for (const r of rows ?? []) points[r.clubId] = { points: r.points, games: r.played };
			sackings += u.news.filter((n) => n.season === season && n.kind === 'demissao').length;
			u = universeSeasonEnd(u, {
				seed: career.seed,
				season,
				tables: Object.fromEntries(Object.entries(out.tables).map(([d, rows]) => [d, (rows ?? []).map((r) => r.clubId)])),
				points,
				champions: Object.fromEntries(Object.entries(out.champions).filter(([, v]) => !!v)) as Record<string, string>,
				promoted: out.moves.filter((m) => m.reason === 'acesso').map((m) => m.clubId),
				relegated: out.moves.filter((m) => m.reason === 'rebaixamento').map((m) => m.clubId),
				next: out.next.divisions as Record<string, string[]>,
				cupChampion: cv?.champion ?? null,
				userClub: null,
				formationFor
			});
			moves += u.log.at(-1)!.moves;
			// Invariantes a cada temporada.
			expect(universeIssues(u)).toEqual([]);
			for (const ids of Object.values(out.next.divisions)) for (const id of ids ?? []) expect(u.clubs[id]?.coachId, `${id} sem técnico em ${season + 1}`).toBeTruthy();
			expect(u.season).toBe(season + 1);
			league = out.next;
			cup = projectedCup(league, { cChampion: out.champions['serie-c'], cRunnerUp: out.runnersUp['serie-c'], dChampion: out.champions['serie-d'], dRunnerUp: out.runnersUp['serie-d'], dRanking: out.tables['serie-d']?.map((r) => r.clubId) });
		}
		const ms = performance.now() - t0;
		// O universo se move por causa dos resultados: há demissões e trocas, mas não um carrossel absurdo.
		expect(sackings).toBeGreaterThan(5);
		expect(sackings / 10).toBeLessThan(60);
		expect(moves).toBeGreaterThan(0);
		expect(u.log).toHaveLength(10);
		expect(Object.values(u.records.titles).reduce((a, b) => a + b, 0)).toBe(50);
		expect(u.records.biggestWin).not.toBeNull();
		expect(u.news.length).toBeLessThanOrEqual(160);
		// Técnicos com carreira registrada e reputações finitas.
		const withHistory = Object.values(u.coaches).filter((c) => c.history.length >= 3);
		expect(withHistory.length).toBeGreaterThan(20);
		// Projetos mudaram (acesso, queda, reconstrução).
		expect(new Set(Object.values(u.clubs).map((m) => m.project)).size).toBeGreaterThanOrEqual(3);
		console.info(`10 temporadas do universo: ${(ms / 1000).toFixed(1)} s, ${sackings} demissões, ${moves} trocas de comando entre temporadas`);
	}, 600_000);

	it('o técnico e o sistema do universo comandam o time da IA nas partidas', () => {
		const career = { seed: 7, season: 2026, clubId: 'flamengo', mode: 'coach', data: { world: 'brasil' } } as unknown as Career;
		const league = initialLeague('brasil', 2026);
		const u = initialUniverse({ seed: 7, season: 2026, firstSeason: 2026, divisions: league.divisions as Record<string, string[]>, userClub: 'flamengo', formationFor });
		expect(u.clubs.flamengo.coachId).toBeNull();
		u.clubs.palmeiras.formation = '5-3-2';
		const ov = universeCoach({ data: { ...career.data, universe: u } } as never, 'palmeiras');
		expect(ov?.formation).toBe('5-3-2');
		expect(ov?.name).toBe(u.coaches[u.clubs.palmeiras.coachId!].name);
	});
});

describe('gabinete do treinador', () => {
	it('marcos, reuniões com consequência e coletivas proporcionais', () => {
		const st = initialOffice(2026, 'A', 50);
		expect(recordGame(st, 2026, 1, 2, 0, { clubId: 'flamengo', opponent: 'vasco-da-gama', competition: 'serie-a' }).map((m) => m.key)).toContain('primeira-vitoria');
		expect(st.totals).toMatchObject({ games: 1, wins: 1 });
		const snap = { profile: 'imediatista' as const, confidence: 25, round: 8, season: 2026, totalRounds: 38, points: 6, position: 18, objectiveLabel: null, contractEnding: false };
		const m = maybeMeeting(st, snap)!;
		expect(m.kind).toBe('advertencia');
		// Pedir tempo irrita a diretoria imediatista; a de projeto aceita.
		expect(resolveMeeting(m, 'pedir-tempo', snap, { reputation: 50, tier: 'A', season: 2026, transferBudget: 1e7 }).confidence).toBeLessThan(0);
		expect(resolveMeeting(m, 'pedir-tempo', { ...snap, profile: 'projeto' }, { reputation: 50, tier: 'A', season: 2026, transferBudget: 1e7 }).confidence).toBeGreaterThan(0);
		expect(resolveMeeting(m, 'prometer', snap, { reputation: 50, tier: 'A', season: 2026, transferBudget: 1e7 }).ultimatum).toMatchObject({ points: 7, untilRound: 13 });
		expect(() => resolveMeeting(m, 'inexistente', snap, { reputation: 50, tier: 'A', season: 2026, transferBudget: 1e7 })).toThrow();
		const pc = maybePress(st, { season: 2026, round: 9, clubId: 'flamengo', nextOpponent: 'fluminense', form: 'v', signedBig: null, boardWarning: false, decisive: false }, null)!;
		expect(pc.topic).toBe('classico');
		const answers = Object.fromEntries(pc.questions.map((q) => [q.id, q.options.find((o) => o.tone === 'provocativo')?.id ?? q.options[0].id]));
		const e = resolvePress(pc, answers, 'conservadora');
		expect(e.fanMood).toBeGreaterThan(0);
		expect(e.confidence).toBeLessThan(0);
		expect(Math.abs(e.fanMood)).toBeLessThanOrEqual(10);
	});

	it('propostas de emprego coerentes com reputação e com o universo', () => {
		const league = initialLeague('brasil', 2026);
		const u = initialUniverse({ seed: 3, season: 2026, firstSeason: 2026, divisions: league.divisions as Record<string, string[]>, userClub: 'mirassol', formationFor });
		u.clubs.ituano.coachId = null;
		u.clubs['sao-paulo'].confidence = 20;
		const low = coachOffers(3, 2026, 10, 25, 'mirassol', u, league.divisions as Record<string, string[]>, { dismissed: true, tierOf: tierOfDivision });
		for (const o of low) expect(getClub(o.clubId)!.reputation).toBeLessThanOrEqual(2);
		// Vaga aberta vem primeiro; com poucas vagas, completa com clubes compatíveis (nunca fica sem proposta).
		expect(low[0].clubId).toBe('ituano');
		expect(low.length).toBeGreaterThanOrEqual(2);
		const high = coachOffers(3, 2026, 10, 90, 'mirassol', u, league.divisions as Record<string, string[]>, { dismissed: false, tierOf: tierOfDivision });
		expect(high.some((o) => o.clubId === 'sao-paulo')).toBe(true);
		for (const o of high) expect(o.wage).toBeGreaterThan(0);
	});
});

describe('comissão técnica e treinos (efeitos medidos)', () => {
	const squad = generateSquad('flamengo', 11);
	const lineup = autoLineup('4-3-3', squad);
	const base = initialTacticalState(squad, '4-3-3', 'posse');
	const ctx = { formation: '4-3-3' as const, style: 'posse' as const, lineup, roles: [], squad };
	it('auxiliar melhor acelera o domínio tático; o interino é pior, mas não zera', () => {
		const good = applyTrainingWeek(base, DEFAULT_PLAN, { ...ctx, learning: staffEffects({ auxiliar: { id: 'a', name: 'A', role: 'auxiliar', competence: 90, wage: 1, until: 2027, age: 40 } }).tacticalLearning });
		const interim = applyTrainingWeek(base, DEFAULT_PLAN, { ...ctx, learning: staffEffects({}).tacticalLearning });
		const gain = (s: typeof base) => s.formations['4-3-3'] - base.formations['4-3-3'];
		expect(gain(good)).toBeGreaterThan(gain(interim));
		expect(gain(interim)).toBeGreaterThan(0);
		expect(gain(good) / gain(interim)).toBeLessThan(1.5);
	});
	it('preparação para o adversário vale só para o rival estudado e tem teto', () => {
		const plan = { sessions: ['adversario', 'adversario', 'adversario', 'adversario', 'adversario'] as const, intensity: 'intensa' as const };
		const prep = applyTrainingWeek(base, { sessions: [...plan.sessions], intensity: plan.intensity }, { ...ctx, nextOpponent: 'vasco-da-gama', analyst: 5 });
		expect(prep.opponentPrep?.opponent).toBe('vasco-da-gama');
		expect(prep.opponentPrep!.bonus).toBeLessThanOrEqual(6);
		const next = applyTrainingWeek(prep, DEFAULT_PLAN, { ...ctx, nextOpponent: 'botafogo' });
		expect(next.opponentPrep).toBeNull();
		const sug = suggestPlan(base, { ...ctx, nextOpponent: 'vasco-da-gama', analyst: 4 }, 92);
		expect(sug.plan.sessions).toContain('adversario');
	});
	it('base: coordenador acelera; plano focado especializa; quem passa dos 19 estagna mais', () => {
		const [y] = youthIntakeFor(5, 'flamengo', 2026, 3);
		const run = (youth: typeof y, intensity: number) => {
			let cur = youth;
			for (let w = 1; w <= 30; w++) cur = developYouth(cur, 3, 3, intensity, 5, 2026, w);
			return cur;
		};
		const slow = run(y, staffEffects({}).youthDevelopment);
		const fast = run(y, staffEffects({ coordBase: { id: 'c', name: 'C', role: 'coordBase', competence: 95, wage: 1, until: 2027, age: 50 } }).youthDevelopment);
		expect(fast.overall).toBeGreaterThanOrEqual(slow.overall);
		expect(fast.overall).toBeLessThanOrEqual(y.potential);
		const old = run({ ...y, age: 21 }, 1);
		expect(old.overall - y.overall).toBeLessThanOrEqual(run(y, 1).overall - y.overall);
		const tec = run({ ...y, plan: 'tecnico' }, 1);
		expect(tec.attributes.passe - y.attributes.passe).toBeGreaterThanOrEqual(tec.attributes.forca - y.attributes.forca);
	});
});

describe('fim de temporada do gabinete', () => {
	it('demissão no meio da temporada vira uma única linha do histórico, com os jogos do ano', async () => {
		const { officeSeasonEnd } = await import('../src/lib/server/universe.ts');
		const { initialClubState } = await import('../src/lib/domain/management.ts');
		const office = initialOffice(2026, 'A', 40);
		for (let k = 0; k < 20; k++) recordGame(office, 2026, k + 1, k % 3 === 0 ? 2 : 0, 1, { clubId: 'mirassol', opponent: 'santos', competition: 'serie-a' });
		office.history.push({ season: 2026, clubId: 'mirassol', division: 'serie-a', position: null, outcome: 'demitido', games: 0, wins: 0, draws: 0, losses: 0, reputation: 40 });
		const club = { ...initialClubState(1, 'mirassol', 'serie-a', 2026), board: { ...initialClubState(1, 'mirassol', 'serie-a', 2026).board, dismissed: true } };
		const league = initialLeague('brasil', 2026);
		const u = initialUniverse({ seed: 1, season: 2026, firstSeason: 2026, divisions: league.divisions as Record<string, string[]>, userClub: 'mirassol', formationFor });
		const out = officeSeasonEnd({ career: { seed: 1, season: 2026, clubId: 'mirassol', personName: 'T', data: {} } as never, office, club, universe: u, division: 'serie-a', position: 18, outcome: 'queda', next: league });
		expect(out.office.history).toHaveLength(1);
		expect(out.office.history[0]).toMatchObject({ outcome: 'demitido', games: 20, position: 18 });
		expect(out.club.jobOffers.length).toBeGreaterThan(0);
	});
});
