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
async function start(page, name, first = false) {
	await page.goto('/multiplayer');
	await page.getByRole('link', { name:'Criar liga' }).click();
	// Dev 0.12: não existe escolha de modo; toda liga é uma carreira online de treinadores.
	await visible(page.getByLabel('Nome da liga'));
	assert.equal(await page.getByRole('heading', { name:'Jogador', exact:true }).count(),0);
	assert.equal(await page.getByText('Exigir prontidão dos auxiliares').count(),0);
	if (first) await capture(page,'01-criar-liga-mobile');
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
async function invite(page, username) {
	await page.getByText('Convidar amigos', { exact:true }).click();
	await page.getByLabel('Usuário BRASFC').fill(username);
	assert.equal(await page.locator('option[value="assistant"]').count(),0);
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
	const { page: rival } = await account('rival_teste','Ivo Treinador',390,844);
	await start(coach,'Liga dos treinadores', true);
	await coach.getByText('Temporada e competição', { exact:true }).click();
	await coach.getByRole('radiogroup', { name:'Temporada inicial' }).getByRole('radio', { name:'2028' }).click();
	await coach.getByText('Temporada e competição', { exact:true }).click();
	await capture(coach,'02-configuracao-mobile');
	await coach.reload();
	await visible(coach.getByLabel('Nome da liga'));
	await coach.waitForFunction(() => document.querySelector('input[placeholder="Ex.: Liga dos amigos"]').value === 'Liga dos treinadores');
	await coach.getByRole('button', { name:'Continuar para o clube' }).click();
	await visible(coach.getByRole('heading', { name:'Escolha seu clube' }));
	const created = coach.url().split('/').at(-1);
	await coach.goBack();
	await visible(coach.getByRole('button', { name:'Salvar e continuar' }));
	assert.equal(await coach.getByLabel('Nome da liga').inputValue(),'Liga dos treinadores');
	await coach.getByRole('button', { name:'Salvar e continuar' }).click();
	await visible(coach.getByRole('heading', { name:'Escolha seu clube' }));
	assert.equal(coach.url().split('/').at(-1),created);
	const rooms = await (await coachSession.request.get('/api/rooms')).json();
	assert.equal(rooms.rooms.length,1);
	await capture(coach,'03-clube-mobile');
	await clubs(coach,'Palmeiras');
	await coach.getByRole('button', { name:'Marcar como pronto' }).click();
	await visible(coach.getByRole('button', { name:'Retirar prontidão' }));
	await invite(coach,'rival_teste');
	await capture(coach,'04-lobby-mobile');
	await accepted(rival,'Liga dos treinadores');
	await clubs(rival,'Flamengo');
	await coach.getByRole('button', { name:'Iniciar temporada' }).click();
	await visible(coach.getByRole('link', { name:'Central da carreira' }));

	const { page: host } = await account('anfitriao_teste','Lia Treinadora',1440,900);
	const { page: friend } = await account('parceiro_teste','Noa Treinador',360,780);
	await start(host,'Liga dos amigos');
	await host.getByRole('button', { name:'Continuar para o clube' }).click();
	await clubs(host,'Palmeiras');
	await invite(host,'parceiro_teste');
	const startSeason = await host.getByRole('button', { name:'Iniciar temporada' }).boundingBox();
	const inviteForm = await host.getByRole('button', { name:'Enviar convite' }).boundingBox();
	assert.ok(startSeason && inviteForm && startSeason.x < inviteForm.x && startSeason.y < inviteForm.y);
	await capture(host,'05-lobby-desktop');
	await accepted(friend,'Liga dos amigos');
	await clubs(friend,'Santos');
	await noOverflow(friend);
	await friend.setViewportSize({ width:780, height:360 });
	await capture(friend,'06-lobby-paisagem');
	await friend.setViewportSize({ width:768, height:1024 });
	await noOverflow(friend);
	await friend.getByRole('link', { name:'Minhas ligas' }).click();
	await visible(friend.getByText('Liga dos amigos', { exact:true }));
	await friend.getByRole('link', { name:'Central Social' }).click();
	await visible(friend.getByRole('heading', { name:'Amigos' }));
	assert.equal(await friend.getByLabel('Código da liga').count(),0);
	assert.deepEqual(errors, []);
	console.log('Carreira online de treinadores validada em Chromium com convites, clubes exclusivos, retorno, recarga e quatro larguras.');
} catch (error) {
	for (const [index, context] of contexts.entries()) {
		for (const page of context.pages()) {
			console.error('Navegação final', page.url());
			await page.screenshot({ path:`${output}/erro-${index}.png`, fullPage:true }).catch(() => {});
		}
	}
	throw error;
} finally {
	await Promise.all(contexts.map((context) => context.close()));
	await browser.close();
}
