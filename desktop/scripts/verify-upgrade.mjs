// Run from the repository root on an isolated Windows runner after installing the stable baseline.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { Transform } from 'node:stream';
import { setTimeout as wait } from 'node:timers/promises';
import WebSocket from 'ws';

assert.equal(process.platform, 'win32');
const [exe, dist, evidence, rollbackDist] = process.argv.slice(2).map((path) => resolve(path));
assert(exe && dist && evidence);
const feed = 'http://127.0.0.1:4187';
let feedDist = dist;
const metadataVersion = (directory) => readFileSync(join(directory, 'latest.yml'), 'utf8').match(/^version: (.+)$/m)[1].trim();
const version = metadataVersion(dist);
let feedMode = 'missing';
const served = { missing: 0, truncated: 0, corrupt: 0, healthy: 0 };
const server = createServer((request, response) => {
	const name = basename(new URL(request.url, feed).pathname);
	if (!['latest.yml', 'BRASFC-Setup.exe', 'BRASFC-Setup.exe.blockmap'].includes(name)) {
		response.writeHead(404).end();
		return;
	}
	if (name !== 'latest.yml' && (feedMode === 'missing' || (name.endsWith('.blockmap') && feedMode !== 'healthy'))) {
		if (name.endsWith('.exe')) served[feedMode]++;
		response.writeHead(404).end();
		return;
	}
	const file = join(feedDist, name);
	const size = statSync(file).size;
	response.setHeader('Content-Length', size);
	if (!name.endsWith('.exe')) {
		createReadStream(file).pipe(response);
		return;
	}
	served[feedMode]++;
	if (feedMode === 'truncated') {
		const stream = createReadStream(file, { end: Math.min(65_535, size - 2) });
		stream.once('end', () => response.destroy());
		stream.pipe(response, { end: false });
	} else if (feedMode === 'corrupt') {
		let first = true;
		const changed = new Transform({ transform(chunk, _encoding, done) {
			if (first) { chunk[0] ^= 0xff; first = false; }
			done(null, chunk);
		} });
		createReadStream(file).pipe(changed).pipe(response);
	} else createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(4187, '127.0.0.1', resolve));
const fromVersion = process.env.BRASFC_BASE_VERSION ?? '1.3.1';
const result = { fromVersion, targetVersion: version, tests: [] };
let app;
let socket;
let inspector = false;
let diagnostics = '';
async function until(fn, timeout = 45_000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		try { const value = await fn(); if (value) return value; } catch {}
		await wait(350);
	}
	throw Error('Etapa do upgrade excedeu o tempo de espera.');
}
async function attach() {
	const page = await until(async () => {
		const [web, main] = await Promise.all([4190, 4191].map(async (port) => {
			try { return await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(600) }).then(r => r.json()); }
			catch { return []; }
		}));
		const page = web.find(p => p.type === 'page');
		if (page) { inspector = false; return page; }
		const runtime = main.find(p => p.type === 'node');
		if (runtime) { inspector = true; return runtime; }
		return false;
	}, 65_000);
	socket = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
}
let id = 0;
function evaluate(expression) {
	if (inspector) expression = `process.mainModule.require('electron').BrowserWindow.getAllWindows()[0]?.webContents.executeJavaScript(${JSON.stringify(expression)}, true)`;
	return new Promise((resolve, reject) => {
		const messageId = ++id;
		const timer = setTimeout(() => { socket.off('message', handler); reject(Error('CDP sem resposta')); }, 15_000);
		function handler(raw) {
			const data = JSON.parse(String(raw));
			if (data.id !== messageId) return;
			clearTimeout(timer); socket.off('message', handler);
			if (data.error || data.result.exceptionDetails) reject(Error(JSON.stringify(data.error ?? data.result.exceptionDetails)));
			else resolve(data.result.result.value);
		}
		socket.on('message', handler);
		socket.send(JSON.stringify({ id: messageId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
	});
}
function launch(extraEnv = {}) {
	app = spawn(exe, ['--remote-debugging-port=4190', '--remote-debugging-address=127.0.0.1', '--inspect=127.0.0.1:4191'], {
		env: { ...process.env, ...extraEnv, ELECTRON_ENABLE_LOGGING: '1' }, stdio: ['ignore', 'ignore', 'pipe']
	});
	app.stderr.on('data', (data) => diagnostics = (diagnostics + String(data)).slice(-4500));
	app.on('exit', (code) => diagnostics += `
Processo saiu com código ${code}`);
	return attach();
}
const preferences = join(process.env.APPDATA, 'BRASFC', 'janela.json');
const useFeed = () => writeFileSync(join(exe, '..', 'resources', 'app-update.yml'),
	`provider: generic\nurl: ${feed}\nupdaterCacheDirName: brasfc-upgrade-validation\n`);
const installedVersion = () => execFileSync('powershell.exe', ['-NoProfile', '-Command', '(Get-Item -LiteralPath $env:BRASFC_UPGRADE_EXE).VersionInfo.ProductVersion'], {
	env: { ...process.env, BRASFC_UPGRADE_EXE: exe }, encoding: 'utf8'
}).trim();
try {
	// Only this disposable Windows installation points to a local feed. The package still passes the updater's original SHA-512 verification.
	useFeed();
	const { mkdirSync } = await import('node:fs');
	mkdirSync(join(preferences, '..'), { recursive: true });
	writeFileSync(preferences, JSON.stringify({ mode: 'offline', automatic: false, width: 1001 }));
	assert.equal(installedVersion().split('.').slice(0, 3).join('.'), fromVersion);
	await launch();
	await until(() => evaluate("location.origin.startsWith('http://127.0.0.1:47615') && !!window.brasfcDesktop"));
	const old = await evaluate(`(async () => {
		const post = (path, body) => fetch(path, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
		const profile = (await post('/api/session', {})).profile;
		const { career } = await post('/api/careers',{mode:'coach',personName:'Teste de atualização',clubId:'bahia',world:'brasil'});
		if (!career?.id) throw Error('Falha ao criar save na versão anterior');
		const round = await post('/api/careers/' + career.id + '/matches',{version:career.version,step:'league:1',decisions:[]});
		if (!round.match) throw Error('Falha ao registrar o primeiro jogo');
		return { id:career.id, profile:profile.id, score:[round.match.homeGoals,round.match.awayGoals] };
	})()`);
	result.tests.push(`${fromVersion} instalado, perfil local e primeira partida oficial persistidos`);
	await evaluate("window.brasfcDesktop.update('auto', false)");
	await evaluate("window.brasfcDesktop.update('check', true)");
	await until(async () => (await evaluate("window.brasfcDesktop.update('state')"))?.version === version);
	for (const failure of ['missing', 'truncated', 'corrupt']) {
		feedMode = failure;
		await evaluate("window.brasfcDesktop.update('download')");
		const state = await until(async () => {
			const state = await evaluate("window.brasfcDesktop.update('state')");
			return state?.status === 'error' && state;
		}, 120_000);
		assert(served[failure] > 0);
		if (failure === 'corrupt') assert.match(state.error, /sha512|checksum|integrity/i);
		assert.equal(await evaluate("window.brasfcDesktop.update('install')"), false);
		assert.equal(installedVersion().split('.').slice(0, 3).join('.'), fromVersion);
		const preserved = await evaluate(`Promise.all([
			fetch('/api/session').then(r => r.json()).then(data => data.profile?.id),
			fetch('/api/careers/${old.id}/matches').then(r => r.json()).then(data => {
				const prior = data.matches?.find(m => m.round === 1);
				return prior && [prior.homeGoals, prior.awayGoals];
			})
		])`);
		assert.deepEqual(preserved, [old.profile, old.score]);
		assert.equal(JSON.parse(readFileSync(preferences, 'utf8')).automatic, false);
		(result.faults ??= []).push({ stage: 'download', fault: failure, rejected: true, previousVersionUsable: true, error: state.error });
	}
	result.tests.push('Download ausente, incompleto e corrompido rejeitados com a instalação, autenticação e save intactos');
	feedMode = 'healthy';
	await evaluate("window.brasfcDesktop.update('download')");
	await until(async () => (await evaluate("window.brasfcDesktop.update('state')"))?.status === 'ready', 120_000);
	assert(served.healthy > 0);
	assert.equal(await evaluate("window.brasfcDesktop.update('install')"), true);
	const oldPid = app.pid;
	// A connected main-process inspector keeps Node alive at shutdown and can retain Electron's instance lock.
	socket.close();
	await until(() => installedVersion().startsWith(version), 120_000);
	result.tests.push('Download repetido, pacote verificado pelo updater e NSIS aplicado pelo app');
	// The updater relaunches without the developer-only CDP argument.
	let relaunchPid;
	try {
		relaunchPid = await until(() => Number(execFileSync('powershell.exe', ['-NoProfile','-Command',
			'Get-Process BRASFC -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Id -ne ' + oldPid + ' } | Select-Object -First 1 -ExpandProperty Id'], {encoding:'utf8'}).trim()),60_000);
		result.tests.push('Nova instância aberta automaticamente após o NSIS');
	} catch {
		result.relaunchMissing = true;
	}
	if (relaunchPid) execFileSync('powershell.exe', ['-NoProfile','-Command',
		'(Get-Process -Id ' + relaunchPid + ').CloseMainWindow() | Out-Null; (Get-Process -Id ' + relaunchPid + ' -ErrorAction SilentlyContinue).WaitForExit(15000) | Out-Null']);
	await launch();
	await until(() => evaluate("location.origin.startsWith('http://127.0.0.1:47615') && !!window.brasfcDesktop"));
	const after = await evaluate(`(async () => {
		const { profile } = await fetch('/api/session').then(r=>r.json());
		const { career } = await fetch('/api/careers/${old.id}').then(r=>r.json());
		const matches = (await fetch('/api/careers/${old.id}/matches').then(r=>r.json())).matches;
		const prior = matches?.find(m => m.round === 1);
		const next = await fetch('/api/careers/${old.id}/matches', {method:'POST',headers:{'content-type':'application/json'},
			body:JSON.stringify({version:career?.version,step:'league:2',decisions:[]})});
		return { profile:profile?.id, id:career?.id, version:career?.version, desktop:(await window.brasfcDesktop.getState()).version,
			score:prior ? [prior.homeGoals, prior.awayGoals] : null, continued:next.ok };
	})()`);
	assert.equal(after.profile, old.profile);
	assert.equal(after.id, old.id);
	assert(after.version > 0);
	assert.equal(after.desktop, version);
	assert.deepEqual(after.score, old.score);
	assert(after.continued, 'A carreira precisa jogar a segunda rodada');
	assert.equal(JSON.parse(readFileSync(preferences, 'utf8')).automatic, false);
	result.tests.push('Reabertura na versão nova com conta, carreira avançada e preferência preservadas');
	assert(!result.relaunchMissing, 'A instalação atualizou, mas a abertura automática não foi observada');
	if (rollbackDist) {
		const candidate = metadataVersion(rollbackDist);
		feedDist = rollbackDist;
		socket.close();
		await new Promise((resolve) => { app.once('exit', resolve); app.kill(); });
		useFeed();
		const originalHash = createHash('sha256').update(readFileSync(exe)).digest('hex');
		const outcomeFile = join(preferences, '..', 'update-recovery', 'outcome.json');
		const outcome = () => JSON.parse(readFileSync(outcomeFile, 'utf8').replace(/^\uFEFF/, ''));
		const waitOffline = () => until(() => evaluate("location.origin.startsWith('http://127.0.0.1:47615') && !!window.brasfcDesktop"));
		const downloadCandidate = async () => {
			await evaluate("window.brasfcDesktop.update('check', true)");
			await until(async () => (await evaluate("window.brasfcDesktop.update('state')"))?.version === candidate);
			await evaluate("window.brasfcDesktop.update('download')");
			await until(async () => (await evaluate("window.brasfcDesktop.update('state')"))?.status === 'ready', 120_000);
		};
		const closeActive = () => execFileSync('powershell.exe', ['-NoProfile', '-Command', `
			Get-Process BRASFC -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:BRASFC_UPGRADE_EXE -and $_.MainWindowHandle -ne 0 } |
			ForEach-Object { $_.CloseMainWindow() | Out-Null; $_.WaitForExit(25000) | Out-Null }
		`], { env: { ...process.env, BRASFC_UPGRADE_EXE: exe } });
		const faultLog = join(preferences, '..', 'update-validation-fault');
		for (const fault of ['installer', 'first-boot']) {
			rmSync(faultLog, { force: true });
			const prior = (() => { try { return outcome().date; } catch { return ''; } })();
			await launch({
				BRASFC_VALIDATION_FAULT_LOG: faultLog,
				[fault === 'installer' ? 'BRASFC_VALIDATION_INSTALL_FAILURE' : 'BRASFC_VALIDATION_STARTUP_FAILURE']: '1'
			});
			await waitOffline();
			await downloadCandidate();
			const installed = await evaluate("window.brasfcDesktop.update('install')");
			assert.equal(installed, true, JSON.stringify(await evaluate("window.brasfcDesktop.update('state')")));
			socket.close();
			const restored = await until(() => {
				const state = outcome();
				return state.date !== prior && state.status === 'restored' && state;
			}, 240_000);
			assert.equal(readFileSync(faultLog, 'utf8'), fault);
			assert(installedVersion().startsWith(version));
			assert.equal(createHash('sha256').update(readFileSync(exe)).digest('hex'), originalHash);
			closeActive();
			await launch();
			await waitOffline();
			const retained = await evaluate(`Promise.all([
				fetch('/api/session').then(r => r.json()).then(data => data.profile?.id),
				fetch('/api/careers/${old.id}/matches').then(r => r.json()).then(data => data.matches?.map(m => m.round))
			])`);
			assert.equal(retained[0], old.profile);
			assert(retained[1].includes(1) && retained[1].includes(2));
			assert.equal(JSON.parse(readFileSync(preferences, 'utf8')).automatic, false);
			result.faults.push({ stage: fault, restored, previousVersionUsable: true, executableSha256: originalHash });
			if (fault === 'installer') {
				socket.close();
				await new Promise((resolve) => { app.once('exit', resolve); app.kill(); });
			}
		}
		await downloadCandidate();
		assert.equal(await evaluate("window.brasfcDesktop.update('install')"), true);
		socket.close();
		await until(() => installedVersion().startsWith(candidate) && outcome().status === 'healthy', 240_000);
		closeActive();
		await launch();
		await waitOffline();
		assert.equal(await evaluate(`fetch('/api/careers/${old.id}').then(r => r.json()).then(d => d.career?.id)`), old.id);
		result.tests.push('Instalação abortada e falha de inicialização recuperadas, com nova tentativa concluída e a mesma carreira disponível');
	}
	result.passed = true;
} catch (error) {
	result.error = String(error.stack ?? error);
	result.diagnostics = diagnostics;
	process.exitCode = 1;
} finally {
	socket?.close();
	app?.kill();
	server.closeAllConnections();
	server.close();
	writeFileSync(evidence, JSON.stringify(result, null, 2));
	console.log(JSON.stringify(result));
}
