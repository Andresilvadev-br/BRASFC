import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Central de Atualizações (cliente): a verificação nunca mostra sucesso falso, alterações não salvas
 * bloqueiam a aplicação e a versão carregada é conferida depois da recarga.
 */
const store = new Map<string, string>();
const fakeStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
let reloads = 0;

beforeEach(() => {
	store.clear();
	reloads = 0;
	vi.resetModules();
	vi.stubGlobal('localStorage', fakeStorage);
	vi.stubGlobal('navigator', { onLine: true });
	vi.stubGlobal('location', { reload: () => void reloads++ });
});
afterEach(() => vi.unstubAllGlobals());

const remote = (name: string, version = '0.4.0') => ({ version, commit: name.split('+')[1] ?? 'x', name, builtAt: '2026-11-18T00:00:00Z', environment: 'producao', channel: 'estavel', database: '0004_evolution', releases: [] });

describe('central de atualizações', () => {
	it('mesma versão no servidor → atualizado; versão diferente → disponível (e obrigatória quando muda a versão menor)', async () => {
		const u = await import('#lib/stores/updates.svelte.ts');
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(remote(u.CURRENT.name, u.CURRENT.version)), { status: 200 })));
		expect(await u.checkForUpdate()).toBe('atualizado');
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(remote('9.9.0+abc', '9.9.0')), { status: 200 })));
		expect(await u.checkForUpdate()).toBe('disponivel');
		expect(u.updates.required).toBe(true);
	});

	it('sem conexão ou servidor com erro: nunca informa "atualizado"', async () => {
		const u = await import('#lib/stores/updates.svelte.ts');
		vi.stubGlobal('navigator', { onLine: false });
		expect(await u.checkForUpdate()).toBe('offline');
		vi.stubGlobal('navigator', { onLine: true });
		vi.stubGlobal('fetch', vi.fn(async () => new Response('falhou', { status: 503 })));
		expect(await u.checkForUpdate()).toBe('erro');
		vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
		expect(await u.checkForUpdate()).toBe('erro'); // resposta sem versão
	});

	it('alterações não salvas bloqueiam a atualização (nada é recarregado)', async () => {
		const u = await import('#lib/stores/updates.svelte.ts');
		const { markDirty, markClean } = await import('#lib/stores/unsaved.svelte.ts');
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(remote('9.9.0+abc', '9.9.0')), { status: 200 })));
		await u.checkForUpdate();
		markDirty('tactic', 'Tática não salva');
		const r = await u.applyUpdate();
		expect(r).toEqual({ ok: false, blocked: ['Tática não salva'] });
		expect(reloads).toBe(0);
		markClean('tactic');
		const ok = await u.applyUpdate();
		expect(ok.ok).toBe(true);
		expect(reloads).toBe(1);
		expect(JSON.parse(store.get('brasfc.update.expect')!).to).toBe('9.9.0+abc');
	});

	it('depois de recarregar: versão esperada → sucesso; versão diferente → erro honesto', async () => {
		const first = await import('#lib/stores/updates.svelte.ts');
		store.set('brasfc.update.expect', JSON.stringify({ to: first.CURRENT.name, from: '0.3.0+old' }));
		vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} });
		vi.stubGlobal('BroadcastChannel', class { onmessage = null; postMessage() {} close() {} });
		const stop = first.initUpdates({ registerWorker: false });
		expect(first.updates.justUpdated).toEqual({ from: '0.3.0+old', to: first.CURRENT.name });
		stop();
		vi.resetModules();
		const second = await import('#lib/stores/updates.svelte.ts');
		store.set('brasfc.update.expect', JSON.stringify({ to: '9.9.9+nao-carregou', from: second.CURRENT.name }));
		const stop2 = second.initUpdates({ registerWorker: false });
		expect(second.updates.status).toBe('erro');
		expect(second.updates.justUpdated).toBeNull();
		stop2();
	});
});
