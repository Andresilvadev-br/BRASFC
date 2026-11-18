/**
 * Integração com o aplicativo do Windows (casca Electron em /desktop).
 * Dentro do app, `window.brasfcDesktop` existe (ponte segura do preload); no navegador, não.
 */
type Bridge = {
	isDesktop: true;
	getState(): Promise<{ fullscreen: boolean; maximized: boolean; version: string; bar: number }>;
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
