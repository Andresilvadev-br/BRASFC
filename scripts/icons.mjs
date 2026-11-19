// Gera os ícones da PWA (static/icons) a partir do escudo do BRASFC, com Edge/Chrome sem interface (CDP).
// Uso: node scripts/icons.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import WebSocket from 'ws';

const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium'].find((p) => existsSync(p));
if (!exe) throw new Error('Nenhum Edge/Chrome encontrado.');
mkdirSync('static/icons', { recursive: true });
const port = 9341;
const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), `brasfc-icons-${Date.now()}`)}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
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
const html = pathToFileURL(resolve('scripts/assets/icon.html')).href;
for (const [size, scale, name] of [[192, 62, 'icon-192'], [512, 62, 'icon-512'], [512, 46, 'icon-maskable-512'], [180, 62, 'apple-touch-icon']]) {
	await cdp('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
	await cdp('Page.navigate', { url: `${html}?s=${scale}` });
	await new Promise((r) => setTimeout(r, 700));
	const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
	writeFileSync(`static/icons/${name}.png`, Buffer.from(data, 'base64'));
	console.log('ícone', name);
}
ws.close();
proc.kill();
