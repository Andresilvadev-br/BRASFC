/**
 * Regras das competições nacionais POR EDIÇÃO (Dev 0.3.1).
 *
 * Cada edição diz quantos clubes disputam, como é cada fase e quantos sobem/caem.
 * As contas fecham entre temporadas (testado em tests/rules.test.ts):
 *   tamanho(C, ano+1) = tamanho(C) − acessos(C) − quedas(C) + quedas(B) + acessos(D)
 *
 * `status` diz a origem de cada regra:
 *  - 'oficial'    → regulamento/anúncio da CBF ou cobertura que o cita (fonte registrada)
 *  - 'anunciado'  → anunciado, mas detalhes da fase final ainda não publicados
 *  - 'projetado'  → regra do universo BRASFC (sem regulamento real conhecido), consistente com as demais
 */
export type NationalDivision = 'serie-a' | 'serie-b' | 'serie-c' | 'serie-d';
export const NATIONAL_DIVISIONS: NationalDivision[] = ['serie-a', 'serie-b', 'serie-c', 'serie-d'];

export type RuleStatus = 'oficial' | 'anunciado' | 'projetado';

export interface PhaseOneRule {
	/** grupos da 1ª fase (1 = tabela única) */
	groups: number;
	/** 1 = turno único; 2 = turno e returno */
	legs: 1 | 2;
}

/** 2ª fase em grupos (quadrangulares) — Série C. */
export interface QuadrangularRule {
	kind: 'quadrangulares';
	/** classificados por grupo da 1ª fase (tabela única: total) */
	qualifiers: number;
	groups: 2;
	/** sobem por quadrangular */
	promotedPerGroup: number;
	/** final entre os líderes dos quadrangulares (ida e volta) */
	final: boolean;
}

/** Mata-mata — Série D. */
export interface KnockoutRule {
	kind: 'mata-mata';
	/** classificados por grupo da 1ª fase */
	qualifiersPerGroup: number;
	/** sobem: semifinalistas + vencedores dos playoffs entre eliminados nas quartas */
	promotedSemifinalists: boolean;
	playoffSpots: number;
}

export interface DivisionRule {
	id: NationalDivision;
	season: number;
	size: number;
	phase1: PhaseOneRule;
	phase2: QuadrangularRule | KnockoutRule | null;
	promoted: number;
	relegated: number;
	/** quedas por grupo (Série C a partir de 2028) */
	relegatedPerGroup?: number;
	/** Série D: piores campanhas que voltam às competições estaduais (projeção do BRASFC) */
	backToState?: number;
	status: RuleStatus;
	fontes: string[];
	nota?: string;
}

const A = (season: number): DivisionRule => ({
	id: 'serie-a',
	season,
	size: 20,
	phase1: { groups: 1, legs: 2 },
	phase2: null,
	promoted: 0,
	relegated: 4,
	status: season === 2026 ? 'oficial' : 'projetado',
	fontes: ['wiki-serie-a-2026'],
	nota: 'Pontos corridos em turno e returno; quatro rebaixados (formato vigente desde 2006).'
});

const B = (season: number): DivisionRule => ({
	id: 'serie-b',
	season,
	size: 20,
	phase1: { groups: 1, legs: 2 },
	phase2: null,
	promoted: 4,
	relegated: 4,
	status: season === 2026 ? 'oficial' : 'projetado',
	fontes: ['wiki-serie-b-2026'],
	nota: 'Pontos corridos; quatro sobem e quatro caem.'
});

function C(season: number): DivisionRule {
	const quad: QuadrangularRule = { kind: 'quadrangulares', qualifiers: 8, groups: 2, promotedPerGroup: 2, final: true };
	if (season <= 2026)
		return { id: 'serie-c', season, size: 20, phase1: { groups: 1, legs: 1 }, phase2: quad, promoted: 4, relegated: 2, status: 'oficial', fontes: ['wiki-serie-c-2026', 'cbf-serie-c-2026-final'] };
	if (season === 2027)
		return {
			id: 'serie-c',
			season,
			size: 24,
			phase1: { groups: 1, legs: 1 },
			phase2: quad,
			promoted: 4,
			relegated: 2,
			status: 'oficial',
			fontes: ['cbf-serie-c-2026-final', 'dol-serie-c-2027'],
			nota: 'Turno único com 24 clubes; os oito primeiros formam dois quadrangulares; dois de cada sobem.'
		};
	return {
		id: 'serie-c',
		season,
		size: 28,
		phase1: { groups: 2, legs: 2 },
		phase2: { kind: 'quadrangulares', qualifiers: 4, groups: 2, promotedPerGroup: 2, final: true },
		promoted: 4,
		relegated: 6,
		relegatedPerGroup: 3,
		status: season === 2028 ? 'anunciado' : 'projetado',
		fontes: ['cbf-serie-c-2026-final', 'cnn-serie-c-2028'],
		nota: 'Dois grupos de 14 em ida e volta e três quedas por grupo (anunciado). A 2ª fase ainda não foi publicada: o BRASFC usa dois quadrangulares com os quatro melhores de cada grupo (projeção).'
	};
}

const D = (season: number): DivisionRule => ({
	id: 'serie-d',
	season,
	size: 96,
	phase1: { groups: 16, legs: 2 },
	phase2: { kind: 'mata-mata', qualifiersPerGroup: 4, promotedSemifinalists: true, playoffSpots: 2 },
	promoted: 6,
	relegated: 0,
	backToState: 4,
	status: season === 2026 ? 'oficial' : 'projetado',
	fontes: ['wiki-serie-d-2026'],
	nota:
		'16 grupos de 6 (turno e returno); quatro avançam ao mata-mata de ida e volta. Sobem os semifinalistas e os dois vencedores dos playoffs entre eliminados nas quartas. ' +
		'Na vida real os participantes vêm dos estaduais; no BRASFC as quatro piores campanhas voltam ao grupo de clubes estaduais e são repostas por ele (projeção).'
});

export function divisionRule(div: NationalDivision, season: number): DivisionRule {
	switch (div) {
		case 'serie-a':
			return A(season);
		case 'serie-b':
			return B(season);
		case 'serie-c':
			return C(season);
		default:
			return D(season);
	}
}

/** Rodadas da 1ª fase (por grupo). */
export function phaseOneRounds(rule: DivisionRule): number {
	const perGroup = rule.size / rule.phase1.groups;
	const n = perGroup % 2 === 0 ? perGroup : perGroup + 1;
	return (n - 1) * rule.phase1.legs;
}

/**
 * Confere se as regras de duas edições seguidas fecham a conta de clubes.
 * Retorna a lista de problemas (vazia = consistente).
 */
export function checkTransition(season: number, stateClubs = 0): string[] {
	const issues: string[] = [];
	const now = (d: NationalDivision) => divisionRule(d, season);
	const next = (d: NationalDivision) => divisionRule(d, season + 1);
	const a = now('serie-a'), b = now('serie-b'), c = now('serie-c'), d = now('serie-d');
	const sizeA = a.size - a.relegated + b.promoted;
	const sizeB = b.size - b.promoted - b.relegated + a.relegated + c.promoted;
	const sizeC = c.size - c.promoted - c.relegated + b.relegated + d.promoted;
	const sizeD = d.size - d.promoted - (d.backToState ?? 0) + c.relegated;
	if (sizeA !== next('serie-a').size) issues.push(`Série A ${season + 1}: ${sizeA} ≠ ${next('serie-a').size}`);
	if (sizeB !== next('serie-b').size) issues.push(`Série B ${season + 1}: ${sizeB} ≠ ${next('serie-b').size}`);
	if (sizeC !== next('serie-c').size) issues.push(`Série C ${season + 1}: ${sizeC} ≠ ${next('serie-c').size}`);
	// A Série D é completada por clubes estaduais (até o tamanho da edição seguinte).
	const fill = next('serie-d').size - sizeD;
	if (fill < 0) issues.push(`Série D ${season + 1}: sobram ${-fill} clubes`);
	if (stateClubs && fill > stateClubs) issues.push(`Série D ${season + 1}: faltam ${fill - stateClubs} clubes estaduais`);
	return issues;
}

/** Vagas da Série D que vêm dos estaduais na próxima edição. */
export function stateFill(season: number): number {
	const c = divisionRule('serie-c', season), d = divisionRule('serie-d', season);
	return divisionRule('serie-d', season + 1).size - (d.size - d.promoted - (d.backToState ?? 0) + c.relegated);
}
