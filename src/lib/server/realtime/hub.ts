import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientMessage, REALTIME_PATH, type PresenceMember, type RoomActivity, type RoomSnapshot, type ServerMessage } from '#lib/realtime/protocol.ts';
import { getDb, type Db } from '../db/index.ts';
import { SESSION_COOKIE } from '../http.ts';
import { findProfileByToken, hashToken, type Profile } from '../repos/profiles.ts';
import { getRoomByCode, isMember, listMembers, normalizeCode, type Room } from '../repos/rooms.ts';

interface Connection {
	ws: WebSocket;
	profile: Profile;
	tokenHash?: string;
	expiresCheck?: string;
	roomId: string | null;
	alive: boolean;
	tokens: number;
	lastRefill: number;
	activity?: RoomActivity;
	activityUntil?: number;
}

const HEARTBEAT_MS = 25_000;
const MAX_CONNECTIONS_PER_PROFILE = 4;

/**
 * Hub de tempo real: presença e estado "pronto" das salas privadas.
 * O servidor é a fonte da verdade — o cliente só envia intenções
 * (entrar, marcar pronto, sair) e recebe instantâneos completos da sala.
 */
export class RealtimeHub {
	readonly wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
	private readonly conns = new Set<Connection>();
	private readonly ready = new Map<string, Set<string>>(); // roomId → profileIds prontos
	private heartbeat: NodeJS.Timeout;

	constructor(private readonly db: () => Promise<Db> = getDb) {
		this.heartbeat = setInterval(() => this.sweep(), HEARTBEAT_MS);
		this.heartbeat.unref?.();
	}

	/** Chamado no evento "upgrade" do servidor HTTP (dev: Vite; produção: server/index.js). */
	handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
		const url = new URL(req.url ?? '/', 'http://localhost');
		if (url.pathname !== REALTIME_PATH || !sameOrigin(req)) {
			socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
			socket.destroy();
			return;
		}
		const token = readCookie(req.headers.cookie, SESSION_COOKIE);
		this.authenticate(token)
			.then((profile) => {
				if (!profile) {
					socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
					socket.destroy();
					return;
				}
				this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws, profile, token ?? undefined));
			})
			.catch(() => {
				socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
				socket.destroy();
			});
	}

	private async authenticate(token: string | null): Promise<Profile | null> {
		if (!token) return null;
		return findProfileByToken(await this.db(), token);
	}

	private accept(ws: WebSocket, profile: Profile, token?: string) {
		const open = [...this.conns].filter((c) => c.profile.id === profile.id);
		if (open.length >= MAX_CONNECTIONS_PER_PROFILE) open[0].ws.close(4008, 'Muitas conexões');
		const conn: Connection = { ws, profile, tokenHash: token && hashToken(token), expiresCheck: profile.username ? token : undefined, roomId: null, alive: true, tokens: 20, lastRefill: Date.now() };
		this.conns.add(conn);
		ws.on('pong', () => (conn.alive = true));
		ws.on('message', (data) => void this.onMessage(conn, data.toString()));
		ws.on('close', () => {
			this.conns.delete(conn);
			if (conn.roomId) void this.broadcastRoom(conn.roomId).catch(() => {});
		});
		ws.on('error', () => ws.terminate());
		this.send(conn, { t: 'welcome', profileId: profile.id, displayName: profile.displayName });
	}

	private allow(conn: Connection): boolean {
		const now = Date.now();
		conn.tokens = Math.min(20, conn.tokens + ((now - conn.lastRefill) / 1000) * 5);
		conn.lastRefill = now;
		if (conn.tokens < 1) return false;
		conn.tokens -= 1;
		return true;
	}

	private async onMessage(conn: Connection, raw: string) {
		const msg = parseClientMessage(raw);
		if (!msg) return this.send(conn, { t: 'error', code: 'invalid', message: 'Mensagem inválida.' });
		if (!this.allow(conn)) return this.send(conn, { t: 'error', code: 'rate', message: 'Muitas ações seguidas. Aguarde um instante.' });

		try {
			switch (msg.t) {
				case 'ping':
					return this.send(conn, { t: 'pong' });
				case 'join': {
					const code = normalizeCode(msg.code);
					const db = await this.db();
					const room = code ? await getRoomByCode(db, code) : null;
					if (!room || room.status !== 'open') {
						return this.send(conn, { t: 'error', code: 'not_found', message: 'Sala não encontrada ou encerrada.' });
					}
					if (!(await isMember(db, room.id, conn.profile.id))) {
						return this.send(conn, { t: 'error', code: 'forbidden', message: 'Entre na sala pelo código antes de conectar.' });
					}
					const previous = conn.roomId;
					conn.roomId = room.id;
					if (previous !== room.id) { conn.activity = undefined; conn.activityUntil = undefined; }
					if (previous && previous !== room.id) await this.broadcastRoom(previous);
					return this.broadcastRoom(room.id, room);
				}
				case 'activity': {
					if (!conn.roomId) return;
					const now = Date.now();
					if (conn.activity === msg.value && (conn.activityUntil ?? 0) > now + 10_000) return;
					conn.activity = msg.value;
					conn.activityUntil = now + 45_000;
					return this.broadcastRoom(conn.roomId);
				}
				case 'ready': {
					if (!conn.roomId) return;
					const set = this.ready.get(conn.roomId) ?? new Set<string>();
					if (msg.value) set.add(conn.profile.id);
					else set.delete(conn.profile.id);
					this.ready.set(conn.roomId, set);
					return this.broadcastRoom(conn.roomId);
				}
				case 'leave': {
					const roomId = conn.roomId;
					conn.roomId = null;
					if (roomId) await this.broadcastRoom(roomId);
					return;
				}
			}
		} catch {
			this.send(conn, { t: 'error', code: 'server', message: 'Falha temporária no servidor.' });
		}
	}

	closeLeague(roomId: string, code: string, reason: string) {
		this.ready.delete(roomId);
		for (const connection of this.conns) {
			if (connection.roomId !== roomId) continue;
			connection.roomId = null;
			this.send(connection, { t: 'closed', code, reason });
		}
	}

	/** Reenvia o estado completo da sala a todos os conectados nela. */
	async broadcastRoom(roomId: string, known?: Room) {
		const db = await this.db();
		const room = known ?? (await db.query<{ code: string }>('SELECT code FROM rooms WHERE id = $1', [roomId]).then((r) => (r[0] ? getRoomByCode(db, r[0].code) : null)));
		const targets = [...this.conns].filter((c) => c.roomId === roomId);
		if (!room) return;
		if (room.status !== 'open') return this.closeLeague(roomId, room.code, 'A sala foi encerrada pelo anfitrião.');
		const [members, world] = await Promise.all([
			listMembers(db, roomId),
			db.query<{ revision: number }>('SELECT revision FROM room_worlds WHERE room_id = $1', [roomId])
		]);
		const memberIds = new Set(members.map((m) => m.profileId));
		const online = new Set(targets.map((c) => c.profile.id));
		const ready = this.ready.get(roomId) ?? new Set<string>();
		for (const id of ready) if (!memberIds.has(id) || !online.has(id)) ready.delete(id);

		const activity = new Map<string, Connection>();
		for (const target of targets) {
			const expiry = target.activityUntil ?? 0;
			if (expiry > Date.now() && expiry > (activity.get(target.profile.id)?.activityUntil ?? 0)) activity.set(target.profile.id, target);
		}
		const snapshot: RoomSnapshot = {
			code: room.code,
			name: room.name,
			ownerId: room.ownerId,
			status: room.status,
			maxMembers: room.maxMembers,
			worldRevision: Number(world[0]?.revision ?? 0),
			members: members.map<PresenceMember>((m) => ({
				profileId: m.profileId,
				displayName: m.displayName,
				role: m.role,
				online: online.has(m.profileId),
				ready: ready.has(m.profileId),
				activity: activity.get(m.profileId)?.activity,
				activityUntil: activity.get(m.profileId)?.activityUntil
			}))
		};
		for (const c of targets) {
			if (!memberIds.has(c.profile.id)) {
				c.roomId = null;
				this.send(c, { t: 'closed', code: room.code, reason: 'Você saiu desta sala.' });
			} else {
				this.send(c, { t: 'room', room: snapshot });
			}
		}
	}

	onlineProfiles(roomId: string) {
		return new Set([...this.conns].filter((c) => c.roomId === roomId && c.ws.readyState === c.ws.OPEN).map((c) => c.profile.id));
	}

	async publishWorldRevision(roomId: string, revision: number) {
		const connected = [...this.conns].filter((connection) => connection.roomId === roomId);
		if (!connected.length) return;
		const members = await listMembers(await this.db(), roomId);
		const ids = new Set(members.map((member) => member.profileId));
		for (const connection of connected) {
			if (connection.roomId === roomId && ids.has(connection.profile.id)) this.send(connection, { t: 'world', v: 1, revision });
		}
	}

	publishNotice(profile: string, notice: import('#lib/realtime/protocol.ts').LeagueNotice) {
		for (const connection of this.conns) {
			if (connection.profile.id === profile) this.send(connection, { t: 'notice', v: 1, notice });
		}
	}

	publishInbox(...profiles: string[]) {
		const targets = new Set(profiles);
		for (const connection of this.conns) {
			if (targets.has(connection.profile.id)) this.send(connection, { t: 'inbox', v: 1 });
		}
	}

	async publishChat(roomId: string, club: string | null) {
		const targets = [...this.conns].filter((connection) => connection.roomId === roomId);
		if (!targets.length) return;
		const rows = await (await this.db()).query<{ profile_id: string }>(`
			SELECT m.profile_id FROM room_members m JOIN rooms r ON r.id=m.room_id AND r.status='open'
			LEFT JOIN room_worlds w ON w.room_id=r.id WHERE m.room_id=$1 AND ($2::text IS NULL OR (
				w.state->'participants'->(m.profile_id::text)->>'club'=$2
				AND w.state->'participants'->(m.profile_id::text)->>'role' IN ('coach','assistant')))`, [roomId, club]);
		const members = new Set(rows.map(({ profile_id }) => profile_id));
		for (const connection of targets) {
			if (connection.roomId === roomId && members.has(connection.profile.id)) {
				this.send(connection, { t: 'chat', v: 1, channel: club ? 'staff' : 'league' });
			}
		}
	}

	/** Atualiza nomes exibidos depois que um perfil é renomeado. */
	async profileRenamed(profileId: string) {
		const rooms = new Set([...this.conns].filter((c) => c.profile.id === profileId && c.roomId).map((c) => c.roomId!));
		for (const id of rooms) await this.broadcastRoom(id);
	}

	stats() {
		return { connections: this.conns.size };
	}

	private send(conn: Connection, msg: ServerMessage) {
		if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg));
	}

	revokeSession(hash: string) {
		for (const connection of this.conns) if (connection.tokenHash === hash) connection.ws.terminate();
	}

	revokeProfile(profile: string) {
		for (const connection of this.conns) if (connection.profile.id === profile) connection.ws.terminate();
	}

	private sweep() {
		for (const c of this.conns) {
			if (!c.alive) {
				c.ws.terminate();
				continue;
			}
			c.alive = false;
			c.ws.ping();
			if (c.expiresCheck) void this.authenticate(c.expiresCheck).then((profile) => {
				if (!profile) c.ws.terminate();
			}).catch(() => c.ws.terminate());
		}
	}

	async close() {
		clearInterval(this.heartbeat);
		for (const c of this.conns) c.ws.close(1001, 'Servidor reiniciando');
		this.conns.clear();
		await new Promise<void>((resolve) => this.wss.close(() => resolve()));
	}
}

function readCookie(header: string | undefined, name: string): string | null {
	if (!header) return null;
	for (const part of header.split(';')) {
		const idx = part.indexOf('=');
		if (idx < 0) continue;
		if (part.slice(0, idx).trim() === name) {
			try {
				return decodeURIComponent(part.slice(idx + 1).trim());
			} catch {
				return null;
			}
		}
	}
	return null;
}

/** Bloqueia conexões de outros sites (CSWSH): a origem precisa bater com o host. */
function sameOrigin(req: IncomingMessage): boolean {
	const origin = req.headers.origin;
	if (!origin) return false;
	const hosts = [req.headers.host, req.headers['x-forwarded-host']].flat().filter(Boolean) as string[];
	try {
		const o = new URL(origin);
		return hosts.some((h) => h.split(',')[0].trim() === o.host);
	} catch {
		return false;
	}
}

const KEY = Symbol.for('brasfc.realtime');

/** Instância única por processo (compartilhada entre o servidor HTTP e as rotas). */
export function getRealtimeHub(): RealtimeHub {
	const g = globalThis as Record<symbol, RealtimeHub | undefined>;
	return (g[KEY] ??= new RealtimeHub());
}

export function peekRealtimeHub(): RealtimeHub | undefined {
	return (globalThis as Record<symbol, RealtimeHub | undefined>)[KEY];
}
