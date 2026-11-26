import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { createApp } from '../src/server.mjs';
import { forum } from '../src/forum.mjs';
const require = createRequire(import.meta.url);
const output = process.env.WEBSITE_SCREENSHOTS ?? 'test-results';
await mkdir(output, { recursive: true });
const db = forum(':memory:');
const app = createApp(
  { WEBSITE_ORIGIN: 'http://127.0.0.1:4175', WEBSITE_RELEASE_LOOKUP: '0' },
  { db, assets: new URL('../dist/public/', import.meta.url) }
);
app.listen(0, '127.0.0.1');
await once(app, 'listening');
const baseURL = 'http://127.0.0.1:' + app.address().port;
let browser;
try {
  const args = process.env.WEBSITE_CHROMIUM_ARGS ? JSON.parse(process.env.WEBSITE_CHROMIUM_ARGS) : undefined;
  browser = await chromium.launch({ executablePath: process.env.WEBSITE_CHROMIUM_EXECUTABLE, args });
  const routes = [
    '/',
    '/galeria',
    '/download',
    '/novidades',
    '/roadmap',
    '/comunidade',
    '/conta',
    '/suporte',
    '/privacidade',
    '/termos',
  ];
  const errors = [];
  const page = await browser.newPage({ baseURL });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());
  });
  for (const width of [1920, 1440, 1366, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    for (const path of routes) {
      assert.equal((await page.goto(path)).status(), 200);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `Overflow em ${path} a ${width}px`
      );
      assert.equal(await page.locator('h1').count(), 1);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const audit = await browser.newPage({ baseURL, bypassCSP: true, viewport: { width: 1440, height: 1000 } });
  for (const [route, name] of [
    ['/', 'home-desktop'],
    ['/galeria', 'galeria-desktop'],
    ['/download', 'download-desktop'],
    ['/comunidade', 'forum-desktop'],
  ]) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    if (route === '/galeria') {
      await page
        .locator('figure img')
        .evaluateAll((images) => images.forEach((img) => (img.loading = 'eager')));
      await page.waitForFunction(() =>
        [...document.querySelectorAll('figure img')].every((img) => img.complete && img.naturalWidth > 0)
      );
    }
    await page.screenshot({ path: `${output}/${name}.jpg`, type: 'jpeg', quality: 76 });
    await audit.goto(route);
    await audit.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const violations = await audit.evaluate(async () =>
      (await window.axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      }))
    );
    assert.deepEqual(violations, [], route);
  }
  await page.goto('/galeria?modo=partidas');
  assert.equal(await page.locator('.gallery-item').count(), 1);
  await page.locator('a.zoom').click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('a.zoom').evaluate((el) => el === document.activeElement), true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver apresentação' }).click();
  assert.equal(await page.locator('#intro').evaluate((el) => el.open && !el.matches(':modal')), true);
  await page.locator('.intro-frame').waitFor({ state: 'visible', timeout: 7000 });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#intro').evaluate((el) => el.open), false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Ver apresentação' }).click();
  assert.equal(await page.locator('.intro-frame').isVisible(), false);
  await page.getByRole('button', { name: 'Pular apresentação' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/home-mobile.jpg`, type: 'jpeg', quality: 78 });
  await page.goto('/comunidade');
  await page.getByRole('link', { name: 'Ideias e sugestões' }).click();
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('escalação');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await page.getByRole('heading', { name: 'Nenhum tópico encontrado' }).waitFor();
  await page.goto('/download');
  const download = await page.getByRole('link', { name: 'Baixar instalador' }).getAttribute('href');
  assert.match(
    download,
    /^https:\/\/github\.com\/Andresilvadev-br\/BRASFC\/releases\/download\/v\d+\.\d+\.\d+\/BRASFC-Setup\.exe$/
  );
  assert.deepEqual(errors, []);
  console.log(
    '70 combinações de páginas e larguras, galeria com teclado, apresentação, movimento reduzido, fórum, download e axe aprovados.'
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => app.close(resolve));
  db.close();
}
