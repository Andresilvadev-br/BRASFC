import { gameUrl, media, sourceLink, stableMaster, categories, statuses, badges } from './content.mjs';
import { releasesUrl, repository } from './releases.mjs';

export const e = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
const date = (value) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Recife' }).format(
        new Date(value)
      )
    : '';
const size = (bytes) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(bytes / 1e6) + ' MB';
const link = (href, label, type = '') => `<a class="button ${type}" href="${e(href)}">${e(label)}</a>`;
const brand = () =>
  '<a class="brand" href="/" aria-label="BRASFC, início"><img src="/media/brasfc.svg" width="33" height="36" alt=""><span>BRAS<strong>FC</strong></span></a>';
const menu = [
  ['/', 'O jogo'],
  ['/galeria', 'Galeria'],
  ['/novidades', 'Novidades'],
  ['/comunidade', 'Comunidade'],
];
const downloadIcon =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 4.7 11 3v8H2zm10-1.9 10-1.9V11H12zM2 12h9v8L2 18.3zm10 0h10v10.1L12 20.2z"/></svg>';
const get = (id) => media.find((item) => item.id === id);
const img = (id, lazy = true) =>
  `<img ${lazy ? 'loading="lazy"' : ''} decoding="async" src="/media/${id}.webp" alt="${e(get(id).alt)}" width="1280" height="720">`;
const fig = (id) =>
  `<figure>${img(id)}<figcaption>${e(get(id).title)} <span>${e(get(id).label)}</span></figcaption></figure>`;
const title = (label, text, detail = '') =>
  `<header class="page-title"><p class="eyebrow">${e(label)}</p><h1>${e(text)}</h1>${detail ? `<p>${e(detail)}</p>` : ''}</header>`;
export const form = (session, action, body, extra = '') =>
  `<form method="post" action="${e(action)}" ${extra}><input type="hidden" name="csrf" value="${e(session.csrf)}">${body}</form>`;
const hidden = (name, value) => `<input type="hidden" name="${name}" value="${e(value)}">`;
const button = (text, type = '') => `<button class="button ${type}" type="submit">${e(text)}</button>`;
const opts = (values, chosen = '') =>
  values
    .map(
      ([value, label]) =>
        `<option value="${e(value)}"${chosen === value ? ' selected' : ''}>${e(label)}</option>`
    )
    .join('');
export function layout(name, path, content, { session, notice } = {}) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="BRASFC, simulador brasileiro de futebol para Windows. Gerencie seu clube ou viva uma carreira de jogador."><meta name="theme-color" content="#0a1111"><title>${e(name)} | BRASFC</title><link rel="icon" href="/media/brasfc.svg" type="image/svg+xml"><link rel="stylesheet" href="/site.css"><script type="module" src="/site.js"></script></head><body><a class="skip" href="#conteudo">Pular para conteúdo</a><header class="top"><div class="mast"><div class="brand-area">${brand()}</div><nav aria-label="Principal">${menu.map(([href, label]) => `<a href="${href}"${href === '/' ? (path === '/' ? ' aria-current="page"' : '') : path.startsWith(href) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div class="top-actions"><a class="account-link" href="/conta">${session ? 'Minha conta' : 'Conta'}</a><a class="button primary mini" href="/download">${downloadIcon} Download</a></div></div></header><main id="conteudo">${notice ? `<p class="notice wrap" role="status">${e(notice)}</p>` : ''}${content}</main><footer class="footer"><div class="wrap footer-inner"><div>${brand()}<p>Seu clube. Sua carreira. Seu futebol.</p></div><nav aria-label="Informações"><a href="/roadmap">Roadmap</a><a href="/suporte">Suporte</a><a href="/privacidade">Privacidade</a><a href="/termos">Termos</a><a href="${repository}">GitHub</a></nav></div></footer></body></html>`;
}

const features = [
  [
    'treinador',
    'Seja o treinador.',
    'Comande o clube da primeira escalação à última rodada.',
    'Escolha seu esquema, distribua funções e acompanhe o elenco. Negocie no mercado, equilibre as finanças e encare o calendário das competições.',
    'painel',
  ],
  [
    'jogador',
    'Seja o jogador.',
    'Construa uma trajetória dentro de campo.',
    'Crie seu atleta, evolua nos treinos, dispute espaço e avalie propostas. Cada temporada muda as opções da sua carreira.',
    'jogador',
  ],
  [
    'partidas',
    'Viva cada partida.',
    'Leia o jogo e mude o plano durante os 90 minutos.',
    'Veja o posicionamento em campo, acompanhe os lances e decida quando trocar a formação ou fazer substituições. A transmissão oferece Clássico, Pixel e Narração.',
    'partida',
  ],
  [
    'multiplayer',
    'Divida a temporada.',
    'Jogue em uma liga compartilhada.',
    'Crie um universo, convide amigos e assuma uma função de treinador, auxiliar ou jogador conforme as regras da liga.',
    'ligas',
  ],
];

export function home(catalog) {
  const release = catalog.releases[0];
  return `<section class="hero"><div class="wrap hero-inner"><div class="hero-copy"><p class="eyebrow"><span></span> Simulador brasileiro de futebol</p><h1>Seu clube.<br>Sua carreira.<br><em>Seu futebol.</em></h1><p>Assuma o vestiário, construa sua trajetória em campo e dispute temporadas com amigos.</p><div class="actions"><a class="button primary" href="/download">${downloadIcon} Baixar para Windows</a>${link(gameUrl, 'Jogar no navegador', 'outline')}</div><p class="hero-meta">${release ? `Versão estável ${e(release.version)} <span></span> Windows x64` : 'Windows x64 <span></span> Consulte os downloads oficiais'}</p></div><div class="hero-aside"><button class="play-intro" type="button" data-intro hidden><span class="play-glyph" aria-hidden="true"></span> Ver apresentação</button></div></div></section>
  <section class="strip"><div class="wrap strip-inner"><div><strong>2 carreiras</strong><span>Treinador e jogador</span></div><div><strong>Partidas em 2D</strong><span>Clássico, Pixel e Narração</span></div><div><strong>Offline e online</strong><span>No seu ritmo ou com amigos</span></div></div></section>
  <section class="wrap features"><header class="section-heading"><p class="eyebrow">Dentro do BRASFC</p><h2>O jogo é seu.</h2></header>${features.map(([id, name, lead, detail, image], i) => `<article class="feature ${i % 2 ? 'reverse' : ''}" id="${id}"><div><h3>${name}</h3><p class="feature-lead">${lead}</p><p>${detail}</p>${link('/galeria?modo=' + get(image).group, 'Explorar galeria', 'text')}</div>${fig(image)}</article>`).join('')}</section>
  <section class="community-band"><div class="wrap band-inner"><div><p class="eyebrow">Comunidade</p><h2>O futebol cresce em equipe.</h2><p>Compartilhe ideias, relate problemas e acompanhe os próximos passos do BRASFC.</p></div>${link('/comunidade', 'Visitar o fórum', 'primary')}</div></section>
  <section class="wrap download-band"><div><p class="eyebrow">BRASFC para PC</p><h2>Seu próximo clube espera.</h2><p>${release ? `Windows x64 · ${e(release.version)} · ${size(release.bytes)}` : 'Consulte o estado do instalador oficial.'}</p></div>${link('/download', 'Ver download e requisitos', 'outline')}</section>
  <dialog id="intro" class="intro" aria-label="Apresentação do BRASFC"><div class="intro-inner"><img class="intro-crest" src="/media/brasfc.svg" alt="Escudo oficial do BRASFC" hidden><img class="intro-frame" alt="" hidden><p class="intro-caption" aria-live="polite"></p><div class="intro-bar"><a href="/download">Baixar para Windows</a><button class="button outline" type="button" data-skip>Pular apresentação</button></div></div></dialog>`;
}

export function gallery(group) {
  const groups = [
    ['', 'Todas'],
    ['treinador', 'Treinador'],
    ['jogador', 'Jogador'],
    ['partidas', 'Partidas 2D'],
    ['multiplayer', 'Multiplayer'],
  ];
  const selected = groups.some(([id]) => id === group) ? group : '';
  return `<article class="wrap page">${title('Galeria', 'O jogo em imagens', 'Capturas reais do BRASFC, com a versão ou origem indicada em cada imagem.')}
    <nav class="filters" aria-label="Filtrar galeria">${groups.map(([id, label]) => `<a class="chip" href="/galeria${id ? '?modo=' + id : ''}"${selected === id ? ' aria-current="true"' : ''}>${label}</a>`).join('')}</nav>
    <div class="gallery">${media
      .filter((item) => !selected || selected === item.group)
      .map(
        (item) =>
          `<div class="gallery-item"><a class="zoom" href="/media/${item.id}.webp" data-title="${e(item.title)}">${fig(item.id)}</a><a class="subtle" href="${sourceLink(item)}">Ver captura no repositório</a></div>`
      )
      .join('')}</div>
    <section class="empty"><h2>Vídeos de gameplay</h2><p>O acervo público verificado contém capturas estáticas. A apresentação usa essas imagens.</p></section><dialog id="preview" class="preview" aria-label="Imagem ampliada"><button type="button" class="button outline" data-dismiss>Fechar imagem</button><img alt=""></dialog></article>`;
}

const releaseLine = (item) =>
  `<article class="release-row"><div><span class="tag">Estável</span><h2>Windows ${e(item.version)}</h2><p>${date(item.published)} · ${size(item.bytes)}</p><p class="notes">${e(item.notes || 'Notas disponíveis no GitHub.')}</p></div>${link(item.page, 'Notas no GitHub', 'outline')}</article>`;
export function download(catalog) {
  const item = catalog.releases[0];
  return `<article class="wrap page">${title('Download oficial', 'BRASFC para Windows', 'O instalador é distribuído pelo repositório oficial do BRASFC.')}
    ${item ? `<section class="download-card"><div><p class="eyebrow">Versão estável</p><h2>${e(item.version)}</h2><p>BRASFC-Setup.exe · ${size(item.bytes)} · ${date(item.published)}</p><p>${catalog.cached ? 'Última consulta disponível em ' + date(catalog.checkedAt) : 'Verificado no GitHub Releases.'}</p></div><div><a class="button primary" href="${item.download}">${downloadIcon} Baixar instalador</a>${link(item.page, 'Ver release', 'outline')}</div></section>` : '<div class="empty"><h2>Instalador indisponível</h2><p>Nenhum instalador estável foi verificado.</p></div>'}
    <div class="info-split"><section><h2>Compatibilidade</h2><p>Windows 10 e 11 de 64 bits conforme as publicações oficiais do instalador. Os requisitos mínimos de hardware ainda não foram publicados.</p><p>O modo offline utiliza saves locais. O multiplayer requer conexão com a internet e conta no jogo.</p><a href="${releasesUrl}/tag/v1.4.8">Fonte da compatibilidade Windows</a></section><section><h2>Instalação</h2><p>Baixe o executável pelo GitHub Releases e abra o instalador no computador. As versões instaladas podem receber atualizações pelo próprio aplicativo.</p>${link('/suporte', 'Ajuda com instalação', 'text')}</section></div>
    ${item?.sha256 ? `<details class="hash"><summary>Ver SHA-256 do instalador</summary><code>${item.sha256}</code></details>` : ''}</article>`;
}
export function news(catalog) {
  return `<article class="wrap page">${title('Changelog', 'Novidades do BRASFC', 'Histórico de instaladores estáveis publicados no GitHub.')}
    ${catalog.releases.length ? catalog.releases.map(releaseLine).join('') : '<section class="empty"><p>O histórico de versões está indisponível neste momento.</p></section>'}${link(releasesUrl, 'Histórico completo no GitHub', 'text')}</article>`;
}
export function roadmap() {
  return `<article class="wrap page">${title('Desenvolvimento público', 'Roadmap', 'Acompanhe entregas publicadas e o espaço de participação da comunidade.')}
    <div class="roadmap"><section><h2>Planejado</h2><p>Sem itens oficialmente publicados nesta etapa.</p></section><section><h2>Em desenvolvimento</h2><p>Sem itens oficialmente publicados nesta etapa.</p></section><section><h2>Concluído</h2><span class="tag">Estável</span><h3>BRASFC 0.11.0 Master</h3><p>Atualização do jogo publicada com a versão Windows 1.4.9.</p><a href="${stableMaster.page}">Ver entrega Master no GitHub</a></section></div>
    <section class="empty"><h2>Créditos da comunidade</h2><p>As contribuições verificadas serão registradas aqui.</p>${link('/comunidade', 'Acompanhar o fórum', 'text')}</section></article>`;
}

const topicHref = (id) => '/comunidade/topico/' + encodeURIComponent(id);
const profileHref = (handle) => '/perfil/' + encodeURIComponent(handle);
const userLabel = (handle, publicProfile = true) =>
  publicProfile ? `<a href="${profileHref(handle)}">@${e(handle)}</a>` : '@' + e(handle);
const contentText = (body) =>
  e(body).replace(
    /(^|\s)@([a-z0-9_]{3,30})\b/gi,
    (_, prefix, handle) => `${prefix}<a href="${profileHref(handle.toLowerCase())}">@${handle}</a>`
  );
const picture = (id) =>
  `<a class="attachment" href="/anexos/${encodeURIComponent(id)}"><img src="/anexos/${encodeURIComponent(id)}" alt="Imagem anexada ao fórum" loading="lazy" decoding="async"></a>`;
const upload =
  '<label>Imagem opcional <input type="file" name="image" accept="image/png,image/jpeg,image/webp"><small>PNG, JPEG ou WebP · até 2 MB</small></label>';
const message = (session, body, required = 'Entre com sua conta BRASFC para participar.') =>
  session
    ? body
    : `<section class="empty"><p>${required}</p>${link('/conta', 'Acessar conta', 'outline')}</section>`;

export function community(session, { rows, totals, filter, category }) {
  const cat = categories.find((c) => c.id === category);
  const makeQuery = (changes) => {
    const query = new URLSearchParams(Object.entries({ ...filter, ...changes }).filter(([, value]) => value));
    return (cat ? '/comunidade/c/' + cat.id : '/comunidade') + '?' + query;
  };
  const sort = [
    ['', 'Em atividade'],
    ['recentes', 'Recentes'],
    ['votos', 'Mais votados'],
  ];
  return `<article class="wrap page forum">${title('Fórum oficial', cat?.label ?? 'Comunidade BRASFC', cat?.description ?? 'O BRASFC está em constante evolução. Compartilhe suas ideias, relate problemas e ajude a construir o futuro do jogo.')}
  <div class="forum-layout"><aside><h2>Categorias</h2><nav class="forum-categories" aria-label="Categorias do fórum"><a href="/comunidade"${!cat ? ' aria-current="page"' : ''}>Todos os tópicos</a>${categories.map((c) => `<a href="/comunidade/c/${c.id}"${cat?.id === c.id ? ' aria-current="page"' : ''}>${c.label}<span>${totals.find((x) => x.category === c.id)?.total ?? 0}</span></a>`).join('')}</nav></aside>
  <section class="topic-list"><div class="section-tools"><h2>Tópicos</h2>${session ? link('/comunidade/novo', 'Novo tópico', 'primary') : link('/conta', 'Entrar para participar', 'outline')}</div>
  <form method="get" class="forum-filters"><label>Buscar<input type="search" name="q" value="${e(filter.q)}" maxlength="120" placeholder="Título ou conteúdo"></label><label>Ordenar<select name="sort">${opts(sort, filter.sort)}</select></label>
  <label>Estado<select name="estado">${opts([['', 'Todos'], ...statuses.map((s) => [s, s])], filter.estado)}</select></label>
  ${cat ? `<label>Seção<select name="secao">${opts([['', 'Todas'], ...cat.sections.map((s) => [s, s])], filter.secao)}</select></label>` : ''}
  ${session ? `<label class="check"><input type="checkbox" name="favoritos" value="1" ${filter.favoritos ? 'checked' : ''}> Favoritos</label>` : ''}${button('Filtrar', 'outline')}</form>
  ${
    rows.length
      ? rows
          .slice(0, 20)
          .map(
            (row) =>
              `<article class="topic-row"><div><p class="topic-meta">${e(row.section)} · @${e(row.handle)} · ${date(row.created)} ${row.pinned ? ' · Fixado' : ''}</p><h3><a href="${topicHref(row.id)}">${e(row.title)}</a></h3><p class="topic-meta">${row.status ? `<span class="tag">${e(row.status)}</span>` : ''} ${row.version ? 'Versão ' + e(row.version) : ''}</p></div><p class="topic-count">${row.replies} resp.<br>${row.votes} apoios</p></article>`
          )
          .join('')
      : '<div class="empty"><h3>Nenhum tópico encontrado</h3><p>Os primeiros tópicos aparecem aqui quando forem publicados.</p></div>'
  }
  <nav class="paging" aria-label="Paginação">${filter.pagina > 1 ? link(makeQuery({ pagina: filter.pagina - 1 }), 'Página anterior', 'outline') : ''}${rows.length > 20 ? link(makeQuery({ pagina: filter.pagina + 1 }), 'Próxima página', 'outline') : ''}</nav></section></div></article>`;
}

export function newTopic(session, selected) {
  const available = categories.filter((x) => session?.staff || x.id !== 'anuncios');
  const cat = available.find((c) => c.id === selected) ?? available[0];
  return `<article class="wrap page article">${title('Comunidade', 'Criar tópico')}${message(
    session,
    session
      ? `
    <form method="get" class="row-form"><label>Categoria<select name="categoria">${opts(
      available.map((c) => [c.id, c.label]),
      cat.id
    )}</select></label>${button('Escolher categoria', 'outline')}</form>
    ${form(session, '/foro/novo', hidden('category', cat.id) + `<label>Seção<select name="section">${opts(cat.sections.map((s) => [s, s]))}</select></label><label>Título<input required name="title" minlength="6" maxlength="120"></label><label>Publicação<textarea required name="body" minlength="12" maxlength="6000" rows="8"></textarea></label>${upload}${button('Publicar tópico', 'primary')}`, 'class="edit-form" enctype="multipart/form-data"')}`
      : ''
  )}</article>`;
}

const report = (session, id, target) =>
  `<details class="report"><summary>Denunciar</summary>${form(session, `/foro/${id}/denunciar`, hidden('target', target) + '<label>Motivo<input name="reason" minlength="4" maxlength="240" required></label>' + button('Registrar denúncia', 'outline'), 'class="row-form"')}</details>`;
export function topic(session, resolved, page, answering) {
  const { entry: t, replies, marks, attachments } = resolved;
  const markButton = (key, label) => {
    const value = marks.find((m) => m.kind === key);
    const copy =
      key === 'favorite'
        ? value?.selected
          ? 'Remover dos favoritos'
          : 'Guardar nos favoritos'
        : label + (value?.total ? ' · ' + value.total : '');
    return session
      ? form(
          session,
          `/foro/${t.id}/marcar`,
          hidden('kind', key) +
            hidden('value', value?.selected ? 'off' : 'on') +
            `<button type="submit" class="chip" aria-pressed="${Boolean(value?.selected)}">${e(copy)}</button>`
        )
      : key !== 'favorite' && value?.total
        ? `<span class="tag">${e(copy)}</span>`
        : '';
  };
  const staffTools = !session?.staff
    ? ''
    : `<details class="moderation"><summary>Moderação</summary>
    ${
      t.status
        ? form(
            session,
            `/foro/${t.id}/moderacao`,
            hidden('action', 'status') +
              `<label>Estado oficial<select name="value">${opts(
                statuses.map((x) => [x, x]),
                t.status
              )}</select></label><label>Versão concluída<input name="version" value="${e(t.version)}" maxlength="25" placeholder="0.11.0"></label>${button('Salvar estado', 'outline')}`,
            'class="row-form"'
          )
        : ''
    }
    ${form(session, `/foro/${t.id}/moderacao`, hidden('action', 'pin') + button(t.pinned ? 'Remover fixação' : 'Fixar tópico', 'outline'))}
    ${form(session, `/foro/${t.id}/moderacao`, hidden('action', 'hide') + button('Ocultar tópico', 'outline'))}</details>`;
  return `<article class="wrap page article">${link('/comunidade/c/' + t.category, 'Voltar à categoria', 'text')}${title(t.section, t.title)}
    <div class="topic-meta">${userLabel(t.handle, t.profilePublic)} · ${date(t.created)} ${t.pinned ? ' · Fixado' : ''} ${t.status ? `<span class="tag">${e(t.status)}</span>` : ''} ${t.version ? 'Versão ' + e(t.version) : ''}</div><p class="prose">${contentText(t.body)}</p>
    ${attachments
      .filter((a) => !a.reply)
      .map((a) => picture(a.id))
      .join('')}
    <div class="marks">${t.category === 'ideias' ? markButton('vote', 'Votar na sugestão') : t.category === 'bugs' ? markButton('also', 'Também tenho esse problema') : ''}${markButton('like', 'Curtir')}${markButton('helpful', 'Útil')}${markButton('favorite', 'Favoritos')}</div>${session ? report(session, t.id, t.id) : ''}${staffTools}
    <section class="replies"><h2>Respostas (${t.replies})</h2>${
      replies.length
        ? replies
            .slice(0, 30)
            .map(
              (
                reply
              ) => `<article class="reply" id="resposta-${reply.id}"><p class="topic-meta">${userLabel(reply.handle, reply.profilePublic)} · ${date(reply.created)} ${reply.parent ? ' · Em resposta a um comentário' : ''}</p><p class="prose">${contentText(reply.body)}</p>${attachments
                .filter((a) => a.reply === reply.id)
                .map((a) => picture(a.id))
                .join('')}
    ${session ? `<a href="?pagina=${page}&amp;resposta=${reply.id}#responder">Responder</a>${report(session, t.id, reply.id)}` : ''}${session?.staff ? form(session, `/foro/${t.id}/moderacao`, hidden('action', 'reply') + hidden('value', reply.id) + button('Ocultar resposta', 'outline')) : ''}</article>`
            )
            .join('')
        : '<p>Ainda sem respostas.</p>'
    }
    <nav class="paging" aria-label="Páginas de respostas">${page > 1 ? link('?pagina=' + (page - 1), 'Página anterior', 'outline') : ''}${replies.length > 30 ? link('?pagina=' + (page + 1), 'Próxima página', 'outline') : ''}</nav>
    <div id="responder">${message(session, session ? form(session, `/foro/${t.id}/responder`, hidden('parent', answering ?? '') + `<label>${answering ? 'Responder ao comentário' : 'Escrever resposta'}<textarea required name="body" minlength="2" maxlength="4000" rows="5"></textarea></label>${upload}${button('Enviar resposta', 'primary')}`, 'class="edit-form" enctype="multipart/form-data"') : '')}</div></section></article>`;
}

export function account(session, configured, detail = {}) {
  if (!session)
    return `<article class="wrap page article">${title('Conta BRASFC', 'Entre na comunidade', 'A comunidade usará a identidade BRASFC do jogador.')}${configured ? `<p>O provedor oficial apresenta os métodos ativos, incluindo Google e usuário e senha quando habilitados.</p>${link('/conta/entrar', 'Continuar com a conta BRASFC', 'primary')}` : '<section class="empty"><h2>Login indisponível nesta instalação</h2><p>O provedor de contas BRASFC ainda precisa ser vinculado. A leitura do fórum permanece pública.</p></section>'}</article>`;
  return `<article class="wrap page article">${title('Conta BRASFC', session.name, '@' + session.handle)}
    ${form(session, '/conta/sair', button('Encerrar esta sessão', 'outline'))}
    <section><h2>Perfil</h2><a href="${profileHref(session.handle)}">Ver meu perfil</a>
    ${form(session, '/conta/perfil', `<label>Nome de exibição<input name="name" value="${e(session.name)}" maxlength="60" required></label><label>Biografia<textarea name="bio" maxlength="320">${e(session.bio)}</textarea></label><label class="check"><input type="checkbox" name="public" value="1"${session.public ? ' checked' : ''}> Perfil público</label>${button('Salvar perfil', 'primary')}`, 'class="edit-form"')}</section>
    <section><h2>Distintivos</h2>${detail.badges.length ? form(session, '/conta/distintivos', '<p>Destaque até dois distintivos.</p>' + detail.badges.map((x) => `<label class="check"><input name="badge" value="${e(x.badge)}" type="checkbox"${x.featured ? ' checked' : ''}> ${e(x.badge)}</label>`).join('') + button('Salvar destaques', 'outline'), 'class="edit-form"') : '<p>Distintivos são concedidos pela equipe por contribuições verificadas.</p>'}</section>
    <section><h2>Notificações</h2>${detail.notifications.length ? `<ul>${detail.notifications.map((n) => `<li><a href="${topicHref(n.topic)}">${e(n.label)}</a> · ${date(n.created)}${n.seen ? '' : ' · Nova'}</li>`).join('')}</ul>${form(session, '/conta/notificacoes', button('Marcar como lidas', 'outline'))}` : '<p>Nenhuma notificação.</p>'}</section>
    <section><h2>Sessões ativas</h2><ul class="sessions">${detail.sessions.map((s) => `<li><span>Iniciada em ${date(s.created)}${s.id === session.sessionId ? ' · sessão atual' : ''}</span>${form(session, '/conta/sessoes', hidden('id', s.id) + button('Encerrar', 'outline'))}</li>`).join('')}</ul><p>A recuperação de acesso é gerenciada pelo provedor unificado de contas.</p></section>
    ${session.staff ? link('/comunidade/moderacao', 'Abrir moderação', 'outline') : ''}</article>`;
}

export function profile(user) {
  return `<article class="wrap page article">${title('Perfil da comunidade', user.name, '@' + user.handle)}<p class="prose">${e(user.bio)}</p>
    <h2>Distintivos</h2><div class="marks">${
      user.badges.length
        ? user.badges
            .filter((b) => b.featured)
            .map((b) => `<span class="tag" title="${e(b.reason)}">${e(b.badge)}</span>`)
            .join('') || '<p>Sem distintivos em destaque.</p>'
        : '<p>Sem distintivos atribuídos.</p>'
    }</div>
    <h2>Publicações recentes</h2>${user.topics.length ? `<ul>${user.topics.map((t) => `<li><a href="${topicHref(t.id)}">${e(t.title)}</a> · ${date(t.created)}</li>`).join('')}</ul>` : '<p>Sem publicações.</p>'}</article>`;
}

export function moderation(session, queue) {
  return `<article class="wrap page article">${title('Equipe BRASFC', 'Moderação da comunidade')}
    <h2>Denúncias abertas</h2>${queue.map((r) => `<article class="reply"><h3>${e(r.title)}</h3><p>${e(r.reason)}</p>${r.hidden ? '<p>Tópico oculto.</p>' : link(topicHref(r.topic), 'Ler tópico', 'text')}${form(session, `/foro/${r.topic}/moderacao`, hidden('action', 'report') + hidden('value', r.id) + button('Encerrar denúncia', 'outline'))}</article>`).join('') || '<p>Nenhuma denúncia pendente.</p>'}
    <h2>Conceder distintivo verificado</h2>${form(session, '/foro/distintivo', '<label>Usuário (sem @)<input name="handle" required maxlength="30"></label>' + `<label>Distintivo<select name="badge">${opts(badges.map((b) => [b, b]))}</select></label>` + '<label>Justificativa<input required name="reason" minlength="8" maxlength="240"></label>' + button('Conceder distintivo', 'primary'), 'class="edit-form"')}</article>`;
}

export function institution(path) {
  const pages = {
    '/suporte': [
      'Central de ajuda',
      'Suporte BRASFC',
      `<h2>Instalação e atualizações</h2><p>Confira o download oficial e as notas da versão. Se a instalação falhar, anote a versão e o erro exibido.</p>${link('/download', 'Ver download', 'outline')}<h2>Relatar um problema</h2><p>Use o fórum para compartilhar o contexto, passos para reproduzir e uma captura sem informações pessoais.</p>${link('/comunidade/c/bugs', 'Ir para bugs e problemas', 'outline')}`,
    ],
    '/privacidade': [
      'Conta e dados',
      'Privacidade',
      `<h2>Dados da comunidade</h2><p>O fórum guarda o identificador BRASFC, nome, usuário, publicações e interações necessárias para sua operação. O site usa um cookie de sessão para autenticação e não armazena a senha do jogo. Denúncias e dados da sessão são restritos.</p><h2>Visibilidade e gestão</h2><p>Na conta você pode esconder a página de perfil e encerrar sessões. O nome de usuário continua visível nas publicações públicas. Solicitações sobre dados podem ser encaminhadas à equipe pelo canal de suporte quando o serviço estiver disponível.</p>${link('/conta', 'Configurações da conta', 'outline')}`,
    ],
    '/termos': [
      'Regras da comunidade',
      'Termos de participação',
      '<h2>Convivência</h2><p>Publique conteúdo relacionado ao jogo. Evite spam, assédio, dados pessoais e material que você não tem autorização para compartilhar. Use a ferramenta de denúncia para alertar a moderação.</p><h2>Moderação</h2><p>A equipe pode ocultar conteúdo que viole as regras. Estados e distintivos são atribuídos por revisão da equipe e podem ser corrigidos.</p>',
    ],
  };
  const [label, name, body] = pages[path];
  return `<article class="wrap page article">${title(label, name)}${body}</article>`;
}
export const errorPage = (status, description) =>
  `<article class="wrap page article">${title(String(status), status === 404 ? 'Página indisponível' : 'Não foi possível concluir', description)}${link('/', 'Voltar ao início', 'primary')}</article>`;
