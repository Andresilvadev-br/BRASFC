// Capturas comparativas de homologação (antes × depois), gravadas direto em arquivo.
// Uso: node scripts/capturas-homologacao.mjs <base> <prefixo> [pasta]
// Mesmo roteiro nas duas versões: convidado, carreira de treinador (3 rodadas), carreira de jogador
// e uma conta BRASFC para a criação de liga. As datas, os elencos e os resultados mudam com a semente de cada carreira.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [base, prefix, out = 'docs/homologacao'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: base, locale: 'pt-BR', reducedMotion: 'reduce' });
const req = ctx.request;
const post = (p, body) => req.post(p, { data: body ?? {}, headers: { origin: base } }).then((r) => r.json());
await post('/api/session');
const coach = (await post('/api/careers', { mode: 'coach', personName: 'Homologação Técnico', clubId: 'fortaleza', world: 'brasil' })).career;
const player = (await post('/api/careers', { mode: 'player', personName: 'Homologação Atleta', clubId: 'bahia', world: 'brasil', position: 'MC', appearance: { skin: 2, hairColor: 1, hairStyle: 'curto' } })).career;
for (let i = 0; i < 3; i++) {
	const c = (await req.get(`/api/careers/${coach.id}`).then((r) => r.json())).career;
	const step = await req.get(`/api/careers/${coach.id}/proximo`).then((r) => r.json());
	await post(`/api/careers/${coach.id}/matches`, { version: c.version, decisions: [], step: step.step });
}
const cr = `/carreira/${coach.id}`, pr = `/carreira/${player.id}`;
const shots = [
	['menu', '/menu', ['pc', 'mobile']],
	['carreiras', '/continuar', ['pc', 'mobile']],
	['painel-treinador', cr, ['pc', 'mobile']],
	['elenco', `${cr}/elenco`, ['pc']],
	['calendario', `${cr}/calendario`, ['pc']],
	['taticas', `${cr}/taticas`, ['pc']],
	['jogador-visao', pr, ['pc', 'mobile']],
	['jogador-treino', `${pr}?secao=treino`, ['pc']],
	['jogador-contratos', `${pr}?secao=mercado`, ['pc']]
];
const sizes = { pc: { width: 1366, height: 768 }, mobile: { width: 390, height: 844 } };
const page = await ctx.newPage();
for (const [name, path, kinds] of shots) for (const kind of kinds) {
	await page.setViewportSize(sizes[kind]);
	const res = await page.goto(path, { waitUntil: 'networkidle' });
	await page.waitForTimeout(700);
	await page.screenshot({ path: `${out}/${prefix}-${name}-${kind}.jpg`, type: 'jpeg', quality: 62, fullPage: kind === 'pc' });
	console.log(prefix, name, kind, res?.status());
}
// Criação de liga (exige conta BRASFC)
const acct = await browser.newContext({ baseURL: base, locale: 'pt-BR', reducedMotion: 'reduce', viewport: sizes.pc });
const user = 'homolog' + Date.now().toString(36).slice(-5);
await acct.request.post('/api/account', { data: { action: 'register', username: user, displayName: 'Homologação', password: 'brasfc-teste-isolado-2026' }, headers: { Origin: base } });
const lp = await acct.newPage();
await lp.goto('/multiplayer');
await lp.getByRole('link', { name: 'Criar liga' }).click();
await lp.getByRole('button', { name: /Carreira de Treinador/i }).click();
await lp.getByLabel('Nome da liga').fill('Liga dos amigos');
await lp.waitForTimeout(700);
await lp.screenshot({ path: `${out}/${prefix}-criar-liga-pc.jpg`, type: 'jpeg', quality: 62, fullPage: true });
console.log(prefix, 'criar-liga', 'pc');
await browser.close();
