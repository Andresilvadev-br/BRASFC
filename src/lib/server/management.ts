import { CLUBES_2026 } from '#lib/data/brasil.ts';
import { EUROPE_NAMES, europePrize, isEuropeComp } from '#lib/domain/europe.ts';
import type { Career } from '#lib/domain/career.ts';
import { clubEconomy, TICKET_REF, type Facility } from '#lib/domain/club.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { CUP_FINAL_PRIZE, CUP_PHASES, phaseOfMatchday } from '#lib/domain/cup.ts';
import { activeMembership, divisionOf, effectiveRule, type LeagueState } from '#lib/domain/league.ts';
import {
	answerIncoming,
	assignScout,
	closeClubSeason,
	dismissYouth,
	fireScout,
	generateIncoming,
	expireIncoming,
	hireScout,
	makeOffer,
	ManagementError,
	processWeek,
	promote,
	releasePlayer,
	renewContract,
	scoutWeek,
	setTicketPrice,
	signSponsor,
	startUpgrade,
	type ActionContext,
	type ActionResult,
	type ClubState,
	type LedgerLine,
	type SeasonEnd
} from '#lib/domain/management.ts';
import { isHumanClub, aiTransfers, findPlayer, formatMoney, rosterOf, squadNeeds, tierOfDivision, transferWindow, type MarketState, type RosterContext } from '#lib/domain/market.ts';
import { seasonObjectives } from '#lib/domain/club.ts';
import { jobOffers } from '#lib/domain/careerlife.ts';
import { squadStrength } from '#lib/domain/squad.ts';
import type { RoundInsert } from './repos/matches.ts';
import type { TransferRow } from './repos/management.ts';
import type { Region } from '#lib/domain/academy.ts';
import type { Position } from '#lib/domain/positions.ts';

const UF = new Map(CLUBES_2026.map((c) => [c.id, c.uf]));
const clubsByUfCache = new Map<string, string[]>();
function clubsByUf(league: LeagueState): (uf: string) => string[] {
	const all = Object.values(league.divisions).flat() as string[];
	return (uf) => {
		const key = `${league.season}:${uf}:${all.length}`;
		let v = clubsByUfCache.get(key);
		if (!v) {
			v = all.filter((id) => UF.get(id) === uf);
			clubsByUfCache.set(key, v);
		}
		return v;
	};
}

export interface WeeklyResult {
	club: ClubState;
	market: MarketState;
	ledger: LedgerLine[];
	transfers: TransferRow[];
	news: Array<{ subject: string; body: string; important?: boolean; sender?: string }>;
}

/** Gestão de um passo do calendário (domingo ou quarta). Determinística pelo estado + semente. */
export function weeklyManagement(o: {
	career: Career;
	league: LeagueState;
	club: ClubState;
	market: MarketState;
	step: { kind: 'league' | 'cup' | 'europe'; round: number; matchday?: number; competition?: string };
	roster: RosterContext;
	userRow: RoundInsert | null;
	strengthOf: (id: string) => number;
	/** 0.13: com vários treinadores o mercado da IA roda uma vez por passo (no primeiro treinador) */
	aiMarket?: boolean;
}): WeeklyResult {
	const { career, league, step } = o;
	const division = divisionOf(league, career.clubId) ?? 'liga-brasfc';
	const tier = tierOfDivision(division);
	let club = o.club;
	let market = o.market;
	const transfers: TransferRow[] = [];
	const news: WeeklyResult['news'] = [];
	const roster = rosterOf({ ...o.roster, market }, career.clubId);
	const myStrength = squadStrength(roster);
	// Objetivos da temporada (primeira semana).
	if (!club.board.objectives.length && division !== 'liga-brasfc') {
		const ids = league.divisions[division as 'serie-a'] ?? [];
		const rank = [...ids].sort((a, b) => o.strengthOf(b) - o.strengthOf(a)).indexOf(career.clubId) + 1;
		const rule = effectiveRule(league, division as 'serie-a');
		club = { ...club, board: { ...club.board, objectives: seasonObjectives({ division, rank, size: ids.length, profile: club.board.profile, inCup: !!career.data.cup?.entrants && Object.values(career.data.cup.entrants).some((l) => l.includes(career.clubId)), promotion: rule.promoted, relegation: rule.relegated }) } };
	}
	let cupPrize = 0;
	let prizeLabel: string | undefined;
	let match: Parameters<typeof processWeek>[1]['match'] = null;
	if (o.userRow) {
		const r = o.userRow;
		const home = r.home === career.clubId;
		const opp = home ? r.away : r.home;
		const youthMinutes = Object.entries(r.summary?.players ?? {}).reduce((s, [id, st]) => s + (id.startsWith('base-') ? st.minutes : 0), 0);
		match = { home, opponent: opp, goalsFor: home ? r.homeGoals : r.awayGoals, goalsAgainst: home ? r.awayGoals : r.homeGoals, competition: r.competition, opponentStrength: o.strengthOf(opp), myStrength, youthMinutes };
		if (step.kind === 'cup' && step.matchday) {
			const ph = phaseOfMatchday(step.matchday);
			if (ph.matchdays[0] === step.matchday && ph.prize) cupPrize = ph.prize;
		}
		if (step.kind === 'europe' && step.matchday && isEuropeComp(step.competition)) {
			cupPrize = europePrize(step.competition, step.matchday);
			prizeLabel = `Premiação da ${EUROPE_NAMES[step.competition]}`;
		}
	}
	const wasDismissed = club.board.dismissed;
	const week = processWeek(club, { seed: career.seed, clubId: career.clubId, season: career.season, round: step.round, tier, division, roster, match, fullWeek: step.kind === 'league', firstSeasonOfCareer: career.season === (career.data.firstSeason ?? career.season), cupPrize, ...(prizeLabel ? { prizeLabel } : {}) });
	club = week.state;
	news.push(...week.news);
	if (!wasDismissed && club.board.dismissed) club = { ...club, jobOffers: jobOffers(career.seed, career.season, step.round, club.coachReputation, career.clubId, activeMembership(league), true) };
	const ledger = [...week.ledger];

	if (step.kind === 'league') {
		const window = transferWindow(step.round);
		const allClubs = Object.values(league.divisions).flat() as string[];
		// Propostas recebidas expiram; novas chegam durante a janela.
		club = expireIncoming(club, roster, career.season, step.round, career.gameDate);
		if (window && career.mode === 'coach') {
			const inc = generateIncoming(club, { ...o.roster, market }, career.clubId, allClubs, career.season, step.round, market.listed);
			if (inc.length) {
				club = { ...club, incoming: [...club.incoming, ...inc] };
				for (const x of inc) {
					const p = roster.find((r) => r.id === x.playerId);
					news.push({ sender: getClub(x.club)?.name ?? 'Mercado', subject: `Proposta por ${p?.name ?? 'atleta'}`, body: `${getClub(x.club)?.name ?? x.club} oferece ${formatMoney(x.fee)} (${x.kind === 'emprestimo' ? 'empréstimo' : 'compra'}). Responda no Mercado até a rodada ${x.expiresRound}.` });
				}
			}
		}
		if (window && o.aiMarket !== false) {
			// Mercado da IA: necessidades reais de elenco e orçamento por nível.
			const budgetOf = (id: string) => clubEconomy(id, tierOfDivision(divisionOf(league, id))).tvAnnual * 0.06;
			const aiClubs = league.selection ? Object.values(activeMembership(league)).flat() : allClubs;
			const moves = aiTransfers({ ...o.roster, market }, aiClubs, `${step.round}`, budgetOf, 3);
			if (moves.length) {
				market = structuredClone(market);
				for (const mv of moves) {
					market.players[mv.playerId] = { club: mv.to, contract: { wage: mv.wage, since: career.gameDate, until: mv.until, role: 'titular' }, since: career.gameDate };
					market.clubCash[mv.from] = (market.clubCash[mv.from] ?? 0) + mv.fee;
					market.clubCash[mv.to] = (market.clubCash[mv.to] ?? 0) - mv.fee;
					const name = rosterOf({ ...o.roster, market }, mv.to).find((p) => p.id === mv.playerId)?.name ?? mv.playerId;
					transfers.push({ playerId: mv.playerId, playerName: name, from: mv.from, to: mv.to, kind: 'ia', fee: mv.fee, wage: mv.wage });
				}
			}
		}
		// Olheiros: relatórios da semana.
		if (club.scouts.length) {
			const need = Math.round(myStrength);
			const reports = scoutWeek(club, { ...o.roster, market }, clubsByUf(league), (id) => UF.get(id) ?? null, career.season, step.round, need);
			if (reports.length) club = { ...club, reports: [...club.reports, ...reports].slice(-60) };
		}
		// Elenco curto: alerta de necessidades.
		const needs = squadNeeds(roster);
		if (needs.length && step.round % 6 === 1) news.push({ sender: 'Auxiliar técnico', subject: 'Elenco com carência', body: `Faltam opções nas posições: ${needs.join(', ')}. Avalie o mercado ou a base.` });
	}
	return { club, market, ledger, transfers, news };
}

/** Fim de temporada da gestão: contratos, empréstimos, premiações, diretoria e base. */
export function seasonEndManagement(o: {
	career: Career;
	club: ClubState;
	market: MarketState;
	roster: RosterContext;
	league: LeagueState;
	next: LeagueState;
	position: number;
	size: number;
	promoted: boolean;
	relegated: boolean;
	champion: boolean;
	cupPhase: number;
	cupChampion: boolean;
	cupRunnerUp: boolean;
	strengthOf: (id: string) => number;
	inCupNext: boolean;
}): WeeklyResult {
	const { career } = o;
	const division = divisionOf(o.league, career.clubId) ?? 'liga-brasfc';
	const tier = tierOfDivision(division);
	const nextDivision = divisionOf(o.next, career.clubId) ?? division;
	const market = structuredClone(o.market);
	const transfers: TransferRow[] = [];
	const news: WeeklyResult['news'] = [];
	const roster = rosterOf({ ...o.roster, market: o.market }, career.clubId);
	// Contratos que terminam: o atleta sai livre (o usuário teve a temporada para renovar).
	for (const p of roster) {
		if (p.id === 'eu') continue;
		if (p.loan && p.loan.until <= career.season) {
			market.players[p.id] = { club: p.loan.from, contract: p.contract, since: career.gameDate };
			transfers.push({ playerId: p.id, playerName: p.name, from: career.clubId, to: p.loan.from, kind: 'retorno', fee: 0, wage: p.contract.wage });
			continue;
		}
		if (p.contract.until <= career.season) {
			market.players[p.id] = { club: null, contract: null, since: career.gameDate };
			transfers.push({ playerId: p.id, playerName: p.name, from: career.clubId, to: null, kind: 'livre', fee: 0, wage: 0 });
			news.push({ sender: 'Departamento de futebol', subject: `${p.name} deixa o clube`, body: `O contrato terminou em ${career.season} sem renovação.` });
		}
	}
	// Atletas emprestados pelo usuário a outros clubes voltam.
	for (const [id, ov] of Object.entries(market.players)) {
		if (ov.loan && ov.loan.from === career.clubId && ov.loan.until <= career.season) {
			market.players[id] = { club: career.clubId, contract: ov.contract, since: career.gameDate };
			transfers.push({ playerId: id, playerName: id, from: ov.club, to: career.clubId, kind: 'retorno', fee: 0, wage: ov.contract?.wage ?? 0 });
		}
		// Contratos de atletas negociados pela IA renovam (a IA evita perder o elenco).
		if (ov.club && ov.club !== career.clubId && !isHumanClub(o.roster, ov.club) && ov.contract && !ov.loan && ov.contract.until <= career.season) ov.contract = { ...ov.contract, until: career.season + 2 };
	}
	const nextIds = o.next.divisions[nextDivision as 'serie-a'] ?? [];
	const rank = [...nextIds].sort((a, b) => o.strengthOf(b) - o.strengthOf(a)).indexOf(career.clubId) + 1;
	const rule = nextDivision === 'liga-brasfc' ? { promoted: 0, relegated: 0 } : effectiveRule(o.next, nextDivision as 'serie-a');
	const e: SeasonEnd = {
		position: o.position,
		size: o.size,
		division,
		promoted: o.promoted,
		relegated: o.relegated,
		champion: o.champion,
		cupPhase: o.cupPhase,
		nextTier: tierOfDivision(nextDivision),
		nextDivision,
		rank: Math.max(1, rank),
		nextSize: nextIds.length || o.size,
		promotion: rule.promoted,
		relegation: rule.relegated,
		inCupNext: o.inCupNext
	};
	const out = closeClubSeason(o.club, career.seed, career.clubId, career.season, tier, e);
	const ledger = [...out.ledger];
	if (o.cupChampion) ledger.push({ category: 'premiacao', amount: CUP_FINAL_PRIZE.champion, description: 'Campeão da Copa do Brasil' });
	if (o.cupRunnerUp) ledger.push({ category: 'premiacao', amount: CUP_FINAL_PRIZE.runnerUp, description: 'Vice-campeão da Copa do Brasil' });
	const extra = (o.cupChampion ? CUP_FINAL_PRIZE.champion : 0) + (o.cupRunnerUp ? CUP_FINAL_PRIZE.runnerUp : 0);
	news.push(...out.news);
	let st = { ...out.state, balance: out.state.balance + extra };
	// Treinador em destaque recebe sondagens de clubes maiores (decide na pré-temporada).
	if (!st.board.dismissed && st.coachReputation >= 55) {
		const offers = jobOffers(career.seed, career.season, 99, st.coachReputation, career.clubId, activeMembership(o.next), false).slice(0, 2).map((x) => ({ ...x, expiresSeason: career.season + 1 }));
		if (offers.length) {
			st = { ...st, jobOffers: offers };
			news.push({ sender: 'Empresário', subject: 'Sondagens de outros clubes', body: `${offers.map((x) => getClub(x.clubId)?.name ?? x.clubId).join(' e ')} querem conversar. Veja em Clube → Carreira.` });
		}
	}
	return { club: st, market, ledger, transfers, news };
}

// ─────────────────────────────────────────────────────────────── ações

export function actionContext(career: Career, league: LeagueState, roster: RosterContext, nextRound: number): ActionContext {
	const division = divisionOf(league, career.clubId) ?? 'liga-brasfc';
	return { seed: career.seed, season: career.season, round: nextRound, clubId: career.clubId, tier: tierOfDivision(division), division, roster, window: transferWindow(nextRound), gameDate: career.gameDate };
}

const POSITIONS = new Set(['GOL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MEI', 'PD', 'PE', 'ATA', 'qualquer']);
const REGIONS_OK = new Set(['norte', 'nordeste', 'centro-oeste', 'sudeste', 'sul']);
const FAC = new Set(['ct', 'base', 'medico', 'observacao', 'estadio']);
const ROLES = new Set(['titular', 'rotacao', 'reserva', 'jovem']);

/** Valida e aplica uma ação do usuário. Valores vindos do navegador são sempre conferidos aqui. */
export function applyAction(club: ClubState, market: MarketState, ctx: ActionContext, body: Record<string, unknown>): ActionResult {
	const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '');
	const num = (k: string) => (typeof body[k] === 'number' && Number.isFinite(body[k]) ? (body[k] as number) : NaN);
	const result = (c: ClubState, msg: string, ledger: LedgerLine[] = []): ActionResult => ({ club: c, market, ledger, transfers: [], message: msg });
	switch (body.action) {
		case 'oferta': {
			const kind = str('kind');
			if (!['compra', 'emprestimo', 'livre'].includes(kind)) throw new ManagementError('Tipo de proposta inválido.');
			const role = str('role');
			if (!ROLES.has(role)) throw new ManagementError('Participação inválida.');
			const fee = kind === 'compra' ? num('fee') : 0;
			const wage = num('wage');
			const years = num('years');
			if (!Number.isFinite(fee) || fee < 0 || fee > 2e9) throw new ManagementError('Valor da proposta inválido.');
			if (kind !== 'emprestimo' && (!Number.isFinite(wage) || wage < 500 || wage > 1e8)) throw new ManagementError('Salário inválido.');
			if (!Number.isInteger(years) || years < 1 || years > 5) throw new ManagementError('Duração inválida (1 a 5 temporadas).');
			const share = kind === 'emprestimo' ? num('wageShare') : 1;
			if (kind === 'emprestimo' && (!Number.isFinite(share) || share < 0 || share > 1)) throw new ManagementError('Divisão de salário inválida.');
			return makeOffer(club, market, ctx, { playerId: str('playerId'), fee, kind: kind as 'compra', wage: kind === 'emprestimo' ? 0 : wage, years, role: role as 'titular', wageShare: share }, /^[a-f0-9-]{36}$/i.test(str('operation')) ? str('operation') : undefined);
		}
		case 'responder':
			return answerIncoming(club, market, ctx, str('offerId'), body.accept === true);
		case 'renovar': {
			const role = str('role');
			if (!ROLES.has(role)) throw new ManagementError('Participação inválida.');
			return renewContract(club, market, ctx, str('playerId'), num('wage'), num('years'), role as 'titular');
		}
		case 'rescindir':
			return releasePlayer(club, market, ctx, str('playerId'));
		case 'listar': {
			const id = str('playerId');
			const roster = rosterOf(ctx.roster, ctx.clubId);
			if (!roster.some((p) => p.id === id)) throw new ManagementError('Atleta não está no elenco.');
			const listed = market.listed.includes(id) ? market.listed.filter((x) => x !== id) : [...market.listed, id].slice(-30);
			return { ...result(club, market.listed.includes(id) ? 'Atleta retirado da lista de vendas.' : 'Atleta colocado à venda.'), market: { ...market, listed } };
		}
		case 'observar': {
			const id = str('playerId');
			if (!id || id.length > 100) throw new ManagementError('Atleta inválido.');
			const saved = market.shortlist.includes(id);
			const observe = typeof body.value === 'boolean' ? body.value : !saved;
			if (observe && !saved && !findPlayer(ctx.roster, id)) throw new ManagementError('Atleta indisponível.');
			const shortlist = observe ? saved ? market.shortlist : [...market.shortlist, id].slice(-40) : market.shortlist.filter((x) => x !== id);
			return { ...result(club, 'Lista de observação atualizada.'), market: { ...market, shortlist } };
		}
		case 'patrocinio':
			return result(signSponsor(club, ctx.season, str('offerId')), 'Contrato de patrocínio assinado.');
		case 'obra': {
			const f = str('facility');
			if (!FAC.has(f)) throw new ManagementError('Área inválida.');
			const r = startUpgrade(club, f as Facility, ctx.tier);
			return result(r.state, 'Obra iniciada.', r.ledger);
		}
		case 'ingresso':
			return result(setTicketPrice(club, num('price'), TICKET_REF[ctx.tier]), 'Preço do ingresso atualizado.');
		case 'olheiro-contratar':
			return result(hireScout(club, ctx.seed, ctx.season, str('scoutId')), 'Olheiro contratado.');
		case 'olheiro-missao': {
			const region = str('region');
			const position = str('position');
			if (!REGIONS_OK.has(region) || !POSITIONS.has(position)) throw new ManagementError('Missão inválida.');
			const weeks = Number.isFinite(num('weeks')) ? num('weeks') : 0;
			return result(assignScout(club, str('scoutId'), region as Region, position as Position, num('maxAge'), weeks), weeks ? `Missão de ${weeks} semanas iniciada.` : 'Missão do olheiro atualizada.');
		}
		case 'olheiro-dispensar':
			return result(fireScout(club, str('scoutId')), 'Olheiro dispensado.');
		case 'base-promover':
			return promote(club, market, ctx, str('youthId'));
		case 'base-dispensar':
			return result(dismissYouth(club, str('youthId')), 'Jovem dispensado da base.');
		default:
			throw new ManagementError('Ação desconhecida.');
	}
}

export { CUP_PHASES };
