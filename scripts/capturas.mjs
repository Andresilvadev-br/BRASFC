// Capturas de tela reais das telas do BRASFC (para relatórios), sem depender de navegador aberto.
// Uso: node scripts/capturas.mjs http://localhost:5173 docs/capturas
// Cria um perfil convidado, uma carreira (Brasil 2026), joga algumas rodadas pela API
// (o servidor simula) e fotografa as telas com o Edge/Chrome sem interface (protocolo CDP).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const base = process.argv[2] ?? 'http://localhost:5173';
const outDir = process.argv[3] ?? 'docs/capturas';
mkdirSync(outDir, { recursive: true });
const BROWSERS = [
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'/usr/bin/chromium',
	'/usr/bin/google-chrome'
];
const exe = BROWSERS.find((p) => existsSync(p));
if (!exe) throw new Error('Nenhum Edge/Chrome encontrado.');

// 1) sessão + carreira pela API
const s = await fetch(`${base}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{}' });
const cookie = (s.headers.get('set-cookie') ?? '').split(';')[0];
const sid = cookie.split('=')[1];
const api = (path, body) => fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie, origin: base }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const { career } = await api('/api/careers', { mode: 'coach', personName: 'Técnico Relatório', clubId: 'fortaleza', world: 'brasil' });
for (let round = 1; round <= Number(process.env.RODADAS ?? 3); round++) {
	const c = (await api(`/api/careers/${career.id}`)).career;
	const r = await api(`/api/careers/${career.id}/matches`, { version: c.version, round, decisions: [] });
	console.log('rodada', round, r.match ? `${r.match.homeGoals}x${r.match.awayGoals}` : r.message ?? 'sem jogo');
}

// 2) navegador sem interface
const port = 9333;
const profile = join(tmpdir(), `brasfc-cap-${Date.now()}`);
const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1440,1000', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 50 && !target; i++) {
	await new Promise((r) => setTimeout(r, 200));
	try {
		target = (await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json())).find((t) => t.type === 'page');
	} catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.once('open', r));
let id = 0;
const pending = new Map();
ws.on('message', (m) => {
	const msg = JSON.parse(m.toString());
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg.result);
		pending.delete(msg.id);
	}
});
const cdp = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
await cdp('Network.enable');
const host = new URL(base).hostname;
await cdp('Network.setCookie', { name: 'brasfc_sid', value: sid, domain: host, path: '/' });
await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

async function shot(path, file, opts = {}) {
	await cdp('Page.navigate', { url: `${base}${path}` });
	await new Promise((r) => setTimeout(r, opts.wait ?? 3500));
	if (opts.js) {
		await cdp('Runtime.evaluate', { expression: opts.js, awaitPromise: true });
		await new Promise((r) => setTimeout(r, opts.after ?? 1500));
	}
	const { data } = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 82, captureBeyondViewport: !!opts.full, ...(opts.clip ? { clip: { ...opts.clip, scale: 1 } } : {}) });
	writeFileSync(join(outDir, file), Buffer.from(data, 'base64'));
	console.log('captura', file);
}

const c = `/carreira/${career.id}`;
const click = (text) => `[...document.querySelectorAll('button,[role=radio],[role=tab]')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)}))?.click()`;
await shot(c, '03-painel.jpg');
await shot(`${c}/taticas`, '03-taticas.jpg', { js: `${click('Avançada')}; document.querySelector('[data-slot="9"]')?.click()` });
await shot(`${c}/taticas`, '03-instrucoes.jpg', { js: `${click('Avançada')}; window.scrollTo(0, document.body.scrollHeight * 0.45)` });
await shot(`${c}/taticas`, '03-dominio.jpg', { js: `window.scrollTo(0, document.body.scrollHeight)` });
await shot(`${c}/treinos`, '03-treinos.jpg');
await shot(`${c}/competicoes`, '03-competicoes.jpg');
await shot(`${c}/estatisticas`, '03-estatisticas.jpg');
await shot(`${c}/partida`, '03-dia-de-jogo.jpg');
await shot(`${c}/partida`, '03-pixel.jpg', {
	js: `(async () => { ${click('Entrar em campo')}; await new Promise(r => setTimeout(r, 800)); ${click('Pixel')}; ${click('8×')}; ${click('Iniciar')}; })()`,
	after: 9000
});
await shot('/nova-carreira?modo=coach', '03-nova-carreira.jpg');
ws.close();
proc.kill();
console.log('ok', career.id);
