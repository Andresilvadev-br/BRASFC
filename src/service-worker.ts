/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * Service worker do BRASFC (PWA instalável).
 *  - Cache SEPARADO por versão (`brasfc-<versão>`): arquivos de versões diferentes nunca se misturam.
 *  - A versão nova só assume quando o usuário pede ("Atualizar agora" → SKIP_WAITING), depois de
 *    o aplicativo conferir que não há alterações sem salvar.
 *  - API e WebSocket nunca passam pelo cache: partidas e ações oficiais exigem o servidor.
 *  - Sem conexão: páginas já visitadas abrem do cache; as demais mostram um aviso de offline.
 */
import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `brasfc-${version}`;
const ASSETS = new Set([...immutable, ...assets].map((a) => (String(a.path).startsWith('/') ? String(a.path) : `/${a.path}`)));

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...ASSETS])));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) if (key !== CACHE && key.startsWith('brasfc-')) await caches.delete(key);
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') void sw.skipWaiting();
	if (event.data?.type === 'VERSION') event.source?.postMessage({ type: 'VERSION', version });
});

const OFFLINE = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BRASFC · sem conexão</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#101418;color:#e7edf0;font:16px system-ui,sans-serif;text-align:center">
<main style="max-width:420px;padding:24px"><h1 style="font-weight:800;letter-spacing:.04em">BRAS<span style="color:#34d399">FC</span></h1>
<p>Sem conexão com o servidor. Partidas e ações da carreira são processadas no servidor para manter tudo seguro.</p>
<p style="color:#aab6bd">Reconecte e toque em tentar novamente.</p><button onclick="location.reload()" style="margin-top:12px;padding:10px 18px;border-radius:999px;border:0;background:#10b981;color:#06140f;font-weight:700">Tentar novamente</button></main></body></html>`;

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== sw.location.origin) return;
	if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;
	if (ASSETS.has(url.pathname)) {
		// Arquivos com hash/versão: do cache desta versão.
		event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(url.pathname)) ?? fetch(req)));
		return;
	}
	if (req.mode === 'navigate') {
		// Rede primeiro (dados sempre atuais); sem conexão, a última cópia ou o aviso de offline.
		event.respondWith(
			(async () => {
				const privatePage = /^\/(?:conta|carreira|multiplayer|continuar|configuracoes|perfil)(?:\/|$)/.test(url.pathname);
				const cache = privatePage ? null : await caches.open(CACHE);
				try {
					const res = await fetch(req);
					if (cache && res.ok && res.type === 'basic') {
						if (/private|no-store/i.test(res.headers.get('cache-control') ?? '')) void cache.delete(req);
						else void cache.put(req, res.clone());
					}
					return res;
				} catch {
					return (await cache?.match(req)) ?? new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
				}
			})()
		);
	}
});
