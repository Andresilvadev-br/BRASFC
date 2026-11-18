// Ponte mínima e segura entre o jogo e a janela do Windows (sem Node no navegador).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('brasfcDesktop', {
	isDesktop: true,
	getState: () => ipcRenderer.invoke('desktop:get-state'),
	setFullscreen: (on) => ipcRenderer.invoke('desktop:set-fullscreen', Boolean(on)),
	toggleFullscreen: () => ipcRenderer.invoke('desktop:toggle-fullscreen'),
	retry: () => ipcRenderer.invoke('desktop:retry'),
	onState: (cb) => {
		const handler = (_e, state) => cb(state);
		ipcRenderer.on('desktop:state', handler);
		return () => ipcRenderer.removeListener('desktop:state', handler);
	}
});
