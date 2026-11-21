import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ServerMessage } from '#lib/realtime/protocol.ts';
import { parseClientMessage } from '#lib/realtime/protocol.ts';
import { createPgliteDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { RateLimiter } from '#lib/server/http.ts';
import { RealtimeHub } from '#lib/server/realtime/hub.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { createRoom, deleteOnlineLeague, joinRoom, leaveRoom } from '#lib/server/repos/rooms.ts';

let db: Db;
let hub: RealtimeHub;
let server: http.Server;
let url: string;
let origin: string;

beforeAll(async () => {
	db = await createPgliteDb();
	await runMigrations(db);
	hub = new RealtimeHub(async () => db);
	server = http.createServer((_, res) => res.end('ok'));
	server.on('upgrade', (req, socket, head) => hub.handleUpgrade(req, socket, head));
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const { port } = server.address() as AddressInfo;
	url = `ws://127.0.0.1:${port}/ws/realtime`;
	origin = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
	await hub.close();
	server.close();
	await db.close();
});

/** Cliente de teste que guarda as mensagens e permite esperar por uma condição. */
function client(token: string, opts: { origin?: string } = {}) {
	const ws = new WebSocket(url, { headers: { cookie: `brasfc_sid=${token}`, origin: opts.origin ?? origin } });
	const inbox: ServerMessage[] = [];
	const waiters: Array<{ test: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }> = [];
	ws.on('message', (raw) => {
		const msg = JSON.parse(raw.toString()) as ServerMessage;
		inbox.push(msg);
		for (const w of [...waiters]) if (w.test(msg)) {
			waiters.splice(waiters.indexOf(w), 1);
			w.resolve(msg);
		}
	});
	return {
		ws,
		opened: new Promise<void>((resolve, reject) => {
			ws.once('open', () => resolve());
			ws.once('unexpected-response', (_, res) => reject(new Error(String(res.statusCode))));
			ws.once('error', reject);
		}),
		send: (m: unknown) => ws.send(JSON.stringify(m)),
		waitFor(test: (m: ServerMessage) => boolean, ms = 4000) {
			const found = inbox.find(test);
			if (found) return Promise.resolve(found);
			return new Promise<ServerMessage>((resolve, reject) => {
				waiters.push({ test, resolve });
				setTimeout(() => reject(new Error('tempo esgotado')), ms);
			});
		}
	};
}

describe('hub de tempo real', () => {
	it('recusa conexões sem sessão ou de outra origem', async () => {
		await expect(client('token-falso').opened).rejects.toThrow('401');
		const { token } = await createGuestProfile(db);
		await expect(client(token, { origin: 'https://site-malicioso.example' }).opened).rejects.toThrow('403');
	});

	it('sincroniza presença e "pronto" entre dois jogadores, e avisa quando a sala é encerrada', async () => {
		const host = await createGuestProfile(db);
		const guest = await createGuestProfile(db);
		const room = await createRoom(db, host.profile.id, 'Amigos');
		await joinRoom(db, room.code, guest.profile.id);

		const a = client(host.token);
		const b = client(guest.token);
		await Promise.all([a.opened, b.opened]);
		a.send({ t: 'join', code: room.code });
		b.send({ t: 'join', code: room.code });

		const bothOnline = (m: ServerMessage) => m.t === 'room' && m.room.members.filter((x) => x.online).length === 2;
		await Promise.all([a.waitFor(bothOnline), b.waitFor(bothOnline)]);

		b.send({ t: 'ready', value: true });
		const seen = await a.waitFor((m) => m.t === 'room' && m.room.members.some((x) => x.profileId === guest.profile.id && x.ready));
		expect(seen.t).toBe('room');

		b.ws.close();
		await a.waitFor((m) => m.t === 'room' && m.room.members.some((x) => x.profileId === guest.profile.id && !x.online && !x.ready));

		await leaveRoom(db, room, host.profile.id);
		await hub.broadcastRoom(room.id);
		const closed = await a.waitFor((m) => m.t === 'closed');
		expect(closed.t).toBe('closed');
		a.ws.close();
	});

	it('avisa os participantes conectados quando uma liga é excluída', async () => {
		const owner = await createGuestProfile(db);
		const guest = await createGuestProfile(db);
		const room = await createRoom(db, owner.profile.id, 'Liga excluída');
		await joinRoom(db, room.code, guest.profile.id);
		const a = client(owner.token), b = client(guest.token);
		try {
			await Promise.all([a.opened, b.opened]);
			a.send({ t:'join', code:room.code });
			b.send({ t:'join', code:room.code });
			const joined = (msg: ServerMessage) => msg.t === 'room' && msg.room.members.every((member) => member.online);
			await Promise.all([a.waitFor(joined), b.waitFor(joined)]);
			const notice = { id:'staff-contract', title:'Contrato aprovado', destination:'social' as const };
			hub.publishNotice(guest.profile.id, notice);
			expect(await b.waitFor((msg) => msg.t === 'notice')).toMatchObject({ notice });
			const deleted = await deleteOnlineLeague(db, room.id, owner.profile.id, room.code);
			hub.closeLeague(room.id, deleted.code, 'A liga foi excluída pelo anfitrião.');
			const connected = await Promise.all([a, b].map((connection) => connection.waitFor((msg) => msg.t === 'closed')));
			expect(connected).toEqual(Array(2).fill({ t:'closed', code:room.code, reason:'A liga foi excluída pelo anfitrião.' }));
			expect(hub.onlineProfiles(room.id).size).toBe(0);
		} finally { a.ws.close(); b.ws.close(); }
	});

	it('não deixa quem não é membro entrar na sala', async () => {
		const owner = await createGuestProfile(db);
		const outsider = await createGuestProfile(db);
		const room = await createRoom(db, owner.profile.id, 'Fechada');
		const c = client(outsider.token);
		await c.opened;
		c.send({ t: 'join', code: room.code });
		const err = await c.waitFor((m) => m.t === 'error');
		expect(err.t === 'error' && err.code).toBe('forbidden');
		c.ws.close();
	});
});

describe('protocolo e limites', () => {
	it('valida mensagens do cliente', () => {
		expect(parseClientMessage('{"t":"ready","value":true}')).toEqual({ t: 'ready', value: true });
		expect(parseClientMessage('{"t":"ready","value":"sim"}')).toBeNull();
		expect(parseClientMessage('{"t":"hack"}')).toBeNull();
		expect(parseClientMessage('não é json')).toBeNull();
		expect(parseClientMessage('x'.repeat(2000))).toBeNull();
	});

	it('limitador de requisições respeita a janela', () => {
		const rl = new RateLimiter(2, 1000);
		expect(rl.take('ip', 0)).toBe(true);
		expect(rl.take('ip', 10)).toBe(true);
		expect(rl.take('ip', 20)).toBe(false);
		expect(rl.take('ip', 1500)).toBe(true);
	});
});
