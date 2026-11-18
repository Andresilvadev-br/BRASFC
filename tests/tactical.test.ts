import { describe, expect, it } from 'vitest';
import '#lib/data/brasil.ts';
import { CLUBS } from '#lib/domain/clubs.ts';
import { applyTrainingWeek, recoverFitness, sanitizePlan, weekLoad, type TrainingPlan } from '#lib/domain/drills.ts';
import { closeSeason, initialLeague, seasonFixtures, type StoredRoundResult } from '#lib/domain/league.ts';
import { playerHistory, playerTotals } from '#lib/domain/playerstats.ts';
import { generateSquad } from '#lib/domain/squad.ts';
import { engineFamiliarity, initialTacticalState, learnFromMatch, similarity, syncSquad, teamMastery } from '#lib/domain/tactical.ts';
import { autoLineup, sanitizeTactic, defaultTactic } from '#lib/domain/tactics.ts';
import { COACH_PROFILES, inMatchAdjustment, planAgainst, type MatchView } from '#lib/engine/ai-coach.ts';
import { overridesOf, paramsFromInstructions, presetInstructions } from '#lib/engine/instructions.ts';
import { Match } from '#lib/engine/match.ts';
import { recommendRoles, roleCompatibility } from '#lib/engine/roles.ts';
import { tacticalParams } from '#lib/engine/tactics.ts';
import { buildTeamSetup } from '#lib/engine/teams.ts';
import type { PlayerStats } from '#lib/engine/types.ts';

const club = CLUBS.find((c) => c.reputation === 3)!;
const squad = generateSquad(club.id, 11);
const lineup = autoLineup('4-3-3', squad);
const apps = lineup.map((id) => ({ id, minutes: 90, role: 'mc-organizador' as const }));

describe('domínio tático progressivo', () => {
	it('evolui com partidas, com retorno decrescente e sem dominar em 3 jogos', () => {
		let st = initialTacticalState(squad, '4-3-3', 'posse');
		const start = st.formations['4-3-3'];
		const gains: number[] = [];
		for (let i = 0; i < 38; i++) {
			const before = st.formations['4-3-3'];
			st = learnFromMatch(st, { formation: '4-3-3', style: 'posse', appearances: apps, squad });
			gains.push(st.formations['4-3-3'] - before);
		}
		const after3 = start + gains.slice(0, 3).reduce((a, b) => a + b, 0);
		expect(after3).toBeLessThan(60); // três jogos não bastam
		expect(gains[0]).toBeGreaterThan(gains[37]); // retorno decrescente
		expect(st.formations['4-3-3']).toBeGreaterThan(70); // uma temporada (38 jogos) de continuidade: "muito bom"
		expect(st.formations['4-3-3']).toBeLessThanOrEqual(100);
	});

	it('trocar de formação aproveita parte do conhecimento e não apaga o anterior', () => {
		let st = initialTacticalState(squad, '4-3-3', 'posse');
		for (let i = 0; i < 20; i++) st = learnFromMatch(st, { formation: '4-3-3', style: 'posse', appearances: apps, squad });
		const domain433 = st.formations['4-3-3'];
		const before4231 = st.formations['4-2-3-1'];
		const before532 = st.formations['5-3-2'];
		expect(similarity('4-3-3', '4-2-3-1')).toBeGreaterThan(similarity('4-3-3', '5-3-2'));
		expect(before4231).toBeGreaterThan(before532); // o parecido aprendeu junto
		for (let i = 0; i < 5; i++) st = learnFromMatch(st, { formation: '4-2-3-1', style: 'posse', appearances: apps, squad });
		expect(st.formations['4-3-3']).toBeGreaterThan(domain433 - 3); // esquece devagar
	});

	it('mudança de elenco: novo atleta começa pouco entrosado e quem sai deixa de contar', () => {
		const st = initialTacticalState(squad, '4-3-3', 'posse');
		const newcomer = { ...squad[0], id: `${club.id}-novo` };
		const next = syncSquad(st, [...squad.slice(1), newcomer]);
		expect(next.integration[newcomer.id]).toBe(15);
		const learned = learnFromMatch(next, { formation: '4-3-3', style: 'posse', appearances: apps, squad: [...squad.slice(1), newcomer] });
		expect(learned.integration[squad[0].id]).toBeUndefined();
		const m = teamMastery(learned, '4-3-3', 'posse', [...lineup.slice(1), newcomer.id]);
		expect(m.cohesion).toBeLessThan(teamMastery(learned, '4-3-3', 'posse', lineup.slice(1).concat(lineup[1])).cohesion);
	});

	it('mudar instruções reduz a compreensão (sem zerar)', () => {
		const preset = presetInstructions('equilibrada', 'posse');
		let st = initialTacticalState(squad, '4-3-3', 'posse');
		st = learnFromMatch(st, { formation: '4-3-3', style: 'posse', instructions: preset, appearances: apps, squad });
		const changed = { ...preset, linha: 5 as const, pressao: 5 as const, ritmo: 5 as const };
		const m = teamMastery(st, '4-3-3', 'posse', lineup, changed);
		expect(m.instructions).toBeLessThan(st.instructions);
		expect(m.instructions).toBeGreaterThan(0);
	});

	it('o motor recebe execução coletiva e domínio por função', () => {
		const st = initialTacticalState(squad, '4-3-3', 'posse');
		const fam = engineFamiliarity(st, '4-3-3', 'posse', lineup, Array(11).fill('mc-organizador'));
		expect(fam.execution).toBeGreaterThan(0);
		expect(Object.keys(fam.roles ?? {})).toHaveLength(11);
	});
});

describe('funções individuais', () => {
	it('compatibilidade depende dos atributos e cai fora da posição', () => {
		const ata = squad.find((p) => p.position === 'ATA')!;
		expect(roleCompatibility(ata.attributes, 'ata-referencia', 'ATA')).toBeGreaterThan(roleCompatibility(ata.attributes, 'ata-referencia', 'ZAG'));
		const recs = recommendRoles(ata.attributes, 'ATA');
		expect(recs.length).toBeGreaterThanOrEqual(3);
		expect(recs[0].score).toBeGreaterThanOrEqual(recs[recs.length - 1].score);
		expect(recs[0].reason.length).toBeGreaterThan(0);
	});

	it('tática salva aceita funções e instruções válidas e descarta as inválidas', () => {
		const t = sanitizeTactic({ ...defaultTactic(squad), roles: ['gk-libero', ...Array(10).fill('xx')], instructions: { linha: 5, pressao: 9 } }, squad)!;
		expect(t.roles?.[0]).toBe('gk-libero');
		expect(t.roles?.[1]).not.toBe('xx');
		expect(t.instructions?.linha).toBe(5);
		expect(t.instructions?.pressao).toBe(presetInstructions('equilibrada', 'posse').pressao);
	});
});

describe('instruções avançadas', () => {
	it('o preset reproduz exatamente os parâmetros calibrados', () => {
		for (const m of ['defensiva', 'equilibrada', 'ofensiva'] as const) {
			const base = tacticalParams(m, 'posse');
			const p = paramsFromInstructions(m, 'posse', presetInstructions(m, 'posse'));
			expect(p.defLine).toBeCloseTo(base.defLine);
			expect(p.tempo).toBeCloseTo(base.tempo);
			expect(p.pressDistance).toBeCloseTo(base.pressDistance);
		}
	});

	it('cada instrução muda o motor com contrapartida', () => {
		const preset = presetInstructions('equilibrada', 'posse');
		const base = paramsFromInstructions('equilibrada', 'posse', preset);
		const press = paramsFromInstructions('equilibrada', 'posse', { ...preset, pressao: 5 });
		expect(press.pressDistance).toBeGreaterThan(base.pressDistance);
		expect(press.fatigueCost).toBeGreaterThan(base.fatigueCost);
		const fast = paramsFromInstructions('equilibrada', 'posse', { ...preset, ritmo: 5 });
		expect(fast.tempo).toBeLessThan(base.tempo);
		expect(fast.passAccuracy).toBeLessThan(base.passAccuracy);
		const aggr = paramsFromInstructions('equilibrada', 'posse', { ...preset, agressividade: 5 });
		expect(aggr.aggression).toBeGreaterThan(1);
	});

	it('trocar o preset preserva os ajustes do usuário', () => {
		const a = presetInstructions('equilibrada', 'posse');
		const mine = { ...a, linha: 5 as const };
		const custom = overridesOf(mine, a);
		const next = { ...presetInstructions('ofensiva', 'pressao'), ...custom };
		expect(next.linha).toBe(5);
		expect(Object.keys(custom)).toEqual(['linha']);
	});
});

describe('treinos e recuperação', () => {
	const ctx = { formation: '4-3-3' as const, style: 'posse' as const, lineup, roles: Array(11).fill('mc-organizador'), squad };
	it('treino melhora a dimensão treinada com limite por semana', () => {
		const st = initialTacticalState(squad, '4-3-3', 'posse');
		const plan: TrainingPlan = { sessions: ['formacao', 'formacao', 'formacao', 'formacao', 'formacao'], intensity: 'intensa' };
		const after = applyTrainingWeek(st, plan, ctx);
		const gain = after.formations['4-3-3'] - st.formations['4-3-3'];
		expect(gain).toBeGreaterThan(0);
		expect(gain).toBeLessThan(6); // repetir o mesmo treino rende menos
		const sp = applyTrainingWeek(st, { sessions: ['bolas-paradas', 'descanso', 'descanso', 'descanso', 'descanso'], intensity: 'normal' }, ctx);
		expect(sp.setPieces).toBeGreaterThan(st.setPieces);
	});

	it('treino intenso recupera menos; descanso recupera mais', () => {
		const tired = Object.fromEntries(squad.map((p) => [p.id, 60]));
		const hard = recoverFitness(tired, squad, { sessions: ['pressao', 'pressao', 'contra-ataque', 'movimentacao', 'entrosamento'], intensity: 'intensa' });
		const soft = recoverFitness(tired, squad, { sessions: ['descanso', 'formacao', 'descanso', 'posse', 'descanso'], intensity: 'leve' });
		expect(weekLoad({ sessions: ['pressao', 'pressao', 'pressao', 'pressao', 'pressao'], intensity: 'intensa' }).recovery).toBeLessThan(10);
		expect(soft[squad[0].id]).toBeGreaterThan(hard[squad[0].id]);
		expect(sanitizePlan({ sessions: ['xx'] }).sessions).toHaveLength(5);
	});
});

describe('IA adversária', () => {
	const view: MatchView = { minute: 70, half: 2, goalDiff: -1, shotsFor: 6, shotsAgainst: 8, onTargetAgainst: 2, possession: 50, avgCondition: 75, playersOnPitch: 11, oppPlayersOnPitch: 11, oppDefLine: 30, fastForwards: false };
	const base = presetInstructions('equilibrada', 'posse');
	it('perdendo no fim, arrisca; com um a menos, se protege primeiro', () => {
		const p = COACH_PROFILES.ofensivo;
		const go = inMatchAdjustment(p, base, 'equilibrada', view, new Set(), 0);
		expect(go?.key).toBe('buscar');
		expect(go?.change.presencaArea).toBeGreaterThan(base.presencaArea);
		const ten = inMatchAdjustment(p, base, 'equilibrada', { ...view, playersOnPitch: 10 }, new Set(), 0.99);
		expect(ten?.key).toBe('menos');
		expect(inMatchAdjustment(p, base, 'equilibrada', view, new Set(['buscar']), 0)).not.toEqual(go);
	});

	it('o plano pré-jogo reage ao que foi observado (e só com observação)', () => {
		const scout = { samples: 3, highPress: true, lowBlock: false, highLine: false, attackingFullbacks: false, centralFocus: false, wideFocus: false, fastForwards: true };
		const plan = planAgainst(COACH_PROFILES.pragmatico, base, scout, () => 0);
		expect(plan.instructions.construcao).toBe(3);
		expect(plan.reasons.length).toBeGreaterThan(0);
		expect(planAgainst(COACH_PROFILES.pragmatico, base, { ...scout, samples: 0 }, () => 0).reasons).toEqual([]);
	});
});

describe('decisões táticas reproduzíveis', () => {
	it('instruções e formação trocadas no jogo são reproduzidas pelo servidor', () => {
		const other = CLUBS.filter((c) => c.reputation === 3)[1];
		const mk = (c: typeof club) => buildTeamSetup({ id: c.id, name: c.name, short: c.short, colors: c.colors }, generateSquad(c.id, 11), { formation: '4-3-3', mentality: 'equilibrada', style: 'posse' });
		const live = new Match({ home: mk(club), away: mk(other), seed: 99, ai: { home: false } });
		for (let i = 0; i < 20 * 60; i++) live.step();
		live.submit('home', { type: 'instructions', value: { ...presetInstructions('equilibrada', 'posse'), pressao: 5, linha: 5 } });
		for (let i = 0; i < 20 * 60; i++) live.step();
		const ids = live.onPitch('home').sort((a, b) => a.slot - b.slot).map((s) => s.id);
		live.submit('home', { type: 'formation', value: '4-2-3-1', lineup: ids, roles: ['gk-libero', ...Array(10).fill('xx')] as never });
		const played = live.runToEnd();
		expect(played.decisions.filter((d) => d.side === 'home').length).toBeGreaterThanOrEqual(2);
		const replay = new Match({ home: mk(club), away: mk(other), seed: 99, ai: { home: false }, replay: played.decisions }).runToEnd();
		expect(JSON.stringify(replay.events)).toBe(JSON.stringify(played.events));
	});
});

describe('temporadas e competições', () => {
	it('fecha a temporada com acesso e rebaixamento e mantém 20 clubes por série', () => {
		const league = initialLeague('brasil', 2026);
		const fx = seasonFixtures(league, 123);
		expect(fx.filter((f) => f.competition === 'serie-a')).toHaveLength(380);
		expect(fx.filter((f) => f.competition === 'serie-c')).toHaveLength(190); // 1ª fase em turno único
		// resultados sintéticos: o mandante sempre vence (ordem determinística)
		const results: StoredRoundResult[] = fx.map((f) => ({ round: f.round, home: f.home, away: f.away, homeGoals: 1, awayGoals: 0, competition: f.competition }));
		const out = closeSeason(league, results);
		expect(out.moves.filter((m) => m.reason === 'acesso')).toHaveLength(8);
		expect(out.moves.filter((m) => m.reason === 'rebaixamento')).toHaveLength(8);
		for (const d of ['serie-a', 'serie-b', 'serie-c'] as const) expect(out.next.divisions[d]).toHaveLength(20);
		expect(out.next.season).toBe(2027);
		const all = Object.values(out.next.divisions).flat();
		expect(new Set(all).size).toBe(60);
	});
});

describe('estatísticas acumuladas', () => {
	const s = (o: Partial<PlayerStats>): PlayerStats => ({ minutes: 90, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, passes: 10, passesCompleted: 8, keyPasses: 0, dribbles: 0, dribblesFailed: 0, tackles: 0, interceptions: 0, clearances: 0, aerialsWon: 0, foulsCommitted: 0, foulsWon: 0, saves: 0, goalsConceded: 0, yellow: 0, red: 0, offsides: 0, errorsLeadingToGoal: 0, rating: 7, condition: 70, ...o });
	const summary = (players: Record<string, PlayerStats>, starters: string[]) => ({ stats: {} as never, players, goals: [], cards: [], starters });
	it('somam por temporada, titularidades e média de notas, sem duplicar', () => {
		const m = [
			{ season: 2026, round: 1, home: 'a', away: 'b', homeGoals: 1, awayGoals: 0, summary: summary({ eu: s({ goals: 1, rating: 8 }) }, ['eu']) },
			{ season: 2026, round: 2, home: 'a', away: 'b', homeGoals: 0, awayGoals: 0, summary: summary({ eu: s({ minutes: 20, rating: 6 }) }, []) },
			{ season: 2027, round: 1, home: 'a', away: 'b', homeGoals: 2, awayGoals: 0, summary: summary({ eu: s({ assists: 1, rating: 7 }) }, ['eu']) }
		];
		const h = playerHistory(m, 'eu');
		expect(h.all.games).toBe(3);
		expect(h.all.starts).toBe(2);
		expect(h.all.goals).toBe(1);
		expect(h.all.rating).toBeCloseTo(7);
		expect(h.seasons.find((x) => x.season === 2026)!.totals.minutes).toBe(110);
		expect(playerTotals(m).eu.assists).toBe(1);
	});
});
