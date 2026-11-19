import type { Release } from '#lib/changelog.ts';
import { hasUnsaved, pendingWrites, unsavedLabels } from './unsaved.svelte.ts';

/**
 * Central de Atualizações (Dev 0.4) — cliente.
 *
 * A versão nova é PUBLICADA no servidor pela implantação (VPS); o botão "Atualizar agora" troca o
 * CLIENTE para a versão já publicada (service worker + recarga), nunca executa nada no servidor.
 * Fluxo: verificar → mostrar novidades → proteger alterações não salvas → aplicar → confirmar que a
 * versão carregada é a esperada → mostrar "O que há de novo". Falha de rede nunca vira sucesso.
 */
export interface VersionInfo {
	version: string;
	commit: string;
	name: string;
	builtAt: string;
	environment: string;
	channel: string;
	database: string | null;
	releases: Release[];
}

export type UpdateStatus = 'idle' | 'verificando' | 'atualizado' | 'disponivel' | 'aplicando' | 'offline' | 'erro';

const EXPECT_KEY = 'brasfc.update.expect';
const SEEN_KEY = 'brasfc.update.seen';

export const CURRENT = { version: __APP_VERSION__, commit: __GIT_SHA__, name: `${__APP_VERSION__}+${__GIT_SHA__}`, builtAt: __BUILD_TIME__ };

export const updates = $state({
	status: 'idle' as UpdateStatus,
	remote: null as VersionInfo | null,
	checkedAt: null as string | null,
	message: '',
	/** a versão nova muda a parte "menor" (0.3 → 0.4): o cliente antigo pode não conversar com o servidor novo */
	required: false,
	/** outra aba já aplicou a atualização */
	otherTab: false,
	/** recém-atualizado (mostra "O que há de novo") */
	justUpdated: null as null | { from: string; to: string },
	installable: false,
	installed: false
});

let channel: BroadcastChannel | null = null;
let deferredPrompt: (Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;

function storage(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

const minor = (v: string) => v.split('.').slice(0, 2).join('.');

/** Consulta a versão publicada. Sem conexão ou erro → estado honesto (nunca "atualizado"). */
export async function checkForUpdate(): Promise<UpdateStatus> {
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		updates.status = 'offline';
		updates.message = 'Sem conexão: não dá para saber se há versão nova.';
		return updates.status;
	}
	updates.status = 'verificando';
	try {
		const res = await fetch('/api/version', { cache: 'no-store', headers: { accept: 'application/json' } });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const info = (await res.json()) as VersionInfo;
		if (!info?.name || !info.version) throw new Error('Resposta inválida do servidor');
		updates.remote = info;
		updates.checkedAt = new Date().toISOString();
		if (info.name === CURRENT.name) {
			updates.status = 'atualizado';
			updates.required = false;
			updates.message = 'Você está na versão mais recente.';
		} else {
			updates.status = 'disponivel';
			updates.required = minor(info.version) !== minor(CURRENT.version);
			updates.message = `Versão ${info.version} disponível.`;
		}
	} catch (e) {
		updates.status = typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'erro';
		updates.message = updates.status === 'offline' ? 'Sem conexão com o servidor.' : `Não foi possível verificar agora (${(e as Error).message}).`;
	}
	return updates.status;
}

/**
 * Aplica a atualização do cliente. Com alterações não salvas, NÃO aplica: devolve a lista do que
 * seria perdido para a interface pedir confirmação.
 */
export async function applyUpdate(opts: { force?: boolean } = {}): Promise<{ ok: true } | { ok: false; blocked: string[] } | { ok: false; error: string }> {
	if (pendingWrites.count) return { ok: false, blocked: ['Gravação em andamento'] };
	if (!opts.force && hasUnsaved()) return { ok: false, blocked: unsavedLabels() };
	if (!updates.remote) {
		const st = await checkForUpdate();
		if (st !== 'disponivel') return { ok: false, error: updates.message };
	}
	updates.status = 'aplicando';
	storage()?.setItem(EXPECT_KEY, JSON.stringify({ to: updates.remote!.name, from: CURRENT.name }));
	channel?.postMessage({ type: 'applied', to: updates.remote!.name });
	try {
		const reg = await navigator.serviceWorker?.getRegistration();
		await reg?.update();
		const waiting = reg?.waiting ?? (await waitForWaiting(reg ?? null));
		if (waiting) {
			const changed = new Promise<void>((r) => navigator.serviceWorker.addEventListener('controllerchange', () => r(), { once: true }));
			waiting.postMessage({ type: 'SKIP_WAITING' });
			await Promise.race([changed, new Promise((r) => setTimeout(r, 4000))]);
		}
	} catch {
		// Sem service worker (navegador antigo/desenvolvimento): a recarga já traz a versão nova.
	}
	location.reload();
	return { ok: true };
}

function waitForWaiting(reg: ServiceWorkerRegistration | null): Promise<ServiceWorker | null> {
	if (!reg?.installing) return Promise.resolve(null);
	const sw = reg.installing;
	return new Promise((resolve) => {
		const t = setTimeout(() => resolve(reg.waiting), 8000);
		sw.addEventListener('statechange', () => {
			if (sw.state === 'installed') {
				clearTimeout(t);
				resolve(reg.waiting);
			}
		});
	});
}

/** Depois de recarregar: confere se a versão carregada é a esperada. */
function confirmLoaded() {
	const st = storage();
	const raw = st?.getItem(EXPECT_KEY);
	if (!raw) return;
	st?.removeItem(EXPECT_KEY);
	try {
		const exp = JSON.parse(raw) as { to: string; from: string };
		if (exp.to === CURRENT.name) {
			updates.justUpdated = { from: exp.from, to: exp.to };
			updates.status = 'atualizado';
			updates.message = `Atualizado para a versão ${CURRENT.version}.`;
		} else {
			updates.status = 'erro';
			updates.message = `A versão carregada (${CURRENT.name}) não é a esperada (${exp.to}). Tente atualizar de novo em alguns instantes.`;
		}
	} catch {
		/* registro corrompido: ignora */
	}
}

/** "O que há de novo" aparece uma vez por versão (e só quando faz sentido). */
export function shouldShowWhatsNew(): boolean {
	const st = storage();
	if (!st) return false;
	const seen = st.getItem(SEEN_KEY);
	if (!seen) {
		st.setItem(SEEN_KEY, CURRENT.version); // primeira visita: não interrompe
		return false;
	}
	return seen !== CURRENT.version && (updates.justUpdated !== null || minor(seen) !== minor(CURRENT.version));
}

export function markWhatsNewSeen() {
	storage()?.setItem(SEEN_KEY, CURRENT.version);
	updates.justUpdated = null;
}

export async function installApp(): Promise<boolean> {
	if (!deferredPrompt) return false;
	await deferredPrompt.prompt();
	const choice = await deferredPrompt.userChoice;
	deferredPrompt = null;
	updates.installable = false;
	return choice.outcome === 'accepted';
}

/** Liga a central: confirmação pós-atualização, abas, instalação e verificação periódica. */
export function initUpdates(opts: { registerWorker: boolean }): () => void {
	confirmLoaded();
	// Service worker só na versão publicada (no desenvolvimento ele atrapalharia o recarregamento).
	if (opts.registerWorker && 'serviceWorker' in navigator) {
		navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch((e) => console.warn('[pwa] service worker indisponível', e));
	}
	updates.installed = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
	try {
		channel = new BroadcastChannel('brasfc-updates');
		channel.onmessage = (e) => {
			if (e.data?.type === 'applied' && e.data.to !== CURRENT.name) updates.otherTab = true;
		};
	} catch {
		channel = null;
	}
	const onPrompt = (e: Event) => {
		e.preventDefault();
		deferredPrompt = e as typeof deferredPrompt;
		updates.installable = true;
	};
	const onInstalled = () => {
		updates.installed = true;
		updates.installable = false;
	};
	const onOnline = () => void checkForUpdate();
	window.addEventListener('beforeinstallprompt', onPrompt);
	window.addEventListener('appinstalled', onInstalled);
	window.addEventListener('online', onOnline);
	const first = setTimeout(() => void checkForUpdate(), 4000);
	const timer = setInterval(() => void checkForUpdate(), 5 * 60_000);
	return () => {
		clearTimeout(first);
		clearInterval(timer);
		window.removeEventListener('beforeinstallprompt', onPrompt);
		window.removeEventListener('appinstalled', onInstalled);
		window.removeEventListener('online', onOnline);
		channel?.close();
	};
}
