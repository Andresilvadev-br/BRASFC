import { api, ApiError, withCareerVersion } from '#lib/api.ts';
import { DIVISION_LABELS, type DivisionId } from '#lib/domain/league.ts';

/** Solicita a ativação somente quando um clube humano troca de divisão na virada. */
export async function startNextSeason<T>(careerId: string, version: number): Promise<T | null> {
	const path = `/api/careers/${careerId}/season`;
	return withCareerVersion(careerId, version, async (v) => {
		try {
			return await api<T>(path, { body: { version: v } });
		} catch (e) {
			const required = e instanceof ApiError && e.status === 409 ? e.errors?.activateDivisions : undefined;
			if (!required) throw e;
			const divisions = required.split(',') as DivisionId[];
			const labels = divisions.map((id) => DIVISION_LABELS[id]).join(', ');
			if (!window.confirm(`Um clube comandado por um treinador passou para uma divisão inativa: ${labels}. Ativar para continuar na próxima temporada?`)) return null;
			return api<T>(path, { body: { version: v, activateDivisions: divisions } });
		}
	});
}
