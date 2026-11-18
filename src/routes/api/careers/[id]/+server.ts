import { error } from '@sveltejs/kit';
import type { CareerData } from '#lib/domain/career.ts';
import { generateSquad } from '#lib/domain/squad.ts';
import { sanitizeTactic } from '#lib/domain/tactics.ts';
import { isPlayerFocus, isTeamFocus } from '#lib/domain/training.ts';
import { sanitizePlan } from '#lib/domain/drills.ts';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { deleteCareer, getCareer, patchCareerData, touchCareer, VersionConflictError } from '#lib/server/repos/careers.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const career = await getCareer(await getDb(), profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	return noStore({ career });
};

/** Atualizações permitidas nesta etapa: tática (treinador) e foco de treino. */
export const PATCH: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const db = await getDb();
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');
	const body = await readJson(event.request);

	if (body.action === 'touch') {
		await touchCareer(db, profile.id, career.id);
		return noStore({ ok: true });
	}

	const version = Number(body.version);
	if (!Number.isInteger(version)) error(400, 'Versão da carreira ausente.');
	const patch: Partial<CareerData> = {};

	if (body.tactic !== undefined) {
		if (career.mode !== 'coach') error(403, 'Somente o treinador define a tática.');
		const tactic = sanitizeTactic(body.tactic, generateSquad(career.clubId, career.seed));
		if (!tactic) error(400, 'Tática inválida para este elenco.');
		patch.tactic = tactic;
	}
	if (body.trainingFocus !== undefined) {
		if (career.mode !== 'coach' || !isTeamFocus(body.trainingFocus)) error(400, 'Foco de treino inválido.');
		patch.trainingFocus = body.trainingFocus;
	}
	if (body.trainingPlan !== undefined) {
		if (career.mode !== 'coach') error(403, 'Somente o treinador define o plano de treinos.');
		if (!body.trainingPlan || typeof body.trainingPlan !== 'object') error(400, 'Plano de treinos inválido.');
		patch.trainingPlan = sanitizePlan(body.trainingPlan);
	}
	if (body.dismissTip !== undefined) {
		if (typeof body.dismissTip !== 'string' || body.dismissTip.length > 120) error(400, 'Recomendação inválida.');
		patch.dismissedTips = [...(career.data.dismissedTips ?? []), body.dismissTip].slice(-60);
	}
	if (body.playerFocus !== undefined) {
		if (career.mode !== 'player' || !isPlayerFocus(body.playerFocus)) error(400, 'Foco individual inválido.');
		patch.playerFocus = body.playerFocus;
	}
	if (!Object.keys(patch).length) error(400, 'Nada para atualizar.');

	try {
		return noStore({ career: await patchCareerData(db, profile.id, career.id, patch, version) });
	} catch (e) {
		if (e instanceof VersionConflictError) error(409, e.message);
		throw e;
	}
};

export const DELETE: RequestHandler = async (event) => {
	const profile = requireProfile(event);
	const ok = await deleteCareer(await getDb(), profile.id, event.params.id);
	if (!ok) error(404, 'Carreira não encontrada.');
	return noStore({ ok: true });
};
