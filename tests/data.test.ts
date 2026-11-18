import { describe, expect, it } from 'vitest';
import { applyCorrections, CLUBES_2026, COPA_2026, DATASET_ISSUES, FONTES, IDENTIDADE, SERIE_D_2026, TEMPORADA_2026, toGameClub, validateDataset } from '#lib/data/brasil.ts';
import { generateSquadFor } from '#lib/domain/squad.ts';

describe('base Brasil 2026', () => {
	it('valida sem erros: Séries A–C (20), Série D (96) e clubes estaduais da Copa, todos com fonte', () => {
		expect(DATASET_ISSUES.filter((i) => i.nivel === 'erro')).toEqual([]);
		for (const s of ['A', 'B', 'C']) expect(CLUBES_2026.filter((c) => c.serie === s)).toHaveLength(20);
		expect(CLUBES_2026.filter((c) => c.serie === 'D')).toHaveLength(96);
		expect(SERIE_D_2026.grupos).toHaveLength(16);
		for (const g of SERIE_D_2026.grupos) expect(g).toHaveLength(6);
		expect(SERIE_D_2026.acessos).toHaveLength(6);
	});

	it('Copa do Brasil 2026: 126 participantes distintos, 28 + 74 + 4 + 20 por fase de entrada', () => {
		const ids = COPA_2026.participantes.map((p) => p.clube);
		expect(new Set(ids).size).toBe(126);
		const by = (f: number) => COPA_2026.participantes.filter((p) => p.fase === f).length;
		expect([by(1), by(2), by(3), by(5)]).toEqual([28, 74, 4, 20]);
		const known = new Set(CLUBES_2026.map((c) => c.id));
		expect(ids.every((id) => known.has(id))).toBe(true);
		// Os 20 da 5ª fase são exatamente a Série A 2026.
		const a = new Set(CLUBES_2026.filter((c) => c.serie === 'A').map((c) => c.id));
		expect(COPA_2026.participantes.filter((p) => p.fase === 5).every((p) => a.has(p.clube))).toBe(true);
	});

	it('clubes sem cores conferidas recebem cores provisórias marcadas (nunca como oficiais)', () => {
		const semCores = CLUBES_2026.find((c) => c.serie === 'D')!;
		const club = toGameClub(semCores);
		expect(club.colorsProvisional).toBe(true);
		expect(club.colors.primary).toMatch(/^#[0-9A-F]{6}$/);
		expect(toGameClub(CLUBES_2026.find((c) => c.id === 'flamengo')!).colorsProvisional).toBeUndefined();
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

	it('cidades antes pendentes foram conferidas e têm fonte', () => {
		for (const id of ['barra', 'caxias', 'floresta', 'maranhao', 'ypiranga']) {
			const c = CLUBES_2026.find((x) => x.id === id)!;
			expect(c.cidade).toBeTruthy();
			expect(c.pendencias).not.toContain('cidade');
			expect(c.fontes).toContain('wiki-serie-c-2026');
		}
		// técnicos continuam pendentes (não inventados)
		expect(CLUBES_2026.every((c) => c.tecnico === null && c.pendencias.includes('tecnico'))).toBe(true);
	});
});
