import { notify } from './island.svelte.ts';
import { hasUnsaved, pendingWrites } from './unsaved.svelte.ts';

type NativeUpdate = { status: string; version: string | null; progress: number; automatic: boolean; error: string | null };
export const nativeUpdate = $state<{ value: NativeUpdate | null }>({ value: null });
/**
 * Integração com o aplicativo do Windows (casca Electron em /desktop).
 * Dentro do app, `window.brasfcDesktop` existe (ponte segura do preload); no navegador, não.
 */
type Bridge = {
	isDesktop: true;
	update?(action: string, value?: boolean): Promise<NativeUpdate | boolean | null>;
	onUpdate?(cb: (state: NativeUpdate) => void): () => void;
	getState(): Promise<{ fullscreen: boolean; maximized: boolean; version: string; bar: number }>;
	quit?(): Promise<boolean>;
	openSaves?(): Promise<boolean>;
	setFullscreen(on: boolean): Promise<boolean>;
	toggleFullscreen(): Promise<boolean>;
	onState(cb: (s: { fullscreen: boolean; maximized: boolean }) => void): () => void;
};

export const desktop = $state({ active: false, fullscreen: false, version: '' });

function bridge(): Bridge | null {
	if (typeof window === 'undefined') return null;
	const b = (window as unknown as { brasfcDesktop?: Bridge }).brasfcDesktop;
	return b?.isDesktop ? b : null;
}

export function initDesktop(): () => void {
	const b = bridge();
	if (!b) return () => {};
	desktop.active = true;
	document.documentElement.classList.add('desktop-app');
	void b.getState().then((s) => {
		desktop.fullscreen = s.fullscreen;
		desktop.version = s.version;
		document.documentElement.classList.toggle('desktop-full', s.fullscreen);
	});
	return b.onState((s) => {
		desktop.fullscreen = s.fullscreen;
		document.documentElement.classList.toggle('desktop-full', s.fullscreen);
	});
}

export function toggleFullscreen() {
	void bridge()?.toggleFullscreen();
}
export function setFullscreen(on: boolean) {
	void bridge()?.setFullscreen(on);
}

/** Fecha o aplicativo (o save local é fechado com segurança antes). */
export function quitApp(): boolean {
	const b = bridge();
	if (!b?.quit) return false;
	void b.quit();
	return true;
}

/** Abre no Windows a pasta onde ficam as carreiras. */
export function openSavesFolder() {
	void bridge()?.openSaves?.();
}

export async function nativeUpdateAction(action: string, value?: boolean) {
	if (action === 'install' && (hasUnsaved() || pendingWrites.count)) return false;
	const result = await bridge()?.update?.(action, value);
	if (result && typeof result === 'object') nativeUpdate.value = result;
	return result;
}

export function initNativeUpdates() {
	const b = bridge();
	if (!b?.onUpdate) return () => {};
	const stop = b.onUpdate((value) => {
		const previous = nativeUpdate.value;
		nativeUpdate.value = value;
		if (value.status === 'ready' && (previous?.status !== 'ready' || previous.version !== value.version)) {
			notify({ icon: 'refresh', tone: 'success', title: 'Atualização pronta', detail: `Versão ${value.version} disponível na Central de Atualizações.` });
		}
	});
	const online = () => { void nativeUpdateAction('check'); };
	window.addEventListener('online', online);
	void nativeUpdateAction('get');
	return () => { stop(); window.removeEventListener('online', online); };
}
