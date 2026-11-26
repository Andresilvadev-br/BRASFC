import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { answerDeal, dismissDealResult, passTurn, TurnError } from '#lib/server/local-turns.ts';
import { getCareer, VersionConflictError } from '#lib/server/repos/careers.ts';
import type { RequestHandler } from './$types';

/**
 * 0.13 · turnos locais entre treinadores (tudo no save deste computador):
 *  - `pronto`: "Ir para próxima partida" — grava e passa a vez (ou libera a rodada no último);
 *  - `negociacao`: aceitar, recusar ou contrapropor uma negociação entre treinadores;
 *  - `negociacao-vista`: quem iniciou viu o desfecho.
 */
export const POST: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	const body = await readJson(event.request);
	const version = Number(body.version);
	if (!Number.isInteger(version)) error(400, 'Versão da carreira ausente.');
	try {
		if (body.action === 'pronto') {
			const out = await passTurn(db, profile.id, career, version);
			return noStore({ career: out.career, play: out.play, next: out.next });
		}
		if (body.action === 'negociacao') {
			const out = await answerDeal(db, profile.id, career, body);
			return noStore(out);
		}
		if (body.action === 'negociacao-vista') return noStore({ career: await dismissDealResult(db, profile.id, career, version) });
		error(400, 'Ação de turno desconhecida.');
	} catch (e) {
		if (e instanceof TurnError) error(e.status, e.message);
		if (e instanceof VersionConflictError) error(409, e.message);
		throw e;
	}
};
