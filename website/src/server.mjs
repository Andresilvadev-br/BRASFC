import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import { authProvider } from './auth.mjs';
import { failure, forum } from './forum.mjs';
import { categories } from './content.mjs';
import * as pages from './pages.mjs';
import { releaseCatalog } from './releases.mjs';

const types = {
  woff2: 'font/woff2',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
};
const imageLimit = 2 * 1024 * 1024;
const local = new Set(['127.0.0.1', 'localhost', '[::1]']);
const gameHost = 'aldetes.vps-kinghost.net';
const assetPath =
  /^\/(?:media\/[a-z0-9-]+\.(svg|webp)|fonts\/[a-z0-9-]+\.woff2|(?:site|motion)\.(?:css|js))$/;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const range = (value) => Math.max(1, Math.min(10000, Number.parseInt(value, 10) || 1));
const parseCookies = (request) =>
  new Map((request.headers.cookie ?? '').split(';').map((cookie) => cookie.trim().split('=', 2)));
const equal = (a, b) =>
  typeof a === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const bounded = (value, limit) => (typeof value === 'string' ? value.trim().slice(0, limit) : '');
const minutes = (n) => n * 60_000;

async function readForm(request, limit) {
  if (Number(request.headers['content-length']) > limit)
    throw failure(413, 'Formulário acima do tamanho permitido.');
  const type = request.headers['content-type'] ?? '';
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)(?:;|$)/i.test(type))
    throw failure(415, 'Formato de formulário inválido.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) {
      request.resume();
      throw failure(413, 'Formulário acima do tamanho permitido.');
    }
    chunks.push(chunk);
  }
  try {
    return await new Response(Buffer.concat(chunks), { headers: { 'content-type': type } }).formData();
  } catch {
    throw failure(400, 'Formulário inválido.');
  }
}
async function upload(file) {
  if (!file || !file.size) return null;
  if (file.size > imageLimit) throw failure(413, 'A imagem pode ter até 2 MB.');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw failure(415, 'Envie uma imagem PNG, JPEG ou WebP.');
  try {
    const input = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 9_000_000,
      failOn: 'error',
    });
    const meta = await input.metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format) || (meta.pages ?? 1) > 1)
      throw Error('Formato inválido');
    return await input
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 83 })
      .toBuffer();
  } catch {
    throw failure(415, 'Imagem inválida ou grande demais para processar.');
  }
}
export function createApp(env = process.env, options = {}) {
  const origin = new URL(env.WEBSITE_ORIGIN ?? 'http://127.0.0.1:4175');
  if (
    origin.hostname.replace(/\.$/, '') === gameHost ||
    (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local.has(origin.hostname))) ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error('WEBSITE_ORIGIN deve ser uma origem HTTPS separada da origem do jogo.');
  }
  const secure = origin.protocol === 'https:';
  const cookieName = secure ? '__Host-brasfc-web' : 'brasfc-web-local';
  const stateName = secure ? '__Host-brasfc-oidc' : 'brasfc-oidc-local';
  const cookie = (name, value, age) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const db =
    options.db ??
    forum(
      resolve(env.WEBSITE_DATA ?? 'data/community.sqlite'),
      (env.WEBSITE_TEAM_IDS ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    );
  const auth = options.auth ?? authProvider(env, origin);
  if (auth?.issuer) db.bindIssuer(auth.issuer);
  const releases = options.releases ?? releaseCatalog({ dynamic: env.WEBSITE_RELEASE_LOOKUP !== '0' });
  const assets = options.assets ?? new URL('./public/', import.meta.url);
  const notices = new Map([
    ['salvo', 'Alterações salvas.'],
    ['denuncia', 'Denúncia registrada para a equipe.'],
  ]);
  const app = createServer({ maxHeaderSize: 16384, requestTimeout: 15000 }, async (request, response) => {
    let path = '/';
    let session = null;
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Cache-Control', 'no-store');
    if (secure) response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const send = (status, body, type = 'text/html; charset=utf-8') => {
      response.writeHead(status, { 'Content-Type': type });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    const html = (title, content, status = 200, notice) =>
      send(status, pages.layout(title, path, content, { session, notice }), undefined);
    const redirect = (url) => {
      response.writeHead(303, { Location: url });
      response.end();
    };
    try {
      if (!request.url?.startsWith('/') || request.url.startsWith('//'))
        throw failure(400, 'Endereço inválido.');
      const url = new URL(request.url, origin);
      if (url.origin !== origin.origin) throw failure(400, 'Endereço inválido.');
      path = url.pathname;
      const q = url.searchParams;
      if (!['GET', 'HEAD', 'POST'].includes(request.method)) throw failure(405, 'Método inválido.');
      if (request.method !== 'POST' && assetPath.test(path)) {
        try {
          const file = await readFile(new URL(path.slice(1), assets));
          response.setHeader('Cache-Control', 'public, max-age=3600');
          return send(200, file, types[path.split('.').at(-1)]);
        } catch {
          throw failure(404, 'Arquivo indisponível.');
        }
      }
      const cookies = parseCookies(request);
      session = db.session(cookies.get(cookieName));
      const notice = notices.get(q.get('ok'));
      if (request.method === 'POST') {
        if (!session) throw failure(401, 'Entre com sua conta BRASFC para participar.');
        if (request.headers.origin !== origin.origin) throw failure(403, 'Origem da solicitação inválida.');
        const needsImage = path === '/foro/novo' || path.endsWith('/responder');
        const data = await readForm(request, needsImage ? imageLimit + 64 * 1024 : 16 * 1024);
        if (!equal(data.get('csrf'), session.csrf)) throw failure(403, 'Sessão do formulário inválida.');
        const fields = Object.fromEntries(data);
        db.rate('write:' + session.id, 48, minutes(10));
        if (path === '/conta/sair') {
          db.revoke(session.id, session.sessionId);
          response.setHeader('Set-Cookie', cookie(cookieName, '', 0));
          return redirect('/conta');
        }
        if (path.startsWith('/conta/')) {
          if (path === '/conta/perfil') db.profileEdit(session.id, fields);
          else if (path === '/conta/sessoes') {
            db.revoke(session.id, fields.id);
            if (fields.id === session.sessionId) response.setHeader('Set-Cookie', cookie(cookieName, '', 0));
          } else if (path === '/conta/distintivos') db.feature(session.id, data.getAll('badge'));
          else if (path === '/conta/notificacoes') db.seen(session.id);
          else throw failure(404, 'Ação indisponível.');
          return redirect('/conta?ok=salvo');
        }
        if (path === '/foro/distintivo') {
          db.award(session.id, fields.handle, fields.badge, fields.reason);
          return redirect('/comunidade/moderacao?ok=salvo');
        }
        if (needsImage) db.rate('post:' + session.id, 12, minutes(15));
        if (path === '/foro/novo') {
          const id = db.create(session.id, fields, await upload(data.get('image')));
          return redirect('/comunidade/topico/' + id);
        }
        const action = path.match(/^\/foro\/([a-f0-9-]{36})\/(responder|marcar|denunciar|moderacao)$/);
        if (!action || !uuid.test(action[1])) throw failure(404, 'Ação indisponível.');
        const [, id, operation] = action;
        if (operation === 'responder') db.reply(session.id, id, fields, await upload(data.get('image')));
        else if (operation === 'marcar') db.mark(session.id, id, fields.kind, fields.value);
        else if (operation === 'denunciar') {
          db.rate('report:' + session.id, 8, minutes(30));
          db.report(session.id, id, fields.target, fields.reason);
          return redirect('/comunidade/topico/' + id + '?ok=denuncia');
        } else {
          db.moderate(session.id, id, fields);
          if (fields.action === 'hide' || fields.action === 'report')
            return redirect('/comunidade/moderacao?ok=salvo');
        }
        return redirect('/comunidade/topico/' + id);
      }
      if (path === '/') return html('Seu clube. Sua carreira. Seu futebol.', pages.home(await releases()));
      if (path === '/download') return html('Download', pages.download(await releases()));
      if (path === '/novidades') return html('Novidades', pages.news(await releases()));
      if (path === '/galeria') return html('Galeria', pages.gallery(q.get('modo')));
      if (path === '/roadmap') return html('Roadmap', pages.roadmap());
      if (['/suporte', '/privacidade', '/termos'].includes(path))
        return html(path.slice(1), pages.institution(path));
      if (path === '/conta')
        return html(
          'Conta',
          pages.account(
            session,
            Boolean(auth),
            session
              ? {
                  badges: db.profile(session.handle, session.id).badges,
                  notifications: db.notifications(session.id),
                  sessions: db.sessions(session.id),
                }
              : {}
          ),
          200,
          notice
        );
      if (path === '/conta/entrar' || path === '/conta/retorno') {
        if (!auth || request.method === 'HEAD')
          throw failure(503, 'O provedor de contas BRASFC está indisponível.');
        if (path === '/conta/entrar') {
          db.rate('auth:' + (request.socket.remoteAddress ?? 'local'), 20, minutes(15));
          const flow = await auth.begin().catch(() => {
            throw failure(503, 'O provedor de contas BRASFC está indisponível.');
          });
          response.setHeader('Set-Cookie', cookie(stateName, flow.state, 600));
          return redirect(flow.location);
        }
        response.setHeader('Set-Cookie', cookie(stateName, '', 0));
        const claims = await auth.complete(url, cookies.get(stateName)).catch((error) => {
          if (error.status) throw error;
          throw failure(400, 'Não foi possível confirmar a conta com o provedor BRASFC.');
        });
        const secret = db.signIn(claims ?? {});
        if (session) db.revoke(session.id, session.sessionId);
        response.setHeader('Set-Cookie', [
          cookie(stateName, '', 0),
          cookie(cookieName, secret, 14 * 24 * 3600),
        ]);
        return redirect('/conta');
      }
      if (path === '/comunidade/novo')
        return html('Criar tópico', pages.newTopic(session, q.get('categoria')));
      if (path === '/comunidade/moderacao') {
        if (!session?.staff) throw failure(403, 'Área reservada à equipe BRASFC.');
        return html('Moderação', pages.moderation(session, db.queue(session.id)), 200, notice);
      }
      if (path === '/comunidade' || path.startsWith('/comunidade/c/')) {
        const category = path === '/comunidade' ? '' : path.slice('/comunidade/c/'.length);
        if (path !== '/comunidade' && !categories.some((c) => c.id === category))
          throw failure(404, 'Categoria indisponível.');
        const filter = {
          q: bounded(q.get('q'), 120),
          sort: bounded(q.get('sort'), 20),
          estado: bounded(q.get('estado'), 32),
          secao: bounded(q.get('secao'), 60),
          favoritos: session && q.get('favoritos') === '1' ? '1' : '',
          pagina: range(q.get('pagina')),
        };
        const rows = db.list({
          category,
          q: filter.q,
          sort: filter.sort,
          status: filter.estado,
          section: filter.secao,
          favorite: filter.favoritos ? session.id : undefined,
          page: filter.pagina,
        });
        return html(
          'Comunidade',
          pages.community(session, { rows, totals: db.categories(), filter, category })
        );
      }
      const topic = path.slice('/comunidade/topico/'.length);
      if (path.startsWith('/comunidade/topico/') && uuid.test(topic)) {
        const page = range(q.get('pagina'));
        const data = db.topic(topic, session?.id, page);
        if (!data) throw failure(404, 'Tópico indisponível.');
        const answering = data.replies.find((reply) => reply.id === q.get('resposta'))?.id;
        return html(data.entry.title, pages.topic(session, data, page, answering), 200, notice);
      }
      if (path.startsWith('/perfil/')) {
        const user = db.profile(path.slice('/perfil/'.length), session?.id);
        if (!user) throw failure(404, 'Perfil indisponível.');
        return html(user.name, pages.profile(user));
      }
      if (path.startsWith('/anexos/') && uuid.test(path.slice(8))) {
        const image = db.image(path.slice(8));
        if (image) return send(200, Buffer.from(image.data), 'image/webp');
      }
      throw failure(404, 'O endereço solicitado não está disponível no site.');
    } catch (error) {
      const status =
        Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
      if (status === 500) console.error(error.name, error.code ?? 'website_error');
      if (!response.headersSent)
        html(
          'Página indisponível',
          pages.errorPage(
            status,
            status === 500 ? 'Ocorreu um erro temporário. Tente de novo.' : error.message
          ),
          status
        );
    }
  });
  if (!options.db) app.once('close', () => db.close());
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = createApp();
  const host = process.env.WEBSITE_HOST ?? '127.0.0.1';
  const port = Number(process.env.WEBSITE_PORT ?? 4175);
  app.listen(port, host, () => console.log(`BRASFC Website · http://${host}:${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => app.close());
}
