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
	await page.getByText('As ligas ficam disponíveis no modo online.').waitFor();

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
	assert.deepEqual(errors, []);
	console.log('Biblioteca de carreiras aprovada no Chromium em cinco resoluções.');
} finally {
	await browser.close();
}
