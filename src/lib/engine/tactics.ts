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
}

const MENTALITY: Record<Mentality, Partial<TacticalParams>> = {
	defensiva: { defLine: 27, blockLength: 37, progressWeight: 0.9, safetyWeight: 1.15, shotThreshold: 0.1, support: 0.3 },
	equilibrada: { defLine: 31, blockLength: 40, progressWeight: 1, safetyWeight: 1, shotThreshold: 0.09, support: 0.5 },
	ofensiva: { defLine: 35, blockLength: 42, progressWeight: 1.1, safetyWeight: 0.9, shotThreshold: 0.08, support: 0.75 }
};

const STYLE: Record<PlayStyle, Partial<TacticalParams>> = {
	posse: { shortBias: 0.6, longBias: -0.4, tempo: 2.6, safetyWeight: 1.25, width: 1.0 },
	'tiki-taka': { shortBias: 1.0, longBias: -0.8, tempo: 1.8, safetyWeight: 1.15, width: 0.9, pressDistance: 14, pressers: 2, fatigueCost: 0.03 },
	'contra-ataque': { counterBoost: 1, longBias: 0.3, tempo: 2.0, width: 0.95, defLine: -6 },
	'bola-longa': { longBias: 1.0, shortBias: -0.5, tempo: 1.8, progressWeight: 0.3 },
	laterais: { wideBias: 1.0, width: 1.15, tempo: 2.2 },
	pressao: { pressDistance: 22, pressers: 3, fatigueCost: 0.06, defLine: 7 },
	vertical: { progressWeight: 0.5, tempo: 1.7, shortBias: -0.1, longBias: 0.2 }
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
	shotThreshold: 0.09,
	support: 0.5,
	counterBoost: 0
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
		else p[k] = v;
	}
	return p;
}
