// Teste de fumaça contra um servidor em execução.
// Uso: node scripts/smoke.mjs http://127.0.0.1:3000
// 0.13 LOCAL LEGACY: o site público (VPS) só apresenta e distribui o jogo; o jogo roda no app
// (servidor embutido com BRASFC_OFFLINE=1). O script detecta qual dos dois está respondendo.
const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const origin = new URL(base).origin;
const ok = (m) => console.log(`✔ ${m}`);
const fail = (m) => {
	console.error(`✘ ${m}`);
	process.exit(1);
};

async function call(path, { method = 'GET', body, cookie, headers = {} } = {}) {
	const res = await fetch(base + path, {
		method,
		redirect: 'manual',
		headers: { origin, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await res.json().catch(() => ({}));
	return { res, data };
}

const health = await call('/api/health');
if (health.data.status !== 'ok') fail(`saúde: ${JSON.stringify(health.data)}`);
ok(`saúde ok (v${health.data.version}, ${health.data.commit})`);

if (health.data.db?.site) {
	ok('modo site: apresentação e download, sem banco');
	const home = await fetch(base + '/');
	if (home.status !== 200) fail(`página inicial: ${home.status}`);
	ok('página inicial no ar');
	const game = await call('/menu');
	if (game.res.status !== 307 || game.res.headers.get('location') !== '/') fail(`rota do jogo deveria voltar ao site (veio ${game.res.status})`);
	ok('rotas do jogo redirecionam para o site');
	const api = await call('/api/careers', { method: 'POST', body: {} });
	if (api.res.status !== 410) fail(`API do jogo deveria estar desativada (veio ${api.res.status})`);
	ok('API do jogo desativada no site (410)');
	process.exit(0);
}

ok(`modo jogo local (banco ${health.data.db.kind})`);
const session = await call('/api/session', { method: 'POST' });
const cookie = session.res.headers.get('set-cookie')?.split(';')[0];
if (!cookie) fail('sessão sem cookie');
ok('perfil local criado');

const cross = await fetch(base + '/api/careers', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json', cookie }, body: '{}' });
if (cross.status !== 403) fail(`origem externa deveria ser bloqueada (veio ${cross.status})`);
ok('origem externa bloqueada (CSRF)');

const career = await call('/api/careers', { method: 'POST', cookie, body: { mode: 'coach', personName: 'Smoke Teste', clubId: 'flamengo', world: 'brasil', others: [{ personName: 'Smoke Dois', clubId: 'palmeiras' }] } });
if (career.res.status !== 201) fail(`carreira: ${JSON.stringify(career.data)}`);
ok(`carreira com 2 treinadores criada (${career.data.career.id})`);
const turn = await call(`/api/careers/${career.data.career.id}/turno`, { method: 'POST', cookie, body: { version: career.data.career.version, action: 'pronto' } });
if (turn.res.status !== 200 || turn.data.career?.personName !== 'Smoke Dois') fail(`turno: ${JSON.stringify(turn.data)}`);
ok('vez passada ao segundo treinador');

await call(`/api/careers/${career.data.career.id}`, { method: 'DELETE', cookie });
ok('limpeza concluída');
