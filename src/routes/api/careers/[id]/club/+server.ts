import { error } from '@sveltejs/kit';
import { careerWorld } from '#lib/domain/career.ts';
import { sanitizePlayerCareer } from '#lib/domain/careerlife.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { divisionOf } from '#lib/domain/league.ts';
import { initialClubState } from '#lib/domain/management.ts';
import { formatMoney } from '#lib/domain/market.ts';
import { sanitizeLeague } from '#lib/domain/league.ts';
import { ManagementError, sanitizeMarket } from '#lib/domain/management.ts';
import { careerView } from '#lib/domain/view.ts';
import { clubStateOf, rosterContext } from '#lib/domain/world.ts';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { actionContext, applyAction } from '#lib/server/management.ts';
import { getCareer, saveCareerProgress, VersionConflictError } from '#lib/server/repos/careers.ts';
import { changeCareerClub, insertLedger, insertMessages, insertTransfers, listHistory, listLedger, listTransfers } from '#lib/server/repos/management.ts';
import { listResults } from '#lib/server/repos/matches.ts';
import type { RequestHandler } from './$types';

/** Históricos da gestão: lançamentos da temporada, transferências e títulos. */
export const GET: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	const [ledger, transfers, history] = await Promise.all([listLedger(db, career.id, career.season), listTransfers(db, career.id), listHistory(db, career.id)]);
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
	if (body.action === 'emprego' || body.action === 'jogador-aceitar' || body.action === 'jogador-recusar') {
		return careerDecision(db, profile.id, career, league, body);
	}
	if (career.mode !== 'coach') error(403, 'Só o treinador gerencia o clube.');
	const club = clubStateOf(career, league);
	if (club.board.dismissed) error(409, 'Você não comanda mais o clube.');
	const view = careerView(career, await listResults(db, career.id, career.season));
	if (view.seasonOver) error(409, 'Temporada encerrada: inicie a próxima para negociar.');
	const ctx = actionContext(career, league, rosterContext(career, league), view.nextRound);
	try {
		const out = applyAction(club, sanitizeMarket(career.data.market), ctx, body);
		const key = `${career.season}:acao:${career.version}`;
		const updated = await db.transaction(async (tx) => {
			const saved = await saveCareerProgress(tx, profile.id, career.id, { gameDate: career.gameDate, data: { club: out.club, market: out.market } }, career.version);
			await insertLedger(tx, career.id, career.season, career.gameDate, out.ledger, key);
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
	const offerId = typeof body.offerId === 'string' ? body.offerId : '';
	if (body.action === 'emprego') {
		if (career.mode !== 'coach') error(403, 'Propostas de emprego são para treinadores.');
		const club = clubStateOf(career, league);
		const offer = club.jobOffers.find((o) => o.id === offerId);
		if (!offer || offer.expiresSeason < career.season) error(422, 'Proposta indisponível ou expirada.');
		const division = divisionOf(league, offer.clubId);
		const fresh = initialClubState(career.seed, offer.clubId, division, career.season);
		const next = { ...fresh, coachReputation: club.coachReputation, jobOffers: [] };
		const ok = await db.transaction(async (tx) => {
			const changed = await changeCareerClub(tx, profileId, career.id, offer.clubId, { club: next, tactic: null, tactical: null, fitness: {}, dismissedTips: [] }, career.version);
			if (changed) await insertMessages(tx, career.id, career.gameDate, [{ sender: `Diretoria — ${getClub(offer.clubId)?.name ?? offer.clubId}`, subject: `Bem-vindo ao ${getClub(offer.clubId)?.name ?? offer.clubId}`, body: 'Você é o novo treinador. Conheça o elenco, a estrutura e os objetivos da diretoria.', important: true }]);
			return changed;
		});
		if (!ok) error(409, 'A carreira mudou em outra janela. Recarregue para continuar.');
		return noStore({ career: await getCareer(db, profileId, career.id), message: `Você assumiu o ${getClub(offer.clubId)?.name ?? offer.clubId}.` });
	}
	if (career.mode !== 'player') error(403, 'Propostas de clubes são da carreira de jogador.');
	const pc = sanitizePlayerCareer(career.data.playerCareer, career.seed, career.data.player, divisionOf(league, career.clubId), career.season);
	const offer = pc?.offers.find((o) => o.id === offerId);
	if (!pc || !offer) error(422, 'Proposta indisponível ou expirada.');
	if (body.action === 'jogador-recusar') {
		const saved = await saveCareerProgress(db, profileId, career.id, { gameDate: career.gameDate, data: { playerCareer: { ...pc, offers: pc.offers.filter((o) => o.id !== offerId) } } }, career.version);
		return noStore({ career: saved, message: 'Proposta recusada.' });
	}
	const state = { ...pc, offers: [], contract: { wage: offer.wage, until: career.season + offer.years - 1, role: offer.role } };
	const ok = await db.transaction(async (tx) => {
		const changed = await changeCareerClub(tx, profileId, career.id, offer.clubId, { playerCareer: state }, career.version);
		if (changed) {
			await insertTransfers(tx, career.id, career.season, career.gameDate, [{ playerId: 'eu', playerName: career.personName, from: career.clubId, to: offer.clubId, kind: 'compra', fee: 0, wage: offer.wage }], `${career.season}:jogador:${career.version}`);
			await insertMessages(tx, career.id, career.gameDate, [{ sender: `Coordenação — ${getClub(offer.clubId)?.name ?? offer.clubId}`, subject: 'Contrato assinado', body: `Bem-vindo! Contrato até ${state.contract.until}, ${formatMoney(offer.wage)} por mês.`, important: true }]);
		}
		return changed;
	});
	if (!ok) error(409, 'A carreira mudou em outra janela. Recarregue para continuar.');
	return noStore({ career: await getCareer(db, profileId, career.id), message: `Você assinou com o ${getClub(offer.clubId)?.name ?? offer.clubId}.` });
}
