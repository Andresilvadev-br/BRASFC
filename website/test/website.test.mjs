import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createApp } from '../src/server.mjs';
import { forum } from '../src/forum.mjs';
import { stableReleases, releasesUrl } from '../src/releases.mjs';

const fixture = (tag = 'v2.0.0') => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  published_at: '2026-11-01T00:00:00Z',
  body: 'Nota oficial',
  assets: [
    {
      name: 'BRASFC-Setup.exe',
      state: 'uploaded',
      size: 100,
      browser_download_url: `${releasesUrl}/download/${tag}/BRASFC-Setup.exe`,
    },
  ],
});
const identity = (id, handle) => ({
  brasfc_profile_id: id,
  sub: 'canonical-' + id,
  preferred_username: handle,
  name: handle,
});
async function serve(t) {
  const database = forum(':memory:', ['staff']);
  const origin = 'http://127.0.0.1:4175';
  const app = createApp(
    { WEBSITE_ORIGIN: origin },
    { db: database, assets: new URL('../public/', import.meta.url), releases: async () => ({ releases: [] }) }
  );
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(async () => {
    await new Promise((resolve) => app.close(resolve));
    database.close();
  });
  const base = 'http://127.0.0.1:' + app.address().port;
  const cookie = (secret) => 'brasfc-web-local=' + secret;
  const login = (claims) => {
    const secret = database.signIn(claims);
    return { secret, csrf: database.session(secret).csrf };
  };
  const get = (path, session) =>
    fetch(base + path, { headers: session ? { cookie: cookie(session.secret) } : {} });
  const post = (path, session, data, header = {}) => {
    const fields = data instanceof FormData ? data : new URLSearchParams(data);
    if (session && !fields.has('csrf')) fields.set('csrf', session.csrf);
    return fetch(base + path, {
      method: 'POST',
      redirect: 'manual',
      headers: { Origin: origin, ...(session ? { cookie: cookie(session.secret) } : {}), ...header },
      body: fields,
    });
  };
  return { database, login, get, post };
}
test('catálogo só aceita instalador estável verificado na origem oficial', () => {
  const marker = fixture();
  assert.equal(
    stableReleases([
      marker,
      { ...marker, prerelease: true },
      { ...marker, draft: true },
      { ...marker, assets: [] },
      fixture('v9.9.9-rc.1'),
      {
        ...marker,
        assets: [{ ...marker.assets[0], browser_download_url: 'https://elsewhere.invalid/a.exe' }],
      },
    ]).length,
    1
  );
});
test('estrutura web separada, estados vazios e rotas do jogo ausentes', async (t) => {
  for (const host of ['aldetes.vps-kinghost.net', 'aldetes.vps-kinghost.net.']) {
    assert.throws(() => createApp({ WEBSITE_ORIGIN: 'https://' + host }), /separada/);
  }
  const { get, post } = await serve(t);
  for (const path of [
    '/',
    '/download',
    '/galeria',
    '/novidades',
    '/roadmap',
    '/comunidade',
    '/conta',
    '/suporte',
    '/privacidade',
    '/termos',
  ]) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  }
  assert.match(await (await get('/download')).text(), /Instalador indisponível/);
  assert.match(await (await get('/conta')).text(), /Login indisponível/);
  assert.equal((await get('/conta/entrar')).status, 503);
  for (const path of ['/menu', '/carreira', '/api/rooms', '/api/session', '/ws', '/media/ausente.webp'])
    assert.equal((await get(path)).status, 404);
  assert.equal((await post('/foro/novo', null, {})).status, 401);
});
test('fórum usa identidade BRASFC, protege formulários e aplica moderação no servidor', async (t) => {
  const { database, login, get, post } = await serve(t);
  const author = login(identity('author', 'treinadora'));
  const reader = login(identity('reader', 'meia'));
  const team = login(identity('staff', 'equipe'));
  assert.throws(() => login({ ...identity('reader', 'meia'), sub: 'outro' }), /Vínculo incompatível/);
  assert.throws(() => login({ sub: 'outra-identidade', preferred_username: 'fora' }), /identidade BRASFC/);
  const draft = {
    category: 'ideias',
    section: 'Mecânicas',
    title: 'Tópico de testes',
    body: 'Sugestão segura <script>alert(1)</script> @meia',
  };
  assert.equal(
    (await post('/foro/novo', author, draft, { Origin: 'https://elsewhere.invalid' })).status,
    403
  );
  assert.equal((await post('/foro/novo', author, { ...draft, csrf: 'invalid' })).status, 403);
  assert.equal(
    (await post('/foro/novo', author, { ...draft, category: 'anuncios', section: 'Changelog' })).status,
    403
  );
  const data = new FormData();
  for (const [key, value] of Object.entries(draft)) data.set(key, value);
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'green' } })
    .png()
    .toBuffer();
  data.set('image', new Blob([png], { type: 'image/png' }), 'campo.png');
  const created = await post('/foro/novo', author, data);
  assert.equal(created.status, 303);
  const url = created.headers.get('location');
  const id = url.split('/').at(-1);
  const publicPage = await (await get(url)).text();
  assert.match(publicPage, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  const image = publicPage.match(/src="(\/anexos\/[a-f\d-]+)"/)[1];
  assert.equal((await get(image)).headers.get('content-type'), 'image/webp');
  const invalid = new FormData();
  invalid.set('body', 'Resposta com anexo inválido');
  invalid.set('image', new Blob(['<svg/>'], { type: 'image/png' }), 'falso.png');
  assert.equal((await post(`/foro/${id}/responder`, reader, invalid)).status, 415);
  assert.equal(
    (await post(`/foro/${id}/responder`, reader, { body: 'Estou acompanhando este tópico.' })).status,
    303
  );
  for (let i = 0; i < 2; i++)
    assert.equal((await post(`/foro/${id}/marcar`, reader, { kind: 'vote', value: 'on' })).status, 303);
  assert.equal(database.topic(id, 'reader').marks.find((m) => m.kind === 'vote').total, 1);
  assert.equal(database.notifications('reader').length, 1);
  assert.equal(database.notifications('author').length, 1);
  assert.equal(
    (await post(`/foro/${id}/denunciar`, reader, { target: id, reason: 'Relatório de teste' })).status,
    303
  );
  const moderate = { action: 'status', value: 'Concluído', version: '0.11.0' };
  assert.equal((await post(`/foro/${id}/moderacao`, reader, moderate)).status, 403);
  assert.equal((await post(`/foro/${id}/moderacao`, team, moderate)).status, 303);
  assert.match(await (await get(url)).text(), /Versão 0\.11\.0/);
  assert.equal(
    (
      await post('/foro/distintivo', team, {
        handle: 'meia',
        badge: 'Equipe BRASFC',
        reason: 'Contribuição testada',
      })
    ).status,
    403
  );
  assert.equal(
    (
      await post('/foro/distintivo', team, {
        handle: 'meia',
        badge: 'Testador',
        reason: 'Contribuição testada',
      })
    ).status,
    303
  );
  assert.equal((await post('/conta/distintivos', reader, { badge: 'Testador' })).status, 303);
  assert.match(await (await get('/perfil/meia')).text(), /Testador/);
  assert.equal((await post('/conta/perfil', reader, { name: 'Nome privado', bio: '' })).status, 303);
  assert.equal((await get('/perfil/meia')).status, 404);
  assert.equal((await get('/perfil/meia', reader)).status, 200);
  assert.equal((await post(`/foro/${id}/moderacao`, team, { action: 'hide' })).status, 303);
  assert.equal((await get(image)).status, 404);
  assert.equal(
    (await post(`/foro/${id}/moderacao`, team, { action: 'report', value: database.queue('staff')[0].id }))
      .status,
    303
  );
  assert.equal(database.queue('staff').length, 0);
  assert.equal((await post('/conta/sair', reader, {})).status, 303);
  assert.equal(database.session(reader.secret), null);
});

test('SQLite recupera publicações e sessões após reiniciar a comunidade', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'brasfc-website-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'community.sqlite');
  let db = forum(file);
  try {
    db.bindIssuer('https://accounts.example.invalid/');
    const member = db.signIn(identity('member', 'membro'));
    const topic = db.create('member', {
      category: 'bugs',
      section: 'Interface',
      title: 'Problema persistente',
      body: 'Publicação gravada no banco isolado.',
    });
    db.close();
    db = forum(file);
    db.bindIssuer('https://accounts.example.invalid/');
    assert.throws(() => db.bindIssuer('https://wrong.example.invalid/'), /outro emissor/);
    assert.equal(db.session(member).id, 'member');
    assert.equal(db.topic(topic).entry.title, 'Problema persistente');
  } finally {
    db.close();
  }
});
