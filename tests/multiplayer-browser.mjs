// @ts-nocheck -- Playwright is installed only in the browser validation job.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.BRASFC_BROWSER_ORIGIN ?? 'http://127.0.0.1:3000';
const output = process.env.BRASFC_SCREENSHOTS ?? 'test-results/multiplayer';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const contexts = [];
const password = 'brasfc-teste-isolado-2026';

async function account(username, displayName, width, height) {
	const context = await browser.newContext({ baseURL:origin, viewport:{ width, height }, hasTouch:width<650,
		isMobile:width<650, deviceScaleFactor:1, reducedMotion:'reduce', locale:'pt-BR' });
	contexts.push(context);
	const response = await context.request.post('/api/account', { data:{ action:'register', username, displayName, password },
		headers:{ Origin:origin } });
	assert.equal(response.status(), 201);
	const page = await context.newPage();
	page.on('pageerror', (error) => errors.push(error.message));
	return { page, context };
}
async function visible(locator) { await locator.waitFor({ state:'visible' }); }
async function absent(page, pattern) { assert.equal(await page.getByText(pattern, { exact:true }).count(), 0); }
async function noOverflow(page) {
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, page.url());
}
async function capture(page, name) {
	await noOverflow(page);
	await page.screenshot({ path:`${output}/${name}.png`, fullPage:true, animations:'disabled' });
}
async function start(page, mode, name) {
	await page.goto('/multiplayer');
	await page.getByRole('link', { name:'Criar liga' }).click();
	await visible(page.getByRole('heading', { name:'Treinador', exact:true }));
	await visible(page.getByRole('heading', { name:'Jogador', exact:true }));
	assert.equal(await page.getByLabel('Nome da liga').count(),0);
	if (mode==='Treinador') await capture(page,'01-cards-mobile');
	await page.getByRole('button', { name:new RegExp(`Carreira de ${mode}`, 'i') }).click();
	await page.getByLabel('Nome da liga').fill(name);
	assert.equal(await page.getByRole('heading', { name:'Amigos', exact:true }).count(),0);
}
async function clubs(page, name) {
	await visible(page.getByRole('heading', { name:'Escolha seu clube' }));
	await absent(page,'Como você quer jogar?');
	await page.getByRole('button', { name:'Buscar clube' }).click();
	await page.getByRole('textbox', { name:'Buscar clube por nome ou estado' }).fill(name);
	await page.getByRole('button', { name, exact:true }).click();
	await page.getByRole('button', { name:'Confirmar e abrir lobby' }).click();
	await visible(page.getByRole('heading', { name:'Participantes', exact:true }));
	assert.equal(await page.getByRole('heading', { name:'Participantes', exact:true }).count(),1);
	assert.equal(await page.getByRole('heading', { name:'Escolha seu clube', exact:true }).count(),0);
}
async function invite(page, username, role) {
	await page.getByText('Convidar amigos', { exact:true }).click();
	await page.getByLabel('Usuário BRASFC').fill(username);
	if (role) await page.getByLabel('Oferecer função').selectOption(role);
	else assert.equal(await page.getByLabel('Oferecer função').count(),0);
	await page.getByRole('button', { name:'Enviar convite' }).click();
	await visible(page.getByText(`Convite enviado para @${username}.`));
	await visible(page.getByText('Pendentes · 1'));
}
async function accepted(page, name) {
	await page.goto('/multiplayer?aba=entrar');
	const row = page.locator('.item').filter({ hasText:name });
	await row.getByRole('button', { name:'Aceitar', exact:true }).click();
	await page.waitForURL('**/multiplayer/sala/**');
}
try {
	const { page: coach, context:coachSession } = await account('tecnico_teste','Camila Técnica',390,844);
	const { page: assistant } = await account('auxiliar_teste','Ivo Auxiliar',390,844);
	await start(coach,'Treinador','Liga da comissão');
	await coach.getByText('Temporada e competição', { exact:true }).click();
	await coach.getByLabel('Temporada inicial').selectOption('2028');
	await coach.getByText('Temporada e competição', { exact:true }).click();
	await capture(coach,'02-configuracao-mobile');
	await coach.reload();
	await visible(coach.getByLabel('Nome da liga'));
	await coach.waitForFunction(() => document.querySelector('input[placeholder="Ex.: Liga dos amigos"]').value === 'Liga da comissão');
	await coach.getByRole('button', { name:'Continuar para o clube' }).click();
	await visible(coach.getByRole('heading', { name:'Escolha seu clube' }));
	const created = coach.url().split('/').at(-1);
	await coach.goBack();
	await visible(coach.getByRole('button', { name:'Salvar e continuar' }));
	assert.equal(await coach.getByLabel('Nome da liga').inputValue(),'Liga da comissão');
	await coach.getByRole('button', { name:'Salvar e continuar' }).click();
	await visible(coach.getByRole('heading', { name:'Escolha seu clube' }));
	assert.equal(coach.url().split('/').at(-1),created);
	const rooms = await (await coachSession.request.get('/api/rooms')).json();
	assert.equal(rooms.rooms.length,1);
	await capture(coach,'03-clube-mobile');
	await clubs(coach,'Palmeiras');
	await coach.getByRole('button', { name:'Marcar como pronto' }).click();
	await visible(coach.getByRole('button', { name:'Retirar prontidão' }));
	await invite(coach,'auxiliar_teste','assistant');
	await capture(coach,'04-lobby-mobile');
	await accepted(assistant,'Liga da comissão');
	await visible(assistant.getByRole('heading', { name:'Participantes' }));
	await visible(assistant.getByText('Auxiliar', { exact:true }));
	await coach.getByRole('button', { name:'Iniciar temporada' }).click();
	await visible(coach.getByRole('link', { name:'Central da carreira' }));

	const { page: athlete } = await account('atleta_teste','Lia Atleta',1440,900);
	const { page: teammate } = await account('parceiro_teste','Noa Jogador',360,780);
	await start(athlete,'Jogador','Liga dos atletas');
	assert.equal(await athlete.getByText('Exigir prontidão dos auxiliares').count(),0);
	await athlete.getByRole('button', { name:'Continuar para o atleta' }).click();
	await visible(athlete.getByRole('heading', { name:'Crie seu atleta' }));
	await athlete.getByLabel('Nome do jogador').fill('Lia do Vale');
	await capture(athlete,'05-atleta-desktop');
	await athlete.getByRole('button', { name:'Continuar para o clube' }).click();
	await clubs(athlete,'Palmeiras');
	await invite(athlete,'parceiro_teste');
	await capture(athlete,'06-lobby-desktop');
	await accepted(teammate,'Liga dos atletas');
	await visible(teammate.getByRole('heading', { name:'Crie seu atleta' }));
	await teammate.getByLabel('Nome do jogador').fill('Noa do Vale');
	await teammate.getByRole('button', { name:'Continuar para o clube' }).click();
	await clubs(teammate,'Palmeiras');
	await noOverflow(teammate);
	await teammate.setViewportSize({ width:780, height:360 });
	await capture(teammate,'07-lobby-paisagem');
	await teammate.setViewportSize({ width:768, height:1024 });
	await noOverflow(teammate);
	await teammate.getByRole('link', { name:'Minhas ligas' }).click();
	await visible(teammate.getByText('Liga dos atletas', { exact:true }));
	await visible(teammate.getByText('Noa do Vale · Palmeiras', { exact:true }));
	await teammate.getByRole('link', { name:'Central Social' }).click();
	await visible(teammate.getByRole('heading', { name:'Amigos' }));
	assert.equal(await teammate.getByLabel('Código da liga').count(),0);
	assert.deepEqual(errors, []);
	console.log('Fluxos de treinador e atleta validados em Chromium com convites, retorno, recarga e quatro larguras.');
} finally {
	await Promise.all(contexts.map((context) => context.close()));
	await browser.close();
}
