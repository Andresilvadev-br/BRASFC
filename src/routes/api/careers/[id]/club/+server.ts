import { error } from '@sveltejs/kit';
import { careerWorld } from '#lib/domain/career.ts';
import { sanitizeLeague } from '#lib/domain/league.ts';
import { ManagementError, sanitizeMarket } from '#lib/domain/management.ts';
import { careerView } from '#lib/domain/view.ts';
import { clubStateOf, rosterContext } from '#lib/domain/world.ts';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { actionContext, applyAction } from '#lib/server/management.ts';
import { getCareer, saveCareerProgress, VersionConflictError } from '#lib/server/repos/careers.ts';
import { insertLedger, insertTransfers, listHistory, listLedger, listTransfers } from '#lib/server/repos/management.ts';
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
	if (career.mode !== 'coach') error(403, 'Só o treinador gerencia o clube.');
	const body = (await readJson(event.request)) as Record<string, unknown>;
	const version = Number(body.version);
	if (!Number.isInteger(version)) error(400, 'Versão da carreira ausente.');
	if (version !== career.version) error(409, 'A carreira mudou em outra janela. Recarregue para continuar.');
	const league = sanitizeLeague(career.data.league, careerWorld(career), career.season);
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
