import { describe, expect, it } from 'vitest';
import { applyCorrections, CLUBES_2026, DATASET_ISSUES, FONTES, IDENTIDADE, TEMPORADA_2026, toGameClub, validateDataset } from '#lib/data/brasil.ts';
import { generateSquadFor } from '#lib/domain/squad.ts';

describe('base Brasil 2026', () => {
	it('valida sem erros: 3 séries × 20 clubes, todos com fonte', () => {
		expect(DATASET_ISSUES.filter((i) => i.nivel === 'erro')).toEqual([]);
		expect(CLUBES_2026).toHaveLength(60);
		for (const s of ['A', 'B', 'C']) expect(CLUBES_2026.filter((c) => c.serie === s)).toHaveLength(20);
	});

	it('o validador detecta dados inválidos', () => {
		const bad = [...CLUBES_2026, { ...CLUBES_2026[0], uf: 'XX', fontes: ['inexistente'] }];
		const issues = validateDataset(bad, FONTES, IDENTIDADE, TEMPORADA_2026);
		expect(issues.some((i) => i.mensagem.includes('ID duplicado'))).toBe(true);
		expect(issues.some((i) => i.mensagem.includes('UF inválida'))).toBe(true);
		expect(issues.some((i) => i.mensagem.includes('Fonte desconhecida'))).toBe(true);
	});

	it('correções preenchem campos e saem das pendências', () => {
		const [c] = applyCorrections(CLUBES_2026.slice(0, 1), [{ clube: CLUBES_2026[0].id, campo: 'estadio', valor: 'Teste', fonte: FONTES[0].id, motivo: 'teste' }]);
		expect(c.estadio).toBe('Teste');
		expect(c.pendencias).not.toContain('estadio');
	});

	it('elencos pendentes ficam marcados como fictícios', () => {
		const club = toGameClub(CLUBES_2026[0]);
		const squad = generateSquadFor(club, 1, { pending: true });
		expect(squad.every((p) => p.pending === true && p.name.length > 3)).toBe(true);
	});
});
