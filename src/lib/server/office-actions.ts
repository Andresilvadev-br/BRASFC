import type { Career } from '#lib/domain/career.ts';
import { isYouthPlan } from '#lib/domain/academy.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { divisionOf, type LeagueState } from '#lib/domain/league.ts';
import { fireStaff, hireStaff, ManagementError, setYouthPlan, type ClubState, type LedgerLine } from '#lib/domain/management.ts';
import { tierOfDivision } from '#lib/domain/market.ts';
import { resolveMeeting, resolvePress, type BoardSnapshot, type OfficeState } from '#lib/domain/office.ts';
import { STAFF_ROLES, type StaffRole } from '#lib/domain/staff.ts';
import { officeOf } from './universe.ts';

export const OFFICE_ACTIONS = new Set(['reuniao', 'coletiva', 'comissao-contratar', 'comissao-dispensar', 'treino-delegar', 'base-plano']);

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
			if (eff.contract) office.contract = eff.contract;
			if (eff.leaving) office.contract = { ...office.contract, until: career.season };
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
