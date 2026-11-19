// Run from the repository root on an isolated Windows runner after installing 1.3.0.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import WebSocket from 'ws';

assert.equal(process.platform, 'win32');
const [exe, dist, evidence] = process.argv.slice(2).map((path) => resolve(path));
assert(exe && dist && evidence);
const feed = 'http://127.0.0.1:4187';
const metadata = join(dist, 'latest.yml');
const version = readFileSync(metadata, 'utf8').match(/^version: (.+)$/m)[1].trim();
let rejectDownloads = true;
let denied = 0;
let served = 0;
const server = createServer((request, response) => {
	const name = basename(new URL(request.url, feed).pathname);
	if (!['latest.yml', 'BRASFC-Setup.exe', 'BRASFC-Setup.exe.blockmap'].includes(name)) {
		response.writeHead(404).end();
		return;
	}
	if (name !== 'latest.yml' && rejectDownloads) {
		denied++;
		response.writeHead(404).end();
		return;
	}
	const file = join(dist, name);
	response.setHeader('Content-Length', statSync(file).size);
	if (name.endsWith('.exe')) served++;
	createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(4187, '127.0.0.1', resolve));
const result = { targetVersion: version, tests: [] };
let app;
let socket;
async function until(fn, timeout = 45_000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		try { const value = await fn(); if (value) return value; } catch {}
		await wait(350);
	}
	throw Error('Etapa do upgrade excedeu o tempo de espera.');
}
async function attach() {
	const page = await until(async () => (await fetch('http://127.0.0.1:4190/json').then(r => r.json())).find(p => p.type === 'page'));
	socket = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
}
let id = 0;
function evaluate(expression) {
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
function launch() {
	app = spawn(exe, ['--remote-debugging-port=4190'], { stdio: 'ignore' });
	return attach();
}
const installedVersion = () => execFileSync('powershell.exe', ['-NoProfile', '-Command', '(Get-Item -LiteralPath $env:BRASFC_UPGRADE_EXE).VersionInfo.ProductVersion'], {
	env: { ...process.env, BRASFC_UPGRADE_EXE: exe }, encoding: 'utf8'
}).trim();
try {
	// Only this disposable Windows installation points to a local feed. The package still passes the updater's original SHA-512 verification.
	writeFileSync(join(exe, '..', 'resources', 'app-update.yml'), `provider: generic\nurl: ${feed}\nupdaterCacheDirName: brasfc-upgrade-validation\n`);
	const preferences = join(process.env.APPDATA, 'BRASFC', 'janela.json');
	const { mkdirSync } = await import('node:fs');
	mkdirSync(join(preferences, '..'), { recursive: true });
	writeFileSync(preferences, JSON.stringify({ mode: 'offline', automatic: false, width: 1001 }));
	assert.match(installedVersion(), /^1\.3\.0\b/);
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
	result.tests.push('1.3.0 instalado, perfil local e primeira partida oficial persistidos');
	await evaluate("window.brasfcDesktop.update('auto', false)");
	await evaluate("window.brasfcDesktop.update('check', true)");
	await until(async () => (await evaluate("window.brasfcDesktop.update('state')"))?.version === version);
	await evaluate("window.brasfcDesktop.update('download')");
	await until(async () => (await evaluate("window.brasfcDesktop.update('state')"))?.status === 'error');
	assert(denied > 0);
	result.tests.push('Falha de download exibida no app');
	rejectDownloads = false;
	await evaluate("window.brasfcDesktop.update('download')");
	await until(async () => (await evaluate("window.brasfcDesktop.update('state')"))?.status === 'ready', 120_000);
	assert(served > 0);
	assert.equal(await evaluate("window.brasfcDesktop.update('install')"), true);
	await until(() => installedVersion().startsWith(version), 120_000);
	result.tests.push('Download repetido, pacote verificado pelo updater e NSIS aplicado pelo app');
	// The updater relaunches without the developer-only CDP argument.
	await until(() => execFileSync('powershell.exe', ['-NoProfile','-Command', '(Get-Process BRASFC -ErrorAction SilentlyContinue | Where-Object MainWindowHandle).Count'], {encoding:'utf8'}).trim() === '1',60_000);
	execFileSync('powershell.exe', ['-NoProfile','-Command', 'Get-Process BRASFC -ErrorAction SilentlyContinue | Where-Object MainWindowHandle | ForEach-Object { $_.CloseMainWindow() | Out-Null; $_.WaitForExit(15000) | Out-Null }']);
	socket?.close();
	await launch();
	await until(() => evaluate("location.origin.startsWith('http://127.0.0.1:47615') && !!window.brasfcDesktop"));
	const after = await evaluate(`(async () => {
		const { profile } = await fetch('/api/session').then(r=>r.json());
		const { career } = await fetch('/api/careers/${old.id}').then(r=>r.json());
		return { profile:profile?.id, id:career?.id, version:career?.version, desktop:(await window.brasfcDesktop.getState()).version };
	})()`);
	assert.equal(after.profile, old.profile);
	assert.equal(after.id, old.id);
	assert(after.version > 0);
	assert.equal(after.desktop, version);
	assert.equal(JSON.parse(readFileSync(preferences, 'utf8')).automatic, false);
	result.tests.push('Reabertura na versão nova com conta, carreira avançada e preferência preservadas');
	result.passed = true;
} catch (error) {
	result.error = String(error.stack ?? error);
	process.exitCode = 1;
} finally {
	socket?.close();
	app?.kill();
	server.closeAllConnections();
	server.close();
	writeFileSync(evidence, JSON.stringify(result, null, 2));
	console.log(JSON.stringify(result));
}
