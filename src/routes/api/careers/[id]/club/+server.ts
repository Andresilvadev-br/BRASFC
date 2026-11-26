import { error } from '@sveltejs/kit';
import { careerWorld } from '#lib/domain/career.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { divisionOf, isActiveClub, sanitizeLeague } from '#lib/domain/league.ts';
import { initialClubState } from '#lib/domain/management.ts';
import { ManagementError, sanitizeMarket } from '#lib/domain/management.ts';
import { careerView } from '#lib/domain/view.ts';
import { clubStateOf, rosterContext } from '#lib/domain/world.ts';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { actionContext, applyAction } from '#lib/server/management.ts';
import { applyOfficeAction, OFFICE_ACTIONS } from '#lib/server/office-actions.ts';
import { ensureUniverse, officeOf, universeCoachMove } from '#lib/server/universe.ts';
import { coachWage, seasonRow } from '#lib/domain/office.ts';
import { currentClubOf, formatMoney, tierOfDivision } from '#lib/domain/market.ts';
import { openDeal, TurnError } from '#lib/server/local-turns.ts';
import { isOfferOpen } from '#lib/domain/employment.ts';
import { initialDiscipline } from '#lib/domain/discipline.ts';
import { boardObjectivesFor, clubPreview } from '#lib/server/coach-market.ts';
import { withWorldRoster } from '#lib/server/world-catalog.ts';
import { carryKnowledge } from '#lib/server/coach-knowledge.ts';
import { getCareer, saveCareerProgress, VersionConflictError } from '#lib/server/repos/careers.ts';
import { changeCareerClub, insertLedger, insertMessages, insertTransfers, listHistory, listLedger, listTransfers } from '#lib/server/repos/management.ts';
import { listResults } from '#lib/server/repos/matches.ts';
import { activeCoachId, clubOwner, isShared } from '#lib/domain/turns.ts';
import type { RequestHandler } from './$types';

/** Históricos da gestão: lançamentos da temporada, transferências e títulos. */
export const GET: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	const [ledger, transfers, history] = await Promise.all([listLedger(db, career.id, career.season, activeCoachId(career)), listTransfers(db, career.id), listHistory(db, career.id, activeCoachId(career))]);
	return noStore({ ledger, transfers, history });
};

/**
 * Ações de gestão (mercado, contratos, patrocínios, obras, ingresso, olheiros, base).
 * Tudo é validado no servidor; a versão da carreira impede ações duplicadas ou fora de ordem.
 */
export const POST: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	const body = (await readJson(event.request)) as Record<string, unknown>;
	const version = Number(body.version);
	if (!Number.isInteger(version)) error(400, 'Versão da carreira ausente.');
	if (version !== career.version) error(409, 'A carreira mudou em outra janela. Recarregue para continuar.');
	const league = sanitizeLeague(career.data.league, careerWorld(career), career.season);
	// Decisões de carreira (trocam o clube da carreira).
	if (body.action === 'emprego' || (typeof body.action === 'string' && body.action.startsWith('proposta-'))) {
		return careerDecision(db, profile.id, career, league, body);
	}
	// Dev 0.12: ações da carreira de jogador foram descontinuadas (o save legado fica guardado).
	if (career.mode !== 'coach') error(410, 'A carreira de jogador foi descontinuada na versão 0.12.');
	if (career.mode !== 'coach') error(403, 'Só o treinador gerencia o clube.');
	// 0.13: proposta por atleta de outro treinador humano → o controle passa ao vendedor (negociação local).
	if (body.action === 'oferta' && isShared(career) && body.kind !== 'livre') {
		const owner = currentClubOf(rosterContext(career, league), String(body.playerId ?? ''));
		if (owner && owner !== career.clubId && clubOwner(career, owner) >= 0) {
			try {
				const out = await openDeal(db, profile.id, career, body);
				return noStore({ career: out.career, message: out.message, handoff: true, deal: out.deal });
			} catch (e) {
				if (e instanceof TurnError) error(e.status, e.message);
				if (e instanceof VersionConflictError) error(409, e.message);
				throw e;
			}
		}
	}
	const club = clubStateOf(career, league);
	if (club.board.dismissed) error(409, 'Você não comanda mais o clube.');
	const view = careerView(career, await listResults(db, career.id, career.season));
	if (view.seasonOver) error(409, 'Temporada encerrada: inicie a próxima para negociar.');
	const roster = rosterContext(career, league);
	const ctx = actionContext(career, league, typeof body.playerId === 'string' && body.playerId.startsWith('world/') ? withWorldRoster(career, roster) : roster, view.nextRound);
	// Dev 0.5: gabinete (reuniões, coletivas, comissão, treinos delegados, plano da base).
	if (OFFICE_ACTIONS.has(String(body.action))) {
		try {
			const me = view.standings.find((r) => r.clubId === career.clubId);
			const out = applyOfficeAction(career, league, club, view.nextRound, me?.points ?? 0, me?.position ?? null, body);
			const key = `${career.season}:gabinete:${career.version}`;
			const updated = await db.transaction(async (tx) => {
				const saved = await saveCareerProgress(tx, profile.id, career.id, { gameDate: career.gameDate, data: { club: out.club, office: out.office } }, career.version);
				await insertLedger(tx, career.id, career.season, career.gameDate, out.ledger, key, activeCoachId(career));
				if (body.action === 'verba-solicitar' || body.action === 'verba-contraproposta') await insertMessages(tx, career.id, career.gameDate, [{ sender: 'Diretoria', subject: 'Reunião de orçamento', body: out.message, important: true }], activeCoachId(career));
				return saved;
			});
			return noStore({ career: updated, message: out.message });
		} catch (e) {
			if (e instanceof ManagementError) error(422, e.message);
			if (e instanceof VersionConflictError) error(409, e.message);
			throw e;
		}
	}
	try {
		const out = applyAction(club, sanitizeMarket(career.data.market), ctx, body);
		const key = `${career.season}:acao:${career.version}`;
		const updated = await db.transaction(async (tx) => {
			const saved = await saveCareerProgress(tx, profile.id, career.id, { gameDate: career.gameDate, data: { club: out.club, market: out.market } }, career.version);
			await insertLedger(tx, career.id, career.season, career.gameDate, out.ledger, key, activeCoachId(career));
			await insertTransfers(tx, career.id, career.season, career.gameDate, out.transfers, `${key}:t`);
			return saved;
		});
		return noStore({ career: updated, message: out.message, negotiation: out.negotiation ?? null });
	} catch (e) {
		if (e instanceof ManagementError) error(422, e.message);
		if (e instanceof VersionConflictError) error(409, e.message);
		throw e;
	}
};

async function careerDecision(db: Awaited<ReturnType<typeof getDb>>, profileId: string, career: NonNullable<Awaited<ReturnType<typeof getCareer>>>, league: ReturnType<typeof sanitizeLeague>, body: Record<string, unknown>) {
	if (career.mode !== 'coach') error(403, 'Propostas de emprego são para treinadores.');
	const offerId = typeof body.offerId === 'string' ? body.offerId : '';
	const club = clubStateOf(career, league);
	const results = await listResults(db, career.id, career.season);
	const view = careerView(career, results);
	const round = Math.max(0, view.nextRound - 1);
	const prevOffice = officeOf(career, club, league);
	const save = async (data: { club?: typeof club; office?: typeof prevOffice }, message: string) => {
		try {
			const updated = await saveCareerProgress(db, profileId, career.id, { gameDate: career.gameDate, data }, career.version);
			return noStore({ career: updated, message });
		} catch (e) {
			if (e instanceof VersionConflictError) error(409, e.message);
			throw e;
		}
	};
	if (body.action === 'proposta-vistas') return save({ office: { ...prevOffice, offerAlert: null } }, 'Propostas vistas.');
	const offer = club.jobOffers.find((o) => o.id === offerId);
	if (!offer || !isOfferOpen(offer, career.season, round)) error(422, 'Proposta indisponível ou expirada.');
	const clubName = getClub(offer.clubId)?.name ?? offer.clubId;
	if (body.action === 'emprego' && isShared(career) && clubOwner(career, offer.clubId) >= 0) error(422, `O ${clubName} é comandado por outro treinador desta carreira.`);
	if (body.action === 'proposta-recusar') {
		const jobOffers = club.jobOffers.map((o) => (o.id === offer.id ? { ...o, status: 'recusada' as const } : o));
		const office = { ...prevOffice, decisions: [...prevOffice.decisions, { season: career.season, round, kind: 'proposta', choice: 'recusada', effect: `Recusou a proposta do ${clubName}.` }].slice(-200), offerAlert: prevOffice.offerAlert ? { ...prevOffice.offerAlert, ids: prevOffice.offerAlert.ids.filter((id) => id !== offer.id) } : null };
		return save({ club: { ...club, jobOffers }, office }, `Você recusou a proposta do ${clubName}.`);
	}
	if (body.action === 'proposta-adiar') {
		if (offer.postponed) error(422, 'Esta proposta já foi adiada uma vez. Responda até o prazo.');
		if (typeof offer.expiresRound !== 'number') error(422, 'Esta proposta já vale até o fim da temporada.');
		const expiresRound = Math.min(offer.expiresRound + 3, Math.max(offer.expiresRound, view.rounds));
		const jobOffers = club.jobOffers.map((o) => (o.id === offer.id ? { ...o, postponed: true, expiresRound } : o));
		return save({ club: { ...club, jobOffers } }, `O ${clubName} aceitou esperar sua resposta até a rodada ${expiresRound}.`);
	}
	if (body.action !== 'emprego') error(400, 'Ação de proposta desconhecida.');
	if (league.selection && !isActiveClub(league, offer.clubId)) error(422, 'O clube está fora das divisões ativas desta carreira.');
	if (view.seasonOver) error(409, 'Temporada encerrada: inicie a próxima temporada antes de assinar.');
	if (body.confirm !== true) error(422, 'Confirme a assinatura do contrato.');
	const division = divisionOf(league, offer.clubId);
	const fresh = initialClubState(career.seed, offer.clubId, division, career.season);
	// O clube novo chega com os mesmos objetivos e orçamento da prévia mostrada antes da assinatura.
	const preview = clubPreview(career, league, results, offer.clubId, ensureUniverse(career, league));
	const objectives = boardObjectivesFor(career, league, offer.clubId, fresh);
	const next = { ...fresh, wageBudget: preview.finance.wageBudget, board: { ...fresh.board, objectives }, coachReputation: club.coachReputation, jobOffers: [] };
	const years = typeof body.years === 'number' && [1, 2, 3].includes(body.years) ? body.years : (offer.years ?? 2);
	const employed = !club.board.dismissed;
	const history = employed ? [...prevOffice.history, seasonRow(prevOffice, { season: career.season, clubId: career.clubId, division: divisionOf(league, career.clubId), position: view.standings.find((r) => r.clubId === career.clubId)?.position ?? null, outcome: 'saiu', reputation: club.coachReputation })] : prevOffice.history;
	const office = {
		...prevOffice,
		contract: { until: career.season + years - 1, wage: offer.wage ?? coachWage(tierOfDivision(division), club.coachReputation) },
		meeting: null, press: null, ultimatum: null, offerAlert: null,
		unemployedSince: undefined, renewalDeclinedSeason: undefined, autoRenewal: prevOffice.autoRenewal && employed,
		history,
		decisions: [...prevOffice.decisions, { season: career.season, round, kind: 'vinculo', choice: 'novo-contrato', effect: `Assinou com o ${clubName} até ${career.season + years - 1}.` }].slice(-200),
		milestones: [...prevOffice.milestones, { key: `contrato-${career.season}-${offer.clubId}`, season: career.season, round, label: `Novo clube: ${clubName}`, detail: `${years} temporada(s), ${formatMoney(offer.wage ?? 0)} por mês.` }]
	};
	const universe = universeCoachMove(ensureUniverse(career, league), career, league, career.clubId, offer.clubId);
	// Conhecimento pessoal do treinador e biblioteca de táticas ficam; o entrosamento é do elenco novo.
	const coachKnowledge = carryKnowledge(career, results);
	const ok = await db.transaction(async (tx) => {
		const changed = await changeCareerClub(tx, profileId, career.id, offer.clubId, { club: next, tactic: null, tactical: null, fitness: {}, dismissedTips: [], office, universe, discipline: initialDiscipline(career.season), ...(coachKnowledge ? { coachKnowledge } : {}) }, career.version);
		if (changed) {
			await insertMessages(tx, career.id, career.gameDate, [{ sender: `Diretoria — ${clubName}`, subject: `Bem-vindo ao ${clubName}`, body: `Contrato assinado até ${office.contract.until}. Objetivo principal: ${objectives[0]?.label ?? preview.project.label}. O elenco ainda vai se adaptar às suas ideias.`, important: true }], activeCoachId(career));
		}
		return changed;
	});
	if (!ok) error(409, 'A carreira mudou em outra janela. Recarregue para continuar.');
	return noStore({ career: await getCareer(db, profileId, career.id), message: `Você assumiu o ${clubName}.` });
}
