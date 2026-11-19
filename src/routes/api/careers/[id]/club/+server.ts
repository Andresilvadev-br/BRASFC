import { error } from '@sveltejs/kit';
import { careerWorld } from '#lib/domain/career.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { divisionOf } from '#lib/domain/league.ts';
import { initialClubState } from '#lib/domain/management.ts';
import { applyPlayerAction } from '#lib/server/player-actions.ts';
import { sanitizeLeague } from '#lib/domain/league.ts';
import { ManagementError, sanitizeMarket } from '#lib/domain/management.ts';
import { careerView } from '#lib/domain/view.ts';
import { clubStateOf, rosterContext } from '#lib/domain/world.ts';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { actionContext, applyAction } from '#lib/server/management.ts';
import { applyOfficeAction, OFFICE_ACTIONS } from '#lib/server/office-actions.ts';
import { ensureUniverse, officeOf, universeCoachMove } from '#lib/server/universe.ts';
import { coachWage } from '#lib/domain/office.ts';
import { tierOfDivision } from '#lib/domain/market.ts';
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
	if (body.action === 'emprego') {
		return careerDecision(db, profile.id, career, league, body);
	}
	if (typeof body.action === 'string' && body.action.startsWith('jogador-')) {
		if (career.mode !== 'player') error(403, 'Ação exclusiva da carreira de jogador.');
		try {
			const view = careerView(career, await listResults(db, career.id, career.season));
			const out = applyPlayerAction(career, view, body);
			const updated = await db.transaction(async (tx) => {
				const saved = await saveCareerProgress(tx, profile.id, career.id, {
					gameDate: career.gameDate, clubId: out.clubId,
					data: { playerCareer: out.state, ...(out.clubId ? { tactical: null, fitness: { eu: out.state.daily.condition } } : {}) }
				}, career.version);
				if (out.movement) await insertTransfers(tx, career.id, career.season, career.gameDate, [{ playerId: 'eu', playerName: career.personName, from: career.clubId, to: out.clubId ?? career.clubId, kind: out.movement, fee: 0, wage: out.state.contract.wage }], `${career.season}:jogador:${career.version}`);
				if (out.movement || body.action === 'jogador-entrevista') await insertMessages(tx, career.id, career.gameDate, [{ sender: body.action === 'jogador-entrevista' ? 'Imprensa' : out.state.agent.name, subject: body.action === 'jogador-entrevista' ? 'Repercussão da entrevista' : 'Contrato profissional', body: out.message, important: !!out.movement }]);
				return saved;
			});
			return noStore({ career: updated, message: out.message });
		} catch (e) {
			if (e instanceof ManagementError) error(422, e.message);
			if (e instanceof VersionConflictError) error(409, e.message);
			throw e;
		}
	}
	if (career.mode !== 'coach') error(403, 'Só o treinador gerencia o clube.');
	const club = clubStateOf(career, league);
	if (club.board.dismissed) error(409, 'Você não comanda mais o clube.');
	const view = careerView(career, await listResults(db, career.id, career.season));
	if (view.seasonOver) error(409, 'Temporada encerrada: inicie a próxima para negociar.');
	const ctx = actionContext(career, league, rosterContext(career, league), view.nextRound);
	// Dev 0.5: gabinete (reuniões, coletivas, comissão, treinos delegados, plano da base).
	if (OFFICE_ACTIONS.has(String(body.action))) {
		try {
			const me = view.standings.find((r) => r.clubId === career.clubId);
			const out = applyOfficeAction(career, league, club, view.nextRound, me?.points ?? 0, me?.position ?? null, body);
			const key = `${career.season}:gabinete:${career.version}`;
			const updated = await db.transaction(async (tx) => {
				const saved = await saveCareerProgress(tx, profile.id, career.id, { gameDate: career.gameDate, data: { club: out.club, office: out.office } }, career.version);
				await insertLedger(tx, career.id, career.season, career.gameDate, out.ledger, key);
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
	if (career.mode !== 'coach') error(403, 'Propostas de emprego são para treinadores.');
	const club = clubStateOf(career, league);
	const offer = club.jobOffers.find((o) => o.id === offerId);
	if (!offer || offer.expiresSeason < career.season) error(422, 'Proposta indisponível ou expirada.');
	const division = divisionOf(league, offer.clubId);
	const fresh = initialClubState(career.seed, offer.clubId, division, career.season);
	const next = { ...fresh, coachReputation: club.coachReputation, jobOffers: [] };
	// Dev 0.5: contrato negociado na proposta; o universo troca os técnicos dos dois clubes.
	const prevOffice = officeOf(career, club, league);
	const years = typeof body.years === 'number' && [1, 2, 3].includes(body.years) ? body.years : (offer.years ?? 2);
	const office = { ...prevOffice, contract: { until: career.season + years - 1, wage: offer.wage ?? coachWage(tierOfDivision(division), club.coachReputation) }, meeting: null, press: null, ultimatum: null, history: [...prevOffice.history, ...(club.board.dismissed ? [] : [{ season: career.season, clubId: career.clubId, division: divisionOf(league, career.clubId), position: null, outcome: 'saiu' as const, games: 0, wins: 0, draws: 0, losses: 0, reputation: club.coachReputation }])] };
	const universe = universeCoachMove(ensureUniverse(career, league), career, league, career.clubId, offer.clubId);
	const ok = await db.transaction(async (tx) => {
		const changed = await changeCareerClub(tx, profileId, career.id, offer.clubId, { club: next, tactic: null, tactical: null, fitness: {}, dismissedTips: [], office, universe }, career.version);
		if (changed) await insertMessages(tx, career.id, career.gameDate, [{ sender: `Diretoria — ${getClub(offer.clubId)?.name ?? offer.clubId}`, subject: `Bem-vindo ao ${getClub(offer.clubId)?.name ?? offer.clubId}`, body: 'Você é o novo treinador. Conheça o elenco, a estrutura e os objetivos da diretoria.', important: true }]);
		return changed;
	});
	if (!ok) error(409, 'A carreira mudou em outra janela. Recarregue para continuar.');
	return noStore({ career: await getCareer(db, profileId, career.id), message: `Você assumiu o ${getClub(offer.clubId)?.name ?? offer.clubId}.` });
}
