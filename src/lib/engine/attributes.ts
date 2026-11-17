import type { Position } from '#lib/domain/positions.ts';
import type { Rng } from '#lib/domain/rng.ts';

/**
 * Atributos de jogo do BRASFC — escala 1–99 (documentada em docs/MOTOR.md):
 *   40 fraco · 55 regular · 65 bom · 75 muito bom · 85 elite · 92+ excepcional
 * São valores de JOGABILIDADE, estimados pelo BRASFC; não são dados oficiais.
 */
export const TECHNICAL = ['passe', 'finalizacao', 'drible', 'dominio', 'cruzamento', 'cabeceio', 'desarme', 'tecnica'] as const;
export const PHYSICAL = ['velocidade', 'aceleracao', 'resistencia', 'forca', 'agilidade', 'impulsao'] as const;
export const MENTAL = ['visao', 'posicionamento', 'antecipacao', 'concentracao', 'decisoes', 'compostura', 'trabalhoEquipe'] as const;
export const GOALKEEPING = ['reflexos', 'posicionamentoGol', 'saidas', 'defesa', 'reposicao', 'jogoAereo'] as const;

export type AttributeKey =
	| (typeof TECHNICAL)[number]
	| (typeof PHYSICAL)[number]
	| (typeof MENTAL)[number]
	| (typeof GOALKEEPING)[number];

export type Attributes = Record<AttributeKey, number>;

export const ALL_ATTRIBUTES: AttributeKey[] = [...TECHNICAL, ...PHYSICAL, ...MENTAL, ...GOALKEEPING];

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
	passe: 'Passe', finalizacao: 'Finalização', drible: 'Drible', dominio: 'Domínio', cruzamento: 'Cruzamento',
	cabeceio: 'Cabeceio', desarme: 'Desarme', tecnica: 'Técnica', velocidade: 'Velocidade', aceleracao: 'Aceleração',
	resistencia: 'Resistência', forca: 'Força', agilidade: 'Agilidade', impulsao: 'Impulsão', visao: 'Visão',
	posicionamento: 'Posicionamento', antecipacao: 'Antecipação', concentracao: 'Concentração', decisoes: 'Decisões',
	compostura: 'Compostura', trabalhoEquipe: 'Trabalho em equipe', reflexos: 'Reflexos', posicionamentoGol: 'Posicionamento (gol)',
	saidas: 'Saídas', defesa: 'Defesa', reposicao: 'Reposição', jogoAereo: 'Jogo aéreo'
};

/** Grupo de posição usado nos pesos do overall. */
export type RoleGroup = 'GOL' | 'ZAG' | 'LAT' | 'VOL' | 'MC' | 'MEI' | 'PON' | 'ATA';

export function roleGroup(p: Position): RoleGroup {
	switch (p) {
		case 'GOL': return 'GOL';
		case 'ZAG': return 'ZAG';
		case 'LD': case 'LE': return 'LAT';
		case 'VOL': return 'VOL';
		case 'MC': return 'MC';
		case 'MEI': return 'MEI';
		case 'PD': case 'PE': return 'PON';
		case 'ATA': return 'ATA';
	}
}

/**
 * Pesos do overall por posição: só atributos relevantes à função contam.
 * O overall resume o jogador, mas o motor usa os atributos individualmente.
 */
export const OVERALL_WEIGHTS: Record<RoleGroup, Partial<Record<AttributeKey, number>>> = {
	GOL: { reflexos: 5, posicionamentoGol: 4, defesa: 4, saidas: 3, jogoAereo: 3, reposicao: 2, concentracao: 2, decisoes: 1, compostura: 1, agilidade: 1 },
	ZAG: { desarme: 5, posicionamento: 5, cabeceio: 4, forca: 3, antecipacao: 3, impulsao: 2, concentracao: 2, decisoes: 2, passe: 1, velocidade: 1, compostura: 1 },
	LAT: { desarme: 3, velocidade: 3, resistencia: 3, cruzamento: 3, posicionamento: 3, passe: 2, aceleracao: 2, drible: 1, antecipacao: 2, trabalhoEquipe: 2, decisoes: 1 },
	VOL: { desarme: 4, posicionamento: 4, passe: 3, antecipacao: 3, resistencia: 3, trabalhoEquipe: 3, forca: 2, decisoes: 2, concentracao: 2, dominio: 1 },
	MC: { passe: 4, visao: 3, decisoes: 3, dominio: 3, resistencia: 3, tecnica: 2, trabalhoEquipe: 3, desarme: 1, posicionamento: 1, compostura: 1, finalizacao: 1 },
	MEI: { passe: 4, visao: 5, tecnica: 4, drible: 3, dominio: 3, decisoes: 2, compostura: 2, finalizacao: 2, agilidade: 1 },
	PON: { drible: 4, velocidade: 4, aceleracao: 4, cruzamento: 3, tecnica: 2, finalizacao: 2, agilidade: 2, dominio: 2, passe: 1, decisoes: 1 },
	ATA: { finalizacao: 6, compostura: 3, posicionamento: 3, cabeceio: 2, dominio: 2, antecipacao: 2, velocidade: 2, aceleracao: 2, forca: 2, tecnica: 1, decisoes: 1 }
};

export function computeOverall(attrs: Attributes, position: Position): number {
	const weights = OVERALL_WEIGHTS[roleGroup(position)];
	let total = 0;
	let sum = 0;
	for (const [k, w] of Object.entries(weights) as Array<[AttributeKey, number]>) {
		total += attrs[k] * w;
		sum += w;
	}
	return Math.round(total / sum);
}

/** Perfis de jogador: deixam atletas da mesma posição com estilos diferentes. */
const ARCHETYPES: Record<RoleGroup, Array<{ id: string; label: string; mod: Partial<Record<AttributeKey, number>> }>> = {
	GOL: [
		{ id: 'reflexo', label: 'Goleiro de reflexos', mod: { reflexos: 8, agilidade: 6, saidas: -4, reposicao: -3 } },
		{ id: 'seguro', label: 'Goleiro seguro', mod: { posicionamentoGol: 6, defesa: 6, jogoAereo: 4, reflexos: -3 } },
		{ id: 'libero', label: 'Goleiro com os pés', mod: { reposicao: 10, saidas: 6, passe: 8, compostura: 4, jogoAereo: -4 } }
	],
	ZAG: [
		{ id: 'xerife', label: 'Zagueiro xerife', mod: { forca: 8, cabeceio: 7, impulsao: 5, passe: -6, velocidade: -4 } },
		{ id: 'construtor', label: 'Zagueiro construtor', mod: { passe: 9, visao: 6, compostura: 6, forca: -4, cabeceio: -3 } },
		{ id: 'rapido', label: 'Zagueiro rápido', mod: { velocidade: 9, aceleracao: 7, antecipacao: 4, forca: -4, cabeceio: -3 } }
	],
	LAT: [
		{ id: 'apoiador', label: 'Lateral apoiador', mod: { cruzamento: 8, drible: 6, resistencia: 5, desarme: -5, posicionamento: -4 } },
		{ id: 'defensivo', label: 'Lateral defensivo', mod: { desarme: 7, posicionamento: 7, forca: 3, cruzamento: -5, drible: -5 } },
		{ id: 'veloz', label: 'Lateral veloz', mod: { velocidade: 9, aceleracao: 8, cruzamento: 2, forca: -5, cabeceio: -3 } }
	],
	VOL: [
		{ id: 'marcador', label: 'Volante marcador', mod: { desarme: 8, forca: 6, antecipacao: 5, visao: -6, tecnica: -5 } },
		{ id: 'construtor', label: 'Volante construtor', mod: { passe: 8, visao: 7, compostura: 5, desarme: -4, forca: -3 } },
		{ id: 'incansavel', label: 'Volante incansável', mod: { resistencia: 10, trabalhoEquipe: 7, velocidade: 3, tecnica: -5, finalizacao: -4 } }
	],
	MC: [
		{ id: 'box', label: 'Meia box-to-box', mod: { resistencia: 8, forca: 4, finalizacao: 5, desarme: 3, visao: -5 } },
		{ id: 'armador', label: 'Meia armador', mod: { passe: 8, visao: 8, tecnica: 5, forca: -6, desarme: -5 } },
		{ id: 'tatico', label: 'Meia tático', mod: { posicionamento: 7, decisoes: 7, trabalhoEquipe: 6, drible: -5, velocidade: -4 } }
	],
	MEI: [
		{ id: 'camisa10', label: 'Camisa 10 clássico', mod: { visao: 9, passe: 7, tecnica: 6, velocidade: -6, resistencia: -5 } },
		{ id: 'driblador', label: 'Meia driblador', mod: { drible: 9, agilidade: 7, aceleracao: 5, visao: -4, passe: -3 } },
		{ id: 'chegada', label: 'Meia de chegada', mod: { finalizacao: 8, posicionamento: 6, compostura: 5, passe: -5, visao: -4 } }
	],
	PON: [
		{ id: 'velocista', label: 'Ponta velocista', mod: { velocidade: 10, aceleracao: 9, drible: 3, passe: -5, visao: -5 } },
		{ id: 'driblador', label: 'Ponta driblador', mod: { drible: 10, agilidade: 7, tecnica: 5, forca: -6, cabeceio: -5 } },
		{ id: 'cruzador', label: 'Ponta cruzador', mod: { cruzamento: 10, passe: 5, visao: 3, drible: -4, finalizacao: -4 } }
	],
	ATA: [
		{ id: 'finalizador', label: 'Finalizador', mod: { finalizacao: 9, compostura: 7, posicionamento: 6, passe: -6, desarme: -6 } },
		{ id: 'pivo', label: 'Centroavante pivô', mod: { forca: 10, cabeceio: 9, impulsao: 6, velocidade: -7, drible: -5 } },
		{ id: 'velocista', label: 'Atacante de profundidade', mod: { velocidade: 10, aceleracao: 9, antecipacao: 5, forca: -6, cabeceio: -5 } }
	]
};

export function archetypeLabel(position: Position, id: string | undefined): string | undefined {
	return ARCHETYPES[roleGroup(position)].find((a) => a.id === id)?.label;
}

const clamp = (v: number) => Math.max(20, Math.min(99, Math.round(v)));

/**
 * Gera atributos coerentes com a posição, um perfil (arquétipo) e um overall-alvo.
 * Atributos fora da função ficam abaixo do nível do jogador (ex.: goleiro finalizando).
 */
export function generateAttributes(position: Position, target: number, rng: Rng, archetypeId?: string): { attributes: Attributes; archetype: string } {
	const group = roleGroup(position);
	const options = ARCHETYPES[group];
	const arche = options.find((a) => a.id === archetypeId) ?? rng.pick(options);
	const weights = OVERALL_WEIGHTS[group];
	const attrs = {} as Attributes;
	for (const k of ALL_ATTRIBUTES) {
		const relevant = (weights[k] ?? 0) > 0;
		const isGk = (GOALKEEPING as readonly string[]).includes(k);
		let base: number;
		if (group === 'GOL') base = isGk ? target : k === 'finalizacao' || k === 'drible' || k === 'cruzamento' ? target - 35 : target - 18;
		else base = isGk ? 25 + rng.int(0, 10) : relevant ? target : target - 12;
		attrs[k] = base + (arche.mod[k] ?? 0) + rng.int(-5, 5);
	}
	// Ajusta para que o overall calculado bata com o alvo.
	for (let i = 0; i < 3; i++) {
		const delta = target - computeOverall(attrs as Attributes, position);
		if (delta === 0) break;
		for (const k of Object.keys(weights) as AttributeKey[]) attrs[k] += delta;
	}
	for (const k of ALL_ATTRIBUTES) attrs[k] = clamp(attrs[k]);
	return { attributes: attrs, archetype: arche.id };
}

export function averageOf(attrs: Attributes, keys: readonly AttributeKey[]): number {
	return keys.reduce((s, k) => s + attrs[k], 0) / keys.length;
}
