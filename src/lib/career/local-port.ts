import { invalidate } from '$app/navigation';
import { api, connectionIssue, isVersionConflict, withCareerVersion } from '#lib/api.ts';
import { clubAction } from '#lib/client/club.ts';
import type { Career } from '#lib/domain/career.ts';
import { activeCoachId } from '#lib/domain/turns.ts';
import { tacticKey, type Tactic } from '#lib/domain/tactics.ts';
import { notify } from '#lib/stores/island.svelte.ts';
import { SyncChannel } from '#lib/stores/sync.svelte.ts';
import type { Delivery, FlushReport, PendingOp } from '#lib/sync/outbox.ts';
import type { CareerPort } from './port.ts';

const savedKey = (career: Career) => (career.data.tactic ? tacticKey(career.data.tactic) : null);
const QUEUED = 'Salvo localmente. Será sincronizado quando a conexão voltar.';

/**
 * Entrega de uma operação da fila na carreira local. Sempre parte da versão mais recente do save;
 * a tática só é gravada se ninguém a alterou desde o rascunho (senão: conflito, o usuário é avisado).
 * Operações da carreira local são idempotentes por valor (gravar a mesma tática/plano/dica de novo
 * não muda nada), então reenviar depois de uma resposta perdida é seguro.
 */
export async function deliverLocal(careerId: string, op: PendingOp): Promise<Delivery> {
	const path = `/api/careers/${careerId}`;
	try {
		const { career } = await api<{ career: Career }>(path);
		// 0.13: com vários treinadores, uma alteração pendente só vale para quem estava no controle.
		if (op.meta?.coach !== undefined && op.meta.coach !== activeCoachId(career)) return 'conflict';
		if (op.kind === 'tactic') {
			const sent = op.payload.tactic as Tactic;
			const current = savedKey(career);
			if (current === tacticKey(sent)) return 'ok';
			if (op.meta?.season !== career.season || op.meta?.clubId !== career.clubId || current !== op.meta?.baseKey) return 'conflict';
		}
		await api(path, { method: 'PATCH', body: { version: career.version, ...op.payload } });
		return 'ok';
	} catch (e) {
		if (connectionIssue(e) || isVersionConflict(e)) return 'retry';
		op.lastError = e instanceof Error ? e.message : 'O servidor recusou a alteração.';
		return 'drop';
	}
}

export function reportSync(report: FlushReport, refresh: () => unknown) {
	if (report.delivered.length) void refresh();
	for (const op of report.conflicts) {
		notify({ icon: 'alert', tone: 'error', title: op.kind === 'tactic' ? 'Tática local não sincronizada' : 'Alteração local não sincronizada',
			detail: 'A carreira mudou em outra janela enquanto você estava sem conexão. A versão do servidor foi mantida.', duration: 8000 });
	}
	for (const op of report.dropped) {
		notify({ icon: 'alert', tone: 'error', title: 'Falha de sincronização', detail: op.lastError ?? 'O servidor recusou uma alteração salva localmente.', duration: 8000 });
	}
	if (report.delivered.length && !report.remaining && !report.conflicts.length && !report.dropped.length) {
		notify({ icon: 'check', tone: 'success', title: 'Sincronizado', detail: 'As alterações salvas localmente chegaram ao servidor.' });
	}
}

export function localSyncChannel(careerId: string) {
	return new SyncChannel(`career:${careerId}`, {
		deliver: (op) => deliverLocal(careerId, op),
		onReport: (report) => reportSync(report, () => invalidate('app:career').catch(() => {}))
	});
}

/**
 * Porta LOCAL (carreira individual): o save fica no servidor da própria instalação (offline) ou na
 * API de carreiras (navegador). Cada gravação leva a versão da carreira; conflitos são detectados.
 * Se a conexão cair, tática, plano de treinos e dicas vão para a fila local e sincronizam depois.
 */
export function localCareerPort(current: () => Career, channel: () => SyncChannel | null = () => null): CareerPort {
	const path = () => `/api/careers/${current().id}`;
	const refresh = () => invalidate('app:career').catch(() => {});
	const patch = async (body: Record<string, unknown>) => {
		const c = current();
		const sync = channel();
		sync?.mark('syncing');
		try {
			const out = await withCareerVersion(c.id, c.version, (version) => api<{ career: Career; message?: string }>(path(), { method: 'PATCH', body: { version, ...body } }));
			sync?.mark('synced');
			await refresh();
			return out;
		} catch (e) {
			// conexão: 'failed' até a fila (se a operação puder esperar) assumir o estado
			if (connectionIssue(e)) sync?.mark('failed', e instanceof Error ? e.message : '');
			else sync?.mark('synced');
			throw e;
		}
	};
	/** fila local quando a conexão cai; devolve false se não há fila ou o erro não é de conexão */
	const queue = async (cause: unknown, kind: string, payload: Record<string, unknown>, dedupe?: string, meta?: Record<string, unknown>) => {
		const sync = channel();
		if (!sync || !connectionIssue(cause)) return false;
		await sync.enqueue({ kind, payload, dedupe, meta: { ...meta, coach: activeCoachId(current()) } });
		return true;
	};
	return {
		kind: 'local',
		get sync() {
			return channel();
		},
		href(section, hash) {
			const tail = !section || section === 'central' ? '' : `/${section}`;
			return `/carreira/${current().id}${tail}${hash ? `#${hash}` : ''}`;
		},
		clubAction: (body) => clubAction(current().id, current().version, body),
		async saveTactic(tactic, base) {
			const c = current();
			const baseKey = c.data.tactic ? tacticKey(base) : null;
			// Já existe uma tática na fila: a nova substitui (o servidor ainda não viu a anterior).
			const pendingTactic = channel()?.pending.find((op) => op.dedupe === 'tactic');
			const meta = { baseKey: pendingTactic?.meta?.baseKey ?? baseKey, season: c.season, clubId: c.clubId, coach: activeCoachId(c) };
			if (pendingTactic) {
				// mantém a ordem: a nova versão substitui a pendente e sai junto com a fila
				await channel()!.enqueue({ kind: 'tactic', payload: { tactic }, dedupe: 'tactic', meta });
				void channel()!.flush(true);
				return { ok: true, queued: true, message: QUEUED };
			}
			const send = (version: number) => api<{ career: Career }>(path(), { method: 'PATCH', body: { version, tactic } });
			channel()?.mark('syncing');
			try {
				const result = await send(c.version).catch(async (cause) => {
					if (!isVersionConflict(cause)) throw cause;
					// Outra janela mudou a carreira: só regrava se a tática salva ainda é a mesma da base do rascunho.
					const { career } = await api<{ career: Career }>(path());
					if (career.season !== c.season || career.clubId !== c.clubId || savedKey(career) !== baseKey) throw cause;
					return send(career.version);
				});
				if (savedKey(result.career) !== tacticKey(tactic)) throw new Error('O servidor não confirmou a tática enviada.');
				channel()?.mark('synced');
				await refresh();
				return { ok: true };
			} catch (cause) {
				if (await queue(cause, 'tactic', { tactic }, 'tactic', meta)) return { ok: true, queued: true, message: QUEUED };
				channel()?.mark(connectionIssue(cause) ? 'failed' : 'synced', cause instanceof Error ? cause.message : '');
				throw cause;
			}
		},
		async saveTrainingPlan(plan) {
			if (channel()?.pending.some((op) => op.dedupe === 'training')) {
				await channel()!.enqueue({ kind: 'training', payload: { trainingPlan: plan }, dedupe: 'training', meta: { coach: activeCoachId(current()) } });
				return { ok: true, queued: true, message: QUEUED };
			}
			try {
				await patch({ trainingPlan: plan });
				return { ok: true };
			} catch (cause) {
				if (await queue(cause, 'training', { trainingPlan: plan }, 'training')) return { ok: true, queued: true, message: QUEUED };
				throw cause;
			}
		},
		async presetOp(op) {
			// Biblioteca: criar/duplicar não é idempotente por valor, então exige o servidor (sem fila).
			const out = await patch({ preset: op });
			return { message: out.message ?? 'Biblioteca atualizada.' };
		},
		async dismissTip(id) {
			try {
				await patch({ dismissTip: id });
			} catch (cause) {
				if (!(await queue(cause, 'tip', { dismissTip: id }, `tip:${id}`))) throw cause;
			}
		},
		refresh,
		supports: () => true
	};
}
