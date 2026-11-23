import type { TacticalInstructions } from '#lib/engine/instructions.ts';
import { similarity, styleSimilarity, type TacticalState } from './tactical.ts';
import { FORMATION_IDS, STYLES, type FormationId, type PlayStyle } from './tactics.ts';

/**
 * Conhecimento tático PESSOAL do treinador (Carreira de Treinador 2.0).
 *
 * É diferente do domínio coletivo do elenco (`TacticalState`):
 *  - pertence ao treinador e o acompanha em todas as trocas de clube;
 *  - cresce mais devagar que o entrosamento de um elenco (é experiência acumulada);
 *  - quase não se perde: um treinador não esquece o futebol que sabe.
 *
 * No jogo, ele não substitui o entrosamento: o elenco novo ainda precisa aprender. O treinador
 * que conhece bem um sistema ensina melhor (o elenco aprende mais rápido) e corrige parte da
 * execução em campo — sem nunca transformar conhecimento em gols.
 */
export const COACH_KNOWLEDGE_VERSION = 1;

export const CONCEPTS = {
	'pressao-alta': 'Pressão alta',
	'bloco-baixo': 'Bloco baixo',
	'linha-alta': 'Linha defensiva alta',
	'contra-ataque': 'Contra-ataque',
	'saida-curta': 'Saída curta e posse',
	'jogo-direto': 'Jogo direto',
	'amplitude': 'Jogo pelos lados',
	'marcacao-individual': 'Marcação individual'
} as const;
export type ConceptId = keyof typeof CONCEPTS;

export interface CoachKnowledge {
	v: number;
	formations: Record<FormationId, number>;
	styles: Record<PlayStyle, number>;
	/** domínio das instruções avançadas em geral */
	instructions: number;
	/** conceitos trabalhados (pressão alta, contra-ataque, linha…) */
	concepts: Partial<Record<ConceptId, number>>;
	/** jogos oficiais comandados com este repertório */
	matches: number;
	/** evolução histórica por temporada (formação e estilo mais usados) */
	timeline: Array<{ season: number; clubId: string; formation: FormationId; style: PlayStyle; games: number; formationLevel: number }>;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const gain = (v: number, k: number) => k * Math.pow(1 - v / 100, 1.4);

/** Conceitos presentes num conjunto de instruções. */
export function conceptsOf(i: TacticalInstructions | undefined): ConceptId[] {
	if (!i) return [];
	const out: ConceptId[] = [];
	if (i.pressao >= 4) out.push('pressao-alta');
	if (i.bloco === 1 || i.linha <= 2) out.push('bloco-baixo');
	if (i.linha >= 4) out.push('linha-alta');
	if (i.aoRecuperar === 'contra-ataque' || i.abordagem === 3) out.push('contra-ataque');
	if (i.construcao === 1 && i.passe === 1) out.push('saida-curta');
	if (i.passe === 3 || i.construcao === 3) out.push('jogo-direto');
	if (i.amplitude >= 4 || i.corredor === 3) out.push('amplitude');
	if (i.marcacao === 'individual') out.push('marcacao-individual');
	return out;
}

/**
 * Ponto de partida. Saves anteriores à 2.0 não tinham o conhecimento separado: ele nasce igual ao
 * domínio que o clube atual já tem, então nada muda no motor até o treinador trocar de clube.
 */
export function initialCoachKnowledge(team?: TacticalState | null): CoachKnowledge {
	const formations = Object.fromEntries(FORMATION_IDS.map((f) => [f, r1(team?.formations[f] ?? 25)])) as Record<FormationId, number>;
	const styles = Object.fromEntries(STYLES.map((s) => [s, r1(team?.styles[s] ?? 25)])) as Record<PlayStyle, number>;
	return { v: COACH_KNOWLEDGE_VERSION, formations, styles, instructions: r1(team?.instructions ?? 40), concepts: {}, matches: 0, timeline: [] };
}

export function sanitizeCoachKnowledge(raw: unknown, team?: TacticalState | null): CoachKnowledge {
	const base = initialCoachKnowledge(team);
	if (!raw || typeof raw !== 'object') return base;
	const k = raw as Partial<CoachKnowledge>;
	const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v) : d);
	return {
		v: COACH_KNOWLEDGE_VERSION,
		formations: Object.fromEntries(FORMATION_IDS.map((f) => [f, num(k.formations?.[f], base.formations[f])])) as Record<FormationId, number>,
		styles: Object.fromEntries(STYLES.map((s) => [s, num(k.styles?.[s], base.styles[s])])) as Record<PlayStyle, number>,
		instructions: num(k.instructions, base.instructions),
		concepts: Object.fromEntries(Object.entries(k.concepts ?? {}).filter(([c, v]) => c in CONCEPTS && typeof v === 'number').map(([c, v]) => [c, clamp(v as number)])),
		matches: Number.isInteger(k.matches) && k.matches! >= 0 ? k.matches! : 0,
		timeline: Array.isArray(k.timeline) ? k.timeline.slice(-40) : []
	};
}

/** Experiência de UMA partida comandada: cresce devagar e quase não esquece. */
export function coachLearnFromMatch(prev: CoachKnowledge, m: { formation: FormationId; style: PlayStyle; instructions?: TacticalInstructions; season: number; clubId: string }): CoachKnowledge {
	const k = structuredClone(prev);
	for (const f of FORMATION_IDS) {
		const v = k.formations[f];
		if (f === m.formation) k.formations[f] = r1(clamp(v + gain(v, 1.6)));
		else {
			const sim = similarity(f, m.formation);
			if (sim >= 0.5) k.formations[f] = r1(clamp(v + gain(v, 1.6) * sim * 0.35));
		}
	}
	for (const s of STYLES) {
		const v = k.styles[s];
		if (s === m.style) k.styles[s] = r1(clamp(v + gain(v, 1.5)));
		else {
			const sim = styleSimilarity(s, m.style);
			if (sim >= 0.35) k.styles[s] = r1(clamp(v + gain(v, 1.5) * sim * 0.3));
		}
	}
	if (m.instructions) k.instructions = r1(clamp(k.instructions + gain(k.instructions, 1.2)));
	for (const c of conceptsOf(m.instructions)) k.concepts[c] = r1(clamp((k.concepts[c] ?? 20) + gain(k.concepts[c] ?? 20, 2)));
	k.matches += 1;
	const last = k.timeline[k.timeline.length - 1];
	if (last && last.season === m.season && last.clubId === m.clubId && last.formation === m.formation && last.style === m.style) {
		last.games += 1;
		last.formationLevel = k.formations[m.formation];
	} else k.timeline = [...k.timeline, { season: m.season, clubId: m.clubId, formation: m.formation, style: m.style, games: 1, formationLevel: k.formations[m.formation] }].slice(-40);
	return k;
}

/** Entre temporadas o treinador perde muito pouco (1%) — bem menos que um elenco parado (5%). */
export function coachSeasonDecay(prev: CoachKnowledge): CoachKnowledge {
	const k = structuredClone(prev);
	for (const f of FORMATION_IDS) k.formations[f] = r1(k.formations[f] * 0.99);
	for (const s of STYLES) k.styles[s] = r1(k.styles[s] * 0.99);
	return k;
}

/** Parte da diferença que o treinador consegue corrigir em campo quando sabe mais que o elenco. */
export const COACH_EXECUTION_SHARE = 0.3;

/**
 * Domínio efetivo usado pelo motor e pela tela: o do elenco, mais 30% da vantagem do treinador.
 * Se o elenco sabe mais que o treinador, vale o do elenco (o treinador não atrapalha).
 */
export function effectiveTactical(team: TacticalState, coach: CoachKnowledge | null | undefined): TacticalState {
	if (!coach) return team;
	const lift = (t: number, c: number) => r1(t + Math.max(0, c - t) * COACH_EXECUTION_SHARE);
	return {
		...team,
		formations: Object.fromEntries(FORMATION_IDS.map((f) => [f, lift(team.formations[f] ?? 20, coach.formations[f] ?? 0)])) as TacticalState['formations'],
		styles: Object.fromEntries(STYLES.map((s) => [s, lift(team.styles[s] ?? 20, coach.styles[s] ?? 0)])) as TacticalState['styles'],
		instructions: lift(team.instructions, coach.instructions)
	};
}

/**
 * Quem conhece o sistema ensina melhor: o ganho de aprendizado do ELENCO é multiplicado por até
 * 1,6 quando o treinador domina muito mais do que os jogadores.
 */
export function teachingFactor(team: TacticalState, coach: CoachKnowledge | null | undefined, formation: FormationId, style: PlayStyle): number {
	if (!coach) return 1;
	const gap = (Math.max(0, coach.formations[formation] - team.formations[formation]) + Math.max(0, coach.styles[style] - team.styles[style])) / 2;
	return 1 + Math.min(0.6, gap / 100);
}

/** Aplica o fator de ensino sobre o que o elenco acabou de aprender (formações e estilos). */
export function withTeaching(before: TacticalState, after: TacticalState, factor: number): TacticalState {
	if (factor <= 1) return after;
	const out = structuredClone(after);
	for (const f of FORMATION_IDS) {
		const d = after.formations[f] - before.formations[f];
		if (d > 0) out.formations[f] = r1(clamp(before.formations[f] + d * factor));
	}
	for (const s of STYLES) {
		const d = after.styles[s] - before.styles[s];
		if (d > 0) out.styles[s] = r1(clamp(before.styles[s] + d * factor));
	}
	return out;
}
