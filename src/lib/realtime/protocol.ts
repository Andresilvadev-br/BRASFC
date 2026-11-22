/** Protocolo do canal de tempo real (servidor autoritativo). */
export const REALTIME_PATH = '/ws/realtime';

export const ROOM_ACTIVITIES = ['rodada', 'carreira', 'mercado', 'admin', 'escalacao', 'taticas', 'contratos'] as const;
export type RoomActivity = (typeof ROOM_ACTIVITIES)[number];

export type ClientMessage =
	| { t: 'join'; code: string }
	| { t: 'activity'; value: RoomActivity }
	| { t: 'ready'; value: boolean }
	| { t: 'leave' }
	| { t: 'ping' };

export interface PresenceMember {
	profileId: string;
	displayName: string;
	role: 'owner' | 'member';
	online: boolean;
	ready: boolean;
	activity?: RoomActivity;
	activityUntil?: number;
}

/** O servidor calcula estes indicadores com as regras e a presença atuais da liga. */
export interface RoundReadiness {
	participants: Array<{ profileId: string; required: boolean; ready: boolean; online: boolean }>;
	requiredCount: number;
	readyCount: number;
	onlineCount: number;
	readyOnlineCount: number;
	canStart: boolean;
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

export type LeagueNotice = {
	id: string;
	title: string;
	destination: 'social' | 'chat';
	code?: string;
};

export type ServerMessage =
	| { t: 'welcome'; profileId: string; displayName: string }
	| { t: 'room'; room: RoomSnapshot }
	| { t: 'world'; v: 1; revision: number }
	| { t: 'closed'; code: string; reason: string }
	| { t: 'error'; code: string; message: string }
	| { t: 'inbox'; v: 1 }
	| { t: 'notice'; v: 1; notice: LeagueNotice }
	| { t: 'chat'; v: 1; channel: 'league' | 'staff' }
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
		case 'activity':
			return ROOM_ACTIVITIES.includes(m.value as RoomActivity) ? { t: 'activity', value: m.value as RoomActivity } : null;
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
