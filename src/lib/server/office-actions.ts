import type { Career } from '#lib/domain/career.ts';
import { isYouthPlan } from '#lib/domain/academy.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { divisionOf, effectiveRule, type LeagueState } from '#lib/domain/league.ts';
import { fireStaff, hireStaff, ManagementError, payroll, setYouthPlan, type ClubState, type LedgerLine } from '#lib/domain/management.ts';
import { formatMoney, rosterOf, tierOfDivision } from '#lib/domain/market.ts';
import { resolveMeeting, resolvePress, type BoardSnapshot, type OfficeState } from '#lib/domain/office.ts';
import { STAFF_ROLES, type StaffRole } from '#lib/domain/staff.ts';
import { officeOf } from './universe.ts';
import { applyBudgetGrant, budgetCooldown, BUDGET_KIND_LABEL, evaluateBudget, isBudgetPercent, isJustification, OUTCOME_LABEL, type BudgetContext, type BudgetKind, type BudgetVerdict, type JustificationId } from '#lib/domain/board-talks.ts';
import { rosterContext } from '#lib/domain/world.ts';

export const OFFICE_ACTIONS = new Set(['reuniao', 'coletiva', 'comissao-contratar', 'comissao-dispensar', 'treino-delegar', 'base-plano', 'renovacao-auto', 'verba-solicitar', 'verba-contraproposta']);

export interface OfficeActionResult {
	club: ClubState;
	office: OfficeState;
	ledger: LedgerLine[];
	message: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Ações do gabinete (Dev 0.5), sempre validadas no servidor. */
export function applyOfficeAction(career: Career, league: LeagueState, club: ClubState, round: number, points: number, position: number | null, body: Record<string, unknown>): OfficeActionResult {
	const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '');
	const office = structuredClone(officeOf(career, club, league));
	const st = structuredClone(club);
	const tier = tierOfDivision(divisionOf(league, career.clubId));
	const out = (message: string, ledger: LedgerLine[] = []): OfficeActionResult => ({ club: st, office, ledger, message });
	switch (body.action) {
		case 'reuniao': {
			const m = office.meeting;
			if (!m || m.id !== str('meetingId')) throw new ManagementError('Esta reunião não está mais pendente.');
			const snap: BoardSnapshot = { profile: st.board.profile, confidence: st.board.confidence, round, season: career.season, totalRounds: 38, points, position, objectiveLabel: st.board.objectives[0]?.label ?? null, contractEnding: office.contract.until <= career.season };
			let eff;
			try {
				eff = resolveMeeting(m, str('choice'), snap, { reputation: st.coachReputation, tier, season: career.season, transferBudget: st.transferBudget });
			} catch (e) {
				throw new ManagementError(e instanceof Error ? e.message : 'Opção inválida.');
			}
			st.board.confidence = clamp(st.board.confidence + eff.confidence, 0, 100);
			if (eff.transferBudgetPct) st.transferBudget = Math.max(0, Math.round(st.transferBudget * (1 + eff.transferBudgetPct / 100)));
			if (eff.baseInvestment) st.board.notes = [...st.board.notes, `base-investida-${career.season}`].slice(-10);
			if (eff.contract) {
				office.contract = eff.contract;
				office.renewalDeclinedSeason = undefined;
			}
			if (eff.leaving) {
				office.contract = { ...office.contract, until: career.season };
				office.renewalDeclinedSeason = career.season;
				office.autoRenewal = false;
			}
			if (eff.ultimatum !== undefined) office.ultimatum = eff.ultimatum;
			if (eff.objectiveShift && st.board.objectives[0]) {
				const o = st.board.objectives[0];
				if (o.kind === 'liga-posicao' || o.kind === 'permanencia') {
					o.target = Math.max(1, o.target + eff.objectiveShift);
					o.label = o.kind === 'liga-posicao' ? `Terminar no máximo em ${o.target}º` : o.label;
				}
			}
			if (st.board.confidence <= 0) {
				st.board.dismissed = true;
				st.board.confidence = 0;
			}
			office.decisions.push({ season: career.season, round, kind: m.kind, choice: str('choice'), effect: eff.effect });
			office.meeting = null;
			return out(eff.effect);
		}
		case 'coletiva': {
			const pc = office.press;
			if (!pc || pc.id !== str('pressId')) throw new ManagementError('Esta coletiva já aconteceu.');
			const answers = body.answers && typeof body.answers === 'object' ? (body.answers as Record<string, string>) : {};
			let eff;
			try {
				eff = resolvePress(pc, answers, st.board.profile);
			} catch (e) {
				throw new ManagementError(e instanceof Error ? e.message : 'Respostas inválidas.');
			}
			st.fanMood = clamp(st.fanMood + eff.fanMood, 0, 100);
			st.board.confidence = clamp(st.board.confidence + eff.confidence, 0, 100);
			st.coachReputation = clamp(st.coachReputation + eff.reputation, 1, 100);
			office.decisions.push({ season: career.season, round, kind: 'coletiva', choice: pc.topic, effect: eff.summary });
			office.press = null;
			return out(`Coletiva encerrada — ${eff.summary}.`);
		}
		case 'comissao-contratar': {
			const role = str('role') as StaffRole;
			if (!(STAFF_ROLES as readonly string[]).includes(role)) throw new ManagementError('Cargo inválido.');
			const r = hireStaff(st, career.seed, career.season, round, tier, role, str('candidateId'));
			return { club: r.state, office, ledger: r.ledger, message: r.message };
		}
		case 'comissao-dispensar': {
			const role = str('role') as StaffRole;
			if (!(STAFF_ROLES as readonly string[]).includes(role)) throw new ManagementError('Cargo inválido.');
			const r = fireStaff(st, career.season, round, role);
			return { club: r.state, office, ledger: r.ledger, message: r.message };
		}
		case 'verba-solicitar': {
			const kind = str('kind');
			if (kind !== 'transferencias' && kind !== 'folha' && kind !== 'redistribuir') throw new ManagementError('Escolha entre orçamento de transferências, limite da folha salarial ou redistribuição.');
			const percent = Number(body.percent);
			if (!isBudgetPercent(percent)) throw new ManagementError('O aumento solicitado deve ser de 10%, 20% ou 30%.');
			const justification = isJustification(body.justification) ? body.justification : 'carencias';
			if (kind === 'redistribuir' && st.transferBudget <= 0) throw new ManagementError('Não há verba de transferências para redistribuir.');
			if ((kind === 'folha' ? st.wageBudget : st.transferBudget) <= 0) throw new ManagementError('Aguarde a definição do orçamento inicial da temporada antes de pedir o aumento.');
			const talks = office.budgetTalks ?? [];
			const wait = budgetCooldown(talks, kind, career.season, round);
			if (wait) throw new ManagementError(wait);
			if (office.budgetBaseline?.season !== career.season) office.budgetBaseline = { season: career.season, transferBudget: st.transferBudget, wageBudget: st.wageBudget };
			const verdict = evaluateBudget(budgetContext(career, league, st, office, round, position), { kind, percent, justification });
			return out(recordTalk(career, st, office, round, { kind, percent, justification }, verdict));
		}
		case 'verba-contraproposta': {
			const c = office.budgetCounter;
			if (!c || c.season !== career.season || round > c.expiresRound) {
				office.budgetCounter = null;
				throw new ManagementError('A contraproposta da diretoria não está mais disponível.');
			}
			office.budgetCounter = null;
			if (body.accept !== true) {
				const before = { transferBudget: st.transferBudget, wageBudget: st.wageBudget };
				office.budgetTalks = [...(office.budgetTalks ?? []), { season: career.season, round, kind: c.kind, percent: c.percent, justification: c.justification, outcome: 'recusado' as const, granted: 0, before, after: before, reasons: ['você recusou a contraproposta'], message: 'Você recusou a contraproposta. Os orçamentos continuam como estavam.' }].slice(-40);
				office.decisions.push({ season: career.season, round, kind: `pedido-verba:${c.kind}`, choice: 'contraproposta-recusada', effect: 'Contraproposta recusada pelo treinador.' });
				return out('Você recusou a contraproposta. Os orçamentos continuam como estavam.');
			}
			const before = { transferBudget: st.transferBudget, wageBudget: st.wageBudget };
			const after = applyBudgetGrant(before, c.kind, c.percent);
			st.transferBudget = after.transferBudget;
			st.wageBudget = after.wageBudget;
			const message = `Acordo fechado: +${c.percent}% (${BUDGET_KIND_LABEL[c.kind].toLowerCase()}). ${describeChange(before, after)} O caixa não foi alterado.`;
			office.budgetTalks = [...(office.budgetTalks ?? []), { season: career.season, round, kind: c.kind, percent: c.percent, justification: c.justification, outcome: 'aprovado' as const, granted: c.percent, before, after, reasons: ['contraproposta aceita'], message }].slice(-40);
			office.decisions.push({ season: career.season, round, kind: `pedido-verba:${c.kind}`, choice: 'aprovado', effect: message });
			return out(message);
		}
		case 'renovacao-auto': {
			office.autoRenewal = body.on === true;
			return out(office.autoRenewal
				? 'Renovação automática ativada. O vínculo será renovado somente se a diretoria concordar e você não tiver recusado a renovação.'
				: 'Renovação automática desativada. Você decidirá manualmente sobre as próximas propostas.');
		}
		case 'treino-delegar':
			office.delegated = body.on === true;
			return out(office.delegated ? 'O auxiliar técnico vai planejar os treinos de cada semana.' : 'Você voltou a planejar os treinos.');
		case 'base-plano': {
			const plan = str('plan');
			if (!isYouthPlan(plan)) throw new ManagementError('Plano inválido.');
			return { club: setYouthPlan(st, str('youthId'), plan), office, ledger: [], message: 'Plano de desenvolvimento atualizado.' };
		}
	}
	throw new ManagementError('Ação desconhecida.');
}

export const clubName = (id: string) => getClub(id)?.name ?? id;

/** Contexto real da reunião de orçamento (tudo do estado salvo do clube). */
export function budgetContext(career: Career, league: LeagueState, st: ClubState, office: OfficeState, round: number, position: number | null): BudgetContext {
	const division = divisionOf(league, career.clubId);
	const size = division ? ((league.divisions as Record<string, string[]>)[division]?.length ?? 0) : 0;
	const rule = division && division !== 'liga-brasfc' ? effectiveRule(league, division as 'serie-a') : { promoted: 0, relegated: 0 };
	const recent = st.months.slice(-3);
	const avg = (k: 'income' | 'expense') => (recent.length ? recent.reduce((s, m) => s + m[k], 0) / recent.length : 0);
	return {
		season: career.season,
		round,
		totalRounds: Math.max(1, (size - 1) * 2),
		balance: st.balance,
		transferBudget: st.transferBudget,
		wageBudget: st.wageBudget,
		wageBill: payroll(rosterOf(rosterContext(career, league), career.clubId)),
		monthlyIncome: avg('income'),
		monthlyExpense: avg('expense'),
		confidence: st.board.confidence,
		reputation: st.coachReputation,
		profile: st.board.profile,
		objective: st.board.objectives[0] ?? null,
		position,
		size,
		promotion: rule.promoted,
		relegation: rule.relegated,
		history: office.budgetTalks ?? [],
		baseline: office.budgetBaseline ?? { transferBudget: st.transferBudget, wageBudget: st.wageBudget }
	};
}

function describeChange(before: { transferBudget: number; wageBudget: number }, after: { transferBudget: number; wageBudget: number }): string {
	const parts: string[] = [];
	if (after.transferBudget !== before.transferBudget) parts.push(`Transferências: ${formatMoney(before.transferBudget)} → ${formatMoney(after.transferBudget)}.`);
	if (after.wageBudget !== before.wageBudget) parts.push(`Teto da folha: ${formatMoney(before.wageBudget)} → ${formatMoney(after.wageBudget)} por mês.`);
	return parts.join(' ');
}

function recordTalk(career: Career, st: ClubState, office: OfficeState, round: number, req: { kind: BudgetKind; percent: number; justification: JustificationId }, v: BudgetVerdict): string {
	const before = { transferBudget: st.transferBudget, wageBudget: st.wageBudget };
	const after = applyBudgetGrant(before, req.kind, v.granted);
	st.transferBudget = after.transferBudget;
	st.wageBudget = after.wageBudget;
	st.board.confidence = clamp(st.board.confidence + v.confidenceDelta, 0, 100);
	const label = BUDGET_KIND_LABEL[req.kind].toLowerCase();
	const why = v.reasons.length ? ` Pesou na análise: ${v.reasons.slice(0, 4).join('; ')}.` : '';
	let message: string;
	if (v.outcome === 'aprovado' || v.outcome === 'parcial') message = `${OUTCOME_LABEL[v.outcome]}: +${v.granted}% em ${label}. ${describeChange(before, after)} O caixa não foi alterado.${why}`;
	else if (v.outcome === 'contraproposta') {
		message = `A diretoria não aceita +${req.percent}%, mas oferece +${v.counter}% em ${label}. Responda até a rodada ${round + 3}.${why}`;
		office.budgetCounter = { season: career.season, round, kind: req.kind, percent: v.counter ?? 5, justification: req.justification, expiresRound: round + 3 };
	} else if (v.outcome === 'aguardar') message = `A diretoria quer ver resultados antes de discutir ${label} de novo (12 rodadas).${why}`;
	else message = `Diretoria recusou +${req.percent}% em ${label}.${why}`;
	if (v.confidenceDelta) message += ` Confiança ${v.confidenceDelta > 0 ? '+' : ''}${v.confidenceDelta}.`;
	office.budgetTalks = [...(office.budgetTalks ?? []), { season: career.season, round, kind: req.kind, percent: req.percent, justification: req.justification, outcome: v.outcome, granted: v.granted, before, after, reasons: v.reasons, message }].slice(-40);
	const choice = v.outcome === 'aprovado' || v.outcome === 'parcial' ? 'aprovado' : v.outcome === 'contraproposta' ? 'contraproposta' : 'recusado';
	office.decisions.push({ season: career.season, round, kind: `pedido-verba:${req.kind}`, choice, effect: message });
	office.decisions = office.decisions.slice(-200);
	return message;
}
