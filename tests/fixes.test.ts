import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, withCareerVersion } from '#lib/api.ts';
import { careerWorld, type Career } from '#lib/domain/career.ts';
import { MENTALITIES } from '#lib/domain/tactics.ts';
import { tacticalParams as paramsFor } from '#lib/engine/tactics.ts';
import { careerView } from '#lib/domain/view.ts';

const legacy = (data: Record<string, unknown>) =>
	({ id: 'x', mode: 'coach', personName: 'Andre', clubId: 'sport', seed: 12345, season: 2026, gameDate: '2026-01-12', version: 3, data }) as unknown as Career;

describe('carreiras antigas com clube real', () => {
	it('ficam no Brasil 2026 mesmo sem o campo world (ou com world errado)', () => {
		for (const data of [{}, { world: 'brasfc' }]) {
			const c = legacy(data);
			expect(careerWorld(c)).toBe('brasil');
			const v = careerView(c, []);
			expect(v.division).toBe('serie-b');
			expect(v.next).not.toBeNull();
		}
	});
	it('clube fictício continua na Liga BRASFC', () => {
		expect(careerWorld({ ...legacy({}), clubId: 'aurora' })).toBe('brasfc');
	});
});

describe('mentalidades', () => {
	it('são cinco, da mais defensiva à mais ofensiva, com linha subindo', () => {
		expect(MENTALITIES).toHaveLength(5);
		const lines = MENTALITIES.map((m) => paramsFor(m, 'posse').defLine);
		expect([...lines].sort((a, b) => a - b)).toEqual(lines);
	});
});

describe('conflito de versão', () => {
	afterEach(() => vi.unstubAllGlobals());
	it('busca a versão atual e tenta de novo uma vez', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ career: { version: 9 } }), { status: 200 })));
		const seen: number[] = [];
		const out = await withCareerVersion('x', 3, async (v) => {
			seen.push(v);
			if (v === 3) throw new ApiError('A carreira mudou em outra janela. Recarregue para continuar.', 409);
			return 'ok';
		});
		expect(out).toBe('ok');
		expect(seen).toEqual([3, 9]);
	});
	it('não repete outros erros', async () => {
		let n = 0;
		await expect(withCareerVersion('x', 3, async () => { n++; throw new ApiError('Tática inválida para este elenco.', 400); })).rejects.toThrow('Tática inválida');
		expect(n).toBe(1);
	});
});
