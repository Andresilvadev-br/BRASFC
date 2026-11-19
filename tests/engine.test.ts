import { describe, expect, it } from 'vitest';
import { CLUBS } from '#lib/domain/clubs.ts';
import { generateSquad } from '#lib/domain/squad.ts';
import { autoLineup, sameTactic, sanitizeTactic, tacticKey, type Tactic } from '#lib/domain/tactics.ts';
import { ALL_ATTRIBUTES, computeOverall, generateAttributes } from '#lib/engine/attributes.ts';
import { Match, simulateMatch } from '#lib/engine/match.ts';
import { teamStatsFromEvents } from '#lib/engine/stats.ts';
import { tacticalParams } from '#lib/engine/tactics.ts';
import { buildTeamSetup } from '#lib/engine/teams.ts';
import type { Mentality, PlayStyle } from '#lib/domain/tactics.ts';
import { createRng } from '#lib/domain/rng.ts';

const mid = CLUBS.filter((c) => c.reputation === 3);
const strong = CLUBS.find((c) => c.reputation === 5)!;
const weak = CLUBS.find((c) => c.reputation === 1)!;

function team(club: (typeof CLUBS)[number], mentality: Mentality = 'equilibrada', style: PlayStyle = 'posse') {
	return buildTeamSetup(
		{ id: club.id, name: club.name, short: club.short, colors: club.colors },
		generateSquad(club.id, 7),
		{ formation: '4-3-3', mentality, style }
	);
}

describe('motor: determinismo', () => {
	it('mesma semente gera exatamente a mesma partida', () => {
		const a = simulateMatch({ home: team(mid[0]), away: team(mid[1]), seed: 42 });
		const b = simulateMatch({ home: team(mid[0]), away: team(mid[1]), seed: 42 });
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it('sementes diferentes geram partidas diferentes', () => {
		const a = simulateMatch({ home: team(mid[0]), away: team(mid[1]), seed: 1 });
		const b = simulateMatch({ home: team(mid[0]), away: team(mid[1]), seed: 2 });
		expect(JSON.stringify(a.events)).not.toBe(JSON.stringify(b.events));
	});

	it('decisões do treinador são reproduzidas pelo servidor (replay)', () => {
		const live = new Match({ home: team(mid[0]), away: team(mid[1]), seed: 77, ai: { home: false } });
		for (let i = 0; i < 30 * 60; i++) live.step();
		live.submit('home', { type: 'mentality', value: 'ofensiva' });
		const out = live.onPitch('home').find((s) => s.slot === 9)!.id;
		live.submit('home', { type: 'sub', outId: out, inId: live.bench('home')[1].id });
		const played = live.runToEnd();
		expect(played.decisions.some((d) => d.decision.type === 'sub' && !d.rejected)).toBe(true);

		const replayed = new Match({ home: team(mid[0]), away: team(mid[1]), seed: 77, ai: { home: false }, replay: played.decisions }).runToEnd();
		expect(JSON.stringify(replayed.events)).toBe(JSON.stringify(played.events));
		expect([replayed.homeGoals, replayed.awayGoals]).toEqual([played.homeGoals, played.awayGoals]);
	});

	it('velocidade de exibição não altera o resultado (passo a passo = direto)', () => {
		const m = new Match({ home: team(mid[2]), away: team(mid[3]), seed: 9 });
		let n = 0;
		while (m.step()) n++;
		const direct = simulateMatch({ home: team(mid[2]), away: team(mid[3]), seed: 9 });
		expect(JSON.stringify(m.result())).toBe(JSON.stringify(direct));
		expect(n).toBeGreaterThan(90 * 60);
	});
});

describe('motor: consistência das regras', () => {
	const results = Array.from({ length: 40 }, (_, i) =>
		simulateMatch({ home: team(mid[i % mid.length]), away: team(mid[(i + 1) % mid.length]), seed: 300 + i })
	);

	it('nenhum evento depois do apito final e eventos em ordem', () => {
		for (const r of results) {
			const end = r.events.findIndex((e) => e.type === 'full_time');
			expect(end).toBe(r.events.length - 1);
			for (let i = 1; i < r.events.length; i++) expect(r.events[i].tick).toBeGreaterThanOrEqual(r.events[i - 1].tick);
		}
	});

	it('expulsos não voltam a participar da partida', () => {
		for (const r of results) {
			for (const red of r.events.filter((e) => e.type === 'red')) {
				const after = r.events.filter((e) => e.tick > red.tick + 1 && (e.player === red.player) && e.type !== 'full_time');
				expect(after).toEqual([]);
			}
		}
	});

	it('substituições respeitam o limite e envolvem atletas válidos', () => {
		for (const r of results) {
			for (const side of ['home', 'away'] as const) {
				const subs = r.events.filter((e) => e.type === 'sub' && e.side === side);
				expect(subs.length).toBeLessThanOrEqual(5);
				const ins = new Set(subs.map((s) => s.player));
				expect(ins.size).toBe(subs.length);
			}
		}
	});

	it('placar = gols nos eventos = estatísticas derivadas dos eventos', () => {
		for (const r of results) {
			const goals = (side: 'home' | 'away') => r.events.filter((e) => e.type === 'goal' && e.side === side).length;
			expect(r.homeGoals).toBe(goals('home'));
			expect(r.awayGoals).toBe(goals('away'));
			const stats = teamStatsFromEvents(r.events);
			expect(stats.home.shots).toBe(r.stats.home.shots);
			expect(stats.away.passes).toBe(r.stats.away.passes);
			const scorers = Object.values(r.players).reduce((s, p) => s + p.goals, 0);
			expect(scorers).toBe(r.homeGoals + r.awayGoals);
		}
	});

	it('notas ficam entre 3 e 10', () => {
		for (const r of results) for (const p of Object.values(r.players)) {
			if (p.minutes > 0) {
				expect(p.rating).toBeGreaterThanOrEqual(3);
				expect(p.rating).toBeLessThanOrEqual(10);
			}
		}
	});
});

describe('motor: estatística em amostra grande', () => {
	it('médias dentro de faixas plausíveis de futebol profissional', () => {
		const n = 80;
		let goals = 0, shots = 0, comp = 0, passes = 0, draws = 0;
		for (let i = 0; i < n; i++) {
			const r = simulateMatch({ home: team(mid[i % mid.length]), away: team(mid[(i + 1) % mid.length]), seed: 2000 + i });
			goals += r.homeGoals + r.awayGoals;
			if (r.homeGoals === r.awayGoals) draws++;
			for (const s of [r.stats.home, r.stats.away]) {
				shots += s.shots;
				passes += s.passes;
				comp += s.passesCompleted;
			}
		}
		expect(goals / n).toBeGreaterThan(1.6);
		expect(goals / n).toBeLessThan(3.4);
		expect(shots / n / 2).toBeGreaterThan(8);
		expect(shots / n / 2).toBeLessThan(18);
		expect(comp / passes).toBeGreaterThan(0.7);
		expect(comp / passes).toBeLessThan(0.9);
		expect(draws / n).toBeGreaterThan(0.12);
		expect(draws / n).toBeLessThan(0.45);
	});

	it('time mais forte vence mais, mas não sempre', () => {
		let w = 0, notWin = 0;
		for (let i = 0; i < 60; i++) {
			const r = simulateMatch({ home: team(strong), away: team(weak), seed: 900 + i });
			if (r.homeGoals > r.awayGoals) w++; else notWin++;
		}
		expect(w).toBeGreaterThan(30);
		expect(notWin).toBeGreaterThan(0);
	});
});

describe('motor: táticas e atributos', () => {
	it('mentalidades e estilos mudam parâmetros concretos', () => {
		const d = tacticalParams('defensiva', 'posse');
		const o = tacticalParams('ofensiva', 'posse');
		expect(o.defLine).toBeGreaterThan(d.defLine);
		expect(d.boxDefense).toBeGreaterThan(o.boxDefense);
		expect(tacticalParams('equilibrada', 'pressao').pressers).toBeGreaterThan(tacticalParams('equilibrada', 'posse').pressers);
		expect(tacticalParams('equilibrada', 'bola-longa').longBias).toBeGreaterThan(0);
	});

	it('gera atributos completos e overall coerente com a posição', () => {
		const rng = createRng(5);
		const { attributes } = generateAttributes('ATA', 75, rng);
		for (const k of ALL_ATTRIBUTES) {
			expect(attributes[k]).toBeGreaterThanOrEqual(1);
			expect(attributes[k]).toBeLessThanOrEqual(99);
		}
		expect(Math.abs(computeOverall(attributes, 'ATA') - 75)).toBeLessThan(8);
		expect(computeOverall(attributes, 'ATA')).toBeGreaterThan(computeOverall(attributes, 'GOL'));
	});
});

describe('táticas salvas (regressão do Dev 0.2)', () => {
	it('jsonb reordenando chaves não marca a tática como alterada', () => {
		const squad = generateSquad(mid[0].id, 7);
		const t: Tactic = sanitizeTactic({ formation: '4-3-3', lineup: autoLineup('4-3-3', squad), mentality: 'equilibrada', style: 'posse' }, squad)!;
		// Postgres jsonb devolve as chaves em outra ordem.
		const fromDb = JSON.parse(JSON.stringify({ style: t.style, lineup: t.lineup, mentality: t.mentality, formation: t.formation })) as Tactic;
		expect(JSON.stringify(fromDb)).not.toBe(JSON.stringify(t));
		expect(sameTactic(fromDb, t)).toBe(true);
		expect(tacticKey(fromDb)).toBe(tacticKey(t));
	});

	it('nomes antigos de estilo são convertidos; as 5 mentalidades são aceitas', () => {
		const squad = generateSquad(mid[0].id, 7);
		const t = sanitizeTactic({ formation: '4-4-2', lineup: autoLineup('4-4-2', squad), mentality: 'cautelosa', style: 'jogo-direto' } as never, squad)!;
		expect(t.mentality).toBe('cautelosa');
		expect(t.style).toBe('bola-longa');
	});
});

describe('comandos individuais e capitães', () => {
	it('preserva a hierarquia e avança para o vice em substituição ou expulsão', () => {
		const home = team(mid[0]);
		const [captain, vice, next] = home.tactic.lineup.slice(1);
		home.tactic.captains = [captain, vice, next];
		const match = new Match({ home, away: team(mid[1]), seed: 7, ai: { home: false } });
		expect(match.captain('home')).toBe(captain);
		while (match.phase !== 'half_time') match.step();
		expect(match.prepareInterval('home', { type: 'sub', outId: captain, inId: match.bench('home')[0].id })).toBeUndefined();
		expect(match.captain('home')).toBe(vice);
		match.states.get(vice)!.sentOff = true;
		expect(match.captain('home')).toBe(next);
		expect(home.tactic.captains).toEqual([captain, vice, next]);
	});

	it('aplica o posicionamento ao motor e recusa instruções de posição incompatível', () => {
		const home = team(mid[0]);
		const away = team(mid[1]);
		const goalkeeper = home.tactic.lineup[0];
		const baseline = new Match({ home, away, seed: 3, ai: { home: false } });
		const trained = new Match({ home: { ...home, tactic: { ...home.tactic, playerOrders: { [goalkeeper]: 'adiantado' } } }, away, seed: 3, ai: { home: false } });
		expect(trained.states.get(goalkeeper)!.x).toBeGreaterThan(baseline.states.get(goalkeeper)!.x);
		while (trained.phase !== 'half_time') trained.step();
		expect(trained.prepareInterval('home', { type: 'individual', playerId: goalkeeper, order: 'ultrapassar' })).toMatch(/incompatível/);
		expect(trained.prepareInterval('home', { type: 'individual', playerId: goalkeeper, order: 'conservador' })).toBeUndefined();
		expect(trained.teams.home.tactic.playerOrders?.[goalkeeper]).toBe('conservador');
	});
});
