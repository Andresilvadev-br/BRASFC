import type { FormationId, Mentality, PlayStyle } from '#lib/domain/tactics.ts';
import type { TacticalInstructions } from './instructions.ts';

/**
 * Treinador automático (IA). Usa apenas o que um treinador de verdade enxergaria:
 * placar, minuto, finalizações, posse, cansaço visível, cartões e a postura do rival
 * (altura da linha, lado por onde ataca, quantos sobem). Nunca lê atributos ocultos
 * nem recebe bônus — só escolhe instruções; a execução continua dependendo do elenco.
 */
export type CoachStyleId = 'pragmatico' | 'ofensivo' | 'reativo' | 'posse' | 'pressao' | 'retranqueiro' | 'equilibrado';

export interface CoachProfile {
	id: CoachStyleId;
	label: string;
	mentality: Mentality;
	style: PlayStyle;
	/** formações preferidas, em ordem */
	formations: FormationId[];
	/** 0–1: quanto o treinador ajusta o plano conforme o adversário e o jogo */
	adaptability: number;
	/** 0–1: disposição para arriscar quando precisa do resultado */
	risk: number;
}

export const COACH_PROFILES: Record<CoachStyleId, CoachProfile> = {
	pragmatico: { id: 'pragmatico', label: 'Pragmático', mentality: 'equilibrada', style: 'contra-ataque', formations: ['4-4-2', '4-2-3-1', '4-3-3'], adaptability: 0.8, risk: 0.4 },
	ofensivo: { id: 'ofensivo', label: 'Ofensivo', mentality: 'ofensiva', style: 'vertical', formations: ['4-3-3', '3-4-3', '4-2-2-2'], adaptability: 0.5, risk: 0.8 },
	reativo: { id: 'reativo', label: 'Reativo', mentality: 'defensiva', style: 'contra-ataque', formations: ['4-4-2', '5-3-2', '4-2-3-1'], adaptability: 0.7, risk: 0.3 },
	posse: { id: 'posse', label: 'Jogo de posse', mentality: 'equilibrada', style: 'posse', formations: ['4-3-3', '4-2-3-1', '3-5-2'], adaptability: 0.5, risk: 0.5 },
	pressao: { id: 'pressao', label: 'Pressão alta', mentality: 'ofensiva', style: 'pressao', formations: ['4-3-3', '4-2-3-1', '3-4-3'], adaptability: 0.6, risk: 0.7 },
	retranqueiro: { id: 'retranqueiro', label: 'Retranqueiro', mentality: 'defensiva', style: 'bola-longa', formations: ['5-3-2', '4-4-2', '3-5-2'], adaptability: 0.4, risk: 0.2 },
	equilibrado: { id: 'equilibrado', label: 'Equilibrado', mentality: 'equilibrada', style: 'laterais', formations: ['4-2-3-1', '4-3-3', '4-4-2'], adaptability: 0.6, risk: 0.5 }
};

/** Tendências observáveis do adversário (dos jogos anteriores ou do jogo atual). */
export interface Scouting {
	/** jogos observados (0 = sem informação) */
	samples: number;
	highPress: boolean;
	lowBlock: boolean;
	highLine: boolean;
	attackingFullbacks: boolean;
	centralFocus: boolean;
	wideFocus: boolean;
	/** nossos atacantes são rápidos o bastante para explorar espaço às costas? */
	fastForwards: boolean;
}

export interface CounterPlan {
	instructions: Partial<TacticalInstructions>;
	reasons: string[];
}

const clamp5 = (v: number) => Math.max(1, Math.min(5, Math.round(v))) as 1 | 2 | 3 | 4 | 5;
const clamp3 = (v: number) => Math.max(1, Math.min(3, Math.round(v))) as 1 | 2 | 3;

/**
 * Plano pré-jogo contra as tendências do rival. Ajustes são parciais e dependem da
 * adaptabilidade do treinador (decidida de forma determinística pela semente `roll`).
 */
export function planAgainst(profile: CoachProfile, base: TacticalInstructions, s: Scouting, roll: (k: string) => number): CounterPlan {
	const out: Partial<TacticalInstructions> = {};
	const reasons: string[] = [];
	if (!s.samples) return { instructions: out, reasons };
	const go = (k: string) => roll(k) < profile.adaptability;
	if (s.highPress && go('press')) {
		out.construcao = 3;
		out.profundidade = clamp5(base.profundidade + 1);
		reasons.push('Rival pressiona alto: saída direta e bolas nas costas.');
	}
	if (s.highLine && s.fastForwards && go('line')) {
		out.profundidade = clamp5((out.profundidade ?? base.profundidade) + 1);
		out.aoRecuperar = 'contra-ataque';
		reasons.push('Linha alta do rival: atacantes rápidos atacam o espaço.');
	}
	if (s.lowBlock && go('block')) {
		out.amplitude = clamp5(base.amplitude + 1);
		out.corredor = 3;
		out.ritmo = clamp5(base.ritmo - 1);
		reasons.push('Rival se fecha atrás: amplitude e paciência.');
	}
	if (s.attackingFullbacks && go('fb')) {
		out.aoRecuperar = 'contra-ataque';
		out.corredor = 3;
		reasons.push('Laterais do rival sobem muito: explorar os lados na transição.');
	}
	if (s.centralFocus && go('center')) {
		out.compactacao = clamp5(base.compactacao + 1);
		out.amplitude = clamp5((out.amplitude ?? base.amplitude) - 1);
		reasons.push('Rival concentra o jogo pelo meio: fechar o corredor central.');
	}
	if (s.wideFocus && go('wide')) {
		out.laterais = clamp3(base.laterais - 1);
		reasons.push('Rival ataca pelos lados: laterais mais contidos.');
	}
	return { instructions: out, reasons };
}

/** O que o banco consegue ver durante o jogo. */
export interface MatchView {
	minute: number;
	half: 1 | 2;
	goalDiff: number;
	shotsFor: number;
	shotsAgainst: number;
	onTargetAgainst: number;
	possession: number;
	avgCondition: number;
	playersOnPitch: number;
	oppPlayersOnPitch: number;
	/** altura média da linha do rival (m a partir do gol dele) nos últimos minutos */
	oppDefLine: number;
	fastForwards: boolean;
}

export interface Adjustment {
	key: string;
	change: Partial<TacticalInstructions>;
	mentality?: Mentality;
	reason: string;
}

/**
 * Ajuste durante o jogo (no máximo um por avaliação). `done` evita repetir o mesmo ajuste.
 * Retorna null quando o treinador decide manter o plano.
 */
export function inMatchAdjustment(profile: CoachProfile, cur: TacticalInstructions, mentality: Mentality, v: MatchView, done: Set<string>, roll: number): Adjustment | null {
	const options: Adjustment[] = [];
	const late = v.half === 2 && v.minute >= 60;
	if (v.playersOnPitch < v.oppPlayersOnPitch && !done.has('menos')) {
		options.push({ key: 'menos', change: { linha: clamp5(cur.linha - 1), compactacao: clamp5(cur.compactacao + 1), pressao: clamp5(cur.pressao - 1) }, reason: 'Com um a menos, o time se compacta.' });
	}
	if (v.goalDiff < 0 && late && !done.has('buscar')) {
		const bold = profile.risk >= 0.5 || v.minute >= 75;
		options.push({ key: 'buscar', change: { presencaArea: clamp5(cur.presencaArea + 1), ritmo: clamp5(cur.ritmo + 1) }, mentality: bold && mentality !== 'ofensiva' ? 'ofensiva' : undefined, reason: 'Atrás no placar: mais gente na área e mais ritmo.' });
	}
	if (v.goalDiff > 0 && v.half === 2 && v.minute >= 75 && !done.has('segurar')) {
		options.push({ key: 'segurar', change: { compactacao: clamp5(cur.compactacao + 1), aoRecuperar: 'reter', linha: clamp5(cur.linha - 1) }, mentality: mentality === 'ofensiva' ? 'equilibrada' : undefined, reason: 'Vencendo no fim: controlar o jogo e proteger a área.' });
	}
	if (v.minute >= 25 && v.shotsAgainst >= v.shotsFor + 5 && v.onTargetAgainst >= 3 && !done.has('proteger')) {
		options.push({ key: 'proteger', change: { compactacao: clamp5(cur.compactacao + 1), bloco: clamp3(cur.bloco - 1) }, reason: 'Rival finaliza muito: bloco mais baixo e compacto.' });
	}
	if (v.avgCondition < 62 && cur.pressao >= 3 && !done.has('poupar')) {
		options.push({ key: 'poupar', change: { pressao: clamp5(cur.pressao - 1) }, reason: 'Time cansado: pressão menos intensa.' });
	}
	if (v.minute >= 20 && v.oppDefLine > 38 && v.fastForwards && !done.has('costas')) {
		options.push({ key: 'costas', change: { profundidade: clamp5(cur.profundidade + 1), passe: clamp3(cur.passe + 1) }, reason: 'Linha do rival alta: bolas nas costas.' });
	}
	if (v.minute >= 30 && v.possession >= 58 && v.shotsFor <= v.shotsAgainst + 1 && !done.has('abrir')) {
		options.push({ key: 'abrir', change: { amplitude: clamp5(cur.amplitude + 1), corredor: 3 }, reason: 'Muita posse e pouca chance: abrir o campo.' });
	}
	if (!options.length) return null;
	// Prioridade: inferioridade numérica > placar > defesa > energia > oportunidades.
	const pick = options[0];
	// Treinadores pouco adaptáveis às vezes mantêm o plano (decisão determinística).
	if (pick.key !== 'menos' && roll > 0.25 + profile.adaptability * 0.75) return null;
	return pick;
}

export function isCoachStyle(v: unknown): v is CoachStyleId {
	return typeof v === 'string' && v in COACH_PROFILES;
}
