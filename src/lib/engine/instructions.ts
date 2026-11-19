import type { Mentality, PlayStyle } from '#lib/domain/tactics.ts';
import { tacticalParams, type TacticalParams } from './tactics.ts';

/**
 * Instruções táticas avançadas (Dev 0.3).
 *
 * Toda tática tem um PRESET derivado de mentalidade + estilo (modo simples). No modo
 * avançado o treinador ajusta instruções individuais; o motor parte dos parâmetros
 * calibrados do preset e aplica só a DIFERENÇA de cada instrução em relação a ele.
 * Assim o modo simples continua exatamente como foi calibrado e cada ajuste tem um
 * efeito previsível (com contrapartida).
 */
export type Level3 = 1 | 2 | 3;
export type Level5 = 1 | 2 | 3 | 4 | 5;

export interface TacticalInstructions {
	// ── organização ofensiva
	/** 1 saída curta · 2 mista · 3 direta (primeira fase de construção e reposição) */
	construcao: Level3;
	/** 1 cadenciado … 5 acelerado */
	ritmo: Level5;
	/** 1 jogadores próximos … 5 espaçados */
	distancia: Level5;
	/** 1 fechado … 5 bem aberto */
	amplitude: Level5;
	/** 1 pelo centro · 2 misto · 3 pelos lados */
	corredor: Level3;
	/** 1 laterais contidos · 2 equilibrados · 3 laterais apoiam sempre */
	laterais: Level3;
	/** 1 passes curtos · 2 mistos · 3 longos */
	passe: Level3;
	/** 1 ataque posicional · 2 misto · 3 transições rápidas */
	abordagem: Level3;
	/** 1 pouca … 5 muita movimentação às costas da defesa */
	profundidade: Level5;
	/** 1 poucos … 5 muitos jogadores na área */
	presencaArea: Level5;
	// ── organização defensiva
	/** altura da linha defensiva: 1 muito baixa … 5 muito alta */
	linha: Level5;
	/** intensidade de pressão: 1 mínima … 5 máxima */
	pressao: Level5;
	/** 1 bloco baixo · 2 médio · 3 alto */
	bloco: Level3;
	/** 1 solto … 5 muito compacto */
	compactacao: Level5;
	marcacao: 'zona' | 'individual';
	/** agressividade nas disputas: 1 cautelosa … 5 muito agressiva */
	agressividade: Level5;
	// ── transições
	aoRecuperar: 'contra-ataque' | 'equilibrado' | 'reter';
	aposPerder: 'pressionar' | 'equilibrado' | 'recompor';
}

export const INSTRUCTION_KEYS = [
	'construcao', 'ritmo', 'distancia', 'amplitude', 'corredor', 'laterais', 'passe', 'abordagem', 'profundidade', 'presencaArea',
	'linha', 'pressao', 'bloco', 'compactacao', 'marcacao', 'agressividade', 'aoRecuperar', 'aposPerder'
] as const satisfies ReadonlyArray<keyof TacticalInstructions>;
export type InstructionKey = (typeof INSTRUCTION_KEYS)[number];

const NEUTRAL: TacticalInstructions = {
	construcao: 2, ritmo: 3, distancia: 3, amplitude: 3, corredor: 2, laterais: 2, passe: 2, abordagem: 2, profundidade: 3, presencaArea: 3,
	linha: 3, pressao: 3, bloco: 2, compactacao: 3, marcacao: 'zona', agressividade: 3, aoRecuperar: 'equilibrado', aposPerder: 'equilibrado'
};

const MENTALITY_PRESET: Record<Mentality, Partial<TacticalInstructions>> = {
	defensiva: { linha: 2, bloco: 1, compactacao: 4, presencaArea: 2, laterais: 1, abordagem: 2, pressao: 2 },
	cautelosa: { linha: 2, compactacao: 4, laterais: 1 },
	equilibrada: {},
	ofensiva: { linha: 4, presencaArea: 4, laterais: 3, pressao: 3 },
	'muito-ofensiva': { linha: 5, presencaArea: 5, laterais: 3, pressao: 4, ritmo: 4, profundidade: 4 }
};

const STYLE_PRESET: Record<PlayStyle, Partial<TacticalInstructions>> = {
	posse: { construcao: 1, ritmo: 2, passe: 1, abordagem: 1, distancia: 2 },
	'tiki-taka': { construcao: 1, ritmo: 4, passe: 1, distancia: 1, abordagem: 1, pressao: 4, aposPerder: 'pressionar', amplitude: 2 },
	'contra-ataque': { aoRecuperar: 'contra-ataque', abordagem: 3, passe: 2, profundidade: 4, linha: 2 },
	'bola-longa': { construcao: 3, passe: 3, ritmo: 4, profundidade: 4 },
	laterais: { corredor: 3, amplitude: 5, laterais: 3 },
	pressao: { pressao: 5, linha: 4, bloco: 3, aposPerder: 'pressionar', agressividade: 4 },
	vertical: { ritmo: 4, abordagem: 3, profundidade: 4 }
};

/** Preset do modo simples. Mentalidade primeiro; o estilo complementa/predomina. */
export function presetInstructions(mentality: Mentality, style: PlayStyle): TacticalInstructions {
	return { ...NEUTRAL, ...MENTALITY_PRESET[mentality], ...STYLE_PRESET[style] };
}

const LEVEL3_KEYS: InstructionKey[] = ['construcao', 'corredor', 'laterais', 'passe', 'abordagem', 'bloco'];
const LEVEL5_KEYS: InstructionKey[] = ['ritmo', 'distancia', 'amplitude', 'profundidade', 'presencaArea', 'linha', 'pressao', 'compactacao', 'agressividade'];

/** Valida e completa instruções recebidas (cliente/banco). Valores inválidos voltam ao preset. */
export function sanitizeInstructions(input: unknown, base: TacticalInstructions): TacticalInstructions {
	const out = { ...base };
	if (!input || typeof input !== 'object') return out;
	const raw = input as Record<string, unknown>;
	for (const k of LEVEL3_KEYS) if ([1, 2, 3].includes(raw[k] as number)) (out as Record<string, unknown>)[k] = raw[k];
	for (const k of LEVEL5_KEYS) if ([1, 2, 3, 4, 5].includes(raw[k] as number)) (out as Record<string, unknown>)[k] = raw[k];
	if (raw.marcacao === 'zona' || raw.marcacao === 'individual') out.marcacao = raw.marcacao;
	if (raw.aoRecuperar === 'contra-ataque' || raw.aoRecuperar === 'equilibrado' || raw.aoRecuperar === 'reter') out.aoRecuperar = raw.aoRecuperar;
	if (raw.aposPerder === 'pressionar' || raw.aposPerder === 'equilibrado' || raw.aposPerder === 'recompor') out.aposPerder = raw.aposPerder;
	return out;
}

/** Ajustes do usuário em relação ao preset (o que o modo simples preserva). */
export function overridesOf(instr: TacticalInstructions, preset: TacticalInstructions): Partial<TacticalInstructions> {
	const out: Partial<TacticalInstructions> = {};
	for (const k of INSTRUCTION_KEYS) if (instr[k] !== preset[k]) (out as Record<string, unknown>)[k] = instr[k];
	return out;
}

/** Parâmetros extras introduzidos na Dev 0.3 (todos neutros = comportamento da Dev 0.2). */
export interface AdvancedParams extends TacticalParams {
	/** 0–1: chance extra de saída longa (reposição e primeira fase) */
	buildDirect: number;
	/** 0–1: intensidade das corridas às costas da defesa */
	runDepth: number;
	/** atacantes extras que atacam a área nos cruzamentos */
	boxRunners: number;
	/** marcação individual: acompanha mais de perto, mas é arrastada e abre espaços */
	manMarking: boolean;
	/** 0,7–1,3: força e risco nas disputas (desarme × faltas/cartões) */
	aggression: number;
	/** segundos de pressão coletiva logo após perder a bola (0 = não pressiona) */
	counterPress: number;
	/** 0–1: velocidade de recomposição após a perda */
	retreat: number;
	/** 0–1: manter a posse após recuperar (contrário do contra-ataque) */
	retain: number;
	/** espaçamento entre jogadores em posse (m somados ao bloco) */
	spacing: number;
}

/**
 * Converte instruções em parâmetros do motor: parte do preset calibrado
 * (mentalidade + estilo) e soma a diferença de cada instrução.
 */
export function paramsFromInstructions(mentality: Mentality, style: PlayStyle, instr?: TacticalInstructions): AdvancedParams {
	const base = tacticalParams(mentality, style);
	const preset = presetInstructions(mentality, style);
	const i = instr ?? preset;
	const d = <K extends InstructionKey>(k: K) => Number(i[k]) - Number(preset[k]);
	const p: AdvancedParams = {
		...base,
		buildDirect: 0,
		runDepth: 0.5,
		boxRunners: 0,
		manMarking: false,
		aggression: 1,
		counterPress: 0,
		retreat: 0.5,
		retain: 0.5,
		spacing: 0
	};
	// ofensivo
	p.tempo = Math.max(1.2, p.tempo * (1 - d('ritmo') * 0.12));
	p.passAccuracy *= 1 - d('ritmo') * 0.008;
	p.spacing = d('distancia') * 2.5;
	p.shortBias -= d('distancia') * 0.12;
	p.width = Math.min(1.25, Math.max(0.6, p.width + d('amplitude') * 0.06));
	p.wideBias += d('corredor') * 0.45;
	p.support = Math.min(1, Math.max(0, p.support + d('laterais') * 0.18));
	p.shortBias -= d('passe') * 0.35;
	p.longBias += d('passe') * 0.35;
	p.buildDirect = Math.min(1, Math.max(0, (Number(i.construcao) - 1) / 2));
	p.progressWeight += d('abordagem') * 0.14;
	p.safetyWeight -= d('abordagem') * 0.07;
	p.runDepth = Math.min(1, Math.max(0, 0.5 + d('profundidade') * 0.12));
	p.boxRunners = d('presencaArea') * 0.5;
	p.support = Math.min(1, Math.max(0, p.support + d('presencaArea') * 0.06));
	// defensivo
	p.defLine += d('linha') * 2.5 + d('bloco') * 2.5;
	p.pressDistance = Math.max(6, p.pressDistance + d('pressao') * 3 + d('bloco') * 1.5);
	p.pressers = Math.max(1, Math.round(p.pressers + d('pressao') * 0.5));
	p.fatigueCost = Math.max(0, p.fatigueCost + Math.max(0, d('pressao')) * 0.012);
	p.blockLength = Math.max(28, p.blockLength - d('compactacao') * 2.5);
	p.boxDefense *= 1 + d('compactacao') * 0.04;
	p.manMarking = i.marcacao === 'individual';
	p.aggression = 1 + (Number(i.agressividade) - 3) * 0.1;
	// transições
	if (i.aoRecuperar !== preset.aoRecuperar) {
		p.counterBoost = i.aoRecuperar === 'contra-ataque' ? 1 : i.aoRecuperar === 'reter' ? 0 : 0.3;
	}
	p.retain = i.aoRecuperar === 'reter' ? 1 : i.aoRecuperar === 'contra-ataque' ? 0 : 0.5;
	p.counterPress = i.aposPerder === 'pressionar' ? 6 : 0;
	p.retreat = i.aposPerder === 'recompor' ? 1 : i.aposPerder === 'pressionar' ? 0.2 : 0.5;
	if (i.aposPerder === 'pressionar' && preset.aposPerder !== 'pressionar') p.fatigueCost += 0.015;
	return p;
}

/** Rótulos para a interface. */
export const INSTRUCTION_LABELS: Record<InstructionKey, { label: string; options: string[]; group: 'ataque' | 'defesa' | 'transicao'; hint: string }> = {
	construcao: { label: 'Saída de bola', options: ['Curta', 'Mista', 'Direta'], group: 'ataque', hint: 'Curta valoriza goleiro e zagueiros com passe; direta pula a pressão, mas devolve mais bolas.' },
	ritmo: { label: 'Ritmo', options: ['Cadenciado', 'Calmo', 'Normal', 'Rápido', 'Acelerado'], group: 'ataque', hint: 'Mais rápido chega antes à área, mas erra mais passes.' },
	distancia: { label: 'Distância entre jogadores', options: ['Muito próximos', 'Próximos', 'Normal', 'Espaçados', 'Muito espaçados'], group: 'ataque', hint: 'Próximos facilitam tabelas; espaçados abrem o campo e alongam os passes.' },
	amplitude: { label: 'Amplitude', options: ['Muito fechado', 'Fechado', 'Normal', 'Aberto', 'Muito aberto'], group: 'ataque', hint: 'Aberto estica a defesa rival, mas deixa o meio menos povoado.' },
	corredor: { label: 'Corredor preferido', options: ['Centro', 'Misto', 'Lados'], group: 'ataque', hint: 'Pelos lados gera cruzamentos; pelo centro, tabelas e chutes de média distância.' },
	laterais: { label: 'Laterais', options: ['Contidos', 'Equilibrados', 'Sempre apoiam'], group: 'ataque', hint: 'Laterais que apoiam dão amplitude, mas deixam espaço nas costas.' },
	passe: { label: 'Tipo de passe', options: ['Curto', 'Misto', 'Longo'], group: 'ataque', hint: 'Passes longos avançam rápido e erram mais.' },
	abordagem: { label: 'Abordagem', options: ['Posicional', 'Mista', 'Transição'], group: 'ataque', hint: 'Posicional rodeia a defesa; transição ataca enquanto o rival está desorganizado.' },
	profundidade: { label: 'Movimentos em profundidade', options: ['Raros', 'Poucos', 'Normais', 'Frequentes', 'Constantes'], group: 'ataque', hint: 'Exige atacantes rápidos e inteligentes; contra linha baixa rende pouco e gera impedimentos.' },
	presencaArea: { label: 'Presença na área', options: ['Mínima', 'Pouca', 'Normal', 'Grande', 'Máxima'], group: 'ataque', hint: 'Mais gente na área ajuda nos cruzamentos e deixa o time exposto na perda.' },
	linha: { label: 'Linha defensiva', options: ['Muito baixa', 'Baixa', 'Média', 'Alta', 'Muito alta'], group: 'defesa', hint: 'Alta encurta o campo, mas oferece espaço às costas para atacantes rápidos.' },
	pressao: { label: 'Intensidade de pressão', options: ['Mínima', 'Baixa', 'Média', 'Alta', 'Máxima'], group: 'defesa', hint: 'Recupera a bola mais cedo e cansa mais.' },
	bloco: { label: 'Bloco', options: ['Baixo', 'Médio', 'Alto'], group: 'defesa', hint: 'Onde o time começa a marcar.' },
	compactacao: { label: 'Compactação', options: ['Solto', 'Pouco', 'Normal', 'Compacto', 'Muito compacto'], group: 'defesa', hint: 'Compacto fecha o meio e a área; o rival encontra espaço pelos lados.' },
	marcacao: { label: 'Marcação', options: ['Por zona', 'Individual'], group: 'defesa', hint: 'Individual cola nos adversários, mas pode ser arrastada e abrir espaços.' },
	agressividade: { label: 'Agressividade', options: ['Cautelosa', 'Contida', 'Normal', 'Firme', 'Muito agressiva'], group: 'defesa', hint: 'Ganha mais disputas e comete mais faltas e cartões.' },
	aoRecuperar: { label: 'Ao recuperar a bola', options: ['Contra-atacar', 'Equilibrado', 'Manter a posse'], group: 'transicao', hint: 'Contra-ataque explora a desorganização; manter a posse controla o ritmo.' },
	aposPerder: { label: 'Ao perder a bola', options: ['Pressionar', 'Equilibrado', 'Recompor'], group: 'transicao', hint: 'Pressionar recupera rápido (e cansa); recompor protege a defesa.' }
};

const ORDER: Record<string, string[]> = { marcacao: ['zona', 'individual'], aoRecuperar: ['contra-ataque', 'equilibrado', 'reter'], aposPerder: ['pressionar', 'equilibrado', 'recompor'] };

/** Valor ↔ índice da opção (para controles da interface). */
export function optionIndex(k: InstructionKey, v: TacticalInstructions[InstructionKey]): number {
	return ORDER[k] ? ORDER[k].indexOf(v as string) : Number(v) - 1;
}
export function valueAt(k: InstructionKey, idx: number): TacticalInstructions[InstructionKey] {
	return (ORDER[k] ? ORDER[k][idx] : idx + 1) as TacticalInstructions[InstructionKey];
}
