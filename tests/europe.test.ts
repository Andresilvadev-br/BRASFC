import { describe, expect, it } from 'vitest';
import { UCL_2026, UEL_2026 } from '#lib/data/world/2026/europe-2026-27.ts';
import {
	EUROPE_MATCHDAYS, KO_STAGES, UCL, UEL, drawLeaguePhase, europeDate, europeFixtures, europeParticipation, europeTable, europeView,
	initialEurope, prepareEurope, projectEurope, sanitizeEurope, settleEuropeMatchday, type EuropeState
} from '#lib/domain/europe.ts';
import type { StoredRoundResult } from '#lib/domain/league.ts';
import { createRng } from '#lib/domain/rng.ts';

const country = (id: string) => id.split('/')[1];

describe('Copas europeias · edição 2026/27', () => {
	it('36 clubes distintos em cada copa, nenhum nas duas, substitutos marcados', () => {
		const ucl = UCL_2026.pots.flat();
		const uel = UEL_2026.pots.flat();
		expect(new Set(ucl).size).toBe(36);
		expect(new Set(uel).size).toBe(36);
		expect(ucl.filter((id) => uel.includes(id))).toEqual([]);
		expect(Object.keys(UCL_2026.substitutes)).toEqual(['aze/qarabag-agdam']);
		expect(Object.keys(UEL_2026.substitutes).sort()).toEqual(['nor/molde-fk', 'por/sc-braga']);
	});

	it('sorteio: 8 rodadas completas, 8 adversários diferentes, 4 em casa e 4 fora, sem rival do mesmo país', () => {
		for (const edition of [UCL_2026, UEL_2026]) {
			const rounds = drawLeaguePhase(edition.pots, 1234);
			expect(rounds).toHaveLength(8);
			const opponents = new Map<string, string[]>();
			const home = new Map<string, number>();
			for (const round of rounds) {
				const seen = round.flat();
				expect(new Set(seen).size).toBe(36);
				for (const [a, b] of round) {
					expect(country(a)).not.toBe(country(b));
					opponents.set(a, [...(opponents.get(a) ?? []), b]);
					opponents.set(b, [...(opponents.get(b) ?? []), a]);
					home.set(a, (home.get(a) ?? 0) + 1);
				}
			}
			for (const [id, list] of opponents) {
				expect(new Set(list).size).toBe(8);
				expect(home.get(id)).toBe(4);
			}
			// Potes: dois adversários de cada pote para quase todos (o sorteio é uma projeção).
			const potOf = new Map(edition.pots.flatMap((p, i) => p.map((id) => [id, i] as const)));
			let balanced = 0;
			for (const list of opponents.values()) {
				const count = [0, 0, 0, 0];
				for (const o of list) count[potOf.get(o)!]++;
				if (count.every((n) => n === 2)) balanced++;
			}
			expect(balanced).toBe(36);
		}
	});

	it('datas: terça (Champions) e quinta (Europa League), de setembro à final em maio', () => {
		const dates = Array.from({ length: EUROPE_MATCHDAYS }, (_, i) => europeDate(UCL, 2026, i + 1));
		expect(dates[0]).toBe('2026-09-15');
		expect(dates.at(-1)).toBe('2027-05-29');
		expect([...dates].sort()).toEqual(dates);
		expect(europeDate(UEL, 2026, 1)).toBe('2026-09-17');
		expect(europeDate(UEL, 2026, 17)).toBe('2027-05-19');
	});
});

/** Simula uma edição inteira com placares aleatórios (empates incluídos, para os pênaltis). */
function simulate(state: EuropeState, seed: number) {
	const rng = createRng(seed);
	const results: StoredRoundResult[] = [];
	const strength = () => 70;
	for (let md = 1; md <= EUROPE_MATCHDAYS; md++) {
		state = prepareEurope(state, results, seed, strength);
		const fixtures = europeFixtures(state).filter((f) => f.round === md);
		for (const f of fixtures) results.push({ home: f.home, away: f.away, homeGoals: rng.int(0, 3), awayGoals: rng.int(0, 3), round: md, competition: f.competition });
		for (const comp of state.comps) state = settleEuropeMatchday(state, comp.id, md, results, seed, strength);
	}
	return { state: prepareEurope(state, results, seed, strength), results };
}

describe('Copas europeias · temporada completa', () => {
	it('fase de liga → playoff → oitavas → quartas → semifinal → final, com campeão e save válido', () => {
		const { state, results } = simulate(initialEurope(2026, 77)!, 77);
		for (const comp of state.comps) {
			expect(comp.stages.map((s) => s.length)).toEqual([8, 8, 4, 2, 1]);
			expect(results.filter((r) => r.competition === comp.id)).toHaveLength(144 + 16 + 16 + 8 + 4 + 1);
			const table = europeTable(comp, results);
			expect(table.every((r) => r.played === 8)).toBe(true);
			// 1º enfrenta o vencedor de 16º × 17º; o mais bem colocado decide em casa.
			const ids = table.map((r) => r.clubId);
			expect(comp.stages[0][7]).toEqual([ids[16], ids[15]]);
			expect(comp.stages[1][0][1]).toBe(ids[0]);
			expect(KO_STAGES.length).toBe(5);
		}
		const view = europeView(state, results, 77, () => 70);
		for (const v of view) expect(v.champion).toBeTruthy();
		const champion = view[0].champion!;
		expect(europeParticipation(state, results, 77, () => 70, champion)[0]).toMatchObject({ status: 'campeao', competition: UCL });
		const last = view[0].table.at(-1)!.clubId;
		expect(europeParticipation(state, results, 77, () => 70, last)[0]).toMatchObject({ status: 'eliminado' });
		expect(sanitizeEurope(JSON.parse(JSON.stringify(state)))).toEqual(state);
		expect(sanitizeEurope({ season: 2026, comps: [{ id: UCL, pots: [] }] })).toBeNull();
	});

	it('próxima edição: vagas da liga jogável pela tabela final, demais países mantidos', () => {
		const first = initialEurope(2026, 5)!;
		const spain = first.comps[0].pots.flat().filter((id) => country(id) === 'esp');
		const table = ['world/esp/girona-fc', 'world/esp/real-madrid', 'world/esp/fc-barcelona', 'world/esp/sevilla-fc', 'world/esp/valencia-cf', 'world/esp/real-sociedad', 'world/esp/rc-celta', 'world/esp/villarreal-cf']
			.map((clubId) => ({ clubId }));
		const next = projectEurope(first, { 'league/esp/1': table }, 2027, 5, () => 70);
		const ucl = next.comps.find((c) => c.id === UCL)!.pots.flat();
		const uel = next.comps.find((c) => c.id === UEL)!.pots.flat();
		expect(ucl.filter((id) => country(id) === 'esp').sort()).toEqual(table.slice(0, spain.length).map((r) => r.clubId).sort());
		expect(uel.filter((id) => country(id) === 'esp').sort()).toEqual(table.slice(spain.length, spain.length + 2).map((r) => r.clubId).sort());
		expect(ucl).toContain('world/eng/arsenal');
		expect(next.comps.every((c) => c.edition === 'projetada' && c.league.length === 8)).toBe(true);
	});
});
