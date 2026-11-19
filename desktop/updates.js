// Adaptador do electron-updater. O provedor e a verificação de integridade ficam no Electron.
function desktopUpdates({ updater, publish, persist, automatic = true, canInstall, drain, interval = 15 * 60_000 }) {
	let state = { status: 'idle', automatic, progress: 0, version: null, error: null };
	let checking, downloading, installing = false, checkedAt = 0;
	const set = (patch) => { state = { ...state, ...patch }; publish(state); };
	const failed = (error) => set({ status: 'error', error: error?.message || String(error) });
	updater.autoDownload = false;
	updater.autoInstallOnAppQuit = false;
	updater.allowDowngrade = false;
	updater.allowPrerelease = false;
	updater.on('checking-for-update', () => set({ status: 'checking', error: null }));
	updater.on('update-not-available', () => set({ status: 'current', version: null, progress: 0 }));
	updater.on('update-available', (info) => {
		set({ status: 'available', version: info.version, progress: 0, error: null });
		if (state.automatic) void download();
	});
	updater.on('download-progress', (info) => set({ status: 'downloading', progress: Math.min(100, Math.max(0, info.percent)) }));
	updater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version, progress: 100, error: null }));
	updater.on('error', failed);
	function check(manual = false) {
		if (checking) return checking;
		if (downloading || ['ready', 'installing'].includes(state.status) || (!manual && Date.now() - checkedAt < 60_000)) return Promise.resolve();
		checkedAt = Date.now();
		checking = Promise.resolve().then(() => updater.checkForUpdates()).catch(failed).finally(() => { checking = null; });
		return checking;
	}
	function download() {
		if (downloading) return downloading;
		if (!state.version || !['available', 'error'].includes(state.status)) return Promise.resolve();
		set({ status: 'downloading', error: null, progress: 0 });
		downloading = Promise.resolve().then(() => updater.downloadUpdate()).catch(failed).finally(() => { downloading = null; });
		return downloading;
	}
	async function install() {
		if (installing || state.status !== 'ready' || !canInstall()) return false;
		installing = true;
		set({ status: 'installing' });
		try {
			await drain();
			updater.quitAndInstall(true, true);
			return true;
		} catch (error) {
			installing = false;
			set({ status: 'ready', error: error?.message || String(error) });
			return false;
		}
	}
	const timer = setInterval(() => void check(), interval);
	timer.unref();
	return {
		get: () => state, check, download, install, close: () => clearInterval(timer),
		setAutomatic(value) {
			set({ automatic: value });
			persist(value);
			if (value && state.status === 'available') void download();
		}
	};
}
module.exports = { desktopUpdates };
