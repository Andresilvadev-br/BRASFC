// BRASFC para Windows — casca leve em Electron.
// O jogo roda no servidor oficial (as partidas e a carreira são processadas lá);
// a casca cuida da janela, da tela cheia e da própria atualização.
const { app, BrowserWindow, ipcMain, Menu, screen, shell, globalShortcut, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const GAME_URL = process.env.BRASFC_URL || 'https://aldetes.vps-kinghost.net';
const ORIGIN = new URL(GAME_URL).origin;
const SELFTEST = process.argv.includes('--selftest');
const BG = '#101418';
const BAR = 36; // altura da barra de título integrada ao jogo

if (!SELFTEST && !app.requestSingleInstanceLock()) app.quit();

const prefsFile = () => path.join(app.getPath('userData'), 'janela.json');
function readPrefs() {
	try {
		return JSON.parse(fs.readFileSync(prefsFile(), 'utf8'));
	} catch {
		return {};
	}
}
function writePrefs(p) {
	try {
		fs.mkdirSync(path.dirname(prefsFile()), { recursive: true });
		fs.writeFileSync(prefsFile(), JSON.stringify(p));
	} catch {
		/* preferência de janela não é crítica */
	}
}

/** Tamanho lembrado, mas SEMPRE centralizado no monitor onde está o cursor (área útil, sem a barra de tarefas). */
function centeredBounds(prefs) {
	const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
	const area = display.workArea;
	const width = Math.min(prefs.width || Math.min(1440, Math.round(area.width * 0.82)), area.width);
	const height = Math.min(prefs.height || Math.min(900, Math.round(area.height * 0.86)), area.height);
	return {
		width,
		height,
		x: Math.round(area.x + (area.width - width) / 2),
		y: Math.round(area.y + (area.height - height) / 2),
		area
	};
}

let win = null;
let prefs = {};

function sendState() {
	if (!win || win.isDestroyed()) return;
	win.webContents.send('desktop:state', { fullscreen: win.isFullScreen(), maximized: win.isMaximized() });
}

function setFullscreen(on) {
	if (!win) return;
	win.setFullScreen(Boolean(on));
}

function createWindow() {
	prefs = readPrefs();
	const b = centeredBounds(prefs);
	win = new BrowserWindow({
		x: b.x,
		y: b.y,
		width: b.width,
		height: b.height,
		minWidth: 1024,
		minHeight: 640,
		useContentSize: true,
		show: false,
		backgroundColor: BG,
		title: 'BRASFC',
		icon: path.join(__dirname, 'assets', 'icon.png'),
		autoHideMenuBar: true,
		titleBarStyle: 'hidden',
		titleBarOverlay: { color: BG, symbolColor: '#E7EDF0', height: BAR },
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			spellcheck: false
		}
	});
	Menu.setApplicationMenu(null);
	win.webContents.setUserAgent(`${win.webContents.getUserAgent()} BRASFC-Desktop/${app.getVersion()}`);

	win.once('ready-to-show', () => {
		// O Windows ajusta o tamanho à escala da tela (125%, 150%…) e à moldura oculta:
		// reaplica o tamanho de conteúdo pedido e recentraliza com o tamanho real.
		win.setContentSize(b.width, b.height);
		const real = win.getBounds();
		const area = screen.getDisplayMatching(real).workArea;
		win.setPosition(Math.round(area.x + (area.width - real.width) / 2), Math.round(area.y + (area.height - real.height) / 2));
		win.setContentSize(b.width, b.height);
		if (prefs.maximized) win.maximize();
		if (prefs.fullscreen) win.setFullScreen(true);
		win.show();
		win.focus();
		if (SELFTEST) void selftest();
	});

	const persist = () => {
		if (!win || win.isDestroyed()) return;
		const maximized = win.isMaximized();
		const fullscreen = win.isFullScreen();
		// Guarda a área de conteúdo (não a moldura), para o tamanho não variar com a escala do Windows.
		if (!maximized && !fullscreen && !win.isMinimized()) {
			const [width, height] = win.getContentSize();
			prefs = { ...prefs, width, height };
		}
		prefs = { ...prefs, maximized, fullscreen };
		writePrefs(prefs);
	};
	for (const ev of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) {
		win.on(ev, () => {
			sendState();
			persist();
		});
	}
	win.on('close', persist);

	// F11 e Alt+Enter: tela cheia. Teclas capturadas só com a janela em foco (não atrapalham outros programas).
	win.webContents.on('before-input-event', (e, input) => {
		if (input.type !== 'keyDown') return;
		if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
			e.preventDefault();
			setFullscreen(!win.isFullScreen());
		}
	});

	// Links externos abrem no navegador; a janela só navega dentro do jogo.
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:/.test(url)) void shell.openExternal(url);
		return { action: 'deny' };
	});
	win.webContents.on('will-navigate', (e, url) => {
		if (url.startsWith('file:')) return;
		if (new URL(url).origin !== ORIGIN) {
			e.preventDefault();
			void shell.openExternal(url);
		}
	});

	// Sem conexão: página própria com "tentar novamente" (nunca uma tela branca).
	win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
		if (!isMain || code === -3) return; // -3 = navegação cancelada
		void win.loadFile(path.join(__dirname, 'pages', 'offline.html'), { query: { url: url || GAME_URL } });
	});

	void win.loadURL(GAME_URL);
}

ipcMain.handle('desktop:get-state', () => ({
	fullscreen: Boolean(win?.isFullScreen()),
	maximized: Boolean(win?.isMaximized()),
	version: app.getVersion(),
	bar: BAR
}));
ipcMain.handle('desktop:set-fullscreen', (_e, on) => {
	setFullscreen(on);
	return true;
});
ipcMain.handle('desktop:toggle-fullscreen', () => {
	if (win) setFullscreen(!win.isFullScreen());
	return true;
});
ipcMain.handle('desktop:retry', () => {
	if (win) void win.loadURL(GAME_URL);
	return true;
});

/** Autoteste (CI e verificação local): mede a centralização e a tela cheia de verdade e encerra. */
async function selftest() {
	const wait = (ms) => new Promise((r) => setTimeout(r, ms));
	const b = win.getBounds();
	const area = screen.getDisplayMatching(b).workArea;
	const dx = Math.abs(b.x - (area.x + (area.width - b.width) / 2));
	const dy = Math.abs(b.y - (area.y + (area.height - b.height) / 2));
	win.setFullScreen(true);
	await wait(1200);
	const full = win.isFullScreen();
	win.setFullScreen(false);
	await wait(1200);
	const back = !win.isFullScreen();
	await wait(Number(process.env.BRASFC_SHOT_WAIT || 0));
	if (process.env.BRASFC_SHOT) fs.writeFileSync(process.env.BRASFC_SHOT, (await win.webContents.capturePage()).toPNG());
	const page = { url: win.webContents.getURL(), title: win.webContents.getTitle() };
	const result = { bounds: b, workArea: area, centered: prefs.maximized || prefs.fullscreen ? 'n/a' : dx <= 2 && dy <= 2, fullscreen: full, leftFullscreen: back, page };
	process.stdout.write(`SELFTEST ${JSON.stringify(result)}\n`);
	app.exit(result.centered !== false && full && back ? 0 : 1);
}

app.on('second-instance', () => {
	if (!win) return;
	if (win.isMinimized()) win.restore();
	win.focus();
});

app.whenReady().then(() => {
	if (SELFTEST) app.setPath('userData', path.join(app.getPath('temp'), 'brasfc-selftest'));
	createWindow();
	if (app.isPackaged && !SELFTEST) {
		// Atualização da própria casca (o jogo em si se atualiza pelo servidor).
		const { autoUpdater } = require('electron-updater');
		autoUpdater.autoInstallOnAppQuit = true;
		autoUpdater.on('update-downloaded', (info) => {
			void dialog
				.showMessageBox(win, {
					type: 'info',
					title: 'BRASFC',
					message: `Versão ${info.version} do aplicativo baixada.`,
					detail: 'Ela será instalada ao fechar o BRASFC. Deseja reiniciar agora?',
					buttons: ['Reiniciar agora', 'Depois'],
					defaultId: 1,
					cancelId: 1
				})
				.then((r) => {
					if (r.response === 0) autoUpdater.quitAndInstall();
				});
		});
		autoUpdater.on('error', () => {
			/* sem internet ou sem versão nova: o jogo continua normalmente */
		});
		void autoUpdater.checkForUpdates().catch(() => {});
	}
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
