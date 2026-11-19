import { REALTIME_PATH, type ClientMessage, type RoomActivity, type RoomSnapshot, type ServerMessage } from './protocol.ts';

export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'closed';

/**
 * Cliente do canal de tempo real de uma sala. O estado exibido vem sempre
 * do servidor (instantâneos completos); reconecta sozinho com espera crescente.
 */
export function createRoomConnection(code: string) {
	const state = $state({
		status: 'idle' as ConnectionStatus,
		room: null as RoomSnapshot | null,
		worldRevision: 0,
		me: null as string | null,
		error: null as string | null,
		closedReason: null as string | null
	});

	let ws: WebSocket | null = null;
	let attempts = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let ping: ReturnType<typeof setInterval> | null = null;
	let stopped = false;
	let activity: RoomActivity = 'rodada';

	function send(msg: ClientMessage) {
		if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
	}

	function connect() {
		if (stopped) return;
		state.status = attempts ? 'reconnecting' : 'connecting';
		const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
		ws = new WebSocket(`${proto}//${location.host}${REALTIME_PATH}`);
		ws.onopen = () => {
			attempts = 0;
			state.error = null;
			send({ t: 'join', code });
			ping = setInterval(() => { send({ t: 'ping' }); send({ t: 'activity', value: activity }); }, 20_000);
		};
		ws.onmessage = (ev) => {
			let msg: ServerMessage;
			try {
				msg = JSON.parse(String(ev.data)) as ServerMessage;
			} catch {
				return;
			}
			if (msg.t === 'welcome') state.me = msg.profileId;
			else if (msg.t === 'room') {
				state.room = msg.room;
				state.worldRevision = Math.max(state.worldRevision, msg.room.worldRevision ?? 0);
				const joined = state.status !== 'online';
				state.status = 'online';
				if (joined) send({ t: 'activity', value: activity });
			} else if (msg.t === 'world' && msg.v === 1) state.worldRevision = Math.max(state.worldRevision, msg.revision);
			else if (msg.t === 'closed') {
				state.closedReason = msg.reason;
				state.status = 'closed';
				stop();
			} else if (msg.t === 'error') state.error = msg.message;
		};
		ws.onclose = () => {
			if (ping) clearInterval(ping);
			ping = null;
			if (stopped) return;
			attempts++;
			state.status = 'reconnecting';
			timer = setTimeout(connect, Math.min(10_000, 500 * 2 ** Math.min(attempts, 5)));
		};
	}

	function stop() {
		stopped = true;
		if (timer) clearTimeout(timer);
		if (ping) clearInterval(ping);
		ws?.close();
	}

	return {
		state,
		start: connect,
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
