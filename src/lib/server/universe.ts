import { catalogClub, fixedOpeningFormation } from '#lib/data/roster-catalog.ts';
import { COACH_PROFILES, type CoachStyleId } from '#lib/engine/ai-coach.ts';
import type { Career } from '#lib/domain/career.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { coachFormation } from '#lib/domain/coaches.ts';
import { divisionOf, divisionStandings, type DivisionId, type LeagueState, type StoredRoundResult } from '#lib/domain/league.ts';
import type { ClubState } from '#lib/domain/management.ts';
import { formatMoney, rosterOf, tierOfDivision } from '#lib/domain/market.ts';
import { coachOffers, coachWage, seasonRow, maybeMeeting, maybePress, recordGame, sanitizeOffice, type BoardSnapshot, type OfficeState } from '#lib/domain/office.ts';
import type { FormationId } from '#lib/domain/tactics.ts';
import { divLabel, initialUniverse, sanitizeUniverse, universeAfterRound, universeSeasonEnd, type NewsItem, type UniverseState } from '#lib/domain/universe.ts';
import { rosterContext } from '#lib/domain/world.ts';
import { isUnemployed, markUnemployed, mergeOffers, offerWindowRounds, openOffers, pruneOffers, renewalVerdict, unemployedOfferDue, windowInterest } from '#lib/domain/employment.ts';
import { payroll } from '#lib/domain/management.ts';
import { persistOffer } from './coach-market.ts';

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
		userClub: career.mode === 'coach' && !isUnemployed(career) ? career.clubId : null,
		formationFor: (id, style) => {
			const roster = catalogClub(career.data.rosterCatalog, id);
			return (roster && fixedOpeningFormation(career.data.rosterCatalog, roster)) ?? formationFor(id, style);
		},
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
		userClub: career.mode === 'coach' && !isUnemployed(career) ? career.clubId : null,
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
	/** última rodada de liga disputada (passos de Copa) */
	leagueRound?: number;
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
	const marketRound = i.isLeague ? i.round : Math.max(0, (i.leagueRound ?? 0));
	const offerKey = i.career.season * 100 + marketRound;
	const divisions = i.league.divisions as Record<string, string[]>;
	const tierOf = (d: string) => tierOfDivision(d);
	const wasUnemployed = !!(i.career.data.club as ClubState | undefined)?.board?.dismissed;
	// Demissão nesta semana: o vínculo termina, o clube antigo volta para a IA e chegam propostas coerentes.
	if (club.board.dismissed && !wasUnemployed) {
		office.history.push(seasonRow(office, { season: i.career.season, clubId: me, division, position: null, outcome: 'demitido', reputation: club.coachReputation }));
		Object.assign(office, markUnemployed(office, i.career.season, marketRound, 'demitido'));
		office.decisions.push({ season: i.career.season, round: marketRound, kind: 'vinculo', choice: 'demitido', effect: `Demitido do ${getClub(me)?.name ?? me}.` });
		const offers = coachOffers(i.career.seed, i.career.season, marketRound, club.coachReputation, me, universe, divisions, { dismissed: true, tierOf })
			.map((x) => persistOffer(i.career, i.league, x, { season: i.career.season, round: marketRound, source: 'demissao', expiresSeason: i.career.season, expiresRound: marketRound + 5 }));
		club.jobOffers = mergeOffers([], offers, i.career.season, marketRound);
		office.lastOfferAt = offerKey;
		if (offers.length) office.offerAlert = { season: i.career.season, round: marketRound, ids: offers.map((o) => o.id) };
		Object.assign(universe, universeAppointCoach(universe, i.career, i.league, me));
		return { office, club, universe, news };
	}
	// Sem clube: o mundo segue; propostas expiram e novas oportunidades surgem a cada poucas rodadas.
	if (club.board.dismissed) {
		club.jobOffers = pruneOffers(club.jobOffers, i.career.season, marketRound);
		const last = office.lastOfferAt !== undefined && Math.floor(office.lastOfferAt / 100) === i.career.season ? office.lastOfferAt % 100 : null;
		if (i.isLeague && !openOffers(club.jobOffers, i.career.season, marketRound).length && unemployedOfferDue(i.career.seed, i.career.season, marketRound, last)) {
			const offers = coachOffers(i.career.seed, i.career.season, marketRound, club.coachReputation, me, universe, divisions, { dismissed: true, tierOf })
				.map((x) => persistOffer(i.career, i.league, x, { season: i.career.season, round: marketRound, source: 'desemprego', expiresSeason: i.career.season, expiresRound: marketRound + 5 }));
			club.jobOffers = mergeOffers(club.jobOffers, offers, i.career.season, marketRound);
			office.lastOfferAt = offerKey;
			if (offers.length) {
				office.offerAlert = { season: i.career.season, round: marketRound, ids: offers.map((o) => o.id) };
				news.push({ sender: 'Empresário', subject: 'Novas oportunidades de trabalho', body: `${offers.map((o) => getClub(o.clubId)?.name ?? o.clubId).join(', ')} procuram treinador. Veja a Central de Propostas.`, important: true });
			}
		}
		return { office, club, universe, news };
	}
	club.jobOffers = pruneOffers(club.jobOffers, i.career.season, marketRound);
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
	// Mercado de treinadores: três janelas na temporada (~25%, ~60%, ~85%). Clubes podem sondar, ou não.
	const windowKey = `${i.career.season}:${i.round}`;
	if (offerWindowRounds(i.totalRounds).includes(i.round) && !(office.offerWindows ?? []).includes(windowKey)) {
		office.offerWindows = [...(office.offerWindows ?? []), windowKey].slice(-12);
		const n = windowInterest(i.career.seed, i.career.season, i.round, { reputation: club.coachReputation, confidence: club.board.confidence, position: row?.position ?? null, size: table.length });
		const offers = n ? coachOffers(i.career.seed, i.career.season, i.round, club.coachReputation, me, universe, divisions, { dismissed: false, tierOf })
			.slice(0, n)
			.map((x) => persistOffer(i.career, i.league, x, { season: i.career.season, round: i.round, source: 'janela', expiresSeason: i.career.season, expiresRound: i.round + 4 })) : [];
		const before = new Set(club.jobOffers.map((o) => o.id));
		club.jobOffers = mergeOffers(club.jobOffers, offers, i.career.season, i.round);
		const added = club.jobOffers.filter((o) => !before.has(o.id));
		if (added.length) {
			office.lastOfferAt = offerKey;
			office.offerAlert = { season: i.career.season, round: i.round, ids: added.map((o) => o.id) };
			news.push({ sender: 'Empresário', subject: 'Clubes interessados em você', body: `${added.map((o) => getClub(o.clubId)?.name ?? o.clubId).join(', ')} sondaram seu nome. As propostas valem até a rodada ${i.round + 4}.`, important: true });
		}
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
export function officeSeasonEnd(o: { career: Career; office: OfficeState; club: ClubState; universe: UniverseState; division: string | null; position: number | null; outcome: 'campeao' | 'acesso' | 'queda' | 'permanece'; next: LeagueState; monthlyWages?: number }): { office: OfficeState; club: ClubState; news: Msg[] } {
	const office = structuredClone(o.office);
	const club = structuredClone(o.club);
	const news: Msg[] = [];
	// A linha da temporada só é aberta para quem termina o ano no comando; saídas no meio do ano
	// (demissão ou troca de clube) já registraram a sua linha com os jogos daquele período.
	if (!club.board.dismissed) {
		const openIdx = office.history.findIndex((h) => h.season === o.career.season && h.clubId === o.career.clubId && h.outcome === 'demitido' && h.games === 0);
		if (openIdx >= 0) office.history.splice(openIdx, 1);
		office.history.push(seasonRow(office, { season: o.career.season, clubId: o.career.clubId, division: o.division, position: o.position, outcome: o.outcome, reputation: club.coachReputation }));
		if (o.outcome === 'campeao') office.milestones.push({ key: `titulo-${o.career.season}-${o.division}`, season: o.career.season, round: 99, label: `Campeão da ${divLabel(o.division ?? '')}`, detail: `${getClub(o.career.clubId)?.name ?? ''} ${o.career.season}` });
		if (o.outcome === 'acesso') office.milestones.push({ key: `acesso-${o.career.season}`, season: o.career.season, round: 99, label: 'Acesso conquistado', detail: `${getClub(o.career.clubId)?.name ?? ''} sobe de divisão` });
	} else {
		// Saves anteriores à 2.0 abriam a linha da demissão com zero jogos e a completavam aqui.
		const idx = office.history.findIndex((h) => h.season === o.career.season && h.clubId === o.career.clubId && h.outcome === 'demitido' && h.games === 0);
		if (idx >= 0) office.history[idx] = seasonRow({ totals: office.totals, history: office.history.filter((_, k) => k !== idx) }, { season: o.career.season, clubId: o.career.clubId, division: o.division, position: o.position, outcome: 'demitido', reputation: club.coachReputation });
	}
	const clubName = getClub(o.career.clubId)?.name ?? '';
	const sender = `Diretoria — ${clubName}`;
	// Fim do vínculo nesta temporada: recusa explícita prevalece; renovação automática depende da diretoria.
	if (!club.board.dismissed && office.contract.until <= o.career.season) {
		const declined = office.renewalDeclinedSeason === o.career.season;
		if (!declined && office.autoRenewal) {
			const objective = club.board.objectives.find((x) => x.kind === 'liga-posicao' || x.kind === 'acesso' || x.kind === 'permanencia');
			const objectiveMet = !objective || o.position === null ? null : objective.kind === 'permanencia' ? o.outcome !== 'queda' : objective.kind === 'acesso' ? o.outcome === 'acesso' || o.outcome === 'campeao' : o.position <= objective.target;
			const verdict = renewalVerdict({ confidence: club.board.confidence, outcome: o.outcome, objectiveMet, balance: club.balance, monthlyWages: o.monthlyWages ?? 0, reputation: club.coachReputation, profile: club.board.profile });
			if (verdict.approved) {
				const nextTier = tierOfDivision(divisionOf(o.next, o.career.clubId));
				office.contract = { until: o.career.season + verdict.years, wage: Math.round((coachWage(nextTier, club.coachReputation) * verdict.wageFactor) / 1000) * 1000 };
				office.decisions.push({ season: o.career.season, round: 99, kind: 'renovacao-automatica', choice: 'aprovada', effect: `Renovado até ${office.contract.until}. ${verdict.reasons.join(', ')}.` });
				news.push({ sender, subject: 'Contrato renovado automaticamente', body: `A diretoria aprovou a renovação até ${office.contract.until} (${formatMoney(office.contract.wage)} por mês). Pesou na decisão: ${verdict.reasons.join(', ') || 'a confiança no seu trabalho'}. Você permanece no comando.`, important: true });
			} else {
				office.decisions.push({ season: o.career.season, round: 99, kind: 'renovacao-automatica', choice: 'recusada', effect: `Diretoria recusou: ${verdict.reasons.join(', ') || 'confiança insuficiente'}.` });
				news.push({ sender, subject: 'Renovação automática recusada', body: `A diretoria não aceitou renovar. ${verdict.reasons.length ? `Pesou na decisão: ${verdict.reasons.join(', ')}.` : 'A confiança no trabalho não foi suficiente.'}`, important: true });
			}
		}
	}
	// Contrato expirado: o treinador sai, o histórico registra a saída e a Central de Propostas assume.
	if (!club.board.dismissed && office.contract.until <= o.career.season) {
		club.board.dismissed = true;
		Object.assign(office, markUnemployed(office, o.career.season, 99, 'fim-contrato'));
		const declined = office.renewalDeclinedSeason === o.career.season;
		office.decisions.push({ season: o.career.season, round: 99, kind: 'vinculo', choice: 'contrato-expirado', effect: `Contrato com o ${clubName} encerrado${declined ? ' após a sua recusa em renovar' : ''}.` });
		office.milestones.push({ key: `saida-${o.career.season}-${o.career.clubId}`, season: o.career.season, round: 99, label: `Saída do ${clubName}`, detail: declined ? 'Você decidiu não renovar.' : 'Contrato encerrado sem renovação.' });
		news.push({ sender, subject: 'Fim de contrato', body: `Seu contrato com o ${clubName} chegou ao fim${declined ? ', como você decidiu' : ' sem renovação'}. Você está sem clube: avalie as propostas na Central de Propostas.`, important: true });
	}
	if (club.board.dismissed) {
		const source = office.unemployedSince?.reason === 'fim-contrato' && office.unemployedSince.season === o.career.season ? 'fim-contrato' as const : 'temporada' as const;
		const offers = coachOffers(o.career.seed, o.career.season + 1, 0, club.coachReputation, o.career.clubId, o.universe, o.next.divisions as Record<string, string[]>, { dismissed: true, tierOf: (d) => tierOfDivision(d) })
			.map((x) => persistOffer({ ...o.career, season: o.career.season + 1 }, o.next, x, { season: o.career.season + 1, round: 0, source, expiresSeason: o.career.season + 1, expiresRound: 6 }));
		club.jobOffers = mergeOffers(pruneOffers(club.jobOffers, o.career.season + 1, 0), offers, o.career.season + 1, 0);
		office.lastOfferAt = (o.career.season + 1) * 100;
		if (offers.length) office.offerAlert = { season: o.career.season + 1, round: 0, ids: offers.map((x) => x.id) };
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
		userClub: career.mode === 'coach' && !isUnemployed(career) ? career.clubId : null,
		formationFor: formationForFactory({ ...career, season: o.next.season }, o.next)
	});
}

/** O clube que o treinador deixou volta para a IA: contrata um técnico livre compatível com o porte. */
export function universeAppointCoach(u: UniverseState, career: Career, league: LeagueState, from: string): UniverseState {
	const next = structuredClone(u);
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
			next.news.push({ id: `${career.season}:sucessor:${from}:${free.id}`, season: career.season, round: 0, kind: 'contratacao', title: `${free.name} é o novo técnico do ${getClub(from)?.name ?? from}`, body: `Assume o lugar de ${career.personName}.`, clubs: [from], tone: 'neutra', importance: 1 });
		}
	}
	return next;
}

/** O treinador trocou de clube: o clube antigo contrata um técnico da IA; o técnico do novo fica livre. */
export function universeCoachMove(u: UniverseState, career: Career, league: LeagueState, from: string, to: string): UniverseState {
	let next = structuredClone(u);
	const target = next.clubs[to];
	if (target?.coachId) {
		const c = next.coaches[target.coachId];
		if (c) next.coaches[c.id] = { ...c, clubId: null, history: [...c.history, { season: career.season, clubId: to, division: divisionOf(league, to), position: null, outcome: 'demitido' }] };
		target.coachId = null;
	}
	next = universeAppointCoach(next, career, league, from);
	const old = next.clubs[from];
	next.news.push({ id: `${career.season}:troca:${from}:${to}`, season: career.season, round: 0, kind: 'usuario', title: `${career.personName} assume o ${getClub(to)?.name ?? to}`, body: `Deixa o ${getClub(from)?.name ?? from}${old?.coachId ? `, que contrata ${next.coaches[old.coachId]?.name}` : ''}.`, clubs: [to, from], tone: 'neutra', importance: 2 });
	return next;
}
