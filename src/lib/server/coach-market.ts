import type { Career } from '#lib/domain/career.ts';
import type { JobOfferDetail } from '#lib/domain/careerlife.ts';
import { BOARD_PROFILES, clubEconomy, seasonObjectives, type Objective } from '#lib/domain/club.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { DIVISION_LABELS, divisionOf, divisionStandings, effectiveRule, type DivisionId, type LeagueState, type StoredRoundResult } from '#lib/domain/league.ts';
import { initialClubState, initialWageBudget, payroll, type ClubState } from '#lib/domain/management.ts';
import { formatMoney, rosterOf, tierOfDivision } from '#lib/domain/market.ts';
import type { CoachOffer } from '#lib/domain/office.ts';
import type { Position } from '#lib/domain/positions.ts';

const POS_ORDER: Position[] = ['GOL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MEI', 'PD', 'PE', 'ATA'];
import { squadStrength, visibleSquadAge, type SquadPlayer } from '#lib/domain/squad.ts';
import { autoLineup, FORMATIONS, type FormationId } from '#lib/domain/tactics.ts';
import { coachOf, PROJECT_INFO, type UniverseState } from '#lib/domain/universe.ts';
import { rosterContext } from '#lib/domain/world.ts';
import { strengthFor } from '#lib/domain/strength.ts';
import { pickBench } from '#lib/engine/teams.ts';
import { CUP_ID } from '#lib/domain/cup.ts';

/**
 * Mercado de treinadores (Carreira de Treinador 2.0): propostas persistidas e a prévia detalhada
 * do clube interessado. A prévia usa as MESMAS funções que montam o clube quando o treinador
 * assume (elenco, objetivos, orçamento inicial), então os números batem depois da assinatura.
 */

export type ProjectGoal = 'evitar-rebaixamento' | 'permanecer' | 'acesso' | 'classificacao' | 'disputar-titulo' | 'conquistar-titulo';
export const PROJECT_GOAL_LABEL: Record<ProjectGoal, string> = {
	'evitar-rebaixamento': 'Evitar o rebaixamento',
	permanecer: 'Permanecer na divisão',
	acesso: 'Disputar uma vaga de acesso',
	classificacao: 'Classificar-se para competição importante',
	'disputar-titulo': 'Disputar o título',
	'conquistar-titulo': 'Conquistar o campeonato'
};

/** Clube de outra carreira, visto como se o treinador já estivesse lá (mesmo elenco que ele vai encontrar). */
function contextAs(career: Career, league: LeagueState, clubId: string) {
	return rosterContext({ ...career, clubId }, league);
}

/** Força relativa do clube na divisão (1 = mais forte) e tamanho da divisão. */
function rankIn(career: Career, league: LeagueState, clubId: string, division: string, strengthOf?: (id: string) => number): { rank: number; size: number } {
	const ids = (league.divisions as Record<string, string[]>)[division] ?? [];
	let strength: (id: string) => number;
	try {
		strength = strengthOf ?? strengthFor({ ...career, clubId });
		strength(clubId);
	} catch {
		// Carreira sem dados de elenco (saves muito antigos ou testes): ordena pelo porte do clube.
		strength = (id) => (getClub(id)?.reputation ?? 1) * 10;
	}
	const rank = [...ids].sort((a, b) => strength(b) - strength(a) || a.localeCompare(b)).indexOf(clubId) + 1;
	return { rank: rank || ids.length, size: ids.length };
}

/** Objetivos que a diretoria vai cobrar (os mesmos gravados no clube ao assumir). */
export function boardObjectivesFor(career: Career, league: LeagueState, clubId: string, club: Pick<ClubState, 'board'>): Objective[] {
	const division = divisionOf(league, clubId);
	if (!division || division === 'liga-brasfc') return [];
	const { rank, size } = rankIn(career, league, clubId, division);
	const rule = effectiveRule(league, division as 'serie-a');
	const inCup = !!career.data.cup?.entrants && Object.values(career.data.cup.entrants).some((l) => l.includes(clubId));
	return seasonObjectives({ division, rank, size, profile: club.board.profile, inCup, promotion: rule.promoted, relegation: rule.relegated });
}

/**
 * Projeto esportivo do clube, derivado da força do elenco na divisão — a mesma conta que define os
 * objetivos gravados quando o treinador assume, então a proposta e o clube real dizem o mesmo.
 */
export function projectGoal(career: Career, league: LeagueState, clubId: string, strengthOf?: (id: string) => number): { goal: ProjectGoal; label: string } {
	const division = divisionOf(league, clubId) ?? '';
	const { rank, size } = division ? rankIn(career, league, clubId, division, strengthOf) : { rank: 1, size: 1 };
	const rule = division && division !== 'liga-brasfc' ? effectiveRule(league, division as 'serie-a') : { promoted: 0, relegated: 0 };
	let goal: ProjectGoal;
	if (rule.promoted && rank <= rule.promoted + 2) goal = 'acesso';
	else if (rank === 1) goal = 'conquistar-titulo';
	else if (rank <= Math.ceil(size / 4)) goal = rule.promoted ? 'acesso' : rank <= Math.max(2, Math.ceil(size / 10)) ? 'disputar-titulo' : 'classificacao';
	else if (rule.relegated && rank > size - rule.relegated - 4) goal = 'evitar-rebaixamento';
	else goal = 'permanecer';
	return { goal, label: PROJECT_GOAL_LABEL[goal] };
}

/** Converte uma proposta do universo no registro persistido da carreira. */
export function persistOffer(career: Career, league: LeagueState, x: CoachOffer, o: { season: number; round: number; source: NonNullable<JobOfferDetail['source']>; expiresSeason: number; expiresRound?: number }, strengthOf?: (id: string) => number): JobOfferDetail {
	const project = projectGoal(career, league, x.clubId, strengthOf);
	return {
		id: `${o.season}-${o.round}-${o.source}-${x.clubId}`,
		clubId: x.clubId,
		division: x.division,
		reason: x.reason,
		project: x.project,
		wage: x.wage,
		years: x.years,
		expiresSeason: o.expiresSeason,
		...(o.expiresRound !== undefined ? { expiresRound: o.expiresRound } : {}),
		createdSeason: o.season,
		createdRound: o.round,
		source: o.source,
		status: 'aberta',
		objective: project.label
	};
}

const SECTORS: Array<{ key: 'GOL' | 'DEF' | 'MEI' | 'ATA'; label: string; positions: Position[] }> = [
	{ key: 'GOL', label: 'Goleiros', positions: ['GOL'] },
	{ key: 'DEF', label: 'Defesa', positions: ['ZAG', 'LD', 'LE'] },
	{ key: 'MEI', label: 'Meio-campo', positions: ['VOL', 'MC', 'MEI'] },
	{ key: 'ATA', label: 'Ataque', positions: ['PD', 'PE', 'ATA'] }
];

export interface ClubPreview {
	clubId: string;
	name: string;
	city: string;
	stadium: string | null;
	reputation: number;
	division: string | null;
	divisionLabel: string;
	position: number | null;
	divisionSize: number;
	points: number;
	played: number;
	recent: Array<{ opponent: string; home: boolean; goalsFor: number; goalsAgainst: number; result: 'v' | 'e' | 'd'; competition: string }>;
	board: { profile: string; profileLabel: string; summary: string; expectation: string };
	project: { goal: ProjectGoal; label: string; relevant: ProjectGoal[]; projectLabel: string | null };
	objectives: Array<{ label: string; weight: number }>;
	coach: { current: string | null; vacancy: boolean };
	squad: {
		formation: FormationId;
		strength: number;
		players: Array<{ id: string; name: string; shortName: string; position: Position; secondary: Position[]; age: number | null; overall: number; potential: number | null; role: 'titular' | 'reserva' | 'fora'; slot: string | null; wage: number; contractUntil: number }>;
		highlights: Array<{ id: string; name: string; position: Position; overall: number; age: number | null; note: string }>;
		needs: Array<{ sector: string; level: 'carencia' | 'atencao' | 'ok'; detail: string }>;
		averageAge: number | null;
	};
	finance: {
		balance: number;
		transferBudget: number;
		wageBudget: number;
		wageBill: number;
		health: 'saudavel' | 'equilibrada' | 'apertada' | 'critica';
		healthLabel: string;
		annualTv: number;
		estimate: boolean;
		note: string;
	};
}

/**
 * Prévia completa do clube interessado. Os clubes da IA não guardam um caixa próprio na carreira:
 * o caixa, o orçamento e o teto da folha são os mesmos que o servidor grava quando o treinador
 * assume (estado inicial determinístico do clube), e a prévia diz isso claramente.
 */
export function clubPreview(career: Career, league: LeagueState, results: StoredRoundResult[], clubId: string, universe: UniverseState | null): ClubPreview {
	const club = getClub(clubId);
	const division = divisionOf(league, clubId);
	const tier = tierOfDivision(division);
	const ctx = contextAs(career, league, clubId);
	const roster = rosterOf(ctx, clubId);
	const fresh = initialClubState(career.seed, clubId, division, career.season);
	const wageBill = payroll(roster);
	const eco = clubEconomy(clubId, tier);
	const wageBudget = fresh.wageBudget || initialWageBudget(wageBill, eco.tvAnnual);
	const mind = universe?.clubs[clubId];
	const formation: FormationId = mind?.formation && FORMATIONS[mind.formation] ? mind.formation : '4-4-2';
	const lineup = autoLineup(formation, roster);
	const bench = new Set(pickBench(roster, lineup));
	const slots = FORMATIONS[formation];
	const players = roster
		.map((p) => {
			const idx = lineup.indexOf(p.id);
			return {
				id: p.id,
				name: p.name,
				shortName: p.shortName,
				position: p.position,
				secondary: p.secondary ?? [],
				age: visibleSquadAge(p),
				overall: p.overall,
				// Potencial só é mostrado para jovens (indicação dos olheiros); para os demais, o teto já foi atingido.
				potential: (visibleSquadAge(p) ?? 99) <= 23 ? p.potential : null,
				role: idx >= 0 ? ('titular' as const) : bench.has(p.id) ? ('reserva' as const) : ('fora' as const),
				slot: idx >= 0 ? slots[idx].position : null,
				wage: p.contract.wage,
				contractUntil: p.contract.until
			};
		})
		.sort((a, b) => (a.role === b.role ? 0 : a.role === 'titular' ? -1 : b.role === 'titular' ? 1 : a.role === 'reserva' ? -1 : 1) || POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position) || b.overall - a.overall);
	const strength = squadStrength(roster);
	const ages = players.map((p) => p.age).filter((a): a is number => a !== null);
	const highlights = [...roster].sort((a, b) => b.overall - a.overall).slice(0, 3).map((p) => ({ id: p.id, name: p.name, position: p.position, overall: p.overall, age: visibleSquadAge(p), note: 'Entre os melhores do elenco' }));
	const prospect = roster.filter((p) => (visibleSquadAge(p) ?? 99) <= 21).sort((a, b) => b.potential - a.potential)[0];
	if (prospect && !highlights.some((h) => h.id === prospect.id)) highlights.push({ id: prospect.id, name: prospect.name, position: prospect.position, overall: prospect.overall, age: visibleSquadAge(prospect), note: 'Jovem promissor' });
	const needs = SECTORS.map((s) => {
		const inSector = roster.filter((p) => s.positions.includes(p.position));
		const need = s.key === 'GOL' ? 2 : s.key === 'DEF' ? 6 : s.key === 'MEI' ? 6 : 4;
		const best = inSector.map((p) => p.overall).sort((a, b) => b - a).slice(0, s.key === 'GOL' ? 1 : s.key === 'ATA' ? 2 : 4);
		const avg = best.length ? best.reduce((a, b) => a + b, 0) / best.length : 0;
		const short = inSector.length < need;
		const weak = avg && avg < strength - 3;
		const level: 'carencia' | 'atencao' | 'ok' = short && weak ? 'carencia' : short || weak ? 'atencao' : 'ok';
		const detail = level === 'ok' ? `${inSector.length} atletas, nível adequado (${Math.round(avg)})` : `${inSector.length} de ${need} atletas recomendados${weak ? `, titulares abaixo da média do elenco (${Math.round(avg)} × ${Math.round(strength)})` : ''}`;
		return { sector: s.label, level, detail };
	});
	// Classificação atual e últimos resultados (liga e Copa) a partir dos jogos salvos.
	const table = division ? divisionStandings(league, division as DivisionId, results.filter((r) => r.competition !== CUP_ID)) : [];
	const row = table.find((r) => r.clubId === clubId);
	const recent = results
		.filter((r) => r.home === clubId || r.away === clubId)
		.slice(-5)
		.reverse()
		.map((r) => {
			const home = r.home === clubId;
			const gf = home ? r.homeGoals : r.awayGoals;
			const ga = home ? r.awayGoals : r.homeGoals;
			return { opponent: home ? r.away : r.home, home, goalsFor: gf, goalsAgainst: ga, result: gf > ga ? ('v' as const) : gf === ga ? ('e' as const) : ('d' as const), competition: r.competition ?? '' };
		});
	const project = projectGoal(career, league, clubId);
	const order: ProjectGoal[] = ['evitar-rebaixamento', 'permanecer', 'acesso', 'classificacao', 'disputar-titulo', 'conquistar-titulo'];
	const at = order.indexOf(project.goal);
	const relevant = order.filter((g, i) => Math.abs(i - at) <= 1 && !(g === 'acesso' && !effectiveRuleOf(league, division).promoted) && !(g === 'evitar-rebaixamento' && !effectiveRuleOf(league, division).relegated));
	const profile = BOARD_PROFILES[fresh.board.profile];
	const objectives = boardObjectivesFor(career, league, clubId, fresh).map((o) => ({ label: o.label, weight: o.weight }));
	const months = wageBill > 0 ? fresh.balance / wageBill : 12;
	const health = months >= 6 ? 'saudavel' : months >= 3 ? 'equilibrada' : months >= 1 ? 'apertada' : 'critica';
	const coach = coachOf(universe, clubId);
	return {
		clubId,
		name: club?.name ?? clubId,
		city: club?.city ?? '',
		stadium: club?.stadium || null,
		reputation: club?.reputation ?? 1,
		division,
		divisionLabel: division ? (DIVISION_LABELS as Record<string, string>)[division] ?? division : 'Sem divisão',
		position: row?.position ?? null,
		divisionSize: table.length,
		points: row?.points ?? 0,
		played: row?.played ?? 0,
		recent,
		board: { profile: fresh.board.profile, profileLabel: profile.label, summary: profile.summary, expectation: objectives[0]?.label ?? project.label },
		project: { goal: project.goal, label: project.label, relevant, projectLabel: mind ? PROJECT_INFO[mind.project].label : null },
		objectives,
		coach: { current: coach?.name ?? null, vacancy: !!mind && !mind.coachId },
		squad: { formation, strength: Math.round(strength * 10) / 10, players, highlights, needs, averageAge: ages.length ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10 : null },
		finance: {
			balance: fresh.balance,
			transferBudget: fresh.transferBudget,
			wageBudget,
			wageBill,
			health,
			healthLabel: { saudavel: 'Saudável', equilibrada: 'Equilibrada', apertada: 'Apertada', critica: 'Crítica' }[health],
			annualTv: eco.tvAnnual,
			estimate: false,
			note: `Valores que a diretoria apresenta para assumir agora: caixa e orçamentos da temporada ${career.season}. A folha é a soma real dos contratos do elenco. Receita de TV anual de referência: ${formatMoney(eco.tvAnnual)}.`
		}
	};
}

function effectiveRuleOf(league: LeagueState, division: string | null) {
	return division && division !== 'liga-brasfc' ? effectiveRule(league, division as 'serie-a') : { promoted: 0, relegated: 0 };
}

export type { SquadPlayer };
