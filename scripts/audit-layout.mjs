// Auditoria de layout no navegador (somente texto, sem capturas).
// Uso: node scripts/audit-layout.mjs  (BASE=http://localhost:5173 WIDTHS=1920x1080,1366x768,390x844 ONLY=elenco,taticas ALL=1)
// Cria um convidado e uma carreira de treinador pela API e mede, em cada rota e largura:
// rolagem horizontal do documento, elementos além da viewport (fora de contêineres roláveis),
// textos cortados (overflow escondido com conteúdo maior que a caixa) e erros de console.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.BASE ?? 'http://localhost:5173';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const widths = (process.env.WIDTHS ?? '1280x720,1366x768,1600x900,1920x1080,2560x1440,3840x2160').split(',').map((w) => w.split('x').map(Number));
const browser = await chromium.launch();
const ctx = await browser.newContext();
const req = ctx.request;
const post = (p, body) => req.post(base + p, { data: body ?? {}, headers: { origin: base } }).then((r) => r.json());
await post('/api/session');
const coach = (await post('/api/careers', { mode: 'coach', personName: 'Auditoria Técnico', clubId: 'fortaleza', world: 'brasil' })).career;
for (let i = 0; i < Number(process.env.STEPS ?? 2); i++) {
	const c = (await req.get(`${base}/api/careers/${coach.id}`).then((r) => r.json())).career;
	const steps = await req.get(`${base}/api/careers/${coach.id}/proximo`).then((r) => r.json());
	await post(`/api/careers/${coach.id}/matches`, { version: c.version, decisions: [], step: steps.step });
}
const cr = `/carreira/${coach.id}`;
let routes = ['/menu', '/continuar', '/nova-carreira', '/multiplayer', '/configuracoes', '/novidades', '/laboratorio', '/conta',
	...['', '/elenco', '/taticas', '/treinos', '/mercado', '/financas', '/calendario', '/competicoes', '/copa', '/clube', '/comissao', '/estatisticas', '/gabinete', '/historia', '/mensagens', '/mundo', '/base', '/partida'].map((s) => cr + s)];
if (only) routes = routes.filter((r) => only.some((o) => r.includes(o)));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
for (const [w, h] of widths) {
	await page.setViewportSize({ width: w, height: h });
	for (const r of routes) {
		errors.length = 0;
		const res = await page.goto(base + r, { waitUntil: 'networkidle' }).catch((e) => ({ status: () => 'ERR ' + e.message.slice(0, 60) }));
		await page.waitForTimeout(500);
		const info = await page.evaluate(() => {
			const vw = document.documentElement.clientWidth;
			const doc = document.documentElement.scrollWidth - vw;
			const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) || s.position === 'fixed') return true; } return false; };
			const out = [];
			for (const el of document.body.querySelectorAll('*')) {
				const b = el.getBoundingClientRect();
				if (!b.width || b.right <= vw + 1 || getComputedStyle(el).position === 'fixed') continue;
				if (clipped(el)) continue;
				const id = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).filter((c) => !c.startsWith('svelte-')).slice(0, 2).join('.') : '');
				out.push(`${id}(+${Math.round(b.right - vw)})`);
				if (out.length > 4) break;
			}
			const cut = [];
			for (const el of document.body.querySelectorAll('*')) {
				const s = getComputedStyle(el);
				// Ignora textos só para leitores de tela (1 px) e reticências com dica (title) do texto completo.
				if (el.children.length || !el.textContent.trim() || !/(hidden|clip)/.test(s.overflowX + s.overflowY) || (s.textOverflow === 'ellipsis' && el.title) || el.clientWidth <= 1 || s.clip !== 'auto') continue;
				if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) cut.push(el.tagName.toLowerCase() + ':' + el.textContent.trim().slice(0, 24));
				if (cut.length > 3) break;
			}
			const tiny = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 11 && e.getBoundingClientRect().width).length;
			return { doc, out, tiny, cut };
		});
		const flag = info.doc > 1 || info.out.length || info.cut.length || errors.length;
		if (flag || process.env.ALL) console.log(`${w} ${r.replace(/\/carreira\/[0-9a-f-]+/, '/c')} st=${res.status()} docX=${info.doc} tiny=${info.tiny} ${info.out.join(' ')}${info.cut.length ? ' CORTE:' + info.cut.join(' | ') : ''} ${errors.length ? 'ERR:' + [...new Set(errors)].slice(0, 2).join(' | ') : ''}`);
	}
}
console.log('rotas', routes.length, 'larguras', widths.length);
await browser.close();
