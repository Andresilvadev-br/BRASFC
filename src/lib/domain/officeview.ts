import { COACH_PROFILES } from '#lib/engine/ai-coach.ts';
import type { Career } from './career.ts';
import { getClub } from './clubs.ts';
import { DRILL_DEFS } from './drills.ts';
import type { ManageView } from './manageview.ts';
import { sanitizeOffice, type OfficeState } from './office.ts';
import { competenceOf, staffCandidates, staffEffects, STAFF_INFO, STAFF_ROLES, type StaffRole } from './staff.ts';
import { coachOf, sanitizeUniverse, type UniverseState } from './universe.ts';
import type { CareerView } from './view.ts';

export interface StaffAdvice {
	id: string;
	role: StaffRole;
	title: string;
	text: string;
	href?: string;
}

/**
 * Visão do gabinete e da comissão (navegador e servidor calculam igual).
 * As recomendações só aparecem quando os dados justificam — nada é sorteado.
 */
export function officeView(career: Career, view: CareerView, manage: ManageView) {
	const universe: UniverseState | null = sanitizeUniverse(career.data.universe);
	const office: OfficeState = sanitizeOffice(career.data.office, career.season, manage.tier, manage.club.coachReputation);
	const staff = manage.club.staff ?? {};
	const fx = staffEffects(staff);
	const half: 1 | 2 = view.nextRound <= 19 ? 1 : 2;
	const base = `/carreira/${career.id}`;
	const advice: StaffAdvice[] = [];
	const lineup = view.tactic.lineup;
	const cond = (id: string) => view.fitness[id] ?? 95;
	const avgLineup = lineup.reduce((s, id) => s + cond(id), 0) / Math.max(1, lineup.length);
	const tired = view.squad.filter((p) => cond(p.id) < 65);
	if (view.trainingPlan.intensity === 'intensa' && avgLineup < 82)
		advice.push({ id: `prep-int-${Math.round(avgLineup)}`, role: 'preparador', title: 'Reduzir a carga desta semana', text: `Os titulares estão com ${Math.round(avgLineup)}% de condição média e o plano está em intensidade alta. Treinar forte agora aumenta o desgaste no domingo.`, href: `${base}/treinos` });
	if (tired.length >= 3)
		advice.push({ id: `fisio-${tired.length}`, role: 'fisio', title: `${tired.length} atletas abaixo de 65%`, text: `${tired.slice(0, 3).map((p) => p.shortName).join(', ')}${tired.length > 3 ? ' e outros' : ''} precisam de recuperação. Um descanso a mais na semana ajuda.`, href: `${base}/treinos` });
	const opp = view.upcoming ? (view.upcoming.home === career.clubId ? view.upcoming.away : view.upcoming.home) : null;
	const oppCoach = opp ? coachOf(universe, opp) : null;
	const oppMind = opp ? universe?.clubs[opp] : null;
	if (opp && oppCoach && oppMind && !view.trainingPlan.sessions.includes('adversario'))
		advice.push({ id: `analista-${opp}-${view.nextRound}`, role: 'analista', title: `Relatório do ${getClub(opp)?.name ?? opp}`, text: `${oppCoach.name} usa o ${oppMind.formation} (${COACH_PROFILES[oppCoach.style].label.toLowerCase()}), domínio de ${Math.round(oppMind.mastery[oppMind.formation] ?? 50)}. Uma sessão de “${DRILL_DEFS.adversario.label.toLowerCase()}” melhora a execução contra ele.`, href: `${base}/treinos` });
	const fDom = view.tactical.formations[view.tactic.formation] ?? 20;
	if (fDom < 55)
		advice.push({ id: `aux-dom-${view.tactic.formation}-${Math.floor(fDom / 5)}`, role: 'auxiliar', title: `O ${view.tactic.formation} ainda não está assimilado`, text: `Domínio em ${Math.round(fDom)}. Manter o sistema e treinar a formação acelera; trocar de esquema agora atrasa.`, href: `${base}/taticas` });
	const avgOverall = manage.roster.slice().sort((a, b) => b.overall - a.overall).slice(0, 16).reduce((s, p) => s + p.overall, 0) / 16;
	const ready = manage.club.academy.filter((y) => y.overall >= avgOverall - 6);
	if (ready.length) advice.push({ id: `base-pronto-${ready.map((y) => y.id).join('-')}`, role: 'coordBase', title: `${ready[0].shortName} está perto do nível do elenco`, text: `${ready.length === 1 ? 'Ele já' : `${ready.length} jovens já`} podem ganhar minutos no profissional. Subir agora evita estagnação.`, href: `${base}/base` });
	const stalled = manage.club.academy.filter((y) => (y.stalled ?? 0) >= 8 && y.overall < y.potential);
	if (stalled.length) advice.push({ id: `base-estagna-${stalled.length}`, role: 'coordBase', title: `${stalled.length} jovem(ns) sem evoluir há 2 meses`, text: 'Mudar o plano de desenvolvimento ou promover ao profissional pode destravar a evolução.', href: `${base}/base` });
	const strong = manage.club.reports.filter((r) => r.verdict === 'recomendado' && !manage.market.shortlist.includes(r.playerId));
	if (strong.length) advice.push({ id: `obs-${strong.length}`, role: 'chefeObs', title: `${strong.length} recomendação(ões) dos olheiros sem acompanhamento`, text: 'Coloque os nomes na lista de observação para acompanhar valor e contrato.', href: `${base}/base` });
	const gk = view.squad.find((p) => p.position === 'GOL' && lineup.includes(p.id));
	if (gk && gk.age >= 33) advice.push({ id: `gk-idade-${gk.id}`, role: 'goleiros', title: `${gk.shortName} tem ${gk.age} anos`, text: 'Vale preparar um sucessor: o declínio físico dos goleiros começa por volta dos 34.', href: `${base}/mercado` });
	const vacant = STAFF_ROLES.filter((r) => !staff[r]);
	return {
		universe,
		office,
		staff,
		effects: fx,
		vacant,
		advice,
		candidates: (role: StaffRole) => staffCandidates(career.seed, career.season, half, role, manage.tier),
		competence: (role: StaffRole) => competenceOf(staff, role),
		info: STAFF_INFO,
		pending: (office.meeting ? 1 : 0) + (office.press ? 1 : 0)
	};
}

export type OfficeView = ReturnType<typeof officeView>;
