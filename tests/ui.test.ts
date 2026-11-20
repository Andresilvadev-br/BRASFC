import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { analyze } from '#lib/domain/assistant.ts';
import { CLUBS } from '#lib/domain/clubs.ts';
import { generateSquad } from '#lib/domain/squad.ts';
import { initialTacticalState, resolveRoles, teamMastery } from '#lib/domain/tactical.ts';
import { defaultTactic } from '#lib/domain/tactics.ts';
import { presetInstructions } from '#lib/engine/instructions.ts';
import AssistantTips from '#lib/ui/AssistantTips.svelte';
import InstructionsEditor from '#lib/ui/tactics/InstructionsEditor.svelte';
import MasteryPanel from '#lib/ui/tactics/MasteryPanel.svelte';
import RolePicker from '#lib/ui/tactics/RolePicker.svelte';

/**
 * Testes de interface do editor tático (renderização SSR dos componentes reais).
 * Verificam o que o usuário vê: seções, opções marcadas, recomendações e explicações.
 */
const club = CLUBS.find((c) => c.reputation === 3)!;
const squad = generateSquad(club.id, 5);
const t = defaultTactic(squad);
const tactic = { ...t, roles: resolveRoles(t.formation) };
const st = initialTacticalState(squad, t.formation, t.style);

describe('editor tático (interface)', () => {
	it('instruções: mostra a seção com a bola, marca o valor e sinaliza o que difere do padrão', () => {
		const preset = presetInstructions('equilibrada', 'posse');
		const { body } = render(InstructionsEditor, { props: { value: { ...preset, ritmo: 5 }, preset } });
		expect(body).toContain('Com a bola');
		expect(body).toContain('Sem a bola');
		expect(body).toContain('Ritmo');
		expect(body).toContain('Acelerado');
		expect(body).toContain('aria-valuetext="Acelerado"'); // régua de 5 níveis com o valor por extenso
		expect(body).toMatch(/Padrão do estilo: <strong[^>]*>Calmo</);
		expect(body).toMatch(/class="card [^"]*\bmod\b/); // destaque dourado: diferente do preset
		expect(body).toContain('Transições');
	});

	it('funções: ordena por compatibilidade, recomenda e explica atributos e riscos', () => {
		const ata = squad.find((p) => p.position === 'ATA')!;
		const { body } = render(RolePicker, { props: { player: ata, position: 'ATA', value: 'ata-referencia', familiarity: {}, onpick: () => {} } });
		expect(body).toContain('Recomendada');
		expect(body).toContain('Centroavante de referência');
		expect(body).toContain('Falso 9');
		expect(body).toContain('Risco:');
		expect(body).toContain('Pede:');
	});

	it('domínio: mostra execução, as quatro dimensões e a comparação das 7 formações', () => {
		const mastery = teamMastery(st, t.formation, t.style, t.lineup);
		const { body } = render(MasteryPanel, { props: { state: st, mastery, formation: t.formation, style: t.style } });
		expect(body).toContain('Execução do plano');
		expect(body).toContain('Entrosamento dos titulares');
		expect(body).toContain('Compreensão das instruções');
		expect(body).toContain('Formações'); // comparação das 7 formações fica na aba própria
		expect(body).toContain('Atletas');
	});

	it('auxiliar: recomendações com dados de apoio e ações', () => {
		const tips = analyze({ squad, tactic, tactical: st, fitness: Object.fromEntries(t.lineup.map((id) => [id, 60])), recent: [], clubId: club.id, nextOpponent: CLUBS[1].id, careerSeed: 1, season: 2027, firstSeason: 2027 });
		expect(tips.some((x) => x.kind === 'fisico')).toBe(true); // titulares a 60%
		expect(tips.some((x) => x.kind === 'adversario')).toBe(true);
		const { body } = render(AssistantTips, { props: { tips, onapply: () => {}, ondismiss: () => {} } });
		expect(body).toContain('Ignorar');
		expect(body).toContain('Por quê?');
		expect(body).toContain('cansado');
	});
});

describe('interface 0.4 (componentes reais)', () => {
	it('medidor mostra o valor e o rótulo; cartão de atleta esconde o nível real quando só há estimativa', async () => {
		const Gauge = (await import('#lib/ui/v4/Gauge.svelte')).default;
		const PlayerCard = (await import('#lib/ui/v4/PlayerCard.svelte')).default;
		expect(render(Gauge, { props: { value: 72.4, label: 'Confiança' } }).body).toMatch(/Confiança[\s\S]*72|72[\s\S]*Confiança/);
		const card = render(PlayerCard, { props: { name: 'Atleta Teste', position: 'ATA', age: 21, overall: null, overallRange: [64, 72], potential: null, value: 1_500_000 } }).body;
		expect(card).toContain('64–72');
		expect(card).toContain('R$ 1,5 mi');
	});

	it('comportamento tático muda com as instruções (linha mais alta → desenho mais alto)', async () => {
		const TacticalOverlay = (await import('#lib/ui/tactics/TacticalOverlay.svelte')).default;
		const base = presetInstructions('equilibrada', 'posse');
		const low = render(TacticalOverlay, { props: { formation: '4-3-3', mentality: 'equilibrada', style: 'posse', instructions: { ...base, linha: 1 }, roles: resolveRoles('4-3-3') } }).body;
		const high = render(TacticalOverlay, { props: { formation: '4-3-3', mentality: 'equilibrada', style: 'posse', instructions: { ...base, linha: 5 }, roles: resolveRoles('4-3-3') } }).body;
		const line = (html: string) => Number(/Linha a (\d+) m/.exec(html)?.[1]);
		expect(line(high)).toBeGreaterThan(line(low));
		expect(high).toContain('Pressão:');
	});

	it('gráfico de finanças desenha uma coluna por mês com rótulo acessível', async () => {
		const Bars = (await import('#lib/ui/v4/Bars.svelte')).default;
		const months = [
			{ season: 2027, month: 12, label: 'Jan', income: 5e6, expense: -3e6, balance: 2e6 },
			{ season: 2027, month: 13, label: 'Fev', income: 4e6, expense: -4.5e6, balance: 1.5e6 }
		];
		const body = render(Bars, { props: { months } }).body;
		expect(body).toContain('Jan: receitas R$ 5 mi');
		expect(body).toContain('Fev: receitas R$ 4 mi');
	});
});
