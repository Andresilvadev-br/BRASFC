import { describe, expect, it } from 'vitest';
import '#lib/data/brasil.ts';
import { allFixtures, seasonSteps, stepFixtures } from '#lib/domain/calendar.ts';
import { CUP_ID, CUP_PHASES, cupFixtures, cupView, initialCup, prepareCup, projectedCup, sanitizeCup, settleCupMatchday, tieOutcome, type CupState } from '#lib/domain/cup.ts';
import { continentalParticipation, qualifyBrazil2027 } from '#lib/domain/continental-qualification.ts';
import { closeSeason, divisionStandings, initialLeague, prepareRound, resolveTie, seasonFixtures, type LeagueState, type StoredRoundResult } from '#lib/domain/league.ts';
import { penaltyShootout, quickMatch } from '#lib/domain/quick.ts';
import { checkTransition, divisionRule, phaseOneRounds } from '#lib/domain/rules.ts';

const strength = () => 70;

/** Joga uma temporada inteira com o modelo rápido (sem banco). */
function playSeason(league: LeagueState, cup: CupState | null, seed: number) {
	const results: StoredRoundResult[] = [];
	for (const step of seasonSteps(league, cup)) {
		let fx;
		if (step.kind === 'league') {
			league = prepareRound(league, step.round, results, seed, strength);
			fx = seasonFixtures(league, seed).filter((f) => f.round === step.round);
		} else {
			cup = prepareCup(cup!, step.matchday, results, seed, strength);
			fx = stepFixtures(step, allFixtures([], cup));
		}
		for (const f of fx) {
			const q = quickMatch(70, 70, seed * 7919 + results.length);
			results.push({ round: f.round, home: f.home, away: f.away, homeGoals: q.homeGoals, awayGoals: q.awayGoals, competition: f.competition });
		}
	}
	return { league, cup, results };
}

describe('regras por edição', () => {
	it('define dois acessos diretos e dois pelos playoffs da Série B sem alterar a tabela regular', () => {
		const old = initialLeague('brasil', 2026, { divisions: ['serie-b'], cup: false });
		const modern = { ...old, bPromotionPlayoff: [] };
		const seed = 77;
		const regular = seasonFixtures(old, seed).map((f) => ({ ...f, homeGoals: 1, awayGoals: 0 }));
		const ranking = divisionStandings(modern, 'serie-b', regular).map((r) => r.clubId);
		const [first, second, third, fourth, fifth, sixth] = ranking;
		const league = prepareRound(modern, 39, regular, seed, strength);
		expect(league.bPromotionPlayoff).toEqual([[sixth, third], [fifth, fourth]]);
		expect(seasonSteps(old, null)).toHaveLength(38);
		expect(seasonSteps(league, null)).toHaveLength(40);
		const games = seasonFixtures(league, seed).filter((f) => f.round > 38);
		expect(games).toHaveLength(4);
		expect(games.filter((f) => f.round === 40).map((f) => f.home)).toEqual([third, fourth]);
		const playoffs = games.map((f) => ({ ...f, homeGoals: f.home === sixth ? 2 : 0, awayGoals: 0 }));
		const ended = closeSeason(league, [...regular, ...playoffs], seed, strength);
		expect(ended.moves.filter((m) => m.from === 'serie-b' && m.to === 'serie-a').map((m) => m.clubId).sort())
			.toEqual([first, second, sixth, fourth].sort());
		expect(ended.tables['serie-b']).toEqual(divisionStandings(league, 'serie-b', regular));
		expect(ended.next.bPromotionPlayoff).toEqual([]);
	});

	it('Série C: 20 (2026), 24 (2027), 28 em dois grupos (2028+); Série D com 96', () => {
		expect(divisionRule('serie-c', 2026).size).toBe(20);
		expect(divisionRule('serie-c', 2027).size).toBe(24);
		expect(divisionRule('serie-c', 2028)).toMatchObject({ size: 28, relegated: 6, relegatedPerGroup: 3, phase1: { groups: 2, legs: 2 } });
		expect(divisionRule('serie-d', 2026)).toMatchObject({ size: 96, promoted: 6, phase1: { groups: 16, legs: 2 } });
		expect(phaseOneRounds(divisionRule('serie-c', 2027))).toBe(23);
		expect(phaseOneRounds(divisionRule('serie-c', 2028))).toBe(26);
		expect(phaseOneRounds(divisionRule('serie-d', 2026))).toBe(10);
	});

	it('as contas de clubes fecham de 2026 a 2040 (nenhum clube sobra ou some)', () => {
		for (let y = 2026; y <= 2040; y++) expect(checkTransition(y, 50), `temporada ${y}`).toEqual([]);
	});
});

describe('temporadas consecutivas com Série D e Copa', () => {
	it('três temporadas: tamanhos corretos, sem clube em duas divisões, D com mata-mata e playoffs', () => {
		let league = initialLeague('brasil', 2026);
		let cup: CupState | null = initialCup(2026);
		const sizes: Array<Record<string, number>> = [];
		for (let s = 0; s < 3; s++) {
			const played = playSeason(league, cup, 4242 + s);
			const d = played.league.dBracket!;
			expect(d.stages).toHaveLength(6); // 2ª fase … final
			expect(d.stages[0]).toHaveLength(32);
			expect(d.playoff).toHaveLength(2);
			const out = closeSeason(played.league, played.results.filter((r) => r.competition !== CUP_ID), 4242 + s, strength);
			expect(out.champions['serie-c']).toBeTruthy();
			expect(out.champions['serie-d']).toBeTruthy();
			// Sobem da D: os 4 semifinalistas + 2 vencedores de playoff.
			const semis = new Set(d.stages[4].flat());
			const dUp = out.moves.filter((m) => m.to === 'serie-c' && m.reason === 'acesso').map((m) => m.clubId);
			expect(dUp).toHaveLength(6);
			expect(dUp.filter((id) => semis.has(id))).toHaveLength(4);
			// Quem cai da Série C não fica nela.
			for (const m of out.moves.filter((x) => x.from === 'serie-c' && x.to === 'serie-d')) expect(out.next.divisions['serie-c']).not.toContain(m.clubId);
			const all = Object.values(out.next.divisions).flat();
			expect(new Set(all).size).toBe(all.length);
			sizes.push(Object.fromEntries(Object.entries(out.next.divisions).map(([k, v]) => [k, v!.length])));
			league = out.next;
			cup = projectedCup(league, { cChampion: out.champions['serie-c'], cRunnerUp: out.runnersUp['serie-c'], dChampion: out.champions['serie-d'], dRunnerUp: out.runnersUp['serie-d'], dRanking: out.tables['serie-d']?.map((r) => r.clubId) });
		}
		expect(sizes.map((x) => x['serie-c'])).toEqual([24, 28, 28]);
		expect(sizes.every((x) => x['serie-a'] === 20 && x['serie-b'] === 20 && x['serie-d'] === 96)).toBe(true);
		expect(league.groups?.['serie-c']).toHaveLength(2);
	}, 60_000);
});

describe('Copa do Brasil', () => {
	it('mantém vencedor e placar dos pênaltis após mudança de força e reabertura', () => {
		const cup = prepareCup(initialCup(2026), 1, [], 777, strength);
		const results = cupFixtures(cup).map((f) => ({ ...f, homeGoals: 0, awayGoals: 0 }));
		const tie = cup.stages[0][0];
		const first = tieOutcome(cup, 0, tie, results, 777, strength)!;
		const saved = settleCupMatchday(cup, 1, results, 777, strength);
		const known = new Set(Object.values(cup.entrants).flat());
		const reloaded = sanitizeCup(JSON.parse(JSON.stringify(saved)), known)!;
		expect(tieOutcome(reloaded, 0, tie, results, 777, () => { throw new Error('Não recalcular força'); }))
			.toMatchObject({ winner: first.winner, penalties: { home: first.penalties!.home, away: first.penalties!.away } });
	});

	it('126 clubes, 9 fases, 155 jogos, um campeão; jogo único até a 4ª fase e ida e volta da 5ª à semi', () => {
		const league = initialLeague('brasil', 2026);
		const { cup, results } = playSeason(league, initialCup(2026), 77);
		expect(cup!.stages.map((s) => s.length)).toEqual([14, 44, 24, 12, 16, 8, 4, 2, 1]);
		expect(cupFixtures(cup!)).toHaveLength(14 + 44 + 24 + 12 + 32 + 16 + 8 + 4 + 1);
		const v = cupView(cup!, results, 77, strength);
		expect(v.champion).toBeTruthy();
		expect(v.phases.every((p) => p.ties.every((t) => t.outcome !== null))).toBe(true);
		expect(CUP_PHASES.slice(0, 4).every((p) => p.legs === 1) && CUP_PHASES.slice(4, 8).every((p) => p.legs === 2) && CUP_PHASES[8].legs === 1).toBe(true);
		// Os 20 da Série A só aparecem a partir da 5ª fase.
		const a = new Set(league.divisions['serie-a']);
		for (let i = 0; i < 4; i++) expect(cup!.stages[i].flat().some((id) => a.has(id))).toBe(false);
		expect(cup!.stages[4].flat().filter((id) => a.has(id))).toHaveLength(20);
	}, 60_000);

	it('empate no agregado vai aos pênaltis (determinístico) e a final é em campo neutro', () => {
		const tie: [string, string] = ['bahia', 'santos'];
		const res: StoredRoundResult[] = [
			{ round: 5, home: 'bahia', away: 'santos', homeGoals: 1, awayGoals: 0, competition: CUP_ID },
			{ round: 6, home: 'santos', away: 'bahia', homeGoals: 1, awayGoals: 0, competition: CUP_ID }
		];
		const a = resolveTie(tie, res, CUP_ID, [5, 6], 9, strength)!;
		const b = resolveTie(tie, res, CUP_ID, [5, 6], 9, strength)!;
		expect(a.decidedBy).toBe('penaltis');
		expect(a.winner).toBe(b.winner);
		expect(a.penalties!.home).not.toBe(a.penalties!.away);
		expect(penaltyShootout(70, 70, 1)).toEqual(penaltyShootout(70, 70, 1));
		const final = cupFixtures({ ...initialCup(2026), stages: [[], [], [], [], [], [], [], [], [['flamengo', 'palmeiras']]] }).find((f) => f.phase === 'Final') as { neutral?: boolean };
		expect(final.neutral).toBe(true);
	});

	it('edição projetada também tem 126 clubes distintos', () => {
		const league = initialLeague('brasil', 2026);
		const { results } = playSeason(league, null, 5);
		const out = closeSeason(league, results, 5, strength);
		const next = projectedCup(out.next, { cChampion: out.champions['serie-c'], dChampion: out.champions['serie-d'] });
		const all = [...next.entrants['1'], ...next.entrants['2'], ...next.entrants['3'], ...next.entrants['5']];
		expect(all).toHaveLength(126);
		expect(new Set(all).size).toBe(126);
	}, 60_000);
});

describe('vagas brasileiras para 2027', () => {
	const teams = Array.from({ length: 20 }, (_, i) => `clube-${i + 1}`);
	const [first, second, third, fourth, fifth, sixth, seventh, eighth, ninth] = teams;
	const eligible = teams.slice(0, 16);

	it('classifica o campeão e vice da Copa e evita dupla classificação para a Sul-Americana', () => {
		const result = qualifyBrazil2027(teams, eligible, { champion: eighth, runnerUp: ninth });
		expect(result.groups).toEqual([first, second, third, fourth, eighth]);
		expect(result.preliminary).toEqual([ninth, fifth]);
		expect(result.sudamericana.slice(0, 2)).toEqual([sixth, seventh]);
		expect(new Set([...result.groups, ...result.preliminary, ...result.sudamericana]).size).toBe(13);
		expect(continentalParticipation(result, ninth, 2027)).toMatchObject([{ competition: 'continental/libertadores', stage: 'Fase preliminar' }]);
		expect(continentalParticipation(result, ninth, 2028)).toEqual([]);
	});

	it('redistribui as vagas da Copa e soma as vagas de campeões continentais sem duplicação', () => {
		const result = qualifyBrazil2027(teams, eligible, { champion: first, runnerUp: fifth });
		expect(result.groups).toEqual([first, second, third, fourth, fifth]);
		expect(result.preliminary).toEqual([sixth, seventh]);
		const holders = qualifyBrazil2027(teams, eligible, { champion: first, runnerUp: seventh }, [second, ninth]);
		expect(holders.groups).toHaveLength(7);
		expect(holders.preliminary).toHaveLength(2);
		expect(new Set([...holders.groups, ...holders.preliminary, ...holders.sudamericana]).size).toBe(15);
		const relegated = qualifyBrazil2027(teams, eligible, { champion: teams[18], runnerUp: teams[19] });
		expect(relegated.groups).toContain(fifth);
		expect(relegated.preliminary).toEqual([sixth, seventh]);
	});
});
