// Teste de fumaça contra um servidor em execução (produção ou staging).
// Uso: node scripts/smoke.mjs http://127.0.0.1:3000
// Verifica: saúde, criação de perfil, carreira, sala e presença via WebSocket.
import { WebSocket } from 'ws';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const origin = new URL(base).origin;
const ok = (m) => console.log(`✔ ${m}`);
const fail = (m) => {
	console.error(`✘ ${m}`);
	process.exit(1);
};

async function call(path, { method = 'GET', body, cookie } = {}) {
	const res = await fetch(base + path, {
		method,
		headers: { origin, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await res.json().catch(() => ({}));
	return { res, data };
}

const health = await call('/api/health');
if (health.data.status !== 'ok') fail(`saúde: ${JSON.stringify(health.data)}`);
ok(`saúde ok (v${health.data.version}, ${health.data.commit}, banco ${health.data.db.kind})`);

const session = await call('/api/session', { method: 'POST' });
const cookie = session.res.headers.get('set-cookie')?.split(';')[0];
if (!cookie) fail('sessão sem cookie');
ok(`perfil criado: ${session.data.profile.displayName}`);

const cross = await fetch(base + '/api/rooms', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json', cookie }, body: '{"name":"x"}' });
if (cross.status !== 403) fail(`origem externa deveria ser bloqueada (veio ${cross.status})`);
ok('origem externa bloqueada (CSRF)');

const career = await call('/api/careers', { method: 'POST', cookie, body: { mode: 'coach', personName: 'Smoke Teste', clubId: 'aurora' } });
if (career.res.status !== 201) fail(`carreira: ${JSON.stringify(career.data)}`);
ok(`carreira criada (${career.data.career.id})`);

const room = await call('/api/rooms', { method: 'POST', cookie, body: { name: 'Sala smoke' } });
if (room.res.status !== 201) fail(`sala: ${JSON.stringify(room.data)}`);
const code = room.data.room.code;
ok(`sala criada (${code})`);

const wsUrl = base.replace(/^http/, 'ws') + '/ws/realtime';
await new Promise((resolve) => {
	const ws = new WebSocket(wsUrl, { headers: { cookie, origin } });
	const timer = setTimeout(() => fail('WebSocket sem resposta'), 8000);
	ws.on('open', () => ws.send(JSON.stringify({ t: 'join', code })));
	ws.on('message', (raw) => {
		const msg = JSON.parse(raw.toString());
		if (msg.t === 'room' && msg.room.members.some((m) => m.online)) {
			clearTimeout(timer);
			ok(`WebSocket: presença em tempo real (${msg.room.members.length} membro)`);
			ws.close();
			resolve();
		}
	});
	ws.on('error', (e) => fail(`WebSocket: ${e.message}`));
});

await call(`/api/rooms/${code}`, { method: 'DELETE', cookie });
await call(`/api/careers/${career.data.career.id}`, { method: 'DELETE', cookie });
ok('limpeza concluída');
