/**
 * Integração com o aplicativo do Windows (casca Electron em /desktop).
 * Dentro do app, `window.brasfcDesktop` existe (ponte segura do preload); no navegador, não.
 */
type Bridge = {
	isDesktop: true;
	getState(): Promise<{ fullscreen: boolean; maximized: boolean; version: string; bar: number; mode?: DesktopMode; offlineAvailable?: boolean }>;
	setMode?(mode: DesktopMode): Promise<boolean>;
	openSaves?(): Promise<boolean>;
	setFullscreen(on: boolean): Promise<boolean>;
	toggleFullscreen(): Promise<boolean>;
	onState(cb: (s: { fullscreen: boolean; maximized: boolean; mode?: DesktopMode; offlineAvailable?: boolean }) => void): () => void;
};

/** online = servidor oficial (carreiras na nuvem); offline = jogo rodando no computador (carreiras salvas nele). */
export type DesktopMode = 'online' | 'offline';

export const desktop = $state({ active: false, fullscreen: false, version: '', mode: 'online' as DesktopMode, offlineAvailable: false });

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
		desktop.mode = s.mode ?? 'online';
		desktop.offlineAvailable = Boolean(s.offlineAvailable);
		document.documentElement.classList.toggle('desktop-full', s.fullscreen);
	});
	return b.onState((s) => {
		desktop.fullscreen = s.fullscreen;
		if (s.mode) desktop.mode = s.mode;
		if (s.offlineAvailable !== undefined) desktop.offlineAvailable = s.offlineAvailable;
		document.documentElement.classList.toggle('desktop-full', s.fullscreen);
	});
}

export function toggleFullscreen() {
	void bridge()?.toggleFullscreen();
}
export function setFullscreen(on: boolean) {
	void bridge()?.setFullscreen(on);
}

/** Troca entre jogar online e offline (o app recarrega o jogo no outro modo). */
export async function setDesktopMode(mode: DesktopMode): Promise<boolean> {
	const b = bridge();
	if (!b?.setMode) return false;
	return b.setMode(mode);
}

/** Abre no Windows a pasta onde ficam as carreiras offline. */
export function openSavesFolder() {
	void bridge()?.openSaves?.();
}
