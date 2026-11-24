/**
 * Dev 0.12 · fila persistente de operações (Hybrid Save Engine).
 *
 * Só operações PERMITIDAS entram aqui: tática, plano de treinos, biblioteca de táticas, dicas e
 * aparência. Dinheiro, transferências, contratos e resultados oficiais nunca são enfileirados —
 * dependem da confirmação imediata do servidor.
 *
 *  - Idempotência: cada operação tem um id fixo, reenviado igual (o servidor reconhece duplicatas).
 *  - Deduplicação: operações com a mesma chave (ex.: "tatica") substituem a pendente anterior —
 *    só o último rascunho daquele campo vai ao servidor (dirty tracking por campo).
 *  - Ordem: a fila é entregue em ordem; uma falha de conexão para a entrega e agenda nova tentativa
 *    com espera exponencial (1 s, 2 s, 4 s… até 30 s).
 *  - Conflito: a regra de cada entidade decide (ex.: tática editada em outra janela é descartada e o
 *    usuário é avisado; o plano de treinos vale o último).
 *  - Persistência: a fila sobrevive a recarregar a página, fechar o app e reconectar.
 */
export interface PendingOp {
	id: string;
	kind: string;
	dedupe?: string;
	payload: Record<string, unknown>;
	/** dados só do cliente (ex.: a tática-base do rascunho), nunca enviados */
	meta?: Record<string, unknown>;
	createdAt: number;
	attempts: number;
	nextAt: number;
	lastError?: string;
}

/** Resultado de uma tentativa de entrega. */
export type Delivery = 'ok' | 'retry' | 'conflict' | 'drop';

export interface OutboxStorage {
	get(key: string): Promise<unknown>;
	set(key: string, value: unknown): Promise<boolean>;
}

export const MAX_PENDING = 50;
/** depois disso a operação é descartada e o usuário é avisado (evita repetir para sempre) */
export const MAX_ATTEMPTS = 40;

export function backoff(attempts: number): number {
	return Math.min(30_000, 1000 * 2 ** Math.max(0, attempts - 1));
}

export interface FlushReport {
	delivered: PendingOp[];
	conflicts: PendingOp[];
	dropped: PendingOp[];
	remaining: number;
}

export class Outbox {
	private ops: PendingOp[] = [];
	private loaded = false;
	private flushing: Promise<FlushReport> | null = null;

	constructor(
		readonly scope: string,
		private storage: OutboxStorage,
		private now: () => number = Date.now,
		private newId: () => string = () => crypto.randomUUID()
	) {}

	private get key() {
		return `outbox:${this.scope}`;
	}

	async load(): Promise<void> {
		if (this.loaded) return;
		const saved = await this.storage.get(this.key);
		this.ops = Array.isArray(saved) ? (saved as PendingOp[]).filter((op) => op && typeof op.id === 'string' && typeof op.kind === 'string') : [];
		this.loaded = true;
	}

	private async persist(): Promise<boolean> {
		return this.storage.set(this.key, this.ops);
	}

	pending(): readonly PendingOp[] {
		return this.ops;
	}

	/** Enfileira (ou substitui a pendente com a mesma chave). Devolve se ficou salvo em disco. */
	async enqueue(input: { kind: string; payload: Record<string, unknown>; dedupe?: string; id?: string; meta?: Record<string, unknown> }): Promise<{ op: PendingOp; persisted: boolean }> {
		await this.load();
		if (input.dedupe) this.ops = this.ops.filter((op) => op.dedupe !== input.dedupe);
		const op: PendingOp = { id: input.id ?? this.newId(), kind: input.kind, payload: input.payload, createdAt: this.now(), attempts: 0, nextAt: this.now(), ...(input.dedupe ? { dedupe: input.dedupe } : {}), ...(input.meta ? { meta: input.meta } : {}) };
		this.ops = [...this.ops, op].slice(-MAX_PENDING);
		return { op, persisted: await this.persist() };
	}

	/** Entrega em ordem. Uma falha temporária interrompe (preserva a ordem) e agenda nova tentativa. */
	flush(deliver: (op: PendingOp) => Promise<Delivery>, force = false): Promise<FlushReport> {
		return (this.flushing ??= (async () => {
			await this.load();
			const report: FlushReport = { delivered: [], conflicts: [], dropped: [], remaining: 0 };
			while (this.ops.length) {
				const op = this.ops[0];
				if (!force && op.nextAt > this.now()) break;
				let result: Delivery;
				try {
					result = await deliver(op);
				} catch (e) {
					op.lastError = e instanceof Error ? e.message : String(e);
					result = 'drop';
				}
				if (result === 'retry' && op.attempts + 1 >= MAX_ATTEMPTS) {
					op.lastError ??= 'O servidor não confirmou a alteração depois de várias tentativas.';
					result = 'drop';
				}
				if (result === 'retry') {
					op.attempts += 1;
					op.nextAt = this.now() + backoff(op.attempts);
					break;
				}
				this.ops = this.ops.slice(1);
				(result === 'ok' ? report.delivered : result === 'conflict' ? report.conflicts : report.dropped).push(op);
			}
			report.remaining = this.ops.length;
			await this.persist();
			return report;
		})().finally(() => {
			this.flushing = null;
		}));
	}

	/** Quando a próxima tentativa deve acontecer (ms a partir de agora), ou null se a fila está vazia. */
	nextDelay(): number | null {
		if (!this.ops.length) return null;
		return Math.max(0, this.ops[0].nextAt - this.now());
	}
}
