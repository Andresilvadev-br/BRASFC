import { catalogClub } from '#lib/data/roster-catalog.ts';
import { COACH_PROFILES, type CoachStyleId } from '#lib/engine/ai-coach.ts';
import type { Career } from '#lib/domain/career.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { coachFormation } from '#lib/domain/coaches.ts';
import { divisionOf, divisionStandings, type DivisionId, type LeagueState, type StoredRoundResult } from '#lib/domain/league.ts';
import type { ClubState } from '#lib/domain/management.ts';
import { formatMoney, rosterOf, tierOfDivision } from '#lib/domain/market.ts';
import { coachOffers, maybeMeeting, maybePress, recordGame, sanitizeOffice, type BoardSnapshot, type OfficeState } from '#lib/domain/office.ts';
import type { FormationId } from '#lib/domain/tactics.ts';
import { divLabel, initialUniverse, sanitizeUniverse, universeAfterRound, universeSeasonEnd, type NewsItem, type UniverseState } from '#lib/domain/universe.ts';
import { rosterContext } from '#lib/domain/world.ts';

/**
 * Integração do universo vivo e do gabinete do treinador com o processamento das rodadas
 * (Dev 0.5). Tudo aqui roda no SERVIDOR e é salvo na mesma transação da rodada.
 */
export type Msg = { subject: string; body: string; important?: boolean; sender?: string };

export function formationForFactory(career: Career, league: LeagueState): (clubId: string, style: CoachStyleId) => FormationId {
	const ctx = rosterContext(career, league);
	return (clubId, style) => coachFormation(COACH_PROFILES[style], rosterOf(ctx, clubId));
}

/** Universo salvo ou, em saves anteriores à 0.5, criado agora a partir das divisões atuais. */
export function ensureUniverse(career: Career, league: LeagueState): UniverseState {
	const u = sanitizeUniverse(career.data.universe);
	if (u) return u;
	const formationFor = formationForFactory(career, league);
	return initialUniverse({
		seed: career.seed,
		season: career.season,
		firstSeason: career.data.firstSeason ?? career.season,
		divisions: league.divisions as Record<string, string[]>,
		userClub: career.mode === 'coach' ? career.clubId : null,
		formationFor: (id, style) => catalogClub(career.data.rosterCatalog, id)?.formation ?? formationFor(id, style),
		coachNameFor: (id) => catalogClub(career.data.rosterCatalog, id)?.coach
	});
}

export function tablesOf(league: LeagueState, results: StoredRoundResult[]): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const div of Object.keys(league.divisions)) out[div] = divisionStandings(league, div as DivisionId, results).map((r) => r.clubId);
	return out;
}

/** Notícias novas que valem uma mensagem na caixa do usuário (sem spam: no máximo duas por passo). */
export function inboxWorthy(before: UniverseState, after: UniverseState, userClub: string, userDivision: string | null, nextOpponent: string | null): Msg[] {
	const known = new Set(before.news.map((n) => n.id));
	const fresh = after.news.filter((n) => !known.has(n.id));
	const relevant = (n: NewsItem) => n.clubs.includes(userClub) || (nextOpponent && n.clubs.includes(nextOpponent)) || n.importance >= 3 || (n.importance >= 2 && userDivision && n.clubs.some((c) => after.clubs[c] && n.body.includes(divLabel(userDivision))));
	return fresh
		.filter(relevant)
		.sort((a, b) => b.importance - a.importance)
		.slice(0, 2)
		.map((n) => ({ sender: 'Imprensa esportiva', subject: n.title, body: n.body, important: n.importance >= 3 || n.clubs.includes(userClub) }));
}

export function universeAfterStep(u: UniverseState, career: Career, league: LeagueState, opts: { round: number; league: boolean; seasonResults: StoredRoundResult[]; newResults: Array<{ home: string; away: string; homeGoals: number; awayGoals: number; competition: string }>; strengthOf: (id: string) => number }): UniverseState {
	return universeAfterRound(u, {
		seed: career.seed,
		season: career.season,
		round: opts.round,
		league: opts.league,
		results: opts.newResults,
		tables: opts.league ? tablesOf(league, opts.seasonResults) : {},
		divisionOf: (id) => divisionOf(league, id),
		strengthOf: opts.strengthOf,
		userClub: career.mode === 'coach' ? career.clubId : null,
		formationFor: formationForFactory(career, league)
	});
}

export function officeOf(career: Career, club: ClubState, league: LeagueState): OfficeState {
	return sanitizeOffice(career.data.office, career.season, tierOfDivision(divisionOf(league, career.clubId)), club.coachReputation);
}

export interface OfficeStepInput {
	career: Career;
	league: LeagueState;
	office: OfficeState;
	club: ClubState;
	universe: UniverseState;
	round: number;
	isLeague: boolean;
	totalRounds: number;
	seasonResults: StoredRoundResult[];
	userMatch: { home: string; away: string; homeGoals: number; awayGoals: number; competition: string } | null;
	nextOpponent: string | null;
	nextDecisive: boolean;
	signedBig: string | null;
}

/**
 * Semana do gabinete: jogos e marcos, ultimato da diretoria, reuniões e coletivas.
 * Devolve o estado novo e as mensagens; a confiança da diretoria muda dentro de `club`.
 */
export function officeStep(i: OfficeStepInput): { office: OfficeState; club: ClubState; universe: UniverseState; news: Msg[] } {
	const office: OfficeState = structuredClone(i.office);
	const club: ClubState = structuredClone(i.club);
	const universe: UniverseState = structuredClone(i.universe);
	const news: Msg[] = [];
	const me = i.career.clubId;
	const division = divisionOf(i.league, me);
	if (i.userMatch) {
		const m = i.userMatch;
		const home = m.home === me;
		const gf = home ? m.homeGoals : m.awayGoals;
		const ga = home ? m.awayGoals : m.homeGoals;
		for (const ms of recordGame(office, i.career.season, i.round, gf, ga, { clubId: me, opponent: home ? m.away : m.home, competition: m.competition })) {
			news.push({ sender: 'Assessoria do treinador', subject: `Marco: ${ms.label}`, body: ms.detail, important: false });
			universe.news.push({ id: `${i.career.season}:${i.round}:usuario:${ms.key}`, season: i.career.season, round: i.round, kind: 'usuario', title: `${i.career.personName}: ${ms.label.toLowerCase()}`, body: ms.detail, clubs: [me], tone: 'boa', importance: 1 });
		}
	}
	// Demissão nesta semana: propostas coerentes vindas do universo (clubes com vaga ou insatisfeitos).
	if (club.board.dismissed && !(i.career.data.club as ClubState | undefined)?.board?.dismissed) {
		office.history.push({ season: i.career.season, clubId: me, division, position: null, outcome: 'demitido', games: 0, wins: 0, draws: 0, losses: 0, reputation: club.coachReputation });
		club.jobOffers = coachOffers(i.career.seed, i.career.season, i.round, club.coachReputation, me, universe, i.league.divisions as Record<string, string[]>, { dismissed: true, tierOf: (d) => tierOfDivision(d) }).map((x) => ({ id: x.id, clubId: x.clubId, division: x.division, reason: `${x.reason} Projeto: ${x.project.toLowerCase()}. Salário de ${formatMoney(x.wage)} por mês, ${x.years} temporada(s).`, expiresSeason: i.career.season + 1, wage: x.wage, years: x.years, project: x.project }));
	}
	if (!i.isLeague || club.board.dismissed) return { office, club, universe, news };
	const table = division ? divisionStandings(i.league, division as DivisionId, i.seasonResults) : [];
	const row = table.find((r) => r.clubId === me);
	// Ultimato: promessa feita na reunião de advertência.
	if (office.ultimatum && office.ultimatum.season === i.career.season && i.round >= office.ultimatum.untilRound) {
		const gained = (row?.points ?? 0) - office.ultimatum.startPoints;
		const ok = gained >= office.ultimatum.points;
		club.board.confidence = Math.max(0, Math.min(100, club.board.confidence + (ok ? 10 : -15)));
		office.decisions.push({ season: i.career.season, round: i.round, kind: 'ultimato', choice: ok ? 'cumprido' : 'descumprido', effect: `${gained} de ${office.ultimatum.points} pontos` });
		news.push({ sender: `Diretoria — ${getClub(me)?.name ?? me}`, subject: ok ? 'Promessa cumprida' : 'Promessa não cumprida', body: ok ? `${gained} pontos nas últimas rodadas. A diretoria reconhece a reação (+10 de confiança).` : `Só ${gained} de ${office.ultimatum.points} pontos prometidos. A paciência acabou (−15 de confiança).`, important: true });
		office.ultimatum = null;
	}
	// Reunião ignorada por 5 rodadas: a diretoria decide sozinha e registra o desgaste.
	if (office.meeting && (office.meeting.season !== i.career.season || i.round - office.meeting.round >= 5)) {
		club.board.confidence = Math.max(0, club.board.confidence - 3);
		office.decisions.push({ season: i.career.season, round: i.round, kind: office.meeting.kind, choice: 'sem-resposta', effect: 'Reunião ignorada: a diretoria decidiu sem você (−3 de confiança).' });
		news.push({ sender: `Diretoria — ${getClub(me)?.name ?? me}`, subject: 'Reunião sem resposta', body: 'Sem retorno do treinador, a diretoria decidiu sozinha. A relação ficou desgastada (−3 de confiança).', important: true });
		office.meeting = null;
	}
	if (office.press && (office.press.season !== i.career.season || i.round - office.press.round >= 3)) {
		office.decisions.push({ season: i.career.season, round: i.round, kind: 'coletiva', choice: 'cancelada', effect: 'Coletiva cancelada: a imprensa ficou sem respostas.' });
		club.coachReputation = Math.max(1, club.coachReputation - 0.5);
		office.press = null;
	}
	const objective = club.board.objectives[0]?.label ?? null;
	const snap: BoardSnapshot = { profile: club.board.profile, confidence: club.board.confidence, round: i.round, season: i.career.season, totalRounds: i.totalRounds, points: row?.points ?? 0, position: row?.position ?? null, objectiveLabel: objective, contractEnding: office.contract.until <= i.career.season };
	const meeting = maybeMeeting(office, snap);
	if (meeting) {
		office.meeting = meeting;
		office.lastMeeting[meeting.kind] = i.career.season * 100 + i.round;
		news.push({ sender: `Diretoria — ${getClub(me)?.name ?? me}`, subject: meeting.title, body: `${meeting.context} Responda no painel da carreira.`, important: true });
	}
	const form = universe.clubs[me]?.form ?? '';
	const press = maybePress(office, { season: i.career.season, round: i.round, clubId: me, nextOpponent: i.nextOpponent, form, signedBig: i.signedBig, boardWarning: meeting?.kind === 'advertencia', decisive: i.nextDecisive }, universe);
	if (press) {
		office.press = press;
		office.lastPress = i.career.season * 100 + i.round;
		news.push({ sender: 'Assessoria de imprensa', subject: press.title, body: 'Os jornalistas aguardam suas respostas. As falas repercutem na torcida e na diretoria.', important: false });
	}
	return { office, club, universe, news };
}

/** Fim de temporada do gabinete: histórico, contrato e mercado de treinadores. */
export function officeSeasonEnd(o: { career: Career; office: OfficeState; club: ClubState; universe: UniverseState; division: string | null; position: number | null; outcome: 'campeao' | 'acesso' | 'queda' | 'permanece'; next: LeagueState }): { office: OfficeState; club: ClubState; news: Msg[] } {
	const office = structuredClone(o.office);
	const club = structuredClone(o.club);
	const news: Msg[] = [];
	const t = office.totals;
	const prev = office.history.filter((h) => h.clubId === o.career.clubId);
	const sum = (k: 'games' | 'wins' | 'draws' | 'losses') => prev.reduce((s, h) => s + h[k], 0);
	// Demissão no meio da temporada já abriu a linha deste ano: completa-a (sem duplicar).
	const openIdx = office.history.findIndex((h) => h.season === o.career.season && h.clubId === o.career.clubId && h.outcome === 'demitido' && h.games === 0);
	const others = office.history.filter((_, k) => k !== openIdx);
	const games = t.games - others.reduce((s, h) => s + h.games, 0);
	const wins = t.wins - others.reduce((s, h) => s + h.wins, 0);
	const draws = t.draws - others.reduce((s, h) => s + h.draws, 0);
	void sum;
	const row = { season: o.career.season, clubId: o.career.clubId, division: o.division, position: o.position, outcome: club.board.dismissed ? ('demitido' as const) : o.outcome, games, wins, draws, losses: Math.max(0, games - wins - draws), reputation: club.coachReputation };
	if (openIdx >= 0) office.history[openIdx] = row;
	else office.history.push(row);
	if (o.outcome === 'campeao') office.milestones.push({ key: `titulo-${o.career.season}-${o.division}`, season: o.career.season, round: 99, label: `Campeão da ${divLabel(o.division ?? '')}`, detail: `${getClub(o.career.clubId)?.name ?? ''} ${o.career.season}` });
	if (o.outcome === 'acesso') office.milestones.push({ key: `acesso-${o.career.season}`, season: o.career.season, round: 99, label: 'Acesso conquistado', detail: `${getClub(o.career.clubId)?.name ?? ''} sobe de divisão` });
	// Contrato: terminou sem renovação → o treinador sai e recebe propostas coerentes.
	if (!club.board.dismissed && office.contract.until <= o.career.season) {
		club.board.dismissed = true;
		news.push({ sender: `Diretoria — ${getClub(o.career.clubId)?.name ?? ''}`, subject: 'Fim de contrato', body: 'Seu contrato chegou ao fim sem renovação. Avalie as propostas de outros clubes.', important: true });
	}
	if (club.board.dismissed) {
		const offers = coachOffers(o.career.seed, o.career.season + 1, 0, club.coachReputation, o.career.clubId, o.universe, o.next.divisions as Record<string, string[]>, { dismissed: true, tierOf: (d) => tierOfDivision(d) });
		club.jobOffers = offers.map((x) => ({ id: x.id, clubId: x.clubId, division: x.division, reason: `${x.reason} Projeto: ${x.project.toLowerCase()}. Salário de ${formatMoney(x.wage)} por mês, ${x.years} temporada(s).`, expiresSeason: o.career.season + 1, wage: x.wage, years: x.years, project: x.project }));
	}
	return { office, club, news };
}

export function universeAtSeasonEnd(u: UniverseState, career: Career, league: LeagueState, o: { tables: Record<string, string[]>; points: Record<string, { points: number; games: number }>; champions: Record<string, string>; promoted: string[]; relegated: string[]; next: LeagueState; cupChampion: string | null }): UniverseState {
	return universeSeasonEnd(u, {
		seed: career.seed,
		season: career.season,
		tables: o.tables,
		points: o.points,
		champions: o.champions,
		promoted: o.promoted,
		relegated: o.relegated,
		next: o.next.divisions as Record<string, string[]>,
		cupChampion: o.cupChampion,
		userClub: career.mode === 'coach' ? career.clubId : null,
		formationFor: formationForFactory({ ...career, season: o.next.season }, o.next)
	});
}

/** O treinador trocou de clube: o clube antigo contrata um técnico da IA; o técnico do novo fica livre. */
export function universeCoachMove(u: UniverseState, career: Career, league: LeagueState, from: string, to: string): UniverseState {
	const next = structuredClone(u);
	const target = next.clubs[to];
	if (target?.coachId) {
		const c = next.coaches[target.coachId];
		if (c) next.coaches[c.id] = { ...c, clubId: null, history: [...c.history, { season: career.season, clubId: to, division: divisionOf(league, to), position: null, outcome: 'demitido' }] };
		target.coachId = null;
	}
	const old = next.clubs[from];
	if (old && !old.coachId) {
		const free = Object.values(next.coaches)
			.filter((c) => !c.clubId && c.age < 70)
			.sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))
			.find((c) => c.reputation <= 40 + (getClub(from)?.reputation ?? 2) * 8);
		if (free) {
			next.coaches[free.id] = { ...free, clubId: from, since: career.season };
			old.coachId = free.id;
			old.formation = formationForFactory(career, league)(from, free.style);
			old.mastery[old.formation] = Math.max(old.mastery[old.formation] ?? 0, 42);
			old.confidence = 62;
		}
	}
	next.news.push({ id: `${career.season}:troca:${from}:${to}`, season: career.season, round: 0, kind: 'usuario', title: `${career.personName} assume o ${getClub(to)?.name ?? to}`, body: `Deixa o ${getClub(from)?.name ?? from}${old?.coachId ? `, que contrata ${next.coaches[old.coachId]?.name}` : ''}.`, clubs: [to, from], tone: 'neutra', importance: 2 });
	return next;
}
