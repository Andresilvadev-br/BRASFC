import { describe, expect, it } from 'vitest';
import { backoff, MAX_ATTEMPTS, Outbox, type Delivery, type OutboxStorage, type PendingOp } from '#lib/sync/outbox.ts';
import { SyncChannel } from '#lib/stores/sync.svelte.ts';

/** armazenamento em memória que imita o IndexedDB (cópia estruturada a cada gravação) */
function memoryStorage(): OutboxStorage & { data: Map<string, unknown> } {
	const data = new Map<string, unknown>();
	return {
		data,
		get: async (key) => structuredClone(data.get(key)),
		set: async (key, value) => (data.set(key, structuredClone(value)), true)
	};
}

function clock(start = 1_000) {
	let t = start;
	return { now: () => t, advance: (ms: number) => (t += ms) };
}

let seq = 0;
const ids = () => `op-${++seq}`;

describe('Dev 0.12 · Hybrid Save Engine — fila local', () => {
	it('deduplica por campo: só o último rascunho da tática vai ao servidor; outros campos seguem na ordem', async () => {
		const box = new Outbox('career:a', memoryStorage(), Date.now, ids);
		await box.enqueue({ kind: 'tactic', payload: { v: 1 }, dedupe: 'tactic' });
		await box.enqueue({ kind: 'training', payload: { v: 'plano' }, dedupe: 'training' });
		await box.enqueue({ kind: 'tactic', payload: { v: 2 }, dedupe: 'tactic' });
		expect(box.pending().map((op) => [op.kind, op.payload.v])).toEqual([['training', 'plano'], ['tactic', 2]]);
		const seen: unknown[] = [];
		const report = await box.flush(async (op) => (seen.push(op.payload.v), 'ok'));
		expect(seen).toEqual(['plano', 2]);
		expect(report.delivered).toHaveLength(2);
		expect(box.pending()).toHaveLength(0);
	});

	it('sobrevive a recarregar a página: a fila é lida de volta do armazenamento local', async () => {
		const storage = memoryStorage();
		const first = new Outbox('room:x:p', storage, Date.now, ids);
		const { op, persisted } = await first.enqueue({ kind: 'preset', payload: { name: 'A' }, meta: { baseKey: 'k' } });
		expect(persisted).toBe(true);
		const reloaded = new Outbox('room:x:p', storage);
		await reloaded.load();
		expect(reloaded.pending()).toEqual([op]);
		// escopos diferentes não se misturam (cada carreira/liga tem sua fila)
		const other = new Outbox('room:y:p', storage);
		await other.load();
		expect(other.pending()).toHaveLength(0);
	});

	it('falha de conexão interrompe em ordem e agenda nova tentativa com espera exponencial; o id não muda', async () => {
		const c = clock();
		const box = new Outbox('career:b', memoryStorage(), c.now, ids);
		const { op } = await box.enqueue({ kind: 'tactic', payload: {}, dedupe: 'tactic' });
		await box.enqueue({ kind: 'tip', payload: {}, dedupe: 'tip:1' });
		const sent: string[] = [];
		let result: Delivery = 'retry';
		const deliver = async (p: PendingOp) => (sent.push(p.id), result);
		let report = await box.flush(deliver);
		expect(report.remaining).toBe(2);
		expect(sent).toEqual([op.id]); // a segunda não passa na frente da primeira
		expect(box.nextDelay()).toBe(backoff(1));
		// antes do prazo nada é reenviado
		report = await box.flush(deliver);
		expect(sent).toHaveLength(1);
		c.advance(backoff(1));
		await box.flush(deliver);
		expect(box.nextDelay()).toBe(backoff(2));
		expect(backoff(2)).toBe(2 * backoff(1));
		expect(backoff(30)).toBe(30_000);
		// reconexão: força a entrega e reenvia exatamente o mesmo id (idempotência no servidor)
		result = 'ok';
		report = await box.flush(deliver, true);
		expect(sent.filter((id) => id === op.id)).toHaveLength(3);
		expect(report.delivered.map((p) => p.kind)).toEqual(['tactic', 'tip']);
	});

	it('conflito e recusa saem da fila e são reportados; repetição infinita vira descarte com aviso', async () => {
		const c = clock();
		const box = new Outbox('career:c', memoryStorage(), c.now, ids);
		await box.enqueue({ kind: 'tactic', payload: {}, dedupe: 'tactic' });
		await box.enqueue({ kind: 'training', payload: {}, dedupe: 'training' });
		await box.enqueue({ kind: 'tip', payload: {} });
		const outcomes: Delivery[] = ['conflict', 'drop', 'retry'];
		const report = await box.flush(async () => outcomes.shift()!);
		expect(report.conflicts.map((op) => op.kind)).toEqual(['tactic']);
		expect(report.dropped.map((op) => op.kind)).toEqual(['training']);
		expect(report.remaining).toBe(1);
		let last = await box.flush(async () => 'retry', true);
		for (let i = 0; i < MAX_ATTEMPTS && last.remaining; i++) last = await box.flush(async () => 'retry', true);
		expect(last.remaining).toBe(0);
		expect(last.dropped[0].lastError).toMatch(/várias tentativas/);
	});

	it('erro inesperado na entrega não trava a fila', async () => {
		const box = new Outbox('career:d', memoryStorage(), Date.now, ids);
		await box.enqueue({ kind: 'tactic', payload: {} });
		const report = await box.flush(async () => { throw new Error('quebrou'); });
		expect(report.dropped[0].lastError).toBe('quebrou');
	});

	it('canal reativo: estados Aguardando → Sincronizando → Sincronizado, e Falha quando o servidor recusa', async () => {
		const storage = memoryStorage();
		let answer: Delivery = 'ok';
		const reports: number[] = [];
		const channel = new SyncChannel('career:e', { storage, deliver: async () => answer, onReport: (r) => reports.push(r.delivered.length) });
		expect(channel.status).toBe('synced');
		await channel.enqueue({ kind: 'tactic', payload: { v: 1 }, dedupe: 'tactic' });
		expect(channel.status).toBe('pending');
		expect(channel.pending).toHaveLength(1);
		await channel.flush(true);
		expect(channel.status).toBe('synced');
		expect(channel.pending).toHaveLength(0);
		expect(channel.lastSyncedAt).not.toBeNull();
		answer = 'retry';
		await channel.enqueue({ kind: 'training', payload: {}, dedupe: 'training' });
		await channel.flush(true);
		expect(channel.status).toBe('reconnecting');
		answer = 'drop';
		await channel.flush(true);
		expect(channel.status).toBe('failed');
		expect(reports).toEqual([1, 0, 0]);
		// gravação direta bem-sucedida não esconde fila pendente
		await channel.enqueue({ kind: 'tip', payload: {} });
		channel.mark('synced');
		expect(channel.status).toBe('pending');
	});
});
