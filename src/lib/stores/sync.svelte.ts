/**
 * Dev 0.12 · Hybrid Save Engine — canal de sincronização reativo.
 *
 * Cada carreira (local ou online) tem um canal. A tela grava primeiro no servidor; se a conexão cair,
 * a operação PERMITIDA vai para a fila local persistente (IndexedDB) e o jogo continua. O canal
 * reenvia sozinho ao reconectar (evento `online`, espera exponencial) e expõe o estado para os
 * indicadores: Salvo localmente · Aguardando sincronização · Sincronizando · Sincronizado ·
 * Reconectando · Falha de sincronização.
 */
import { localGet, localSet } from '#lib/sync/local-store.ts';
import { Outbox, type Delivery, type FlushReport, type OutboxStorage, type PendingOp } from '#lib/sync/outbox.ts';

export type SyncStatus = 'synced' | 'local' | 'pending' | 'syncing' | 'reconnecting' | 'failed';

export const SYNC_LABEL: Record<SyncStatus, string> = {
	synced: 'Sincronizado',
	local: 'Salvo localmente',
	pending: 'Aguardando sincronização',
	syncing: 'Sincronizando',
	reconnecting: 'Reconectando',
	failed: 'Falha de sincronização'
};

export const SYNC_TONE: Record<SyncStatus, 'ok' | 'warn' | 'bad'> = {
	synced: 'ok', local: 'warn', pending: 'warn', syncing: 'warn', reconnecting: 'warn', failed: 'bad'
};

const browserStorage: OutboxStorage = { get: (key) => localGet(key), set: (key, value) => localSet(key, value) };
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export interface SyncChannelOptions {
	deliver: (op: PendingOp) => Promise<Delivery>;
	/** chamado depois de cada entrega (atualizar a tela, avisar conflitos/descartes) */
	onReport?: (report: FlushReport) => void;
	storage?: OutboxStorage;
}

export class SyncChannel {
	status = $state<SyncStatus>('synced');
	pending = $state.raw<readonly PendingOp[]>([]);
	error = $state('');
	/** false quando o armazenamento local não está disponível: a fila vive só nesta aba */
	persisted = $state(true);
	lastSyncedAt = $state<number | null>(null);

	#outbox: Outbox;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#options: SyncChannelOptions;

	constructor(readonly scope: string, options: SyncChannelOptions) {
		this.#options = options;
		this.#outbox = new Outbox(scope, options.storage ?? browserStorage);
	}

	#snapshot() {
		this.pending = [...this.#outbox.pending()];
	}

	#schedule() {
		clearTimeout(this.#timer);
		const delay = this.#outbox.nextDelay();
		if (delay !== null && !offline()) this.#timer = setTimeout(() => void this.flush(), delay);
	}

	/** Carrega a fila salva (sobrevive a recarregar/fechar o app) e começa a observar a rede. */
	start(): () => void {
		let alive = true;
		void this.#outbox.load().then(() => {
			if (!alive) return;
			this.#snapshot();
			if (this.pending.length) {
				this.status = offline() ? 'local' : 'pending';
				void this.flush(true);
			}
		});
		const reconnect = () => void this.flush(true);
		const lost = () => {
			if (this.pending.length) this.status = 'local';
		};
		if (typeof window !== 'undefined') {
			window.addEventListener('online', reconnect);
			window.addEventListener('offline', lost);
		}
		return () => {
			alive = false;
			clearTimeout(this.#timer);
			if (typeof window !== 'undefined') {
				window.removeEventListener('online', reconnect);
				window.removeEventListener('offline', lost);
			}
		};
	}

	/** Guarda uma operação permitida que não chegou ao servidor. Mesma `dedupe` = só a última vale. */
	async enqueue(input: { kind: string; payload: Record<string, unknown>; dedupe?: string; id?: string; meta?: Record<string, unknown> }) {
		const { op, persisted } = await this.#outbox.enqueue(input);
		this.persisted = persisted;
		this.error = '';
		this.#snapshot();
		this.status = offline() ? 'local' : 'pending';
		clearTimeout(this.#timer);
		if (!offline()) this.#timer = setTimeout(() => void this.flush(), 1000);
		return op;
	}

	/** Mostra que uma gravação direta está em andamento (sem fila). */
	mark(status: 'syncing' | 'synced' | 'failed', error = '') {
		if (this.pending.length && status === 'synced') return;
		this.status = status;
		this.error = error;
		if (status === 'synced') this.lastSyncedAt = Date.now();
	}

	async flush(force = false): Promise<FlushReport | null> {
		if (!this.#outbox.pending().length) return null;
		if (offline()) {
			this.status = 'local';
			return null;
		}
		this.status = 'syncing';
		const report = await this.#outbox.flush(this.#options.deliver, force);
		this.#snapshot();
		if (report.dropped.length) {
			this.status = 'failed';
			this.error = report.dropped.at(-1)?.lastError ?? 'Uma alteração foi recusada pelo servidor.';
		} else if (report.remaining) {
			this.status = offline() ? 'local' : 'reconnecting';
		} else {
			this.status = 'synced';
			this.error = '';
			this.lastSyncedAt = Date.now();
		}
		this.#options.onReport?.(report);
		this.#schedule();
		return report;
	}
}
