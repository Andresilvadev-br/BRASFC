import { invalidate } from '$app/navigation';
import { api, isVersionConflict, withCareerVersion } from '#lib/api.ts';
import { clubAction } from '#lib/client/club.ts';
import type { Career } from '#lib/domain/career.ts';
import { tacticKey, type Tactic } from '#lib/domain/tactics.ts';
import type { CareerPort } from './port.ts';

/**
 * Porta LOCAL (carreira individual): o save fica no servidor da própria instalação (offline) ou na
 * API de carreiras (navegador). Cada gravação leva a versão da carreira; conflitos são detectados.
 */
export function localCareerPort(current: () => Career): CareerPort {
	const path = () => `/api/careers/${current().id}`;
	const refresh = () => invalidate('app:career').catch(() => {});
	const patch = async (body: Record<string, unknown>) => {
		const c = current();
		const out = await withCareerVersion(c.id, c.version, (version) => api<{ career: Career; message?: string }>(path(), { method: 'PATCH', body: { version, ...body } }));
		await refresh();
		return out;
	};
	return {
		kind: 'local',
		href(section, hash) {
			const tail = !section || section === 'central' ? '' : `/${section}`;
			return `/carreira/${current().id}${tail}${hash ? `#${hash}` : ''}`;
		},
		clubAction: (body) => clubAction(current().id, current().version, body),
		async saveTactic(tactic, base) {
			const c = current();
			const savedKey = (career: Career) => (career.data.tactic ? tacticKey(career.data.tactic) : null);
			const send = (version: number) => api<{ career: Career }>(path(), { method: 'PATCH', body: { version, tactic } });
			const result = await send(c.version).catch(async (cause) => {
				if (!isVersionConflict(cause)) throw cause;
				// Outra janela mudou a carreira: só regrava se a tática salva ainda é a mesma da base do rascunho.
				const { career } = await api<{ career: Career }>(path());
				const baseKey = c.data.tactic ? tacticKey(base) : null;
				if (career.season !== c.season || career.clubId !== c.clubId || savedKey(career) !== baseKey) throw cause;
				return send(career.version);
			});
			if (savedKey(result.career) !== tacticKey(tactic)) throw new Error('O servidor não confirmou a tática enviada.');
			await refresh();
			return { ok: true };
		},
		async saveTrainingPlan(plan) {
			await patch({ trainingPlan: plan });
			return { ok: true };
		},
		async presetOp(op) {
			const out = await patch({ preset: op });
			return { message: out.message ?? 'Biblioteca atualizada.' };
		},
		async dismissTip(id) {
			await patch({ dismissTip: id });
		},
		refresh,
		supports: () => true
	};
}
