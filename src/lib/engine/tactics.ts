import type { Mentality, PlayStyle } from '#lib/domain/tactics.ts';

/**
 * Tradução das escolhas táticas em parâmetros do motor.
 * Cada parâmetro altera um comportamento concreto (documentado em docs/MOTOR.md).
 * A eficiência real depende dos atributos de quem executa.
 */
export interface TacticalParams {
	/** altura da linha defensiva sem a bola (metros a partir do próprio gol) */
	defLine: number;
	/** comprimento do bloco (distância entre defesa e ataque) */
	blockLength: number;
	/** amplitude em posse (0.6 fechado – 1.15 aberto) */
	width: number;
	/** distância em que o time pressiona o portador (m) */
	pressDistance: number;
	/** quantos atletas pressionam ao mesmo tempo */
	pressers: number;
	/** custo físico extra por minuto */
	fatigueCost: number;
	/** peso do avanço no valor do passe (vs. segurança) */
	progressWeight: number;
	/** peso da segurança no valor do passe */
	safetyWeight: number;
	/** preferência por passes curtos (<18 m) */
	shortBias: number;
	/** preferência por lançamentos (>30 m) */
	longBias: number;
	/** preferência por jogadas pelos lados e cruzamentos */
	wideBias: number;
	/** segundos médios até decidir com a bola */
	tempo: number;
	/** limiar de xG para arriscar o chute */
	shotThreshold: number;
	/** laterais/meias que se juntam ao ataque */
	support: number;
	/** bônus de velocidade nas transições logo após recuperar a bola */
	counterBoost: number;
	/** multiplicador da precisão de passe (passes arriscados erram mais) */
	passAccuracy: number;
	/** densidade defensiva na própria área: bloqueios, marcação na recepção e pressão no chute */
	boxDefense: number;
}

const MENTALITY: Record<Mentality, Partial<TacticalParams>> = {
	defensiva: { defLine: 30, blockLength: 32, progressWeight: 0.9, safetyWeight: 1.15, shotThreshold: 0.112, support: 0.3, boxDefense: 1.45, counterBoost: 0.5 },
	equilibrada: { defLine: 31, blockLength: 40, progressWeight: 1, safetyWeight: 1, shotThreshold: 0.102, support: 0.5 },
	ofensiva: { defLine: 35, blockLength: 42, progressWeight: 1.08, safetyWeight: 0.92, shotThreshold: 0.097, support: 0.7, boxDefense: 0.82, fatigueCost: 0.02 }
};

const STYLE: Record<PlayStyle, Partial<TacticalParams>> = {
	posse: { shortBias: 0.6, longBias: -0.4, tempo: 2.3, safetyWeight: 1.08, progressWeight: 0.12, width: 1.0, passAccuracy: 1.05, boxDefense: 1.1 },
	'tiki-taka': { shortBias: 1.0, longBias: -0.8, tempo: 1.8, safetyWeight: 1.15, width: 0.9, pressDistance: 14, pressers: 2, fatigueCost: 0.04, passAccuracy: 1.0 },
	'contra-ataque': { counterBoost: 1, longBias: 0.3, tempo: 2.1, width: 0.95, defLine: -1, passAccuracy: 0.98 },
	'bola-longa': { longBias: 1.0, shortBias: -0.5, tempo: 1.8, progressWeight: 0.3, passAccuracy: 0.96 },
	laterais: { wideBias: 0.8, width: 1.15, tempo: 2.2, boxDefense: 0.95 },
	pressao: { pressDistance: 22, pressers: 3, fatigueCost: 0.055, defLine: 7 },
	vertical: { progressWeight: 0.25, tempo: 1.8, shortBias: -0.1, longBias: 0.2, passAccuracy: 0.95 }
};

const BASE: TacticalParams = {
	defLine: 31,
	blockLength: 40,
	width: 1,
	pressDistance: 11,
	pressers: 1,
	fatigueCost: 0,
	progressWeight: 1,
	safetyWeight: 1,
	shortBias: 0,
	longBias: 0,
	wideBias: 0,
	tempo: 2.6,
	shotThreshold: 0.085,
	support: 0.5,
	counterBoost: 0,
	passAccuracy: 1,
	boxDefense: 1
};

/** Combina mentalidade e estilo. Modificadores aditivos para linhas/pesos, substitutivos para o resto. */
export function tacticalParams(mentality: Mentality, style: PlayStyle): TacticalParams {
	const m = MENTALITY[mentality];
	const s = STYLE[style];
	const p: TacticalParams = { ...BASE, ...m };
	for (const [k, v] of Object.entries(s) as Array<[keyof TacticalParams, number]>) {
		if (k === 'defLine') p.defLine += v;
		else if (k === 'progressWeight') p.progressWeight += v;
		else if (k === 'safetyWeight') p.safetyWeight = (p.safetyWeight + v) / 2;
		else if (k === 'boxDefense' || k === 'passAccuracy') p[k] *= v;
		else p[k] = v;
	}
	return p;
}
