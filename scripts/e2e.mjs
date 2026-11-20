// Jornadas de ponta a ponta no navegador real (Edge/Chrome sem interface, protocolo CDP).
// Uso: node scripts/e2e.mjs http://localhost:5173 [saida.json]
// Verifica: telas abrem sem erro de console, textos essenciais aparecem, ações reais de gestão funcionam
// pelo servidor, passos de liga e Copa avançam, e mede tempos de abertura/navegação.
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? null;
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium'].find((p) => existsSync(p));
const results = { checks: [], timings: [], actions: [], errors: [] };
const ok = (name, pass, detail = '') => {
	results.checks.push({ name, pass, detail });
	console.log(`${pass ? 'OK ' : 'FALHOU'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── sessão e carreira pela API (o navegador recebe o mesmo cookie)
const s = await fetch(`${base}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{}' });
const cookie = (s.headers.get('set-cookie') ?? '').split(';')[0];
const sid = cookie.split('=')[1];
const api = async (path, body, method) => {
	const r = await fetch(`${base}${path}`, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', cookie, origin: base }, body: body ? JSON.stringify(body) : undefined });
	return { status: r.status, json: await r.json().catch(() => ({})) };
};
const created = await api('/api/careers', { mode: 'coach', personName: 'Teste Jornada', clubId: 'bahia', world: 'brasil' });
ok('criar carreira (Bahia, Brasil 2026)', created.status === 201, `status ${created.status}`);
const id = created.json.career.id;
const career = async () => (await api(`/api/careers/${id}`)).json.career;

// ── ações reais de gestão (janela aberta na pré-temporada)
const act = async (label, body, expect = 200) => {
	const c = await career();
	const r = await api(`/api/careers/${id}/club`, { version: c.version, ...body });
	results.actions.push({ label, status: r.status, message: r.json.message });
	ok(label, r.status === expect, `${r.status} ${r.json.message ?? ''}`);
	return r;
};
const c0 = await career();
const sponsor = c0.data.club?.sponsorOffers?.[0] ?? null;
// O estado do clube nasce na primeira semana: avança um passo antes das ações.
const step1 = await api(`/api/careers/${id}/matches`, { version: c0.version, step: 'league:1', decisions: [] });
ok('avançar a 1ª rodada (motor no servidor)', step1.status === 200, `placar ${step1.json.match ? `${step1.json.match.homeGoals}x${step1.json.match.awayGoals}` : 'sem jogo'}`);
const c1 = await career();
const offers = c1.data.club?.sponsorOffers ?? [];
if (offers[0]) await act('assinar patrocínio', { action: 'patrocinio', offerId: offers[0].id });
await act('ingresso fora da faixa é recusado', { action: 'ingresso', price: 1 }, 422);
await act('ajustar ingresso', { action: 'ingresso', price: 70 });
// Renovação (atleta qualquer do elenco): primeiro abaixo do pedido, depois acima.
const view = await (await fetch(`${base}/api/careers/${id}/proximo`, { headers: { cookie } })).json();
void view;
await act('renovar com salário baixo não fecha (sem erro, sem mudança)', { action: 'renovar', playerId: 'bahia-05', wage: 1000, years: 2, role: 'rotacao' });
await act('renovar com salário alto fecha', { action: 'renovar', playerId: 'bahia-05', wage: 3_000_000, years: 2, role: 'rotacao' });
await act('pôr atleta à venda', { action: 'listar', playerId: 'bahia-20' });
await act('contratar olheiro', { action: 'olheiro-contratar', scoutId: `olheiro-2026-0` });
{
	const c = await career();
	const r = await api(`/api/careers/${id}/club`, { version: c.version, action: 'obra', facility: 'ct' });
	ok('obra no CT (ou recusa justificada pela diretoria)', r.status === 200 || (r.status === 422 && /diretoria|Caixa/.test(r.json.message ?? '')), `${r.status} ${r.json.message ?? ''}`);
}
await act('compra sem dinheiro suficiente é recusada', { action: 'oferta', playerId: 'flamengo-00', kind: 'compra', fee: 1_900_000_000, wage: 200000, years: 3, role: 'titular' }, 422);
const cb = await career();
const avail = Math.floor(Math.min(cb.data.club.transferBudget, Math.max(0, cb.data.club.balance)) * 0.9);
const offer = await act('proposta por atleta da Série B dentro do orçamento (negociação real)', { action: 'oferta', playerId: 'avai-14', kind: 'compra', fee: avail, wage: 120000, years: 3, role: 'rotacao' });
results.actions.push({ label: 'resposta da negociação', negotiation: offer.json.negotiation });

// ── Dev 0.5: gabinete, comissão, base e treinos delegados
{
	const c = await career();
	const office = c.data.office;
	if (office?.meeting) await act('responder reunião da diretoria', { action: 'reuniao', meetingId: office.meeting.id, choice: office.meeting.options[0].id });
	ok('universo vivo criado no 1º passo (técnicos e notícias)', !!c.data.universe && Object.keys(c.data.universe.coaches).length > 150, `${Object.keys(c.data.universe?.coaches ?? {}).length} técnicos`);
	await act('reunião inexistente é recusada', { action: 'reuniao', meetingId: 'x', choice: 'aceitar' }, 422);
	await act('contratar analista de desempenho', { action: 'comissao-contratar', role: 'analista', candidateId: 'st-analista-2026-1-1' });
	await act('cargo inválido é recusado', { action: 'comissao-contratar', role: 'presidente', candidateId: 'x' }, 422);
	await act('delegar treinos ao auxiliar', { action: 'treino-delegar', on: true });
	const y = (await career()).data.club.academy[0];
	if (y) await act('plano de desenvolvimento de jovem', { action: 'base-plano', youthId: y.id, plan: 'fisico' });
	const sc = (await career()).data.club.scouts[0];
	if (sc) await act('missão de olheiro com prazo', { action: 'olheiro-missao', scoutId: sc.id, region: 'nordeste', position: 'ATA', maxAge: 23, weeks: 4 });
	await act('prazo de missão inválido é recusado', { action: 'olheiro-missao', scoutId: sc?.id ?? 'x', region: 'nordeste', position: 'ATA', maxAge: 23, weeks: 40 }, 422);
}

// ── passos de calendário até a 2ª fase da Copa
for (let i = 0; i < 6; i++) {
	const p = (await api(`/api/careers/${id}/proximo`)).json;
	const t0 = performance.now();
	const r = await api(`/api/careers/${id}/matches`, { version: p.version, step: p.step, decisions: [] });
	results.timings.push({ kind: 'passo', step: p.step, ms: Math.round(performance.now() - t0) });
	ok(`avançar ${p.step}`, r.status === 200, `${Math.round(performance.now() - t0)} ms`);
}
const dup = await api(`/api/careers/${id}/matches`, { version: (await career()).version, step: 'league:1', decisions: [] });
ok('passo repetido é recusado (sem duplicar)', dup.status === 409);

// ── navegador
const port = 9351;
const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), `brasfc-e2e-${Date.now()}`)}`, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 50 && !target; i++) {
	await new Promise((r) => setTimeout(r, 200));
	try {
		target = (await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json())).find((t) => t.type === 'page');
	} catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.once('open', r));
let n = 0;
const pending = new Map();
const pageErrors = [];
let inboxWrites = 0;
ws.on('message', (m) => {
	const msg = JSON.parse(m.toString());
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg.result);
		pending.delete(msg.id);
	} else if (msg.method === 'Runtime.exceptionThrown') pageErrors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
	else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') pageErrors.push(msg.params.args?.map((a) => a.value ?? a.description).join(' '));
	else if (msg.method === 'Network.requestWillBeSent' && msg.params.request.method === 'POST' &&
		new URL(msg.params.request.url).pathname === `/api/careers/${id}/messages`) inboxWrites++;
});
const cdp = (method, params = {}) => new Promise((res) => { const k = ++n; pending.set(k, res); ws.send(JSON.stringify({ id: k, method, params })); });
await cdp('Runtime.enable');
await cdp('Network.enable');
await cdp('Network.setCookie', { name: 'brasfc_sid', value: sid, domain: new URL(base).hostname, path: '/' });
const evalJs = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;

const c = `/carreira/${id}`;
const pages = [
	['/menu', 'Nova carreira'],
	['/nova-carreira', 'Treinador'],
	[c, 'Próximos jogos'],
	[`${c}/elenco`, 'Reservas'],
	[`${c}/taticas`, 'Comportamento'],
	[`${c}/mercado`, 'Montar o elenco'],
	[`${c}/financas`, 'Caixa do clube'],
	[`${c}/clube`, 'Estrutura'],
	[`${c}/base`, 'Base e olheiros'],
	[`${c}/copa`, 'Copa do Brasil'],
	[`${c}/competicoes`, 'Série A'],
	[`${c}/historia`, 'Legado'],
	[`${c}/gabinete`, 'Gabinete do treinador'],
	[`${c}/comissao`, 'Quem trabalha com você'],
	[`${c}/mundo`, 'Notícias e mundo'],
	[`${c}/mensagens`, 'Mensagens'],
	[`${c}/calendario`, ''],
	[`${c}/estatisticas`, ''],
	[`${c}/treinos`, ''],
	[`${c}/partida`, ''],
	['/novidades', 'Versão em uso'],
	['/configuracoes', 'Janela e aplicativo']
];
for (const [path, text] of pages) {
	pageErrors.length = 0;
	await cdp('Page.enable');
	const t0 = performance.now();
	await cdp('Page.navigate', { url: `${base}${path}` });
	await new Promise((r) => setTimeout(r, 2500));
	const nav = await evalJs(`(() => { const e = performance.getEntriesByType('navigation')[0]; return e ? { dcl: Math.round(e.domContentLoadedEventEnd), load: Math.round(e.loadEventEnd) } : null })()`);
	const body = (await evalJs('document.body.innerText')) ?? '';
	results.timings.push({ kind: 'pagina', path: path.replace(id, ':id'), ...(nav ?? {}), wallMs: Math.round(performance.now() - t0) });
	const errs = pageErrors.filter((e) => e && !/favicon|service-worker|ServiceWorker/.test(e));
	ok(`abre ${path.replace(id, ':id')}`, errs.length === 0 && (!text || body.toLowerCase().includes(text.toLowerCase())), errs.length ? errs.join(' | ').slice(0, 200) : text ? `contém "${text}"` : '');
}
ok('abrir mensagens faz no máximo uma gravação automática', inboxWrites <= 1, `${inboxWrites} gravação(ões)`);
// Navegação interna (sem recarregar): Painel → Mercado → Finanças, medida no próprio navegador.
await cdp('Page.navigate', { url: `${base}${c}` });
await new Promise((r) => setTimeout(r, 2500));
for (const to of ['mercado', 'financas', 'elenco']) {
	const ms = await evalJs(`new Promise((res) => { const t0 = performance.now(); const a = document.querySelector('a[href$="/${to}"]'); a.click(); const iv = setInterval(() => { if (location.pathname.endsWith('/${to}') && document.title.length && !document.querySelector('[data-sveltekit-loading]')) { clearInterval(iv); requestAnimationFrame(() => res(Math.round(performance.now() - t0))); } }, 16); setTimeout(() => res(-1), 8000); })`);
	results.timings.push({ kind: 'navegacao', to, ms });
	ok(`navegação interna até ${to}`, ms > 0, `${ms} ms`);
}
// Teclado: o menu responde às setas e o foco é visível.
await cdp('Page.navigate', { url: `${base}/menu` });
await new Promise((r) => setTimeout(r, 2000));
await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
const active = await evalJs(`document.activeElement?.getAttribute('data-menu-item')`);
ok('menu navegável pelo teclado', active === '1', `foco no item ${active}`);
// Responsivo: largura de celular sem rolagem horizontal.
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
for (const path of [c, `${c}/mercado`, `${c}/financas`]) {
	await cdp('Page.navigate', { url: `${base}${path}` });
	await new Promise((r) => setTimeout(r, 2200));
	const overflow = await evalJs(`document.documentElement.scrollWidth - window.innerWidth`);
	ok(`sem rolagem horizontal no celular: ${path.replace(id, ':id')}`, overflow <= 2, `${overflow}px`);
}
const mem = await evalJs(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null`);
results.timings.push({ kind: 'memoria', mb: mem });
ws.close();
proc.kill();
const failed = results.checks.filter((x) => !x.pass).length;
console.log(`\n${results.checks.length - failed}/${results.checks.length} verificações passaram`);
if (out) writeFileSync(out, JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
