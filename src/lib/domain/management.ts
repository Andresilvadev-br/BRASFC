import { initialStaff, monthlyStaffCost, sanitizeStaff, staffCandidates, staffEffects, staffSeverance, STAFF_INFO, type StaffRole, type StaffState } from './staff.ts';
import type { YouthPlan } from './academy.ts';
import { developYouth, promoteYouth, reportFor, youthIntakeFor, REGIONS, scoutCandidates, type Scout, type ScoutReport, type Youth, type Region } from './academy.ts';
import {
	attendance,
	BOARD_PROFILES,
	boardProfileOf,
	clubEconomy,
	confidenceAfterMatch,
	confidenceFromMoney,
	DISMISSAL_THRESHOLD,
	FACILITIES,
	isDerby,
	leaguePrize,
	maintenanceWeekly,
	medicalRecovery,
	moodAfterMatch,
	seasonObjectives,
	sponsorOffers,
	stadiumCapacity,
	upgradeCost,
	type BoardProfile,
	type Facility,
	type Objective,
	type SponsorContract,
	type SponsorOffer,
	type SponsorSlot
} from './club.ts';
import { getClub } from './clubs.ts';
import {
	clubResponse,
	currentClubOf,
	emptyMarket,
	formatMoney,
	freeAgents,
	playerResponse,
	rosterOf,
	roundMoney,
	tierOfDivision,
	wageDemand,
	type ClubAnswer,
	type Contract,
	type ContractRole,
	type MarketState,
	type NegotiationOffer,
	type PlayerAnswer,
	type RosterContext,
	type RosterPlayer,
	type Tier
} from './market.ts';
import type { Position } from './positions.ts';
import { createRng, deriveSeed } from './rng.ts';
import { squadStrength } from './squad.ts';

/**
 * Estado de gestão do clube do usuário (Dev 0.4), persistido em careers.data.club.
 * Funções PURAS: o servidor aplica, valida a versão da carreira e grava estado + históricos
 * (career_ledger, career_transfers) na mesma transação.
 */

export interface IncomingOffer {
	id: string;
	playerId: string;
	club: string;
	fee: number;
	kind: 'compra' | 'emprestimo';
	expiresRound: number;
	season: number;
}

export interface NegotiationLog {
	id: string;
	season: number;
	round: number;
	playerId: string;
	playerName?: string;
	gameDate?: string;
	asking?: number;
	demand?: number;
	expired?: boolean;
	op?: string;
	club: string;
	offer: NegotiationOffer;
	club_answer: ClubAnswer['status'];
	player_answer: PlayerAnswer['status'] | null;
	message: string;
	done: boolean;
}

export type { JobOfferDetail as JobOffer } from './careerlife.ts';
import type { JobOfferDetail as JobOffer } from './careerlife.ts';

export interface MonthSummary {
	season: number;
	month: number;
	income: number;
	expense: number;
	balance: number;
	byCategory: Record<string, number>;
}

export interface ClubState {
	v: 1;
	balance: number;
	transferBudget: number;
	/** teto da folha mensal */
	wageBudget: number;
	ticketPrice: number;
	fanMood: number;
	board: { profile: BoardProfile; confidence: number; objectives: Objective[]; dismissed: boolean; notes: string[] };
	sponsors: SponsorContract[];
	sponsorOffers: SponsorOffer[];
	infra: Record<Facility, { level: number; project: { target: number; cost: number; readyWeek: number } | null }>;
	scouts: Scout[];
	reports: ScoutReport[];
	academy: Youth[];
	intakeSeason: number;
	/** semanas jogadas na carreira (relógio das obras) */
	week: number;
	months: MonthSummary[];
	incoming: IncomingOffer[];
	negotiations: NegotiationLog[];
	youthMinutes: number;
	coachReputation: number;
	jobOffers: JobOffer[];
	/** Dev 0.5: comissão técnica */
	staff?: StaffState;
	/** Dev 0.5: jovens revelados pela base do clube (para o legado) */
	revealed?: Array<{ id: string; name: string; position: string; season: number; overall: number; potentialHint: number }>;
}

export interface LedgerLine {
	category: string;
	amount: number;
	description: string;
}

export const LEDGER_LABELS: Record<string, string> = {
	tv: 'TV e comercial',
	patrocinio: 'Patrocínios',
	bilheteria: 'Bilheteria',
	premiacao: 'Premiações',
	transferencias: 'Transferências',
	salarios: 'Salários',
	estrutura: 'Estrutura e manutenção',
	obras: 'Obras',
	base: 'Categorias de base',
	comissao: 'Comissão técnica e olheiros',
	rescisoes: 'Rescisões',
	bonus: 'Bônus de metas'
};

// ─────────────────────────────────────────────────────────────── início

export function initialInfra(clubId: string, tier: Tier): ClubState['infra'] {
	const rep = getClub(clubId)?.reputation ?? 2;
	const base = tier === 'A' ? 2 + Math.floor(rep / 2) : tier === 'B' ? 2 + (rep >= 4 ? 1 : 0) : 1 + (rep >= 4 ? 1 : 0);
	const out = {} as ClubState['infra'];
	for (const f of FACILITIES) out[f] = { level: Math.max(1, Math.min(5, base + (f === 'estadio' && rep >= 4 ? 1 : 0))), project: null };
	return out;
}

export function initialClubState(seed: number, clubId: string, division: string | null, season: number): ClubState {
	const tier = tierOfDivision(division);
	const eco = clubEconomy(clubId, tier);
	const profile = boardProfileOf(seed, clubId);
	return {
		v: 1,
		balance: roundMoney(eco.tvAnnual * 0.12),
		transferBudget: roundMoney(eco.tvAnnual * (profile === 'ambiciosa' ? 0.12 : profile === 'rigida' ? 0.05 : 0.08)),
		wageBudget: 0, // definido na primeira semana a partir da folha atual
		ticketPrice: eco.ticketRef,
		fanMood: eco.fanBase,
		board: { profile, confidence: 62, objectives: [], dismissed: false, notes: [] },
		sponsors: [],
		sponsorOffers: sponsorOffers(seed, clubId, season, tier, eco.fanBase, []),
		infra: initialInfra(clubId, tier),
		scouts: [],
		reports: [],
		academy: youthIntakeFor(seed, clubId, season, initialInfra(clubId, tier).base.level),
		intakeSeason: season,
		week: 0,
		months: [],
		incoming: [],
		negotiations: [],
		youthMinutes: 0,
		coachReputation: 30 + (getClub(clubId)?.reputation ?? 2) * 5,
		jobOffers: [],
		staff: initialStaff(seed, clubId, season, tier, getClub(clubId)?.reputation ?? 2),
		revealed: []
	};
}

/** Garante a forma do estado (saves antigos ou dados corrompidos voltam ao padrão). */
export function sanitizeClubState(raw: unknown, seed: number, clubId: string, division: string | null, season: number): ClubState {
	const base = initialClubState(seed, clubId, division, season);
	if (!raw || typeof raw !== 'object' || (raw as ClubState).v !== 1) return base;
	const r = raw as ClubState;
	const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
	const months = new Map<string, MonthSummary>();
	if (Array.isArray(r.months)) {
		for (const entry of r.months.slice(-36)) {
			if (!entry || !Number.isInteger(entry.season) || !Number.isInteger(entry.month) || entry.month < 0) continue;
			const categories = entry.byCategory && typeof entry.byCategory === 'object' && !Array.isArray(entry.byCategory) ? entry.byCategory : {};
			months.set(`${entry.season}:${entry.month}`, {
				season: entry.season, month: entry.month,
				income: num(entry.income, 0), expense: num(entry.expense, 0), balance: num(entry.balance, 0),
				byCategory: Object.fromEntries(Object.entries(categories).filter(([, value]) => Number.isFinite(value)))
			});
		}
	}
	return {
		...base,
		...r,
		balance: num(r.balance, base.balance),
		transferBudget: Math.max(0, num(r.transferBudget, base.transferBudget)),
		wageBudget: Math.max(0, num(r.wageBudget, 0)),
		ticketPrice: Math.max(5, Math.min(500, num(r.ticketPrice, base.ticketPrice))),
		fanMood: Math.max(0, Math.min(100, num(r.fanMood, base.fanMood))),
		board: { ...base.board, ...(r.board ?? {}), confidence: Math.max(0, Math.min(100, num(r.board?.confidence, 62))) },
		infra: Object.fromEntries(FACILITIES.map((f) => [f, { level: Math.max(1, Math.min(5, num(r.infra?.[f]?.level, base.infra[f].level))), project: r.infra?.[f]?.project ?? null }])) as ClubState['infra'],
		sponsors: Array.isArray(r.sponsors) ? r.sponsors : [],
		sponsorOffers: Array.isArray(r.sponsorOffers) ? r.sponsorOffers : base.sponsorOffers,
		scouts: Array.isArray(r.scouts) ? r.scouts.slice(0, 5) : [],
		reports: Array.isArray(r.reports) ? r.reports.slice(-60) : [],
		academy: Array.isArray(r.academy) ? r.academy.slice(0, 30) : base.academy,
		months: [...months.values()],
		incoming: Array.isArray(r.incoming) ? r.incoming : [],
		negotiations: Array.isArray(r.negotiations) ? r.negotiations.slice(-30) : [],
		jobOffers: Array.isArray(r.jobOffers) ? r.jobOffers : [],
		staff: sanitizeStaff(r.staff) ?? base.staff,
		revealed: Array.isArray(r.revealed) ? r.revealed.slice(-80) : []
	};
}

export function sanitizeMarket(raw: unknown): MarketState {
	const m = emptyMarket();
	if (!raw || typeof raw !== 'object') return m;
	const r = raw as Partial<MarketState>;
	return {
		players: r.players && typeof r.players === 'object' ? r.players : {},
		extra: r.extra && typeof r.extra === 'object' ? r.extra : {},
		clubCash: r.clubCash && typeof r.clubCash === 'object' ? r.clubCash : {},
		listed: Array.isArray(r.listed) ? r.listed.filter((x) => typeof x === 'string').slice(0, 30) : [],
		shortlist: Array.isArray(r.shortlist) ? r.shortlist.filter((x) => typeof x === 'string').slice(0, 40) : []
	};
}

// ─────────────────────────────────────────────────────────────── semana

export interface WeekInput {
	seed: number;
	clubId: string;
	season: number;
	round: number;
	tier: Tier;
	division: string;
	roster: RosterPlayer[];
	humanWages?: number;
	/** jogo do usuário neste passo */
	match: null | { home: boolean; opponent: string; goalsFor: number; goalsAgainst: number; competition: string; opponentStrength: number; myStrength: number; youthMinutes: number };
	/** é domingo de liga (semana completa) ou quarta de Copa */
	fullWeek: boolean;
	firstSeasonOfCareer: boolean;
	/** prêmios da Copa conquistados neste passo */
	cupPrize: number;
}

export interface WeekOutcome {
	state: ClubState;
	ledger: LedgerLine[];
	news: Array<{ subject: string; body: string; important?: boolean }>;
	attendance: number | null;
	dismissed: boolean;
}

export function payroll(roster: RosterPlayer[]): number {
	return roster.reduce((s, p) => s + Math.round(p.contract.wage * (p.loan ? p.loan.wageShare : 1)), 0);
}

export function initialWageBudget(wages: number, annualIncome: number): number {
	return roundMoney(Math.max(wages * 1.08, annualIncome / 24));
}

/**
 * Uma semana (ou quarta de Copa) da gestão: receitas, despesas, obras, base, olheiros,
 * torcida e diretoria. Tudo derivado do estado real da carreira.
 */
export function processWeek(prev: ClubState, w: WeekInput): WeekOutcome {
	const st: ClubState = structuredClone(prev);
	const ledger: LedgerLine[] = [];
	const news: WeekOutcome['news'] = [];
	const eco = clubEconomy(w.clubId, w.tier);
	const add = (category: string, amount: number, description: string) => {
		if (!amount) return;
		ledger.push({ category, amount: Math.round(amount), description });
	};
	let att: number | null = null;
	const wageBill = payroll(w.roster) + (w.humanWages ?? 0);
	if (!st.wageBudget) st.wageBudget = initialWageBudget(wageBill, eco.tvAnnual);

	if (w.fullWeek) {
		st.week++;
		add('tv', eco.tvAnnual / 52, 'Cota de TV e receitas comerciais da semana');
		for (const s of st.sponsors) add('patrocinio', s.monthly / 4.33, `${s.brand} (${s.slot})`);
		add('salarios', -wageBill / 4.33, 'Folha salarial da semana');
		add('estrutura', -maintenanceWeekly(Object.fromEntries(FACILITIES.map((f) => [f, st.infra[f].level])) as Record<Facility, number>, w.tier), 'Manutenção da estrutura');
		add('base', -(2500 + st.infra.base.level * 4000) * (w.tier === 'A' ? 3 : w.tier === 'B' ? 1.5 : 1) / 4.33, 'Custeio das categorias de base');
		add('comissao', -st.scouts.reduce((s, x) => s + x.wage, 0) / 4.33, 'Salários dos olheiros');
		add('comissao', -monthlyStaffCost(st.staff) / 4.33, 'Salários da comissão técnica');
		// Obras concluídas
		for (const f of FACILITIES) {
			const pr = st.infra[f].project;
			if (pr && st.week >= pr.readyWeek) {
				st.infra[f] = { level: pr.target, project: null };
				news.push({ subject: `Obra concluída: ${f === 'ct' ? 'centro de treinamento' : f}`, body: `A estrutura chegou ao nível ${pr.target}.`, important: true });
			}
		}
		// Base: uma semana de desenvolvimento
		st.academy = st.academy.map((y) => developYouth(y, st.infra.ct.level, st.infra.base.level, staffEffects(st.staff).youthDevelopment * (st.board.notes.includes(`base-investida-${w.season}`) ? 1.15 : 1), w.seed, w.season, w.round));
	}
	if (w.cupPrize) add('premiacao', w.cupPrize, 'Premiação da Copa do Brasil');

	if (w.match) {
		const m = w.match;
		const outcome = m.goalsFor > m.goalsAgainst ? 'v' : m.goalsFor === m.goalsAgainst ? 'e' : 'd';
		const derby = isDerby(w.clubId, m.opponent);
		if (m.home) {
			const capacity = stadiumCapacity(eco.capacity, st.infra.estadio.level);
			att = attendance({ capacity, fanMood: st.fanMood, price: st.ticketPrice, ticketRef: eco.ticketRef, opponentReputation: getClub(m.opponent)?.reputation ?? 2, derby, competitionWeight: m.competition === 'copa-do-brasil' ? 1.1 : 1 });
			add('bilheteria', att * st.ticketPrice, `Bilheteria: ${att.toLocaleString('pt-BR')} torcedores`);
		}
		st.fanMood = moodAfterMatch(st.fanMood, outcome, m.home, derby, st.ticketPrice, eco.ticketRef);
		const dConf = confidenceAfterMatch(st.board.profile, outcome, m.myStrength - m.opponentStrength, w.firstSeasonOfCareer);
		st.board.confidence = clamp(st.board.confidence + dConf, 0, 100);
		st.youthMinutes += m.youthMinutes;
		if (BOARD_PROFILES[st.board.profile].youth > 1 && m.youthMinutes >= 90) st.board.confidence = clamp(st.board.confidence + 0.4, 0, 100);
		// Olheiros: um relatório por olheiro por jogo da semana.
	}
	const totalIncome = ledger.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
	const totalExpense = ledger.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0);
	st.balance = Math.round(st.balance + totalIncome + totalExpense);
	if (w.fullWeek) {
		st.board.confidence = clamp(st.board.confidence + confidenceFromMoney(st.board.profile, st.balance, eco.tvAnnual), 0, 100);
		// Resumo mensal (4 semanas = 1 mês do jogo)
		const month = Math.floor((st.week - 1) / 4);
		const cur = st.months.find((x) => x.season === w.season && x.month === month);
		const target = cur ?? { season: w.season, month, income: 0, expense: 0, balance: 0, byCategory: {} };
		target.income += totalIncome;
		target.expense += totalExpense;
		target.balance = st.balance;
		for (const l of ledger) target.byCategory[l.category] = (target.byCategory[l.category] ?? 0) + l.amount;
		if (!cur) st.months = [...st.months, target].slice(-36);
	} else if (ledger.length) {
		const last = st.months.at(-1);
		if (last) {
			last.income += totalIncome;
			last.expense += totalExpense;
			last.balance = st.balance;
			for (const l of ledger) last.byCategory[l.category] = (last.byCategory[l.category] ?? 0) + l.amount;
		}
	}
	let dismissed = false;
	if (!st.board.dismissed && w.fullWeek && w.round >= 10 && st.board.confidence < DISMISSAL_THRESHOLD) {
		st.board.dismissed = true;
		dismissed = true;
		news.push({ subject: 'A diretoria decidiu pela sua saída', body: `A confiança chegou a ${Math.round(st.board.confidence)}%. Seu ciclo no clube termina aqui. Avalie as propostas de outros clubes na área do clube.`, important: true });
	} else if (w.fullWeek && st.board.confidence < 30 && !st.board.notes.includes(`alerta-${w.season}`)) {
		st.board.notes = [...st.board.notes, `alerta-${w.season}`].slice(-10);
		news.push({ subject: 'Diretoria preocupada', body: `A confiança da diretoria caiu para ${Math.round(st.board.confidence)}%. Resultados nas próximas semanas serão decisivos.`, important: true });
	}
	return { state: st, ledger, news, attendance: att, dismissed };
}

/** Relatórios de olheiros da semana (atletas de outros clubes da região/posição pedida). */
export function scoutWeek(st: ClubState, ctx: RosterContext, clubsByUf: (uf: string) => string[], ufOf: (clubId: string) => string | null, season: number, round: number, needOverall: number): ScoutReport[] {
	const out: ScoutReport[] = [];
	const bonus = staffEffects(st.staff).scoutJudgement;
	for (const scout of st.scouts) {
		// Dev 0.5: missão com prazo — fora dela o olheiro fica parado (sem relatórios).
		if (scout.mission && st.week > scout.mission.untilWeek) continue;
		const rng = createRng(deriveSeed(ctx.seed, 'olheiro-semana', scout.id, season, round));
		const clubs = REGIONS[scout.region].flatMap((uf) => clubsByUf(uf)).filter((c) => c !== ctx.userClub);
		if (!clubs.length) continue;
		const club = rng.pick(clubs);
		const pool = rosterOf(ctx, club).filter((p) => (scout.position === 'qualquer' || p.position === scout.position) && p.age <= scout.maxAge && !st.reports.some((r) => r.playerId === p.id));
		if (!pool.length) continue;
		const p = pool.sort((a, b) => b.overall + b.potential * 0.3 - (a.overall + a.potential * 0.3))[rng.int(0, Math.min(3, pool.length - 1))];
		out.push(reportFor(scout, p, st.infra.observacao.level, season, round, needOverall, bonus));
		if (scout.mission) scout.mission.found++;
		void ufOf;
	}
	return out;
}

// ─────────────────────────────────────────────────────────────── fim de temporada

export interface SeasonEnd {
	position: number;
	size: number;
	division: string;
	promoted: boolean;
	relegated: boolean;
	champion: boolean;
	cupPhase: number;
	nextTier: Tier;
	nextDivision: string;
	rank: number;
	nextSize: number;
	promotion: number;
	relegation: number;
	inCupNext: boolean;
}

export function closeClubSeason(prev: ClubState, seed: number, clubId: string, season: number, tier: Tier, e: SeasonEnd): { state: ClubState; ledger: LedgerLine[]; news: Array<{ subject: string; body: string; important?: boolean }> } {
	const st: ClubState = structuredClone(prev);
	const ledger: LedgerLine[] = [];
	const news: Array<{ subject: string; body: string; important?: boolean }> = [];
	const prize = leaguePrize(tier, e.position, e.size);
	if (prize) ledger.push({ category: 'premiacao', amount: prize, description: `Premiação da liga (${e.position}º lugar)` });
	// Bônus e exigências de patrocínio
	for (const s of st.sponsors) {
		if (!s.bonus) continue;
		const ok = s.bonus.kind === 'acesso' ? e.promoted : s.bonus.kind === 'titulo' ? e.champion : s.bonus.kind === 'top' ? e.position <= s.bonus.target : e.cupPhase >= s.bonus.target;
		if (ok) ledger.push({ category: 'bonus', amount: s.bonus.amount, description: `Bônus ${s.brand}: ${s.bonus.label}` });
	}
	st.sponsors = st.sponsors.filter((s) => {
		const failed = s.requirement && e.position > s.requirement.maxPosition;
		if (failed) news.push({ subject: `${s.brand} encerra o patrocínio`, body: `A exigência "${s.requirement!.label}" não foi cumprida.` });
		return !failed && s.untilSeason > season;
	});
	// Avaliação da diretoria pelos objetivos
	let score = 0;
	let weight = 0;
	for (const o of st.board.objectives) {
		weight += o.weight;
		const met =
			o.kind === 'acesso' ? e.promoted : o.kind === 'permanencia' ? !e.relegated : o.kind === 'liga-posicao' ? e.position <= o.target : o.kind === 'copa-fase' ? e.cupPhase >= o.target : o.kind === 'saldo' ? st.balance >= o.target * 1e6 : st.youthMinutes >= o.target;
		score += met ? o.weight : -o.weight * 0.8;
	}
	const delta = weight ? (score / weight) * 18 : 0;
	st.board.confidence = clamp(st.board.confidence + delta + (e.champion ? 10 : 0) + (e.promoted ? 8 : 0) - (e.relegated ? 20 : 0), 0, 100);
	st.coachReputation = clamp(st.coachReputation + (e.champion ? 12 : 0) + (e.promoted ? 8 : 0) - (e.relegated ? 10 : 0) + delta / 3, 1, 100);
	news.push({ subject: `Balanço da temporada ${season}`, body: `A diretoria avaliou os objetivos: confiança agora em ${Math.round(st.board.confidence)}%.`, important: true });
	if (e.champion) st.fanMood = clamp(st.fanMood + 15, 0, 100);
	if (e.promoted) st.fanMood = clamp(st.fanMood + 10, 0, 100);
	if (e.relegated) st.fanMood = clamp(st.fanMood - 18, 0, 100);
	const total = ledger.reduce((s, l) => s + l.amount, 0);
	st.balance += total;
	// Próxima temporada: orçamento, objetivos, patrocínios, base.
	const eco = clubEconomy(clubId, e.nextTier);
	const prof = BOARD_PROFILES[st.board.profile];
	st.transferBudget = roundMoney(Math.max(0, eco.tvAnnual * (0.05 + 0.05 * prof.results) + Math.max(0, st.balance) * 0.25));
	st.wageBudget = roundMoney(Math.max(st.wageBudget * (e.nextTier === tier ? 1.03 : e.promoted ? 1.5 : 0.75), (eco.tvAnnual / 12) * 0.5));
	st.board.objectives = seasonObjectives({ division: e.nextDivision, rank: e.rank, size: e.nextSize, profile: st.board.profile, inCup: e.inCupNext, promotion: e.promotion, relegation: e.relegation });
	st.sponsorOffers = sponsorOffers(seed, clubId, season + 1, e.nextTier, st.fanMood, st.sponsors.map((s) => s.slot));
	st.academy = [...st.academy.map((y) => ({ ...y, age: y.age + 1 })).filter((y) => y.age <= 20), ...youthIntakeFor(seed, clubId, season + 1, st.infra.base.level)].slice(0, 30);
	st.intakeSeason = season + 1;
	st.youthMinutes = 0;
	st.incoming = [];
	return { state: st, ledger, news };
}

// ─────────────────────────────────────────────────────────────── ações do usuário

export class ManagementError extends Error {}

export interface ActionContext {
	seed: number;
	season: number;
	round: number;
	clubId: string;
	tier: Tier;
	division: string;
	roster: RosterContext;
	window: string | null;
	gameDate: string;
	additionalWages?: number;
}

export interface ActionResult {
	club: ClubState;
	market: MarketState;
	ledger: LedgerLine[];
	transfers: Array<{ playerId: string; playerName: string; from: string | null; to: string | null; kind: string; fee: number; wage: number }>;
	message: string;
	negotiation?: NegotiationLog;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v * 10) / 10));

function setOverride(m: MarketState, id: string, club: string | null, contract: Contract | null, date: string, loan?: MarketState['players'][string]['loan']) {
	m.players[id] = { club, contract, since: date, ...(loan ? { loan } : {}) };
}

/** Proposta do usuário por um atleta (compra, empréstimo ou jogador livre): clube e atleta respondem. */
export function makeOffer(club: ClubState, market: MarketState, ctx: ActionContext, offer: NegotiationOffer, op?: string): ActionResult {
	if (club.board.dismissed) throw new ManagementError('Você não comanda mais o clube.');
	const prior = op && club.negotiations.find((entry) => entry.op === op);
	if (prior) return { club, market, ledger: [], transfers: [], message: prior.message, negotiation: prior };
	const st = structuredClone(club);
	const mk = structuredClone(market);
	let player: RosterPlayer | undefined;
	let seller: string | null = null;
	if (offer.kind === 'livre') {
		player = freeAgents(ctx.roster).find((p) => p.id === offer.playerId);
		if (!player) throw new ManagementError('Este atleta não está livre no mercado.');
	} else {
		if (!ctx.window) throw new ManagementError('A janela de transferências está fechada.');
		seller = currentClubOf(ctx.roster, offer.playerId);
		if (!seller) throw new ManagementError('Atleta sem clube: faça uma proposta de jogador livre.');
		if (seller === ctx.clubId) throw new ManagementError('O atleta já é do seu clube.');
		player = rosterOf(ctx.roster, seller).find((p) => p.id === offer.playerId);
		if (!player) throw new ManagementError('Atleta não encontrado.');
		if (player.loan) throw new ManagementError('Atleta emprestado: não pode ser negociado agora.');
	}
	const myRoster = rosterOf(ctx.roster, ctx.clubId);
	if (myRoster.length >= 34) throw new ManagementError('Elenco cheio (máximo de 34 atletas).');
	const fee = offer.kind === 'compra' ? Math.max(0, Math.round(offer.fee)) : 0;
	if (fee > st.transferBudget || fee > Math.max(0, st.balance)) throw new ManagementError(`Valor acima do orçamento disponível (${formatMoney(Math.min(st.transferBudget, Math.max(0, st.balance)))}).`);
	const prefix = `${ctx.season}-${ctx.round}-${offer.playerId}-`;
	const sequence = 1 + Math.max(-1, ...st.negotiations.filter((entry) => entry.id.startsWith(prefix)).map((entry) => Number(entry.id.slice(prefix.length)) || 0));
	const log: NegotiationLog = { id: prefix + sequence, op, season: ctx.season, round: ctx.round, gameDate: ctx.gameDate, playerId: offer.playerId, playerName: player.name, club: seller ?? '', offer, club_answer: 'aceita', player_answer: null, message: '', done: false };
	if (seller) {
		const sellerSquad = rosterOf(ctx.roster, seller);
		const cash = (mk.clubCash[seller] ?? 0) + clubEconomy(seller, tierOfDivision(ctx.roster.divisionOf(seller))).tvAnnual * 0.05;
		const ans = clubResponse(offer, player, sellerSquad, cash);
		log.club_answer = ans.status;
		if (ans.status === 'contraproposta' && offer.kind === 'compra') log.asking = ans.asking;
		if (ans.status !== 'aceita') {
			log.message = ans.reason;
			st.negotiations = [...st.negotiations, log].slice(-30);
			return { club: st, market: mk, ledger: [], transfers: [], message: ans.reason, negotiation: log };
		}
	}
	const rep = getClub(ctx.clubId)?.reputation ?? 2;
	const starters = new Set([...myRoster].sort((a, b) => b.overall - a.overall).slice(0, 11).map((p) => p.id));
	const pAns = playerResponse(offer, player, ctx.tier, rep, starters.has(player.id) || player.overall >= squadStrength(myRoster));
	log.player_answer = pAns.status;
	if (pAns.status === 'recusada' && offer.wage < pAns.demand && offer.kind !== 'emprestimo') log.demand = pAns.demand;
	if (pAns.status !== 'aceita') {
		log.message = pAns.reason;
		st.negotiations = [...st.negotiations, log].slice(-30);
		return { club: st, market: mk, ledger: [], transfers: [], message: pAns.reason, negotiation: log };
	}
	const wage = offer.kind === 'emprestimo' ? player.contract.wage : Math.round(offer.wage);
	const wageShare = Math.max(0.5, Math.min(1, offer.wageShare ?? 1));
	const myCost = offer.kind === 'emprestimo' ? Math.round(wage * wageShare) : wage;
	if (offer.kind === 'livre' && wage > st.balance) throw new ManagementError('Saldo insuficiente para pagar as luvas.');
	const wages = payroll(myRoster) + (ctx.additionalWages ?? 0);
	if (!st.wageBudget) st.wageBudget = initialWageBudget(wages, clubEconomy(ctx.clubId, ctx.tier).tvAnnual);
	if (wages + myCost > st.wageBudget) throw new ManagementError(`A folha passaria do teto mensal da diretoria (${formatMoney(st.wageBudget)}).`);
	const ledger: LedgerLine[] = [];
	if (offer.kind === 'emprestimo') {
		setOverride(mk, player.id, ctx.clubId, player.contract, ctx.gameDate, { from: seller!, until: ctx.season, wageShare });
	} else {
		const contract: Contract = { wage, since: ctx.gameDate, until: ctx.season + Math.max(1, Math.min(5, Math.round(offer.years))) - 1, role: offer.role };
		setOverride(mk, player.id, ctx.clubId, contract, ctx.gameDate);
		if (fee) {
			st.transferBudget -= fee;
			ledger.push({ category: 'transferencias', amount: -fee, description: `Compra de ${player.name}` });
			mk.clubCash[seller!] = (mk.clubCash[seller!] ?? 0) + fee;
		}
		if (offer.kind === 'livre') ledger.push({ category: 'transferencias', amount: -wage, description: `Luvas de ${player.name}` });
	}
	st.balance += ledger.reduce((s, l) => s + l.amount, 0);
	log.done = true;
	log.message = offer.kind === 'emprestimo' ? `${player.name} chega emprestado até o fim de ${ctx.season}.` : `${player.name} assinou até ${ctx.season + offer.years - 1}.`;
	st.negotiations = [...st.negotiations, log].slice(-30);
	mk.shortlist = mk.shortlist.filter((x) => x !== player!.id);
	return {
		club: st,
		market: mk,
		ledger,
		transfers: [{ playerId: player.id, playerName: player.name, from: seller, to: ctx.clubId, kind: offer.kind === 'livre' ? 'livre' : offer.kind, fee, wage }],
		message: log.message,
		negotiation: log
	};
}

function incomingLog(offer: IncomingOffer, player: RosterPlayer | undefined, round: number, gameDate: string, status: 'aceita' | 'recusada' | 'expirada', message: string): NegotiationLog {
	return {
		id: 'recebida:' + offer.id, season: offer.season, round, gameDate,
		playerId: offer.playerId, playerName: player?.name, club: offer.club,
		offer: { playerId: offer.playerId, kind: offer.kind, fee: offer.fee, years: 3, wage: 0, role: 'titular' },
		club_answer: status === 'aceita' ? 'aceita' : 'recusada', player_answer: null,
		message, done: status === 'aceita', expired: status === 'expirada'
	};
}

export function expireIncoming(club: ClubState, roster: RosterPlayer[], season: number, round: number, gameDate: string): ClubState {
	const isExpired = (offer: IncomingOffer) => offer.season !== season || offer.expiresRound < round;
	const expired = club.incoming.filter(isExpired);
	if (!expired.length) return club;
	const logs = expired.map((offer) => incomingLog(offer, roster.find((p) => p.id === offer.playerId), round, gameDate, 'expirada', 'O prazo da proposta terminou.'));
	return { ...club, incoming: club.incoming.filter((offer) => !isExpired(offer)), negotiations: [...club.negotiations, ...logs].slice(-30) };
}

/** Responder proposta recebida por um atleta do usuário. */
export function answerIncoming(club: ClubState, market: MarketState, ctx: ActionContext, offerId: string, accept: boolean): ActionResult {
	const st = structuredClone(club);
	const mk = structuredClone(market);
	const inc = st.incoming.find((o) => o.id === offerId);
	if (!inc || inc.season !== ctx.season || inc.expiresRound < ctx.round) throw new ManagementError('Proposta não encontrada ou expirada.');
	st.incoming = st.incoming.filter((o) => o.id !== offerId);
	const roster = rosterOf(ctx.roster, ctx.clubId);
	const player = roster.find((p) => p.id === inc.playerId);
	if (!accept) {
		const negotiation = incomingLog(inc, player, ctx.round, ctx.gameDate, 'recusada', 'Proposta recusada.');
		st.negotiations = [...st.negotiations, negotiation].slice(-30);
		return { club: st, market: mk, ledger: [], transfers: [], message: negotiation.message, negotiation };
	}
	if (!ctx.window) throw new ManagementError('A janela de transferências está fechada.');
	if (!player) throw new ManagementError('O atleta não está mais no elenco.');
	if (roster.length <= 16) throw new ManagementError('O elenco ficaria com menos de 16 atletas.');
	const tierBuyer = tierOfDivision(ctx.roster.divisionOf(inc.club));
	const contract: Contract = { since: ctx.gameDate, wage: Math.max(player.contract.wage, wageDemand(player, tierBuyer, getClub(inc.club)?.reputation ?? 2, 'titular', 3)), until: ctx.season + 2, role: 'titular' };
	if (inc.kind === 'emprestimo') setOverride(mk, player.id, inc.club, player.contract, ctx.gameDate, { from: ctx.clubId, until: ctx.season, wageShare: 1 });
	else setOverride(mk, player.id, inc.club, contract, ctx.gameDate);
	mk.listed = mk.listed.filter((x) => x !== player.id);
	mk.clubCash[inc.club] = (mk.clubCash[inc.club] ?? 0) - inc.fee;
	const ledger: LedgerLine[] = inc.fee ? [{ category: 'transferencias', amount: inc.fee, description: `Venda de ${player.name}` }] : [];
	st.balance += inc.fee;
	st.transferBudget += Math.round(inc.fee * 0.5); // metade da venda volta ao orçamento
	const message = `${player.name} foi negociado com ${getClub(inc.club)?.name ?? inc.club}.`;
	const negotiation = incomingLog(inc, player, ctx.round, ctx.gameDate, 'aceita', message);
	st.negotiations = [...st.negotiations, negotiation].slice(-30);
	return { club: st, market: mk, ledger, transfers: [{ playerId: player.id, playerName: player.name, from: ctx.clubId, to: inc.club, kind: inc.kind === 'emprestimo' ? 'emprestimo' : 'venda', fee: inc.fee, wage: inc.kind === 'emprestimo' ? player.contract.wage : contract.wage }], message, negotiation };
}

/** Renovação de contrato com um atleta do elenco. */
export function renewContract(club: ClubState, market: MarketState, ctx: ActionContext, playerId: string, wage: number, years: number, role: ContractRole): ActionResult {
	const st = structuredClone(club);
	const mk = structuredClone(market);
	const roster = rosterOf(ctx.roster, ctx.clubId);
	const p = roster.find((x) => x.id === playerId);
	if (!p) throw new ManagementError('Atleta não está no elenco.');
	if (p.loan) throw new ManagementError('Atleta emprestado: renove com o clube dono.');
	if (!Number.isInteger(years) || years < 1 || years > 5) throw new ManagementError('Contratos vão de 1 a 5 temporadas.');
	if (!Number.isFinite(wage) || wage < 500 || wage > 1e8) throw new ManagementError('Salário inválido.');
	const demand = wageDemand(p, ctx.tier, getClub(ctx.clubId)?.reputation ?? 3, role, years);
	if (wage < demand) return { club: st, market: mk, ledger: [], transfers: [], message: `${p.name} pede ${formatMoney(demand)} por mês para renovar.` };
	const wages = payroll(roster) + (ctx.additionalWages ?? 0);
	if (!st.wageBudget) st.wageBudget = initialWageBudget(wages, clubEconomy(ctx.clubId, ctx.tier).tvAnnual);
	if (wages - p.contract.wage + wage > st.wageBudget) throw new ManagementError(`A folha passaria do teto (${formatMoney(st.wageBudget)}).`);
	const contract: Contract = { wage: Math.round(wage), since: ctx.gameDate, until: ctx.season + years, role };
	setOverride(mk, p.id, ctx.clubId, contract, ctx.gameDate);
	return { club: st, market: mk, ledger: [], transfers: [{ playerId: p.id, playerName: p.name, from: ctx.clubId, to: ctx.clubId, kind: 'renovacao', fee: 0, wage: contract.wage }], message: `${p.name} renovou até ${contract.until}.` };
}

/** Rescisão: paga metade do que resta do contrato; o atleta fica livre. */
export function releasePlayer(club: ClubState, market: MarketState, ctx: ActionContext, playerId: string): ActionResult {
	const st = structuredClone(club);
	const mk = structuredClone(market);
	const roster = rosterOf(ctx.roster, ctx.clubId);
	const p = roster.find((x) => x.id === playerId);
	if (!p) throw new ManagementError('Atleta não está no elenco.');
	if (roster.length <= 16) throw new ManagementError('O elenco ficaria com menos de 16 atletas.');
	if (p.loan) {
		setOverride(mk, p.id, p.loan.from, p.contract, ctx.gameDate);
		return { club: st, market: mk, ledger: [], transfers: [{ playerId: p.id, playerName: p.name, from: ctx.clubId, to: p.loan.from, kind: 'retorno', fee: 0, wage: p.contract.wage }], message: `${p.name} voltou ao clube de origem.` };
	}
	const months = Math.max(1, (p.contract.until - ctx.season + 1) * 12 - 6);
	const cost = roundMoney(p.contract.wage * months * 0.5);
	setOverride(mk, p.id, null, null, ctx.gameDate);
	st.balance -= cost;
	return { club: st, market: mk, ledger: [{ category: 'rescisoes', amount: -cost, description: `Rescisão de ${p.name}` }], transfers: [{ playerId: p.id, playerName: p.name, from: ctx.clubId, to: null, kind: 'rescisao', fee: cost, wage: 0 }], message: `${p.name} teve o contrato rescindido (${formatMoney(cost)}).` };
}

export function signSponsor(club: ClubState, season: number, offerId: string): ClubState {
	const st = structuredClone(club);
	const o = st.sponsorOffers.find((x) => x.id === offerId);
	if (!o) throw new ManagementError('Proposta de patrocínio indisponível.');
	if (st.sponsors.some((s) => s.slot === o.slot)) throw new ManagementError('Já existe contrato para este espaço.');
	st.sponsors = [...st.sponsors, { ...o, signedSeason: season, untilSeason: season + o.seasons - 1 }];
	st.sponsorOffers = st.sponsorOffers.filter((x) => x.slot !== o.slot);
	return st;
}

export function startUpgrade(club: ClubState, f: Facility, tier: Tier): { state: ClubState; ledger: LedgerLine[] } {
	const st = structuredClone(club);
	const cur = st.infra[f];
	if (cur.project) throw new ManagementError('Já existe uma obra em andamento nesta área.');
	if (cur.level >= 5) throw new ManagementError('Nível máximo atingido.');
	const { cost, weeks } = upgradeCost(f, cur.level, tier);
	if (cost > st.balance) throw new ManagementError(`Caixa insuficiente: a obra custa ${formatMoney(cost)}.`);
	if (BOARD_PROFILES[st.board.profile].money > 1.3 && cost > st.balance * 0.5) throw new ManagementError('A diretoria (financeiramente rígida) não aprova gastar mais da metade do caixa numa obra.');
	st.infra[f] = { level: cur.level, project: { target: cur.level + 1, cost, readyWeek: st.week + weeks } };
	st.balance -= cost;
	return { state: st, ledger: [{ category: 'obras', amount: -cost, description: `Obra: ${f} nível ${cur.level + 1}` }] };
}

export function setTicketPrice(club: ClubState, price: number, ref: number): ClubState {
	if (!Number.isFinite(price) || price < Math.max(5, ref * 0.3) || price > ref * 4) throw new ManagementError(`Preço fora da faixa permitida (${Math.round(Math.max(5, ref * 0.3))}–${Math.round(ref * 4)} reais).`);
	return { ...structuredClone(club), ticketPrice: Math.round(price) };
}

export function hireScout(club: ClubState, seed: number, season: number, candidateId: string): ClubState {
	const st = structuredClone(club);
	if (st.scouts.length >= st.infra.observacao.level) throw new ManagementError(`A estrutura de observação comporta ${st.infra.observacao.level} olheiro(s).`);
	const c = scoutCandidates(seed, season).find((s) => s.id === candidateId);
	if (!c) throw new ManagementError('Olheiro indisponível.');
	if (st.scouts.some((s) => s.id === c.id)) throw new ManagementError('Olheiro já contratado.');
	st.scouts = [...st.scouts, c];
	return st;
}

export function assignScout(club: ClubState, scoutId: string, region: Region, position: Position | 'qualquer', maxAge: number, weeks = 0): ClubState {
	const st = structuredClone(club);
	const s = st.scouts.find((x) => x.id === scoutId);
	if (!s) throw new ManagementError('Olheiro não encontrado.');
	if (!(region in REGIONS)) throw new ManagementError('Região inválida.');
	if (!Number.isFinite(maxAge)) throw new ManagementError('Idade máxima inválida.');
	s.region = region;
	s.position = position;
	s.maxAge = Math.max(17, Math.min(35, Math.round(maxAge)));
	// Dev 0.5: missão com prazo (2 a 12 semanas); 0 = observação contínua.
	if (weeks) {
		if (!Number.isInteger(weeks) || weeks < 2 || weeks > 12) throw new ManagementError('Prazo da missão inválido (2 a 12 semanas).');
		s.mission = { untilWeek: st.week + weeks, found: 0, startedWeek: st.week };
	} else s.mission = null;
	return st;
}

/** Dev 0.5: plano de desenvolvimento de um jovem da base. */
export function setYouthPlan(club: ClubState, youthId: string, plan: YouthPlan): ClubState {
	const st = structuredClone(club);
	const y = st.academy.find((x) => x.id === youthId);
	if (!y) throw new ManagementError('Jovem não encontrado na base.');
	y.plan = plan;
	return st;
}

/** Dev 0.5: contrata um profissional para a comissão (substitui quem ocupa o cargo, pagando a rescisão). */
export function hireStaff(club: ClubState, seed: number, season: number, round: number, tier: Tier, role: StaffRole, candidateId: string): { state: ClubState; ledger: LedgerLine[]; message: string } {
	const st = structuredClone(club);
	const half: 1 | 2 = round <= 19 ? 1 : 2;
	const c = staffCandidates(seed, season, half, role, tier).find((x) => x.id === candidateId);
	if (!c) throw new ManagementError('Profissional indisponível.');
	const staff = { ...(st.staff ?? {}) };
	if (staff[role]?.id === c.id) throw new ManagementError('Este profissional já trabalha no clube.');
	const ledger: LedgerLine[] = [];
	const cur = staff[role];
	if (cur) {
		const fee = staffSeverance(cur, season, Math.max(0, 10 - Math.floor(round / 4)));
				ledger.push({ category: 'comissao', amount: -fee, description: `Rescisão: ${cur.name} (${STAFF_INFO[role].label})` });
		st.balance -= fee;
	}
	staff[role] = c;
	st.staff = staff;
	return { state: st, ledger, message: `${c.name} é o novo ${STAFF_INFO[role].label.toLowerCase()}.` };
}

/** Dev 0.5: dispensa um profissional (rescisão de metade dos salários restantes). */
export function fireStaff(club: ClubState, season: number, round: number, role: StaffRole): { state: ClubState; ledger: LedgerLine[]; message: string } {
	const st = structuredClone(club);
	const cur = st.staff?.[role];
	if (!cur) throw new ManagementError('Cargo já está vago.');
	const fee = staffSeverance(cur, season, Math.max(0, 10 - Math.floor(round / 4)));
	st.balance -= fee;
	const staff = { ...(st.staff ?? {}) };
	delete staff[role];
	st.staff = staff;
	return { state: st, ledger: [{ category: 'comissao', amount: -fee, description: `Rescisão: ${cur.name} (${STAFF_INFO[role].label})` }], message: `${cur.name} foi dispensado. Um interino assume até a contratação.` };
}

export function fireScout(club: ClubState, scoutId: string): ClubState {
	const st = structuredClone(club);
	st.scouts = st.scouts.filter((s) => s.id !== scoutId);
	return st;
}

/** Promove um jovem ao profissional (contrato de jovem promessa). */
export function promote(club: ClubState, market: MarketState, ctx: ActionContext, youthId: string): ActionResult {
	const st = structuredClone(club);
	const mk = structuredClone(market);
	const y = st.academy.find((x) => x.id === youthId);
	if (!y) throw new ManagementError('Jovem não encontrado na base.');
	const roster = rosterOf(ctx.roster, ctx.clubId);
	if (roster.length >= 34) throw new ManagementError('Elenco cheio (máximo de 34 atletas).');
	const used = new Set(roster.map((p) => p.number));
	let number = 30;
	while (used.has(number)) number++;
	const player = promoteYouth(y, number);
	mk.extra[player.id] = { player, season: ctx.season, origin: 'base', formedBy: ctx.clubId };
	st.revealed = [...(st.revealed ?? []), { id: player.id, name: player.name, position: player.position, season: ctx.season, overall: player.overall, potentialHint: Math.round((y.potential + y.overall) / 2) }].slice(-80);
	const contract: Contract = { wage: Math.max(2000, roundMoney(wageDemand(player, ctx.tier, 3, 'jovem', 3) * 0.6)), until: ctx.season + 2, role: 'jovem' };
	setOverride(mk, player.id, ctx.clubId, contract, ctx.gameDate);
	st.academy = st.academy.filter((x) => x.id !== youthId);
	return { club: st, market: mk, ledger: [], transfers: [{ playerId: player.id, playerName: player.name, from: null, to: ctx.clubId, kind: 'base', fee: 0, wage: contract.wage }], message: `${player.name} foi promovido ao elenco profissional.` };
}

export function dismissYouth(club: ClubState, youthId: string): ClubState {
	const st = structuredClone(club);
	if (!st.academy.some((y) => y.id === youthId)) throw new ManagementError('Jovem não encontrado.');
	st.academy = st.academy.filter((y) => y.id !== youthId);
	return st;
}

/** Propostas de clubes da IA pelos atletas do usuário (durante a janela). */
export function generateIncoming(st: ClubState, ctx: RosterContext, userClub: string, clubs: string[], season: number, round: number, listed: string[]): IncomingOffer[] {
	const rng = createRng(deriveSeed(ctx.seed, 'propostas', season, round));
	const roster = rosterOf(ctx, userClub);
	const out: IncomingOffer[] = [];
	const candidates = [...roster].filter((p) => !p.loan && p.id !== 'eu').sort((a, b) => (listed.includes(b.id) ? 1 : 0) - (listed.includes(a.id) ? 1 : 0) || b.value - a.value);
	for (const p of candidates.slice(0, 6)) {
		const chance = listed.includes(p.id) ? 0.5 : p.contract.role === 'reserva' ? 0.12 : 0.06;
		if (!rng.chance(chance)) continue;
		const buyers = clubs.filter((c) => c !== userClub && (getClub(c)?.reputation ?? 1) >= (getClub(userClub)?.reputation ?? 1) - 1);
		if (!buyers.length) continue;
		const buyer = rng.pick(buyers);
		const fee = roundMoney(p.value * (0.8 + rng.next() * 0.35) * (listed.includes(p.id) ? 0.9 : 1));
		if (st.incoming.some((o) => o.playerId === p.id)) continue;
		out.push({ id: `${season}-${round}-${p.id}`, playerId: p.id, club: buyer, fee, kind: p.age <= 21 && p.contract.role !== 'titular' && rng.chance(0.3) ? 'emprestimo' : 'compra', expiresRound: round + 2, season });
	}
	return out;
}
