import type { BoardProfile, Objective } from './club.ts';
import { roundMoney } from './market.ts';

/**
 * Reuniões de orçamento com a diretoria (Carreira de Treinador 2.0).
 *
 * O treinador pede mais verba de transferências, um teto de folha maior ou uma redistribuição
 * entre os dois, com uma justificativa. A diretoria analisa caixa, receitas × despesas, dívida,
 * resultados, objetivo, confiança, reputação, pedidos anteriores e o próprio perfil. Ela pode
 * aprovar, aprovar em parte, fazer contraproposta, recusar ou pedir resultados antes de voltar ao tema.
 *
 * Regras que impedem exploração: no máximo 3 pedidos por tipo na temporada, 8 rodadas entre pedidos
 * do mesmo tipo (12 após "aguarde resultados"), aumento total limitado a +50% do orçamento de início
 * da temporada e desgaste de confiança para pedidos insistentes. Teto de folha NUNCA cria dinheiro.
 */
export type BudgetKind = 'transferencias' | 'folha' | 'redistribuir';
export const BUDGET_KIND_LABEL: Record<BudgetKind, string> = {
	transferencias: 'Orçamento de transferências',
	folha: 'Teto mensal da folha salarial',
	redistribuir: 'Redistribuir verba de transferências para a folha'
};

export const JUSTIFICATIONS = {
	titulo: 'Precisamos de reforços para disputar o título.',
	carencias: 'Nosso elenco tem carências importantes.',
	manter: 'Precisamos aumentar a folha para manter nossos principais atletas.',
	acesso: 'Estamos perto de conquistar o acesso.',
	permanencia: 'Precisamos de reforços para fugir do rebaixamento.'
} as const;
export type JustificationId = keyof typeof JUSTIFICATIONS;
export const isJustification = (v: unknown): v is JustificationId => typeof v === 'string' && v in JUSTIFICATIONS;

export type BudgetOutcome = 'aprovado' | 'parcial' | 'contraproposta' | 'recusado' | 'aguardar';
export const OUTCOME_LABEL: Record<BudgetOutcome, string> = {
	aprovado: 'Aprovado integralmente',
	parcial: 'Aprovado parcialmente',
	contraproposta: 'Contraproposta da diretoria',
	recusado: 'Recusado',
	aguardar: 'Diretoria pede resultados antes'
};

export interface BudgetTalk {
	season: number;
	round: number;
	kind: BudgetKind;
	percent: number;
	justification: JustificationId;
	outcome: BudgetOutcome;
	/** percentual efetivamente concedido (0 se nada mudou) */
	granted: number;
	before: { transferBudget: number; wageBudget: number };
	after: { transferBudget: number; wageBudget: number };
	reasons: string[];
	message: string;
}

export interface BudgetCounter {
	season: number;
	round: number;
	kind: BudgetKind;
	percent: number;
	justification: JustificationId;
	/** responde até esta rodada */
	expiresRound: number;
}

export interface BudgetContext {
	season: number;
	round: number;
	totalRounds: number;
	balance: number;
	transferBudget: number;
	wageBudget: number;
	/** folha mensal atual */
	wageBill: number;
	/** médias mensais recentes (receita e despesa) */
	monthlyIncome: number;
	monthlyExpense: number;
	confidence: number;
	reputation: number;
	profile: BoardProfile;
	objective: Objective | null;
	position: number | null;
	size: number;
	promotion: number;
	relegation: number;
	/** pedidos desta temporada (todas as categorias) */
	history: BudgetTalk[];
	/** orçamentos do início da temporada (limite de +50%) */
	baseline: { transferBudget: number; wageBudget: number };
}

export interface BudgetVerdict {
	outcome: BudgetOutcome;
	granted: number;
	counter: number | null;
	confidenceDelta: number;
	reasons: string[];
}

const PCT = [10, 20, 30] as const;
export const isBudgetPercent = (v: unknown): v is 10 | 20 | 30 => PCT.includes(v as 10);

/** Pedidos do mesmo tipo: limite por temporada e intervalo mínimo (em rodadas). */
export function budgetCooldown(history: BudgetTalk[], kind: BudgetKind, season: number, round: number): string | null {
	const same = history.filter((h) => h.season === season && h.kind === kind);
	if (same.length >= 3) return 'A diretoria já discutiu este tema três vezes nesta temporada. Volte a pedir na próxima.';
	const last = same.at(-1);
	if (!last) return null;
	const wait = last.outcome === 'aguardar' ? 12 : 8;
	if (round - last.round < wait) return `A diretoria precisa avaliar os resultados antes de receber outro pedido deste tipo (intervalo de ${wait} rodadas; faltam ${wait - (round - last.round)}).`;
	return null;
}

/** Análise da diretoria (determinística: o mesmo pedido no mesmo contexto tem a mesma resposta). */
export function evaluateBudget(ctx: BudgetContext, req: { kind: BudgetKind; percent: 10 | 20 | 30; justification: JustificationId }): BudgetVerdict {
	const reasons: string[] = [];
	let score = (ctx.confidence - 50) * 0.8;
	if (ctx.confidence >= 70) reasons.push('confiança alta no seu trabalho');
	else if (ctx.confidence < 45) reasons.push('confiança da diretoria baixa');
	// Resultados × objetivo
	const share = ctx.position && ctx.size > 1 ? (ctx.position - 1) / (ctx.size - 1) : 0.5;
	const objectiveOk = !ctx.objective || ctx.position === null ? null
		: ctx.objective.kind === 'permanencia' ? ctx.position <= ctx.size - ctx.relegation
		: ctx.objective.kind === 'acesso' ? ctx.position <= ctx.objective.target + 1
		: ctx.objective.kind === 'liga-posicao' ? ctx.position <= ctx.objective.target : null;
	if (objectiveOk === true) { score += 10; reasons.push('campanha dentro do objetivo'); }
	else if (objectiveOk === false) { score -= 10; reasons.push('campanha abaixo do objetivo'); }
	// Justificativa coerente com a realidade
	const j = req.justification;
	const contenders = ctx.position !== null && ctx.position <= Math.max(3, Math.ceil(ctx.size * 0.15));
	const nearPromotion = ctx.promotion > 0 && ctx.position !== null && ctx.position <= ctx.promotion + 2;
	const danger = ctx.relegation > 0 && ctx.position !== null && ctx.position > ctx.size - ctx.relegation - 3;
	if (j === 'titulo') { if (contenders) { score += 8; reasons.push('o time briga pelo título'); } else { score -= 14; reasons.push('a tabela não sustenta o discurso de título'); } }
	if (j === 'acesso') { if (nearPromotion) { score += 8; reasons.push('o acesso está ao alcance'); } else { score -= 14; reasons.push('o acesso ainda está distante'); } }
	if (j === 'permanencia') { if (danger) { score += 6; reasons.push('risco real de rebaixamento'); } else { score -= 8; reasons.push('o time não corre risco de queda'); } }
	if (j === 'manter') { if (req.kind !== 'transferencias') score += 4; else { score -= 6; reasons.push('a justificativa fala de salários, não de contratações'); } }
	// Finanças: caixa, resultado mensal e dívida
	const monthly = ctx.monthlyIncome - ctx.monthlyExpense;
	const base = req.kind === 'folha' ? ctx.wageBudget : ctx.transferBudget;
	const increase = roundMoney(base * req.percent / 100);
	if (ctx.balance < 0) { score -= 25; reasons.push('o clube está endividado'); }
	else if (req.kind === 'transferencias' && ctx.balance < ctx.transferBudget + increase) { score -= 18; reasons.push('o caixa não cobre o orçamento ampliado'); }
	else if (req.kind === 'folha' && ctx.balance < increase * 6) { score -= 15; reasons.push('o caixa não sustenta seis meses de folha maior'); }
	else if (ctx.balance > (ctx.transferBudget + increase) * 2) { score += 5; reasons.push('caixa confortável'); }
	if (monthly < 0) { score -= 8; reasons.push('despesas mensais acima das receitas'); }
	else if (monthly > 0 && monthly * 6 > increase) score += 4;
	if (req.kind === 'folha' && ctx.wageBill > 0 && ctx.wageBill < ctx.wageBudget * 0.8) { score -= 8; reasons.push('a folha atual ainda tem folga dentro do teto'); }
	// Reputação, perfil e insistência
	score += (ctx.reputation - 50) / 5;
	const prof: Record<BoardProfile, number> = { ambiciosa: 8, imediatista: contenders ? 6 : -4, conservadora: -5, rigida: -12, formadora: req.kind === 'transferencias' ? -6 : 0, projeto: 0 };
	score += prof[ctx.profile];
	if (prof[ctx.profile] >= 6) reasons.push('perfil de diretoria disposto a investir');
	if (prof[ctx.profile] <= -8) reasons.push('diretoria financeiramente rígida');
	if (req.kind === 'redistribuir') { score += 12; reasons.push('não exige dinheiro novo'); }
	score -= req.percent === 30 ? 16 : req.percent === 20 ? 8 : 0;
	const seasonRequests = ctx.history.filter((h) => h.season === ctx.season).length;
	if (seasonRequests >= 2) { score -= 6 * (seasonRequests - 1); reasons.push('pedidos frequentes nesta temporada'); }
	// Limite de +50% sobre o orçamento do início da temporada
	if (req.kind !== 'redistribuir') {
		const baseline = req.kind === 'folha' ? ctx.baseline.wageBudget : ctx.baseline.transferBudget;
		const room = baseline > 0 ? Math.floor(((baseline * 1.5 - base) / base) * 100) : 0;
		if (room < 5) return { outcome: 'recusado', granted: 0, counter: null, confidenceDelta: -1, reasons: ['o orçamento já foi ampliado ao máximo nesta temporada'] };
		if (room < req.percent) { score -= 6; reasons.push(`margem de aumento limitada a ${room}%`); }
	}
	const poor = objectiveOk === false || share > 0.6;
	const cap = (pct: number) => {
		if (req.kind === 'redistribuir') return pct;
		const baseline = req.kind === 'folha' ? ctx.baseline.wageBudget : ctx.baseline.transferBudget;
		const room = baseline > 0 ? Math.floor(((baseline * 1.5 - base) / base) * 100) : 0;
		return Math.max(0, Math.min(pct, room));
	};
	if (score >= 18) return { outcome: 'aprovado', granted: cap(req.percent), counter: null, confidenceDelta: 0, reasons };
	if (score >= 8) return { outcome: 'parcial', granted: cap(Math.max(5, Math.round(req.percent / 2 / 5) * 5)), counter: null, confidenceDelta: 0, reasons };
	if (score >= 0) return { outcome: 'contraproposta', granted: 0, counter: cap(req.percent === 10 ? 5 : 10), confidenceDelta: 0, reasons };
	if (score < -15 && poor) return { outcome: 'aguardar', granted: 0, counter: null, confidenceDelta: req.percent >= 20 ? -3 : -2, reasons };
	return { outcome: 'recusado', granted: 0, counter: null, confidenceDelta: req.percent >= 20 ? -2 : -1, reasons };
}

/** Aplica o percentual concedido. Teto de folha e transferências mudam; o CAIXA nunca muda. */
export function applyBudgetGrant(o: { transferBudget: number; wageBudget: number }, kind: BudgetKind, percent: number): { transferBudget: number; wageBudget: number } {
	if (percent <= 0) return { ...o };
	if (kind === 'transferencias') return { ...o, transferBudget: o.transferBudget + Math.max(1, roundMoney(o.transferBudget * percent / 100)) };
	if (kind === 'folha') return { ...o, wageBudget: o.wageBudget + Math.max(1, roundMoney(o.wageBudget * percent / 100)) };
	// Redistribuir: parte da verba de contratações paga 12 meses de folha maior.
	const moved = roundMoney(o.transferBudget * percent / 100);
	return { transferBudget: o.transferBudget - moved, wageBudget: o.wageBudget + roundMoney(moved / 12) };
}
