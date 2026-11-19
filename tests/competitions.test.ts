import { describe, expect, it } from 'vitest';
import '#lib/data/brasil.ts';
import { allFixtures, seasonSteps, stepFixtures } from '#lib/domain/calendar.ts';
import { CUP_ID, CUP_PHASES, cupFixtures, cupView, initialCup, prepareCup, projectedCup, type CupState } from '#lib/domain/cup.ts';
import { closeSeason, initialLeague, prepareRound, resolveTie, seasonFixtures, type LeagueState, type StoredRoundResult } from '#lib/domain/league.ts';
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
