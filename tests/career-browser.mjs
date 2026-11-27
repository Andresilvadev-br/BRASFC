// @ts-nocheck -- Playwright is installed only in the browser validation job.
// Chromium sobre o mesmo servidor local e banco em disco usados pelo modo offline.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { DEFAULT_APPEARANCE } from '../src/lib/domain/appearance.ts';

const origin = process.env.BRASFC_BROWSER_ORIGIN ?? 'http://127.0.0.1:3001';
const output = process.env.BRASFC_SCREENSHOTS ?? 'test-results/careers';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();

try {
	const page = await browser.newPage({ baseURL: origin, locale: 'pt-BR', reducedMotion: 'reduce' });
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/continuar');
	await page.getByRole('heading', { name: 'Nenhuma carreira salva' }).waitFor();

	const create = async (data) => {
		const response = await page.request.post('/api/careers', { data, headers: { Origin: origin } });
		assert.equal(response.status(), 201, await response.text());
		return (await response.json()).career;
	};
	const coach = await create({ mode: 'coach', personName: 'Ana Técnica', clubId: 'bahia', world: 'brasil' });
	// Dev 0.12: a carreira de jogador foi descontinuada; a API recusa criar uma nova.
	const refused = await page.request.post('/api/careers', { data: { mode: 'player', personName: 'Caio Atleta', clubId: 'palmeiras', position: 'ATA', world: 'brasil', appearance: DEFAULT_APPEARANCE }, headers: { Origin: origin } });
	assert.equal(refused.status(), 400);
	const player = await create({ mode: 'coach', personName: 'Caio Técnico', clubId: 'palmeiras', world: 'brasil', appearance: DEFAULT_APPEARANCE });
	await page.reload();
	const coachCard = page.getByRole('article').filter({ hasText: 'Ana Técnica' });
	const playerCard = page.getByRole('article').filter({ hasText: 'Caio Técnico' });
	await playerCard.getByRole('button', { name: 'Carregar', exact: true }).waitFor();

	for (const [width, height] of [[1920, 1080], [2560, 1440], [1600, 900], [1366, 768], [390, 844]]) {
		await page.setViewportSize({ width, height });
		assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `Overflow em ${width} × ${height}`);
		if ([1920, 390].includes(width)) await page.screenshot({ path: `${output}/biblioteca-${width}.png`, fullPage: true });
	}

	await coachCard.getByRole('button', { name: 'Renomear' }).click();
	await page.getByLabel('Nome do save').fill('Projeto Bahia');
	await page.getByRole('button', { name: 'Salvar nome' }).click();
	await coachCard.getByText('Projeto Bahia', { exact: true }).waitFor();
	const persisted = await (await page.request.get('/api/careers/' + coach.id)).json();
	assert.equal(persisted.career.version, coach.version);

	await playerCard.getByRole('button', { name: 'Carregar', exact: true }).click();
	await page.waitForURL('**/carreira/' + player.id);
	await page.goto('/continuar');
	await playerCard.getByRole('button', { name: /Excluir/ }).click();
	const confirm = page.getByRole('button', { name: 'Excluir definitivamente' });
	assert(await confirm.isDisabled());
	await page.getByRole('button', { name: 'Cancelar' }).click();
	await confirm.waitFor({ state: 'hidden' });
	assert.equal((await page.request.get('/api/careers/' + player.id)).status(), 200);

	await playerCard.getByRole('button', { name: /Excluir/ }).click();
	await page.getByRole('checkbox').check();
	await confirm.click();
	await playerCard.waitFor({ state: 'detached' });
	const { careers } = await (await page.request.get('/api/careers')).json();
	assert.deepEqual(careers.map(({ id, label }) => ({ id, label })), [{ id: coach.id, label: 'Projeto Bahia' }]);

	// Dev 0.12 · Hybrid Save Engine na carreira individual: servidor fora do ar ao salvar a tática.
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.goto(`/carreira/${coach.id}/taticas`);
	await page.getByRole('heading', { name: 'Táticas', exact: true }).waitFor();
	const careerApi = `**/api/careers/${coach.id}`;
	const cut = (route) => route.request().method() === 'PATCH' ? route.abort('internetdisconnected') : route.continue();
	await page.route(careerApi, cut);
	await page.getByRole('button', { name: 'Montar melhor 11' }).click();
	await page.getByRole('button', { name: 'Aplicar na prancheta' }).click();
	await page.getByRole('button', { name: 'Salvar tática', exact: true }).click();
	await page.getByText('Tática salva localmente', { exact: true }).first().waitFor();
	const badge = page.locator('[data-sync]').first();
	await page.waitForFunction(() => /\(1\)/.test(document.querySelector('[data-sync]')?.textContent ?? ''));
	await page.reload();
	await page.getByRole('heading', { name: 'Táticas', exact: true }).waitFor();
	await page.waitForFunction(() => /\(1\)/.test(document.querySelector('[data-sync]')?.textContent ?? ''), null, { timeout: 15_000 });
	assert.equal((await (await page.request.get('/api/careers/' + coach.id)).json()).career.data.tactic ?? null, null, 'nada chegou ao servidor ainda');
	await page.unroute(careerApi, cut);
	await page.waitForFunction(() => document.querySelector('[data-sync]')?.getAttribute('data-sync') === 'synced', null, { timeout: 40_000 });
	assert.match(await badge.textContent(), /Sincronizado/);
	const synced = (await (await page.request.get('/api/careers/' + coach.id)).json()).career;
	assert.ok(synced.data.tactic, 'a tática da fila local chegou ao save');
	assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'Overflow com o indicador de sincronização');

	// Nova carreira: seleção independente e o mesmo calendário para os dois treinadores.
	const button = (name) => page.getByRole('button', { name, exact: typeof name === 'string' });
	const assume = async () => {
		const ready = button('Assumir o controle');
		await ready.waitFor({ timeout: 2500 }).catch(() => {});
		if (await ready.isVisible()) await ready.click();
	};
	await page.goto('/nova-carreira');
	await page.getByRole('heading', { name: 'Escolha os países' }).waitFor();
	// World Database: país ativo = todas as divisões; sem país jogável, não avança.
	const brazil = page.getByRole('checkbox', { name: /Brasil/ });
	assert.equal(await brazil.getAttribute('aria-checked'), 'true');
	await brazil.click();
	assert(await button('Criar treinador').isDisabled());
	await brazil.click();
	await button('Criar treinador').click();
	await page.getByLabel('Nome do treinador').fill('Ana Torres');
	await button('Escolher clube').click();
	await page.getByRole('checkbox', { name: /Adicionar outro treinador/ }).check();
	await button('Confirmar e criar o próximo treinador').click();
	await page.getByLabel('Nome do treinador').fill('Bia Santos');
	await button('Escolher clube').click();
	const creating = page.waitForResponse((r) => r.url().endsWith('/api/careers') && r.request().method() === 'POST');
	await button('Iniciar carreira com 2 treinadores').click();
	const created = await creating;
	assert.equal(created.status(), 201, await created.text());
	const { career: shared } = await created.json();
	assert.deepEqual(shared.data.worldSelection, { countries: ['bra'] });
	assert.deepEqual(shared.data.league.selection, { divisions: ['serie-a', 'serie-b', 'serie-c', 'serie-d'], cup: true });
	assert(shared.data.local.coaches.every((c) => shared.data.league.divisions['serie-a'].includes(c.clubId)));
	const careerPage = `/carreira/${shared.id}`;
	await page.goto(careerPage + '/partida');
	await assume();
	await button('Finalizar preparação').click();
	await page.waitForURL('**' + careerPage);
	await page.goto(careerPage + '/partida');
	await assume();
	await button('Finalizar e jogar a rodada').click();
	await page.locator('.row .event').first().waitFor();
	assert.equal(await page.locator('.row .event').count(), 78);
	let confirmed = 0;
	for (let i = 0; i < 60 && !(await button('Voltar à carreira').isVisible()); i++) {
		const interruption = button('Continuar sem alterações');
		const halftime = button('Confirmar e continuar');
		const skip = button(/^(Ir ao intervalo|Resultado)$/);
		if (await interruption.isVisible()) await interruption.click();
		else if (await halftime.isVisible()) { await halftime.click(); confirmed++; }
		else if (await skip.isVisible() && await skip.isEnabled()) await skip.click();
		await page.waitForTimeout(150);
	}
	assert.equal(confirmed, 2);
	await button('Voltar à carreira').waitFor({ timeout: 30_000 });
	let maxHistory = 0;
	for (const cell of await page.locator('.row .event[data-kind]').all()) {
		assert.equal(await cell.locator('span').count(), 1);
		await cell.click();
		const detail = page.getByRole('dialog');
		maxHistory = Math.max(maxHistory, await detail.locator('ol li').count());
		await detail.getByRole('button', { name: 'Fechar' }).click();
		await detail.waitFor({ state: 'hidden' });
		if (maxHistory > 1) break;
	}
	assert(maxHistory > 1, 'A lista mostra só o último lance, e os detalhes preservam os anteriores');
	await button('Voltar à carreira').click();
	await page.waitForURL('**' + careerPage);
	// World Database: carreira europeia (LaLiga) pelo assistente, com elenco real e tabela pelo critério oficial.
	await page.goto('/nova-carreira');
	await page.getByRole('heading', { name: 'Escolha os países' }).waitFor();
	await page.getByRole('checkbox', { name: /Espanha/ }).click();
	assert(await button('Criar treinador').isDisabled(), 'Brasil e Europa juntos ainda não são permitidos');
	await page.getByRole('checkbox', { name: /Brasil/ }).click();
	await button('Criar treinador').click();
	await page.getByLabel('Nome do treinador').fill('Lia Mundo');
	await button('Escolher clube').click();
	const creatingWorld = page.waitForResponse((r) => r.url().endsWith('/api/careers') && r.request().method() === 'POST');
	await page.getByRole('button', { name: /Iniciar carreira|Começar carreira|Criar carreira/ }).last().click();
	const createdWorld = await creatingWorld;
	assert.equal(createdWorld.status(), 201, await createdWorld.text());
	const { career: spain } = await createdWorld.json();
	assert.equal(spain.data.world, 'mundo');
	assert.equal(spain.gameDate, '2026-08-02');
	assert.equal(spain.data.league.divisions['league/esp/1'].length, 20);
	assert.deepEqual(spain.data.europe?.comps.map((c) => c.id), ['continental/ucl', 'continental/uel'], 'Champions League e Europa League na carreira europeia');
	const round = await page.request.post(`/api/careers/${spain.id}/matches`, { data: { version: spain.version, step: 'league:1' }, headers: { Origin: origin } });
	assert.equal(round.status(), 200, await round.text());
	for (const path of ['', '/elenco', '/competicoes', '/financas', '/calendario', '/europa']) {
		const response = await page.goto(`/carreira/${spain.id}${path}`);
		await page.waitForLoadState('networkidle');
		assert.equal(response.status(), 200, `Tela ${path || '/'} da carreira europeia`);
		assert.equal(await page.getByText('Bola murcha').count(), 0, `Tela ${path || '/'} da carreira europeia falhou`);
	}
	await page.goto(`/carreira/${spain.id}/competicoes`);
	await page.getByRole('heading', { name: 'LaLiga' }).waitFor();
	await page.goto(`/carreira/${spain.id}/europa`);
	await page.getByRole('heading', { name: /Champions League|Europa League/ }).first().waitFor();
	assert.deepEqual(errors, []);
	console.log('Biblioteca de carreiras, ligas selecionáveis, placar simultâneo e carreira europeia aprovados no Chromium.');
} finally {
	await browser.close();
}
