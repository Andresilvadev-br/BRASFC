import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import '#lib/data/brasil.ts';
import { EVENT_LABELS, competitionLabel, eventLabel } from '#lib/ui/match/event-labels.ts';
import ActionCard from '#lib/ui/cards/ActionCard.svelte';
import MatchCard from '#lib/ui/cards/MatchCard.svelte';
import SelectCard from '#lib/ui/cards/SelectCard.svelte';
import StatCard from '#lib/ui/cards/StatCard.svelte';
import StatsCompare from '#lib/ui/match/StatsCompare.svelte';

/** Biblioteca de cards (0.10) e textos da transmissão: renderização SSR dos componentes reais. */
describe('cards e transmissão', () => {
	it('traduz todos os tipos de lance, sem expor chaves técnicas', () => {
		for (const [key, label] of Object.entries(EVENT_LABELS)) {
			expect(label).not.toMatch(/_/);
			expect(label).not.toBe(key);
		}
		expect(eventLabel('shot_off')).toBe('Finalização para fora');
		expect(eventLabel('desconhecido')).toBe('Lance');
		expect(competitionLabel('serie-a')).toBe('Série A');
		expect(competitionLabel('copa-do-brasil')).toBe('Copa do Brasil');
	});

	it('ActionCard indisponível mostra o motivo e não é clicável', () => {
		const body = render(ActionCard, { props: { icon: 'briefcase', title: 'Buscar transferência', description: 'Sondagem pelo empresário', status: 'Janela fechada', disabled: true, onclick: () => {} } }).body;
		expect(body).toContain('Janela fechada');
		expect(body).toMatch(/<button[^>]*disabled/);
	});

	it('SelectCard expõe o estado selecionado para leitores de tela', () => {
		const on = render(SelectCard, { props: { title: 'Finalização', selected: true, onselect: () => {} } }).body;
		const off = render(SelectCard, { props: { title: 'Passe', selected: false, onselect: () => {} } }).body;
		expect(on).toContain('aria-checked="true"');
		expect(off).toContain('aria-checked="false"');
	});

	it('MatchCard mostra placar e nomes acessíveis dos clubes', () => {
		const body = render(MatchCard, { props: { home: 'flamengo', away: 'palmeiras', score: { home: 2, away: 1 }, status: 'Encerrado' } }).body;
		expect(body).toContain('Encerrado');
		expect(body).toMatch(/2 a 1/);
	});

	it('StatCard informa escala e variação reais', () => {
		const body = render(StatCard, { props: { label: 'Confiança', value: 64, max: 100, delta: 3, hint: 'desde a última rodada' } }).body;
		expect(body).toContain('aria-valuenow="64"');
		expect(body).toContain('▲ 3');
		const flat = render(StatCard, { props: { label: 'Geral', value: 70 } }).body;
		expect(flat).not.toContain('role="meter"');
	});

	it('StatsCompare compara as estatísticas oficiais das equipes', () => {
		const base = { shots: 0, shotsOnTarget: 0, xg: 0, passes: 0, passesCompleted: 0, possessionTicks: 0, corners: 0, fouls: 0, offsides: 0, yellows: 0, reds: 0 };
		const body = render(StatsCompare, { props: {
			home: { id: 'flamengo', short: 'FLA', colors: { primary: '#c00' } }, away: { id: 'palmeiras', short: 'PAL', colors: { primary: '#060' } },
			stats: { home: { ...base, possessionTicks: 60, shots: 7, xg: 1.234, passes: 100, passesCompleted: 85 }, away: { ...base, possessionTicks: 40, shots: 3 } }
		} }).body;
		expect(body).toContain('Posse de bola');
		expect(body).toMatch(/60%[\s\S]*40%/);
		expect(body).toContain('1.23');
		expect(body).toContain('85%');
	});
});
