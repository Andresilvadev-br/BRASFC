// Modo offline: o próprio aplicativo roda o jogo completo (o mesmo servidor do site),
// com o banco PGlite gravado na pasta do usuário. Nada sai do computador.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/** Pasta do jogo embutido: no instalador fica em resources/app-offline; em desenvolvimento, o build do repositório. */
function gameDir(app) {
	const packaged = path.join(process.resourcesPath || '', 'app-offline');
	if (app.isPackaged) return packaged;
	const local = path.join(__dirname, 'offline', 'app-offline');
	return fs.existsSync(path.join(local, 'server', 'index.js')) ? local : path.join(__dirname, '..');
}

function isAvailable(app) {
	const dir = gameDir(app);
	return fs.existsSync(path.join(dir, 'server', 'index.js')) && fs.existsSync(path.join(dir, 'build', 'handler.js'));
}

function portFree(port) {
	return new Promise((resolve) => {
		const s = net.createServer();
		s.once('error', () => resolve(false));
		s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
	});
}

function randomPort() {
	return new Promise((resolve, reject) => {
		const s = net.createServer();
		s.once('error', reject);
		s.listen(0, '127.0.0.1', () => {
			const { port } = s.address();
			s.close(() => resolve(port));
		});
	});
}

function waitHealthy(url, timeoutMs) {
	const started = Date.now();
	return new Promise((resolve, reject) => {
		const tick = async () => {
			try {
				const r = await fetch(`${url}/api/health`);
				if (r.ok) return resolve();
			} catch {
				/* ainda subindo */
			}
			if (Date.now() - started > timeoutMs) return reject(new Error('O jogo offline não respondeu a tempo.'));
			setTimeout(tick, 250);
		};
		void tick();
	});
}

let running = null;

/**
 * Sobe o servidor local uma única vez por execução do app.
 * A porta preferida é fixa (mesma origem a cada abertura: preferências e sessão continuam);
 * se estiver ocupada, usa outra livre.
 */
async function startLocalServer(app, preferredPort) {
	if (running) return running;
	running = (async () => {
		const dir = gameDir(app);
		const saves = path.join(app.getPath('userData'), 'saves', 'pglite');
		fs.mkdirSync(saves, { recursive: true });
		const port = preferredPort && (await portFree(preferredPort)) ? preferredPort : await randomPort();
		Object.assign(process.env, {
			NODE_ENV: 'production',
			HOST: '127.0.0.1',
			PORT: String(port),
			// sem isto o adapter-node supõe https e a checagem de origem recusa as gravações (403)
			ORIGIN: `http://127.0.0.1:${port}`,
			BRASFC_ALLOW_PGLITE: '1',
			BRASFC_OFFLINE: '1',
			PGLITE_DIR: saves
		});
		delete process.env.DATABASE_URL;
		await import(pathToFileURL(path.join(dir, 'server', 'index.js')).href);
		const url = `http://127.0.0.1:${port}`;
		await waitHealthy(url, 60_000);
		return { url, port, saves };
	})();
	running.catch(() => (running = null));
	return running;
}

/** Fecha o banco com segurança (grava tudo antes de sair). */
async function stopLocalServer() {
	if (!running) return;
	try {
		await globalThis[Symbol.for('brasfc.shutdown')]?.();
	} catch {
		/* encerrando de qualquer forma */
	}
}

module.exports = { isAvailable, startLocalServer, stopLocalServer, gameDir };
