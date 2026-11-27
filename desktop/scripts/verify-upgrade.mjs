// Run from the repository root on an isolated Windows runner after installing the stable baseline.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
async function attach(endpoints) {
	const chromiumDeadline = Date.now() + 3000;
	const page = await until(async () => {
		const web = endpoints.chromium;
		if (web) {
			const url = new URL('/json', web.replace(/^ws:/, 'http:'));
			const pages = await fetch(url, { signal: AbortSignal.timeout(600) }).then(r => r.json()).catch(() => []);
			const target = pages.find(p => p.type === 'page');
			if (target) return { url: target.webSocketDebuggerUrl, inspector: false };
		}
		if (endpoints.node && Date.now() >= chromiumDeadline) return { url: endpoints.node, inspector: true };
		return false;
	}, 65_000);
	inspector = page.inspector;
	socket = new WebSocket(page.url, { handshakeTimeout: 5000 });
	socket.on('error', (error) => { diagnostics = (diagnostics + String(error)).slice(-4500); });
	await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
}
let id = 0;
function evaluate(expression, timeout = 15_000) {
	if (inspector) expression = `process.mainModule.require('electron').BrowserWindow.getAllWindows()[0]?.webContents.executeJavaScript(${JSON.stringify(expression)}, true)`;
	const connection = socket;
	if (connection.readyState !== WebSocket.OPEN) return Promise.reject(Error('CDP desconectado'));
	return new Promise((resolve, reject) => {
		const messageId = ++id;
		const timer = setTimeout(() => finish(Error('CDP sem resposta')), timeout);
		const disconnect = () => finish(Error('CDP desconectado'));
		function finish(error, value) {
			clearTimeout(timer);
			connection.off('message', handler);
			connection.off('close', disconnect);
			if (error) reject(error);
			else resolve(value);
		}
		function handler(raw) {
			const data = JSON.parse(String(raw));
			if (data.id !== messageId) return;
			if (data.error || data.result.exceptionDetails) finish(Error(JSON.stringify(data.error ?? data.result.exceptionDetails)));
			else finish(null, data.result.result.value);
		}
		connection.on('message', handler);
		connection.once('close', disconnect);
		connection.send(JSON.stringify({ id: messageId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }),
			(error) => { if (error) finish(error); });
	});
}
function launch(extraEnv = {}) {
	// Cada abertura do app escolhe portas livres. Só anexamos ao processo que esta chamada abriu.
	const endpoints = {};
	let startup = '';
	app = spawn(exe, ['--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--inspect=127.0.0.1:0'], {
		env: { ...process.env, ...extraEnv, ELECTRON_ENABLE_LOGGING: '1' }, stdio: ['ignore', 'ignore', 'pipe']
	});
	app.stderr.on('data', (data) => {
		diagnostics = (diagnostics + String(data)).slice(-4500);
		startup = (startup + String(data)).slice(-8000);
		endpoints.chromium ??= startup.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/\S+)[\r\n]/)?.[1];
		endpoints.node ??= startup.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/\S+)[\r\n]/)?.[1];
	});
	app.on('exit', (code) => diagnostics += `
Processo saiu com código ${code}`);
	return attach(endpoints);
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
	await until(() => evaluate("location.origin.startsWith('http://127.0.0.1:47615') && location.pathname === '/menu' && !!window.brasfcDesktop"));
	// Use the baseline's own session after its opening flow has completed. Starting
	// another guest session during the opening can race the baseline's first cookie.
	const old = await evaluate(`(async () => {
		const post = (path, body) => fetch(path, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
		const { profile } = await fetch('/api/session').then(r => r.json());
		if (!profile?.id) throw Error('A abertura da versão anterior não iniciou o perfil local');
		const { career } = await post('/api/careers',{mode:'coach',personName:'Teste de atualização',clubId:'bahia',world:'brasil'});
		if (!career?.id) throw Error('Falha ao criar save na versão anterior');
		const round = await post('/api/careers/' + career.id + '/matches',{version:career.version,step:'league:1',decisions:[]});
		if (!round.match) throw Error('Falha ao registrar o primeiro jogo');
		const current = (await fetch('/api/session').then(r => r.json())).profile;
		if (current?.id !== profile.id) throw Error('O perfil mudou durante a preparação do save inicial');
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
	const newSaves = await evaluate(`(async () => {
		const post = async (path, body) => {
			const r = await fetch(path, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
			if (!r.ok) throw Error(path + ': ' + r.status + ' ' + await r.text());
			return r.json();
		};
		const saves = [];
		for (const shared of [false, true]) {
			const opened = await post('/api/careers', {personName:'Ana Técnica',clubId:'bahia',world:'brasil',
				...(shared
					? {worldSelection:{countries:['bra']},others:[{personName:'Bia Técnica',clubId:'manauara'}]}
					: {leagueSelection:{divisions:['serie-a'],cup:false}})});
			const c = opened.career;
			if (shared && (c.data.league.selection.divisions.length !== 4 || !c.data.league.divisions['serie-d'].includes(c.data.local.coaches[1].clubId))) {
				throw Error('A seleção por país não ativou as quatro séries para os dois treinadores.');
			}
			if (!(await fetch('/carreira/' + c.id + '/partida')).ok) throw Error('A tela da primeira partida falhou');
			const root = '/api/careers/' + c.id;
			const t = shared ? (await post(root + '/turno', {version:c.version,action:'pronto'})).career : c;
			if (shared && !(await fetch(root + '/rodada')).ok) throw Error('A central da primeira rodada falhou');
			await post(root + '/matches', {version:t.version,season:t.season,step:'league:1'});
			const replay = await post(root + '/matches', {version:t.version,season:t.season,step:'league:1'});
			if (!replay.replay) throw Error('A primeira rodada foi reenviada em vez de relida');
			saves.push({id:c.id,shared});
		}
		return saves;
	})()`, 60_000);
	const cupSave = await evaluate(`(async () => {
		const request = async (path, body) => {
			const response = await fetch(path, body === undefined ? undefined : {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
			if (!response.ok) throw Error(path + ': ' + response.status + ' ' + await response.text());
			return response.json();
		};
		let {career} = await request('/api/careers', {personName:'Ana Técnica',clubId:'sport',worldSelection:{countries:['bra']},previewSeed:777});
		const root = '/api/careers/' + career.id;
		for (let i = 0; i < 16; i++) {
			const next = await request(root + '/proximo');
			if (next.step === 'cup:2' && !next.plays) throw Error('A estreia do Sport apareceu como folga.');
			const played = await request(root + '/matches', {version:career.version,season:career.season,step:next.step});
			career = played.career;
			if (next.step === 'cup:2') {
				const fixture = played.match?.fixture;
				if (fixture?.competition !== 'copa-do-brasil' || ![fixture.home, fixture.away].includes('sport')) throw Error('A Copa não registrou a partida do Sport.');
				return { id:career.id, score:[played.match.homeGoals,played.match.awayGoals] };
			}
		}
		throw Error('O calendário não alcançou a estreia do Sport.');
	})()`, 150_000);
	const worldSaves = await evaluate(`(async () => {
		const post = async (path, body) => {
			const response = await fetch(path, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
			if (!response.ok) throw Error(path + ': ' + response.status + ' ' + await response.text());
			return response.json();
		};
		const saves = [];
		for (const [country, clubId, step, competition] of [
			['ger', 'world/ger/sv-meppen', 'league:1', 'league/ger/3'],
			['fra', 'world/fra/psg', 'continental/uefa-super-cup:1', 'continental/uefa-super-cup']
		]) {
			const { career } = await post('/api/careers', {personName:'Lia Mundo',clubId,worldSelection:{countries:[country]}});
			if (country === 'ger' && career.data.league.divisions['league/ger/3']?.length !== 20) throw Error('A Alemanha não ativou a 3. Liga.');
			const root = '/api/careers/' + career.id;
			const preview = await fetch(root + '/proximo').then(r => r.json());
			if (preview.step !== step || !preview.plays) throw Error('Partida esperada no calendário: ' + step);
			const { match } = await post(root + '/matches', {version:career.version,season:career.season,step});
			if (match?.fixture.competition !== competition) throw Error('A primeira partida da carreira mundial não foi registrada.');
			if (country === 'fra' && match.fixture.away !== 'world/eng/aston-villa') throw Error('A Supercopa não carregou o adversário do país inativo.');
			saves.push({id:career.id,country,competition,score:[match.homeGoals,match.awayGoals]});
		}
		return saves;
	})()`, 60_000);
	socket.close();
	const pid = app.pid;
	execFileSync('powershell.exe', ['-NoProfile', '-Command',
		'(Get-Process -Id ' + pid + ').CloseMainWindow() | Out-Null; (Get-Process -Id ' + pid + ' -ErrorAction SilentlyContinue).WaitForExit(15000) | Out-Null']);
	await launch();
	await until(() => evaluate("location.origin.startsWith('http://127.0.0.1:47615') && !!window.brasfcDesktop"));
	const reopened = await evaluate(`(async () => {
		const results = [];
		for (const save of ${JSON.stringify(newSaves)}) {
			const root = '/api/careers/' + save.id;
			let {career} = await fetch(root).then(r=>r.json());
			const first = await fetch(root + '/matches').then(r=>r.json());
			if (first.matches.length !== 1 || first.matches[0].round !== 1) throw Error('O save reaberto não contém exatamente uma primeira partida');
			if (!(await fetch('/carreira/' + save.id + '/partida')).ok) throw Error('A tela de partida falhou após reabrir');
			const post = (path, body) => fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
			if (save.shared) {
				const turn = await post(root + '/turno',{version:career.version,action:'pronto'});
				if (!turn.ok) throw Error('O turno não avançou');
				career = (await turn.json()).career;
			}
			const next = await post(root + '/matches',{version:career.version,season:career.season,step:'league:2'});
			const second = await fetch(root + '/matches').then(r=>r.json());
			results.push(next.ok && second.matches.length === 2 && second.matches[1].round === 2);
		}
		return results;
	})()`, 60_000);
	assert.deepEqual(reopened, [true, true]);
	const reopenedCup = await evaluate(`(async () => {
		const root = '/api/careers/${cupSave.id}';
		const { career } = await fetch(root).then(r => r.json());
		const { matches } = await fetch(root + '/matches').then(r => r.json());
		const cup = matches.filter((m) => m.competition === 'copa-do-brasil' && m.round === 2 && [m.home,m.away].includes('sport'));
		return { countries: career?.data.worldSelection?.countries, scores: cup.map((m) => [m.homeGoals,m.awayGoals]) };
	})()`);
	assert.deepEqual(reopenedCup, { countries: ['bra'], scores: [cupSave.score] });
	const reopenedWorld = await evaluate(`(async () => {
		const result = [];
		for (const save of ${JSON.stringify(worldSaves)}) {
			const root = '/api/careers/' + save.id;
			const { career } = await fetch(root).then(r => r.json());
			const { matches } = await fetch(root + '/matches').then(r => r.json());
			const game = matches.find(m => m.competition === save.competition);
			result.push({id:career.id,country:career.data.worldSelection.countries[0],competition:game?.competition,score:[game?.homeGoals,game?.awayGoals]});
		}
		return result;
	})()`);
	assert.deepEqual(reopenedWorld, worldSaves);
	result.tests.push('Carreiras novas com um e dois treinadores (incluindo Série D): primeira rodada idempotente, reabertura e segunda rodada no executável');
	result.tests.push('Seleção por país e estreia do Sport na Copa do Brasil preservadas após reabrir o executável');
	result.tests.push('Carreiras com SV Meppen na 3. Liga e com PSG na Supercopa da UEFA: primeira partida e reabertura offline');
	assert(!result.relaunchMissing, 'A instalação atualizou, mas a abertura automática não foi observada');
	if (rollbackDist) {
		const candidate = metadataVersion(rollbackDist);
		feedDist = rollbackDist;
		socket.close();
		await new Promise((resolve) => { app.once('exit', resolve); app.kill(); });
		useFeed();
		const originalHash = createHash('sha256').update(readFileSync(exe)).digest('hex');
		const outcomeFile = join(preferences, '..', 'update-recovery', 'outcome.json');
		const recoveryPending = join(preferences, '..', 'update-recovery', 'pending.json');
		async function startInstall() {
			let installed;
			try { installed = await evaluate("window.brasfcDesktop.update('install')"); }
			catch (error) {
				if (existsSync(recoveryPending) && /frame was disposed|CDP sem resposta|CDP desconectado/.test(String(error))) return;
				throw error;
			}
			if (installed !== true) {
				throw Error(`O instalador recusou a solicitação: ${JSON.stringify(await evaluate("window.brasfcDesktop.update('state')"))}`);
			}
		}
		const outcome = () => JSON.parse(readFileSync(outcomeFile, 'utf8').replace(/^\uFEFF/, ''));
		const waitOffline = () => until(() => evaluate("location.origin.startsWith('http://127.0.0.1:47615') && !!window.brasfcDesktop"));
		const downloadCandidate = async () => {
			await evaluate("window.brasfcDesktop.update('check', true)", 45_000);
			await until(async () => (await evaluate("window.brasfcDesktop.update('state')"))?.version === candidate);
			await evaluate("window.brasfcDesktop.update('download')", 120_000);
			await until(async () => (await evaluate("window.brasfcDesktop.update('state')"))?.status === 'ready', 120_000);
		};
		const closeActive = () => execFileSync('powershell.exe', ['-NoProfile', '-Command', `
			Get-Process BRASFC -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:BRASFC_UPGRADE_EXE -and $_.MainWindowHandle -ne 0 } |
			ForEach-Object { $_.CloseMainWindow() | Out-Null; $_.WaitForExit(25000) | Out-Null }
		`], { env: { ...process.env, BRASFC_UPGRADE_EXE: exe } });
		const waitForRecoveredWindow = (pid) => {
			assert(Number.isSafeInteger(pid) && pid > 0, 'A recuperação precisa relançar o executável restaurado.');
			execFileSync('powershell.exe', ['-NoProfile', '-Command', `
				$deadline = [DateTime]::UtcNow.AddSeconds(25)
				do {
					$reopened = Get-Process -Id ([int]$env:BRASFC_UPGRADE_PID) -ErrorAction Stop
					if ($reopened.Path -ne $env:BRASFC_UPGRADE_EXE) { throw 'Processo restaurado não é o BRASFC esperado.' }
					if ($reopened.MainWindowHandle -ne 0) {
						if (!$reopened.CloseMainWindow() -or !$reopened.WaitForExit(25000)) { throw 'Janela restaurada não encerrou.' }
						return
					}
					Start-Sleep -Milliseconds 250
				} while ([DateTime]::UtcNow -lt $deadline)
				throw 'O BRASFC não abriu a janela após restaurar os arquivos.'
			`], { env: { ...process.env, BRASFC_UPGRADE_EXE: exe, BRASFC_UPGRADE_PID: String(pid) } });
		};
		const faultLog = join(preferences, '..', 'update-validation-fault');
		const bootFault = join(preferences, '..', 'update-validation-first-boot');
		for (const fault of ['installer', 'first-boot']) {
			result.pendingFault = fault;
			rmSync(faultLog, { force: true });
			rmSync(bootFault, { force: true });
			// NSIS may relaunch through the Windows shell without inheriting the updater environment.
			if (fault === 'first-boot') writeFileSync(bootFault, '');
			const prior = (() => { try { return outcome().date; } catch { return ''; } })();
			await launch(fault === 'installer' ? {
				BRASFC_VALIDATION_FAULT_LOG: faultLog,
				BRASFC_VALIDATION_INSTALL_FAILURE: '1'
			} : {});
			await waitOffline();
			await downloadCandidate();
			await startInstall();
			socket.close();
			const restored = await until(() => {
				const state = outcome();
				return state.date !== prior && state;
			}, 150_000);
			assert.equal(restored.status, 'restored', JSON.stringify(restored));
			assert.equal(readFileSync(faultLog, 'utf8'), fault);
			assert(installedVersion().startsWith(version));
			assert.equal(createHash('sha256').update(readFileSync(exe)).digest('hex'), originalHash);
			waitForRecoveredWindow(restored.reopenedPid);
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
			delete result.pendingFault;
			if (fault === 'installer') {
				socket.close();
				await new Promise((resolve) => { app.once('exit', resolve); app.kill(); });
			}
		}
		result.pendingFault = 'retry';
		await downloadCandidate();
		await startInstall();
		socket.close();
		await until(() => installedVersion().startsWith(candidate) && outcome().status === 'healthy', 240_000);
		closeActive();
		await launch();
		await waitOffline();
		assert.equal(await evaluate(`fetch('/api/careers/${old.id}').then(r => r.json()).then(d => d.career?.id)`), old.id);
		delete result.pendingFault;
		result.tests.push('Instalação abortada e falha de inicialização recuperadas, com nova tentativa concluída e a mesma carreira disponível');
	}
	result.passed = true;
} catch (error) {
	result.error = String(error.stack ?? error);
	result.diagnostics = diagnostics;
	const recoveryDir = join(preferences, '..', 'update-recovery');
	for (const [name, file] of [['watcher', join(recoveryDir, 'watch.log')], ['faultInjected', join(preferences, '..', 'update-validation-fault')], ['recoveryOutcome', join(recoveryDir, 'outcome.json')]]) {
		if (existsSync(file)) result[name] = readFileSync(file, 'utf8').slice(-1500);
	}
	result.recoveryPending = existsSync(join(recoveryDir, 'pending.json'));
	process.exitCode = 1;
} finally {
	socket?.close();
	app?.kill();
	server.closeAllConnections();
	server.close();
	writeFileSync(evidence, JSON.stringify(result, null, 2));
	console.log(JSON.stringify(result));
}
