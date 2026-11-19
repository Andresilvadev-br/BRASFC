import type { RoleId } from '#lib/engine/roles.ts';
import type { SquadPlayer } from './squad.ts';
import { learningRate, styleSimilarity, similarity, type TacticalState } from './tactical.ts';
import { FORMATION_IDS, STYLES, type FormationId, type PlayStyle } from './tactics.ts';

/**
 * Centro de Treinamento Tático (Dev 0.3). A semana tem 5 sessões (segunda a sexta).
 * Cada treino melhora uma dimensão do domínio tático e cobra carga física; descanso recupera.
 * Não há atalho: o ganho por semana é limitado e cai conforme o domínio sobe, e treinar
 * pesado antes do jogo deixa o time mais cansado no domingo.
 */
export const DRILLS = [
	'formacao', 'posse', 'pressao', 'defesa', 'contra-ataque', 'movimentacao', 'construcao', 'bolas-paradas', 'entrosamento', 'funcoes', 'adversario', 'descanso'
] as const;
export type DrillId = (typeof DRILLS)[number];
export type Intensity = 'leve' | 'normal' | 'intensa';

export interface DrillDef {
	id: DrillId;
	label: string;
	short: string;
	what: string;
	/** pontos de carga física por sessão (normal) */
	load: number;
	/** estilos reforçados (além do estilo em uso) */
	styles: PlayStyle[];
}

export const DRILL_DEFS: Record<DrillId, DrillDef> = {
	formacao: { id: 'formacao', label: 'Domínio da formação', short: 'Formação', what: 'Posicionamento e distâncias do esquema em uso.', load: 5, styles: [] },
	posse: { id: 'posse', label: 'Posse e circulação', short: 'Posse', what: 'Passe sob pressão e circulação para achar o lado livre.', load: 5, styles: ['posse', 'tiki-taka'] },
	pressao: { id: 'pressao', label: 'Pressão alta', short: 'Pressão', what: 'Gatilhos de pressão e pressão pós-perda.', load: 8, styles: ['pressao', 'tiki-taka'] },
	defesa: { id: 'defesa', label: 'Organização defensiva', short: 'Defesa', what: 'Linha, coberturas e compactação.', load: 5, styles: [] },
	'contra-ataque': { id: 'contra-ataque', label: 'Contra-ataques', short: 'Contra-ataque', what: 'Transição rápida após a recuperação.', load: 7, styles: ['contra-ataque', 'vertical'] },
	movimentacao: { id: 'movimentacao', label: 'Movimentações ofensivas', short: 'Movimentação', what: 'Desmarques, infiltrações e ataques às costas.', load: 6, styles: ['vertical', 'laterais'] },
	construcao: { id: 'construcao', label: 'Construção de jogadas', short: 'Construção', what: 'Saída de bola e jogadas ensaiadas no último terço.', load: 5, styles: ['posse', 'laterais', 'bola-longa'] },
	'bolas-paradas': { id: 'bolas-paradas', label: 'Bolas paradas', short: 'Bola parada', what: 'Escanteios e faltas ensaiados.', load: 3, styles: [] },
	entrosamento: { id: 'entrosamento', label: 'Entrosamento coletivo', short: 'Entrosamento', what: 'Coletivos com os titulares: integra quem chegou agora.', load: 6, styles: [] },
	funcoes: { id: 'funcoes', label: 'Adaptação às funções', short: 'Funções', what: 'Treino específico de cada função na escalação.', load: 5, styles: [] },
	adversario: { id: 'adversario', label: 'Preparação para o adversário', short: 'Adversário', what: 'Estuda o próximo rival com o analista: execução melhor só neste jogo.', load: 4, styles: [] },
	descanso: { id: 'descanso', label: 'Descanso / regenerativo', short: 'Descanso', what: 'Recupera a parte física.', load: 0, styles: [] }
};

export const INTENSITY: Record<Intensity, { label: string; gain: number; load: number }> = {
	leve: { label: 'Leve', gain: 0.6, load: 0.6 },
	normal: { label: 'Normal', gain: 1, load: 1 },
	intensa: { label: 'Intensa', gain: 1.35, load: 1.6 }
};

export interface TrainingPlan {
	/** segunda a sexta */
	sessions: DrillId[];
	intensity: Intensity;
}

export const DEFAULT_PLAN: TrainingPlan = { sessions: ['descanso', 'formacao', 'posse', 'defesa', 'bolas-paradas'], intensity: 'normal' };

export function isDrill(v: unknown): v is DrillId {
	return typeof v === 'string' && (DRILLS as readonly string[]).includes(v);
}

export function sanitizePlan(input: unknown): TrainingPlan {
	if (!input || typeof input !== 'object') return { ...DEFAULT_PLAN, sessions: [...DEFAULT_PLAN.sessions] };
	const raw = input as Partial<TrainingPlan>;
	const sessions = Array.isArray(raw.sessions) && raw.sessions.length === 5 && raw.sessions.every(isDrill) ? [...raw.sessions] : [...DEFAULT_PLAN.sessions];
	const intensity = raw.intensity === 'leve' || raw.intensity === 'intensa' ? raw.intensity : 'normal';
	return { sessions, intensity };
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const gain = (v: number, k: number) => k * Math.pow(1 - v / 100, 1.4);

/** Carga física total da semana (média por atleta) e recuperação líquida prevista. */
export function weekLoad(plan: TrainingPlan) {
	const load = plan.sessions.reduce((s, d) => s + DRILL_DEFS[d].load * INTENSITY[plan.intensity].load, 0);
	const rest = plan.sessions.filter((d) => d === 'descanso').length;
	// Recuperação de uma semana sem treino: ~30 pontos; cada descanso soma 3; carga desconta metade.
	const recovery = 30 + rest * 3 - load * 0.5;
	return { load: r1(load), recovery: r1(recovery), rest };
}

export interface WeekContext {
	formation: FormationId;
	style: PlayStyle;
	lineup: string[];
	roles: RoleId[];
	squad: SquadPlayer[];
	/** Dev 0.5: próximo adversário (treino de preparação) */
	nextOpponent?: string | null;
	/** Dev 0.5: multiplicador do auxiliar técnico sobre o ganho */
	learning?: number;
	/** Dev 0.5: fator do analista de desempenho (1–5) */
	analyst?: number;
}

/**
 * Aplica uma semana de treinos ao domínio tático. Ganho por sessão ~0,4–1,2 ponto,
 * decrescente — uma semana inteira de "formação" não supera ~4 pontos.
 */
export function applyTrainingWeek(prev: TacticalState, plan: TrainingPlan, ctx: WeekContext): TacticalState {
	const st = structuredClone(prev);
	const g = INTENSITY[plan.intensity].gain * (ctx.learning ?? 1);
	// A preparação vale para um adversário: se o próximo rival mudou, a anterior se perde.
	if (st.opponentPrep && st.opponentPrep.opponent !== ctx.nextOpponent) st.opponentPrep = null;
	const byId = new Map(ctx.squad.map((p) => [p.id, p]));
	const teamRate = ctx.lineup.length ? ctx.lineup.reduce((s, id) => s + (byId.has(id) ? learningRate(byId.get(id)!) : 1), 0) / ctx.lineup.length : 1;
	// Repetir o mesmo treino na semana rende menos (fadiga mental).
	const seen = new Map<DrillId, number>();
	for (const d of plan.sessions) {
		const n = seen.get(d) ?? 0;
		seen.set(d, n + 1);
		const k = g * teamRate * (n === 0 ? 1 : n === 1 ? 0.6 : 0.35);
		const def = DRILL_DEFS[d];
		switch (d) {
			case 'formacao':
				for (const f of FORMATION_IDS) {
					const sim = similarity(f, ctx.formation);
					if (sim >= 0.5) st.formations[f] = r1(clamp(st.formations[f] + gain(st.formations[f], 1.2 * k) * (f === ctx.formation ? 1 : sim * 0.4)));
				}
				break;
			case 'defesa':
				st.formations[ctx.formation] = r1(clamp(st.formations[ctx.formation] + gain(st.formations[ctx.formation], 0.5 * k)));
				st.instructions = r1(clamp(st.instructions + gain(st.instructions, 0.8 * k)));
				break;
			case 'bolas-paradas':
				st.setPieces = r1(clamp(st.setPieces + gain(st.setPieces, 2.4 * k)));
				break;
			case 'entrosamento':
				for (const id of ctx.lineup) st.integration[id] = r1(clamp((st.integration[id] ?? 15) + gain(st.integration[id] ?? 15, 1.6 * k)));
				break;
			case 'funcoes':
				ctx.lineup.forEach((id, i) => {
					const roles = (st.roles[id] ??= {});
					const v = roles[ctx.roles[i]] ?? 20;
					roles[ctx.roles[i]] = r1(clamp(v + gain(v, 2 * k * (byId.has(id) ? learningRate(byId.get(id)!) : 1))));
				});
				break;
			case 'adversario':
				if (ctx.nextOpponent) {
					const cur = st.opponentPrep?.opponent === ctx.nextOpponent ? st.opponentPrep.bonus : 0;
					st.opponentPrep = { opponent: ctx.nextOpponent, bonus: r1(Math.min(6, cur + 1.2 * k * (ctx.analyst ?? 2))) };
				}
				break;
			case 'descanso':
				break;
			default: {
				// treinos de estilo: reforçam o estilo em uso se ele for parecido com o treino
				const targets = new Set<PlayStyle>([...def.styles]);
				for (const s of STYLES) {
					const rel = targets.has(s) ? 1 : 0;
					const inUse = s === ctx.style ? Math.max(rel, ...def.styles.map((x) => styleSimilarity(x, s))) : rel * 0.5;
					if (inUse > 0.2) st.styles[s] = r1(clamp(st.styles[s] + gain(st.styles[s], 1.2 * k) * inUse));
				}
				st.instructions = r1(clamp(st.instructions + gain(st.instructions, 0.4 * k)));
			}
		}
	}
	return st;
}

/** Condição física após uma semana (pós-jogo → véspera do próximo jogo). */
export function recoverFitness(fitness: Record<string, number>, squad: SquadPlayer[], plan: TrainingPlan): Record<string, number> {
	const { recovery } = weekLoad(plan);
	const out: Record<string, number> = {};
	for (const p of squad) {
		const cur = fitness[p.id] ?? 95;
		// Resistência alta recupera um pouco mais rápido.
		const r = recovery * (0.85 + p.attributes.resistencia / 330);
		out[p.id] = r1(clamp(cur + r, 30, 100));
	}
	return out;
}

/** Previsão aproximada dos efeitos da semana, para a interface. */
export function previewWeek(st: TacticalState, plan: TrainingPlan, ctx: WeekContext) {
	const after = applyTrainingWeek(st, plan, ctx);
	const { load, recovery } = weekLoad(plan);
	return {
		formation: r1(after.formations[ctx.formation] - st.formations[ctx.formation]),
		style: r1(after.styles[ctx.style] - st.styles[ctx.style]),
		instructions: r1(after.instructions - st.instructions),
		setPieces: r1(after.setPieces - st.setPieces),
		cohesion: r1(ctx.lineup.reduce((s, id) => s + (after.integration[id] ?? 0) - (st.integration[id] ?? 0), 0) / Math.max(1, ctx.lineup.length)),
		load,
		recovery
	};
}

/** Sugestão de semana a partir do momento do time (explicável). */
export function suggestPlan(st: TacticalState, ctx: WeekContext, avgCondition: number): { plan: TrainingPlan; reasons: string[] } {
	const reasons: string[] = [];
	const sessions: DrillId[] = ['descanso'];
	const cohesion = ctx.lineup.reduce((s, id) => s + (st.integration[id] ?? 15), 0) / Math.max(1, ctx.lineup.length);
	const ranked: Array<[DrillId, number, string]> = [
		['formacao', 100 - st.formations[ctx.formation], `domínio da formação ${ctx.formation} em ${Math.round(st.formations[ctx.formation])}`],
		['entrosamento', 100 - cohesion, `entrosamento dos titulares em ${Math.round(cohesion)}`],
		['funcoes', 100 - ctx.lineup.reduce((s, id, i) => s + (st.roles[id]?.[ctx.roles[i]] ?? 20), 0) / Math.max(1, ctx.lineup.length), 'funções ainda pouco treinadas'],
		[styleDrill(ctx.style), 100 - st.styles[ctx.style], `estilo em ${Math.round(st.styles[ctx.style])}`],
		['bolas-paradas', 70 - st.setPieces, `bolas paradas em ${Math.round(st.setPieces)}`]
	];
	ranked.sort((a, b) => b[1] - a[1]);
	for (const [d, , why] of ranked.slice(0, 3)) {
		sessions.push(d);
		reasons.push(`${DRILL_DEFS[d].label}: ${why}.`);
	}
	const tired = avgCondition < 75;
	if (tired) {
		sessions.push('descanso');
		reasons.push(`Condição média em ${Math.round(avgCondition)}%: um descanso extra antes do jogo.`);
	} else if (ctx.nextOpponent && (ctx.analyst ?? 0) >= 3) {
		sessions.push('adversario');
		reasons.push('O analista tem material do próximo adversário: uma sessão de preparação específica.');
	} else sessions.push('defesa');
	return { plan: { sessions, intensity: tired ? 'leve' : 'normal' }, reasons };
}

function styleDrill(s: PlayStyle): DrillId {
	return s === 'pressao' ? 'pressao' : s === 'contra-ataque' ? 'contra-ataque' : s === 'vertical' || s === 'laterais' ? 'movimentacao' : s === 'bola-longa' ? 'construcao' : 'posse';
}
