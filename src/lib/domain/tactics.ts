import { sanitizeCaptains, sanitizeOrders, type PlayerOrders } from './player-orders.ts';
import { presetInstructions, sanitizeInstructions, INSTRUCTION_KEYS, type TacticalInstructions } from '#lib/engine/instructions.ts';
import { DEFAULT_ROLE, isRoleId, ROLES, type RoleId } from '#lib/engine/roles.ts';
import { positionFit, type Position } from './positions.ts';
import type { SquadPlayer } from './squad.ts';

export interface Slot {
	position: Position;
	/** 0–100 da esquerda para a direita */
	x: number;
	/** 0–100 do ataque (topo) até o próprio gol (base) */
	y: number;
}

export const FORMATIONS = {
	'4-3-3': [
		{ position: 'GOL', x: 50, y: 92 },
		{ position: 'LD', x: 84, y: 72 }, { position: 'ZAG', x: 62, y: 76 }, { position: 'ZAG', x: 38, y: 76 }, { position: 'LE', x: 16, y: 72 },
		{ position: 'VOL', x: 50, y: 58 }, { position: 'MC', x: 70, y: 46 }, { position: 'MC', x: 30, y: 46 },
		{ position: 'PD', x: 82, y: 24 }, { position: 'ATA', x: 50, y: 16 }, { position: 'PE', x: 18, y: 24 }
	],
	'4-4-2': [
		{ position: 'GOL', x: 50, y: 92 },
		{ position: 'LD', x: 84, y: 72 }, { position: 'ZAG', x: 62, y: 76 }, { position: 'ZAG', x: 38, y: 76 }, { position: 'LE', x: 16, y: 72 },
		{ position: 'PD', x: 84, y: 44 }, { position: 'MC', x: 61, y: 50 }, { position: 'MC', x: 39, y: 50 }, { position: 'PE', x: 16, y: 44 },
		{ position: 'ATA', x: 58, y: 17 }, { position: 'ATA', x: 42, y: 27 }
	],
	'4-2-3-1': [
		{ position: 'GOL', x: 50, y: 92 },
		{ position: 'LD', x: 84, y: 72 }, { position: 'ZAG', x: 62, y: 76 }, { position: 'ZAG', x: 38, y: 76 }, { position: 'LE', x: 16, y: 72 },
		{ position: 'VOL', x: 62, y: 58 }, { position: 'VOL', x: 38, y: 58 },
		{ position: 'PD', x: 82, y: 34 }, { position: 'MEI', x: 50, y: 36 }, { position: 'PE', x: 18, y: 34 },
		{ position: 'ATA', x: 50, y: 15 }
	],
	'3-5-2': [
		{ position: 'GOL', x: 50, y: 92 },
		{ position: 'ZAG', x: 72, y: 75 }, { position: 'ZAG', x: 50, y: 78 }, { position: 'ZAG', x: 28, y: 75 },
		{ position: 'LD', x: 88, y: 48 }, { position: 'VOL', x: 50, y: 58 }, { position: 'MC', x: 67, y: 44 }, { position: 'MC', x: 33, y: 44 }, { position: 'LE', x: 12, y: 48 },
		{ position: 'ATA', x: 58, y: 17 }, { position: 'ATA', x: 42, y: 27 }
	],
	'5-3-2': [
		{ position: 'GOL', x: 50, y: 92 },
		{ position: 'LD', x: 88, y: 66 }, { position: 'ZAG', x: 69, y: 76 }, { position: 'ZAG', x: 50, y: 78 }, { position: 'ZAG', x: 31, y: 76 }, { position: 'LE', x: 12, y: 66 },
		{ position: 'MC', x: 70, y: 46 }, { position: 'VOL', x: 50, y: 52 }, { position: 'MC', x: 30, y: 46 },
		{ position: 'ATA', x: 58, y: 17 }, { position: 'ATA', x: 42, y: 27 }
	],
	'4-2-2-2': [
		{ position: 'GOL', x: 50, y: 92 },
		{ position: 'LD', x: 84, y: 72 }, { position: 'ZAG', x: 62, y: 76 }, { position: 'ZAG', x: 38, y: 76 }, { position: 'LE', x: 16, y: 72 },
		{ position: 'VOL', x: 62, y: 57 }, { position: 'VOL', x: 38, y: 57 },
		{ position: 'MEI', x: 74, y: 36 }, { position: 'MEI', x: 26, y: 36 },
		{ position: 'ATA', x: 58, y: 17 }, { position: 'ATA', x: 42, y: 27 }
	],
	'3-4-3': [
		{ position: 'GOL', x: 50, y: 92 },
		{ position: 'ZAG', x: 72, y: 75 }, { position: 'ZAG', x: 50, y: 78 }, { position: 'ZAG', x: 28, y: 75 },
		{ position: 'LD', x: 86, y: 50 }, { position: 'MC', x: 61, y: 52 }, { position: 'MC', x: 39, y: 52 }, { position: 'LE', x: 14, y: 50 },
		{ position: 'PD', x: 78, y: 22 }, { position: 'ATA', x: 50, y: 16 }, { position: 'PE', x: 22, y: 22 }
	]
} as const satisfies Record<string, readonly Slot[]>;

export type FormationId = keyof typeof FORMATIONS;
export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];

export const MENTALITIES = ['defensiva', 'cautelosa', 'equilibrada', 'ofensiva', 'muito-ofensiva'] as const;
export type Mentality = (typeof MENTALITIES)[number];
export const MENTALITY_LABELS: Record<Mentality, string> = {
	defensiva: 'Defensiva',
	cautelosa: 'Cautelosa',
	equilibrada: 'Equilibrada',
	ofensiva: 'Ofensiva',
	'muito-ofensiva': 'Muito ofensiva'
};

export const STYLES = ['posse', 'tiki-taka', 'contra-ataque', 'bola-longa', 'laterais', 'pressao', 'vertical'] as const;
export type PlayStyle = (typeof STYLES)[number];
export const STYLE_LABELS: Record<PlayStyle, string> = {
	posse: 'Posse de bola',
	'tiki-taka': 'Tiki-taka',
	'contra-ataque': 'Contra-ataque',
	'bola-longa': 'Bola longa',
	laterais: 'Jogo pelas laterais',
	pressao: 'Pressão alta',
	vertical: 'Construção vertical'
};

/** Valores da Dev 0.1 que continuam aceitos ao ler carreiras antigas. */
const LEGACY_MENTALITY: Record<string, Mentality> = {};
const LEGACY_STYLE: Record<string, PlayStyle> = { 'jogo-direto': 'bola-longa' };

export function normalizeMentality(v: unknown): Mentality | null {
	if (typeof v !== 'string') return null;
	if ((MENTALITIES as readonly string[]).includes(v)) return v as Mentality;
	return LEGACY_MENTALITY[v] ?? null;
}

export function normalizeStyle(v: unknown): PlayStyle | null {
	if (typeof v !== 'string') return null;
	if ((STYLES as readonly string[]).includes(v)) return v as PlayStyle;
	return LEGACY_STYLE[v] ?? null;
}

export interface Tactic {
formation: FormationId;
/** ids dos 11 titulares, na ordem dos slots da formação */
lineup: string[];
mentality: Mentality;
style: PlayStyle;
/** instruções avançadas (Dev 0.3); ausente = preset de mentalidade + estilo */
instructions?: TacticalInstructions;
/** função de cada slot (Dev 0.3); ausente = função padrão da posição */
roles?: RoleId[];
captains?: string[];
playerOrders?: PlayerOrders;
}

export function isFormation(value: unknown): value is FormationId {
	return typeof value === 'string' && value in FORMATIONS;
}

/** Escalação automática: melhor encaixe (posição + qualidade) por slot. */
export function autoLineup(formation: FormationId, squad: SquadPlayer[]): string[] {
	const slots = FORMATIONS[formation];
	const available = new Set(squad.map((p) => p.id));
	const byId = new Map(squad.map((p) => [p.id, p]));
	// Preenche primeiro os slots mais restritivos (goleiro, depois defesa).
	const order = slots.map((s, i) => i).sort((a, b) => scarcity(slots[a].position) - scarcity(slots[b].position));
	const lineup: string[] = new Array(slots.length).fill('');
	for (const i of order) {
		let best: SquadPlayer | null = null;
		let bestScore = -Infinity;
		for (const id of available) {
			const p = byId.get(id)!;
			const score = positionFit(p.position, slots[i].position) * 100 + p.overall;
			if (score > bestScore) {
				best = p;
				bestScore = score;
			}
		}
		if (best) {
			lineup[i] = best.id;
			available.delete(best.id);
		}
	}
	return lineup;
}

function scarcity(position: Position): number {
	return position === 'GOL' ? 0 : position === 'LD' || position === 'LE' ? 1 : 2;
}

/** Familiaridade 0–100: quão bem os titulares encaixam nas posições da formação. */
export function lineupFamiliarity(formation: FormationId, lineup: string[], squad: SquadPlayer[]): number {
	const slots = FORMATIONS[formation];
	const byId = new Map(squad.map((p) => [p.id, p]));
	let total = 0;
	slots.forEach((slot, i) => {
		const p = byId.get(lineup[i]);
		total += p ? positionFit(p.position, slot.position) : 0;
	});
	return Math.round((total / slots.length) * 100);
}

export interface AssistantNote {
	tone: 'positivo' | 'alerta' | 'info';
	text: string;
}

/**
 * Relatório do auxiliar técnico — regras simples e verificáveis sobre a escalação atual.
 * (Não simula partidas; apenas lê os dados disponíveis.)
 */
export function assistantReport(tactic: Tactic, squad: SquadPlayer[]): AssistantNote[] {
	const slots = FORMATIONS[tactic.formation];
	const byId = new Map(squad.map((p) => [p.id, p]));
	const notes: AssistantNote[] = [];
	const starters = tactic.lineup.map((id) => byId.get(id)).filter((p): p is SquadPlayer => !!p);

	if (starters.length < slots.length) {
		notes.push({ tone: 'alerta', text: `Faltam ${slots.length - starters.length} titulares na escalação.` });
	}
	const outOfPosition = slots.filter((s, i) => {
		const p = byId.get(tactic.lineup[i]);
		return p && positionFit(p.position, s.position) < 0.5;
	}).length;
	if (outOfPosition > 0) {
		notes.push({ tone: 'alerta', text: `${outOfPosition} jogador(es) atuando fora de posição.` });
	} else if (starters.length === slots.length) {
		notes.push({ tone: 'positivo', text: 'Todos os titulares estão em posições conhecidas.' });
	}
	const tired = starters.filter((p) => p.condition < 94);
	if (tired.length) {
		notes.push({ tone: 'info', text: `${tired.map((p) => p.shortName).join(', ')} com condição física abaixo de 94%.` });
	}
	const bench = squad.filter((p) => !tactic.lineup.includes(p.id));
	const strongBench = bench.filter((b) => starters.some((s) => s.position === b.position && b.overall > s.overall + 2));
	if (strongBench.length) {
		notes.push({ tone: 'info', text: `${strongBench.map((p) => p.shortName).join(', ')} tem nota superior a um titular da mesma posição.` });
	}
	if (tactic.style === 'pressao' && tactic.mentality === 'defensiva') {
		notes.push({ tone: 'info', text: 'Pressão alta com mentalidade defensiva tende a gerar instruções conflitantes.' });
	}
	return notes;
}

export function defaultTactic(squad: SquadPlayer[]): Tactic {
	return { formation: '4-3-3', lineup: autoLineup('4-3-3', squad), mentality: 'equilibrada', style: 'posse' };
}

/** Valida uma tática recebida do cliente contra o elenco do clube. */
export function sanitizeTactic(input: unknown, squad: SquadPlayer[]): Tactic | null {
	if (!input || typeof input !== 'object') return null;
	const t = input as Record<string, unknown>;
	if (!isFormation(t.formation)) return null;
	const mentality = normalizeMentality(t.mentality);
	const style = normalizeStyle(t.style);
	if (!mentality || !style) return null;
	if (!Array.isArray(t.lineup) || t.lineup.length !== FORMATIONS[t.formation].length) return null;
	const ids = new Set(squad.map((p) => p.id));
	const seen = new Set<string>();
	for (const id of t.lineup) {
		if (typeof id !== 'string' || !ids.has(id) || seen.has(id)) return null;
		seen.add(id);
	}
	const out: Tactic = {
	formation: t.formation,
	lineup: [...(t.lineup as string[])],
	mentality,
	style
	};
	if (t.instructions && typeof t.instructions === 'object') out.instructions = sanitizeInstructions(t.instructions, presetInstructions(mentality, style));
	if (Array.isArray(t.roles) && t.roles.length === FORMATIONS[t.formation].length) {
	const slots = FORMATIONS[t.formation];
	out.roles = slots.map((slot, i) => {
	const r = (t.roles as unknown[])[i];
	return isRoleId(r) && ROLES[r].positions.includes(slot.position) ? r : DEFAULT_ROLE[slot.position];
	});
	}
	const captains = sanitizeCaptains(t.captains, squad);
	const orders = sanitizeOrders(t.playerOrders, squad);
	if (captains) out.captains = captains;
	if (orders) out.playerOrders = orders;
	return out;
}

/** Repair only unavailable starters. Keep valid tactical preferences and succession. */
export function recoverTactic(tactic: Tactic | undefined, squad: SquadPlayer[]): Tactic | null {
	if (!tactic) return null;
	const saved = sanitizeTactic(tactic, squad);
	if (saved || !isFormation(tactic.formation)) return saved;
	return sanitizeTactic({ ...tactic, lineup: autoLineup(tactic.formation, squad) }, squad);
}

/**
 * Chave canônica da tática (independe da ordem das propriedades do objeto).
 * O PostgreSQL (jsonb) reordena as chaves ao gravar; comparar JSON.stringify
 * do objeto inteiro fazia a tela achar que a tática salva ainda tinha alterações.
 */
export function tacticKey(t: Tactic): string {
	return JSON.stringify([t.formation, [...t.lineup], t.mentality, t.style, t.instructions ? INSTRUCTION_KEYS.map((k) => t.instructions![k]) : null, t.roles ?? null, t.captains ?? null, Object.entries(t.playerOrders ?? {}).sort(([a], [b]) => a.localeCompare(b))]);
}

export function sameTactic(a: Tactic, b: Tactic): boolean {
	return tacticKey(a) === tacticKey(b);
}
