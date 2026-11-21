import { retryDelay } from '#lib/api.ts';
import { REALTIME_PATH, type ClientMessage, type RoomActivity, type RoomSnapshot, type ServerMessage } from './protocol.ts';

export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline' | 'unavailable' | 'closed';

/**
 * Cliente do canal de tempo real de uma sala. O estado exibido vem sempre
 * do servidor (instantâneos completos); reconecta sozinho com espera crescente.
 */
export function createRoomConnection(code?: string) {
	const state = $state({
		status: 'idle' as ConnectionStatus,
		room: null as RoomSnapshot | null,
		worldRevision: 0,
		inboxVersion: 0,
		chatVersion: { league: 0, staff: 0 },
		me: null as string | null,
		error: null as string | null,
		closedReason: null as string | null
	});

	let ws: WebSocket | null = null;
	let attempts = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let ping: ReturnType<typeof setInterval> | null = null;
	let stopped = false;
	let watching = false;
	let joinTimer: ReturnType<typeof setTimeout> | undefined;
	let activity: RoomActivity = 'rodada';

	function send(msg: ClientMessage) {
		if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
	}

	function connect() {
		if (stopped || ws) return;
		if (!navigator.onLine) { state.status = 'offline'; return; }
		state.status = attempts ? 'reconnecting' : 'connecting';
		const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
		const socket = new WebSocket(`${proto}//${location.host}${REALTIME_PATH}`);
		ws = socket;
		joinTimer = setTimeout(() => socket.close(), 10_000);
		socket.onopen = () => {
			if (code) send({ t: 'join', code });
			ping = setInterval(() => { send({ t: 'ping' }); if (code) send({ t: 'activity', value: activity }); }, 20_000);
		};
		socket.onmessage = (ev) => {
			let msg: ServerMessage;
			try {
				msg = JSON.parse(String(ev.data)) as ServerMessage;
			} catch {
				return;
			}
			if (msg.t === 'welcome') {
				state.me = msg.profileId;
				if (!code) {
					clearTimeout(joinTimer);
					attempts = 0;
					state.status = 'online';
				}
			} else if (msg.t === 'inbox' && msg.v === 1) state.inboxVersion++;
			else if (msg.t === 'chat' && msg.v === 1) state.chatVersion[msg.channel]++;
			else if (msg.t === 'room') {
				state.room = msg.room;
				state.worldRevision = Math.max(state.worldRevision, msg.room.worldRevision ?? 0);
				const joined = state.status !== 'online';
				clearTimeout(joinTimer);
				attempts = 0;
				state.error = null;
				state.status = 'online';
				if (joined) send({ t: 'activity', value: activity });
			} else if (msg.t === 'world' && msg.v === 1) state.worldRevision = Math.max(state.worldRevision, msg.revision);
			else if (msg.t === 'closed') {
				state.closedReason = msg.reason;
				state.status = 'closed';
				stop();
			} else if (msg.t === 'error') state.error = msg.message;
		};
		socket.onclose = () => {
			if (ws !== socket) return;
			ws = null;
			clearTimeout(joinTimer);
			if (ping) clearInterval(ping);
			ping = null;
			if (stopped) return;
			if (!navigator.onLine) { state.status = 'offline'; return; }
			attempts++;
			if (attempts >= 7) { state.status = 'unavailable'; return; }
			state.status = 'reconnecting';
			timer = setTimeout(connect, retryDelay(attempts - 1));
		};
	}

	function resume() {
		if (stopped) return;
		if (timer) clearTimeout(timer);
		attempts = 0;
		connect();
	}

	function networkLost() {
		if (timer) clearTimeout(timer);
		state.status = 'offline';
		ws?.close();
	}

	function start() {
		stopped = false;
		if (!watching) {
			watching = true;
			window.addEventListener('online', resume);
			window.addEventListener('offline', networkLost);
		}
		resume();
	}

	function stop() {
		stopped = true;
		watching = false;
		window.removeEventListener('online', resume);
		window.removeEventListener('offline', networkLost);
		if (timer) clearTimeout(timer);
		if (ping) clearInterval(ping);
		clearTimeout(joinTimer);
		ws?.close();
	}

	return {
		state,
		start,
		setActivity(value: RoomActivity) {
			if (value === activity) return;
			activity = value;
			send({ t: 'activity', value });
		},
		setReady: (value: boolean) => send({ t: 'ready', value }),
		leave() {
			send({ t: 'leave' });
			stop();
		},
		stop
	};
}
