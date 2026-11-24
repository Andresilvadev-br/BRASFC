import { error } from '@sveltejs/kit';
import { sanitizePresets, type TacticPreset } from '#lib/domain/tactic-presets.ts';
import { applyPresetOperation, PresetError } from '#lib/server/presets.ts';
import { isAppearance } from '#lib/domain/appearance.ts';
import type { Career, CareerData } from '#lib/domain/career.ts';
// O elenco ATUAL (contratações, vendas, base), o mesmo que a tela de táticas mostra.
import { careerSquad } from '#lib/domain/matchday.ts';
import { sanitizeTactic } from '#lib/domain/tactics.ts';
import { isPlayerFocus, isPlayerFocusForPosition, isTeamFocus } from '#lib/domain/training.ts';
import { sanitizePlan } from '#lib/domain/drills.ts';
import { getDb } from '#lib/server/db/index.ts';
import { noStore, readJson, requireProfile } from '#lib/server/http.ts';
import { cleanCareerLabel, deleteCareer, getCareer, isUuid, MAX_CAREER_LABEL, patchCareerData, renameCareer, touchCareer, VersionConflictError } from '#lib/server/repos/careers.ts';
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
	const body = await readJson(event.request);
	if (body.action === 'rename') {
		const label = cleanCareerLabel(body.label);
		if (label === undefined) error(400, `Use um nome de até ${MAX_CAREER_LABEL} caracteres.`);
		if (!await renameCareer(db, profile.id, event.params.id, label)) error(404, 'Carreira não encontrada.');
		return noStore({ ok: true, label });
	}
	if (body.action === 'touch') {
		if (!isUuid(event.params.id) || !await touchCareer(db, profile.id, event.params.id)) error(404, 'Carreira não encontrada.');
		return noStore({ ok: true });
	}
	const career = await getCareer(db, profile.id, event.params.id);
	if (!career) error(404, 'Carreira não encontrada.');

	const version = Number(body.version);
	if (!Number.isInteger(version)) error(400, 'Versão da carreira ausente.');
	// Um ex-treinador não pode mais alterar o elenco, plano ou instruções do clube anterior via API.
	if (career.mode === 'coach' && career.data.club?.board.dismissed && (body.tactic !== undefined || body.trainingFocus !== undefined || body.trainingPlan !== undefined || body.dismissTip !== undefined)) {
		error(409, 'Seu vínculo terminou. Aceite uma nova proposta antes de modificar o trabalho de um clube.');
	}
	const patch: Partial<CareerData> = {};
	if (body.appearance !== undefined) {
		if (!isAppearance(body.appearance)) error(400, 'Aparência inválida.');
		patch.appearance = body.appearance;
	}

	if (body.tactic !== undefined) {
		if (career.mode !== 'coach') error(403, 'Somente o treinador define a tática.');
		const tactic = sanitizeTactic(body.tactic, careerSquad(career));
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
		if (career.mode !== 'player' || !career.data.position || !isPlayerFocus(body.playerFocus) || !isPlayerFocusForPosition(body.playerFocus, career.data.position)) error(400, 'Foco individual inválido.');
		patch.playerFocus = body.playerFocus;
	}
	// Treinador 2.0: biblioteca "Minhas Táticas" (pertence ao treinador; vale entre clubes e temporadas).
	let presetMessage: string | null = null;
	if (body.preset !== undefined) {
		if (career.mode !== 'coach') error(403, 'A biblioteca de táticas é do treinador.');
		const out = presetOperation(career, body.preset);
		patch.tacticPresets = out.presets;
		presetMessage = out.message;
	}
	if (!Object.keys(patch).length) error(400, 'Nada para atualizar.');

	try {
		return noStore({ career: await patchCareerData(db, profile.id, career.id, patch, version), ...(presetMessage ? { message: presetMessage } : {}) });
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

function presetOperation(career: Career, raw: unknown): { presets: TacticPreset[]; message: string } {
	try {
		return applyPresetOperation(sanitizePresets(career.data.tacticPresets), raw, { squad: careerSquad(career), clubId: career.clubId, season: career.season });
	} catch (e) {
		if (e instanceof PresetError) error(e.status, e.message);
		throw e;
	}
}
