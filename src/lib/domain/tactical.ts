import { roleCompatibility, DEFAULT_ROLE, ROLES, type RoleId } from '#lib/engine/roles.ts';
import { INSTRUCTION_KEYS, type TacticalInstructions } from '#lib/engine/instructions.ts';
import type { TeamFamiliarity } from '#lib/engine/types.ts';
import type { SquadPlayer } from './squad.ts';
import { FORMATION_IDS, FORMATIONS, STYLES, type FormationId, type PlayStyle } from './tactics.ts';

/**
 * Domínio tático progressivo (Dev 0.3).
 *
 * Cinco dimensões, todas de 0 a 100 e persistidas na carreira:
 *   1. formação  2. estilo  3. função de cada atleta  4. entrosamento  5. compreensão das instruções
 *
 * Regras de projeto:
 *  - Aprende devagar e com retorno decrescente: dominar um sistema leva temporadas, não rodadas.
 *  - Conhecimento é parcialmente transferível entre sistemas parecidos (4-3-3 → 4-2-3-1).
 *  - Esquecer é lento: trocar de esquema não apaga o que foi aprendido.
 *  - O motor converte tudo em EXECUÇÃO (posicionamento, leitura, sincronia), nunca em gols.
 */
export const TACTICAL_VERSION = 1;

export interface TacticalState {
	v: number;
	formations: Record<FormationId, number>;
	styles: Record<PlayStyle, number>;
	/** compreensão das instruções em uso */
	instructions: number;
	/** assinatura das instruções em uso (para medir mudanças) */
	instructionsKey: string;
	/** entrosamento de cada atleta com o grupo */
	integration: Record<string, number>;
	/** domínio de cada atleta nas funções que já exerceu */
	roles: Record<string, Partial<Record<RoleId, number>>>;
	/** treino de bolas paradas */
	setPieces: number;
	/** desempenho por formação/estilo (histórico) */
	history: TacticalRecord[];
}

export interface TacticalRecord {
	season: number;
	round: number;
	formation: FormationId;
	style: PlayStyle;
	goalsFor: number;
	goalsAgainst: number;
	execution: number;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Estado inicial de um clube: conhece um pouco de tudo e mais do sistema que já usava. */
export function initialTacticalState(squad: SquadPlayer[], formation: FormationId, style: PlayStyle): TacticalState {
	const formations = Object.fromEntries(FORMATION_IDS.map((f) => [f, f === formation ? 45 : 22 + similarity(f, formation) * 12])) as Record<FormationId, number>;
	const styles = Object.fromEntries(STYLES.map((s) => [s, s === style ? 40 : 22 + styleSimilarity(s, style) * 12])) as Record<PlayStyle, number>;
	const integration: Record<string, number> = {};
	const roles: TacticalState['roles'] = {};
	for (const p of squad) {
		integration[p.id] = 45;
		roles[p.id] = { [DEFAULT_ROLE[p.position]]: 45 };
	}
	return { v: TACTICAL_VERSION, formations: round(formations), styles: round(styles), instructions: 50, instructionsKey: '', integration, roles, setPieces: 40, history: [] };
}

function round<T extends Record<string, number>>(o: T): T {
	return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round1(v)])) as T;
}

/** Semelhança entre formações (0–1): posições em comum, slot a slot. */
export function similarity(a: FormationId, b: FormationId): number {
	if (a === b) return 1;
	const pa = FORMATIONS[a].map((s) => s.position);
	const pb = [...FORMATIONS[b].map((s) => s.position)];
	let common = 0;
	for (const p of pa) {
		const i = pb.indexOf(p);
		if (i >= 0) {
			common++;
			pb.splice(i, 1);
		}
	}
	// linhas de defesa diferentes (3 × 4 × 5 zagueiros) pesam mais
	const backs = (f: FormationId) => FORMATIONS[f].filter((s) => s.position === 'ZAG').length;
	const penalty = backs(a) === backs(b) ? 0 : 0.15;
	return Math.max(0, common / 11 - penalty);
}

const STYLE_SIM: Partial<Record<PlayStyle, Partial<Record<PlayStyle, number>>>> = {
	posse: { 'tiki-taka': 0.7, laterais: 0.35, pressao: 0.2 },
	'tiki-taka': { posse: 0.7, pressao: 0.4 },
	'contra-ataque': { vertical: 0.5, 'bola-longa': 0.35 },
	'bola-longa': { vertical: 0.4, 'contra-ataque': 0.35 },
	laterais: { posse: 0.35, vertical: 0.2 },
	pressao: { 'tiki-taka': 0.4, vertical: 0.3, posse: 0.2 },
	vertical: { 'contra-ataque': 0.5, 'bola-longa': 0.4, pressao: 0.3 }
};

export function styleSimilarity(a: PlayStyle, b: PlayStyle): number {
	if (a === b) return 1;
	return STYLE_SIM[a]?.[b] ?? STYLE_SIM[b]?.[a] ?? 0.1;
}

/** Capacidade de aprendizagem (0,75–1,25) a partir de atributos mentais. */
export function learningRate(p: Pick<SquadPlayer, 'attributes'>): number {
	const a = p.attributes;
	const m = (a.decisoes + a.posicionamento + a.trabalhoEquipe + a.concentracao + a.antecipacao) / 5;
	return clamp(0.75 + (m - 45) / 80, 0.75, 1.25);
}

export function instructionsKey(i: TacticalInstructions | undefined): string {
	return i ? INSTRUCTION_KEYS.map((k) => String(i[k])).join('|') : '';
}

/** Quantas instruções mudaram entre duas assinaturas. */
export function changedInstructions(a: string, b: string): number {
	if (!a || !b) return 0;
	const x = a.split('|');
	const y = b.split('|');
	return x.reduce((n, v, i) => n + (v === y[i] ? 0 : 1), 0);
}

/** Ganho com retorno decrescente: perto de 100, aprender fica muito mais difícil. */
function gain(v: number, k: number): number {
	return k * Math.pow(1 - v / 100, 1.3);
}

export interface MatchLearningInput {
	formation: FormationId;
	style: PlayStyle;
	instructions?: TacticalInstructions;
	/** atletas usados, com minutos e função exercida */
	appearances: Array<{ id: string; minutes: number; role: RoleId }>;
	squad: SquadPlayer[];
}

/**
 * Aprendizado de UMA partida. Formação/estilo usados ganham ~1–3 pontos (menos quanto mais
 * alto o domínio); sistemas parecidos ganham uma fração; os demais esquecem bem devagar.
 */
export function learnFromMatch(prev: TacticalState, m: MatchLearningInput): TacticalState {
	const st = structuredClone(prev);
	const byId = new Map(m.squad.map((p) => [p.id, p]));
	const used = m.appearances.filter((a) => a.minutes > 0 && byId.has(a.id));
	const rate = used.length ? used.reduce((s, a) => s + learningRate(byId.get(a.id)!) * a.minutes, 0) / used.reduce((s, a) => s + a.minutes, 0) : 1;
	// formação
	for (const f of FORMATION_IDS) {
		const v = st.formations[f] ?? 20;
		if (f === m.formation) st.formations[f] = clamp(v + gain(v, 3.2) * rate);
		else {
			const sim = similarity(f, m.formation);
			const next = sim >= 0.5 ? v + gain(v, 3.2) * rate * sim * 0.45 : v - (v > 30 ? 0.25 : 0);
			st.formations[f] = clamp(next, 15);
		}
		st.formations[f] = round1(st.formations[f]);
	}
	// estilo
	for (const s of STYLES) {
		const v = st.styles[s] ?? 20;
		if (s === m.style) st.styles[s] = clamp(v + gain(v, 3) * rate);
		else {
			const sim = styleSimilarity(s, m.style);
			st.styles[s] = clamp(sim >= 0.35 ? v + gain(v, 3) * rate * sim * 0.4 : v - (v > 30 ? 0.25 : 0), 15);
		}
		st.styles[s] = round1(st.styles[s]);
	}
	// instruções: mudanças derrubam parte da compreensão; jogar com elas ensina
	const key = instructionsKey(m.instructions);
	const changed = changedInstructions(st.instructionsKey, key);
	st.instructions = round1(clamp(st.instructions - Math.min(30, changed * 4) + gain(st.instructions - Math.min(30, changed * 4), 4) * rate, 10));
	st.instructionsKey = key;
	// entrosamento e funções
	const playing = new Set(used.map((a) => a.id));
	for (const p of m.squad) {
		const cur = st.integration[p.id] ?? 15;
		if (playing.has(p.id)) {
			const a = used.find((u) => u.id === p.id)!;
			st.integration[p.id] = round1(clamp(cur + gain(cur, 3.5) * (a.minutes / 90) * learningRate(p)));
			const roles = (st.roles[p.id] ??= {});
			const rv = roles[a.role] ?? 20;
			roles[a.role] = round1(clamp(rv + gain(rv, 5) * (a.minutes / 90) * learningRate(p)));
			// funções da mesma posição aprendem um pouco junto
			for (const other of Object.values(ROLES)) {
				if (other.id === a.role || !other.positions.includes(p.position)) continue;
				const ov = roles[other.id] ?? 20;
				roles[other.id] = round1(clamp(ov + gain(ov, 5) * (a.minutes / 90) * 0.2));
			}
		} else {
			st.integration[p.id] = round1(clamp(cur - 0.4, 10));
		}
	}
	// atletas que saíram do elenco deixam de contar
	for (const id of Object.keys(st.integration)) if (!byId.has(id)) delete st.integration[id];
	for (const id of Object.keys(st.roles)) if (!byId.has(id)) delete st.roles[id];
	return st;
}

/** Garante que todo atleta do elenco tenha registro (novos contratados/base começam baixos). */
export function syncSquad(prev: TacticalState, squad: SquadPlayer[]): TacticalState {
	const st = structuredClone(prev);
	for (const p of squad) {
		if (st.integration[p.id] === undefined) st.integration[p.id] = 15;
		if (!st.roles[p.id]) st.roles[p.id] = { [DEFAULT_ROLE[p.position]]: 25 };
	}
	return st;
}

/** Domínio coletivo de um plano (0–100) para exibir e para o motor. */
export function teamMastery(st: TacticalState, formation: FormationId, style: PlayStyle, lineup: string[], instructions?: TacticalInstructions) {
	const f = st.formations[formation] ?? 20;
	const s = st.styles[style] ?? 20;
	const pending = changedInstructions(st.instructionsKey, instructionsKey(instructions));
	const i = clamp(st.instructions - Math.min(30, pending * 4));
	const cohesion = lineup.length ? lineup.reduce((acc, id) => acc + (st.integration[id] ?? 15), 0) / lineup.length : 0;
	const execution = f * 0.35 + s * 0.25 + i * 0.15 + cohesion * 0.25;
	return { formation: round1(f), style: round1(s), instructions: round1(i), cohesion: round1(cohesion), execution: round1(execution) };
}

/** Familiaridade enviada ao motor: execução coletiva + domínio individual por função. */
export function engineFamiliarity(st: TacticalState, formation: FormationId, style: PlayStyle, lineup: string[], roles: RoleId[], instructions?: TacticalInstructions): TeamFamiliarity {
	const m = teamMastery(st, formation, style, lineup, instructions);
	const roleFam: Record<string, number> = {};
	lineup.forEach((id, i) => {
		roleFam[id] = st.roles[id]?.[roles[i]] ?? 20;
	});
	return { execution: m.execution, roles: roleFam, setPieces: st.setPieces };
}

/** Funções escolhidas (ou padrão) para a formação, alinhadas aos slots. */
export function resolveRoles(formation: FormationId, roles?: Array<RoleId | null | undefined>): RoleId[] {
	return FORMATIONS[formation].map((slot, i) => {
		const r = roles?.[i];
		return r && ROLES[r]?.positions.includes(slot.position) ? r : DEFAULT_ROLE[slot.position];
	});
}

/** Melhor função para cada slot pelo atributo (usado pela IA e como sugestão). */
export function bestRoles(formation: FormationId, lineup: string[], squad: SquadPlayer[]): RoleId[] {
	const byId = new Map(squad.map((p) => [p.id, p]));
	return FORMATIONS[formation].map((slot, i) => {
		const p = byId.get(lineup[i]);
		if (!p) return DEFAULT_ROLE[slot.position];
		const options = Object.values(ROLES).filter((r) => r.positions.includes(slot.position));
		return options.sort((a, b) => roleCompatibility(p.attributes, b.id, slot.position) - roleCompatibility(p.attributes, a.id, slot.position))[0].id;
	});
}

/** Normaliza um estado salvo (saves antigos ou dados parciais). */
export function sanitizeTacticalState(input: unknown, squad: SquadPlayer[], formation: FormationId, style: PlayStyle): TacticalState {
	const base = initialTacticalState(squad, formation, style);
	if (!input || typeof input !== 'object') return base;
	const raw = input as Partial<TacticalState>;
	const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v) : d);
	const st: TacticalState = {
		v: TACTICAL_VERSION,
		formations: Object.fromEntries(FORMATION_IDS.map((f) => [f, num(raw.formations?.[f], base.formations[f])])) as TacticalState['formations'],
		styles: Object.fromEntries(STYLES.map((s) => [s, num(raw.styles?.[s], base.styles[s])])) as TacticalState['styles'],
		instructions: num(raw.instructions, base.instructions),
		instructionsKey: typeof raw.instructionsKey === 'string' ? raw.instructionsKey : '',
		integration: {},
		roles: {},
		setPieces: num(raw.setPieces, base.setPieces),
		history: Array.isArray(raw.history) ? raw.history.slice(-120) : []
	};
	for (const p of squad) {
		st.integration[p.id] = num(raw.integration?.[p.id], base.integration[p.id]);
		const r = raw.roles?.[p.id];
		st.roles[p.id] = r && typeof r === 'object' ? Object.fromEntries(Object.entries(r).filter(([k, v]) => k in ROLES && typeof v === 'number').map(([k, v]) => [k, clamp(v as number)])) : base.roles[p.id];
	}
	return st;
}

export const MASTERY_LABEL = (v: number) => (v >= 85 ? 'Dominado' : v >= 70 ? 'Muito bom' : v >= 55 ? 'Bom' : v >= 40 ? 'Em evolução' : v >= 25 ? 'Básico' : 'Novo');
