/** Protocolo do canal de tempo real (servidor autoritativo). */
export const REALTIME_PATH = '/ws/realtime';

export type ClientMessage =
	| { t: 'join'; code: string }
	| { t: 'ready'; value: boolean }
	| { t: 'leave' }
	| { t: 'ping' };

export interface PresenceMember {
	profileId: string;
	displayName: string;
	role: 'owner' | 'member';
	online: boolean;
	ready: boolean;
}

export interface RoomSnapshot {
	code: string;
	name: string;
	ownerId: string;
	status: 'open' | 'closed';
	maxMembers: number;
	worldRevision?: number;
	members: PresenceMember[];
}

export type ServerMessage =
	| { t: 'welcome'; profileId: string; displayName: string }
	| { t: 'room'; room: RoomSnapshot }
	| { t: 'world'; v: 1; revision: number }
	| { t: 'closed'; code: string; reason: string }
	| { t: 'error'; code: string; message: string }
	| { t: 'pong' };

export function parseClientMessage(raw: string): ClientMessage | null {
	if (raw.length > 1024) return null;
	let v: unknown;
	try {
		v = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!v || typeof v !== 'object') return null;
	const m = v as Record<string, unknown>;
	switch (m.t) {
		case 'join':
			return typeof m.code === 'string' && m.code.length <= 12 ? { t: 'join', code: m.code } : null;
		case 'ready':
			return typeof m.value === 'boolean' ? { t: 'ready', value: m.value } : null;
		case 'leave':
			return { t: 'leave' };
		case 'ping':
			return { t: 'ping' };
		default:
			return null;
	}
}
