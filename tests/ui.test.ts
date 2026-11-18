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
		expect(body).toContain('aria-checked="true" title="Acelerado"');
		expect(body).toMatch(/class="mod[ "]/); // ponto dourado: diferente do preset
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
		for (const f of ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '5-3-2', '4-2-2-2', '3-4-3']) expect(body).toContain(f);
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
