import { randomUUID } from 'node:crypto';
import type { Db } from '../db/index.ts';
import { applyWorldCommand, worldSnapshot } from '../connected-world.ts';
import { sanitizeTactic, type Tactic } from '#lib/domain/tactics.ts';
import { RoomError, type Room } from './rooms.ts';
import { isSocialId, roomAccess } from './social.ts';

type Suggestion = { tactic: Tactic; tacticAtSend: Tactic };
type Message = {
	seq: string; author: string; display_name: string; avatar: number; body: string; created_at: Date;
	suggestion: Suggestion | null; status: 'pending' | 'approved' | 'declined' | null;
};

function fail(message: string, status = 400): never { throw new RoomError(message, status); }
const seqOf = (value: unknown) => typeof value === 'string' && /^\d{1,18}$/.test(value) ? value : null;

function channelClub(access: Awaited<ReturnType<typeof roomAccess>>, channel: unknown) {
	if (channel === 'league') return null;
	if (channel !== 'staff') fail('Canal inválido.');
	if (!access.club || (access.role !== 'coach' && access.role !== 'assistant')) fail('Canal exclusivo da comissão.', 403);
	return access.club;
}

export async function readRoomChat(db: Db, room: Room, profile: string, channel: unknown, before?: string | null) {
	const access = await roomAccess(db, room, profile);
	const club = channelClub(access, channel);
	const [scope, values] = club ? ['m.club=$3', [room.id, seqOf(before), club]] : ['m.club IS NULL', [room.id, seqOf(before)]];
	// The channel and membership are rechecked in the same SQL statement as the message read.
	const messages = await db.query<Message>(`SELECT m.seq::text,m.author,p.display_name,p.avatar,m.body,m.created_at,m.suggestion,m.status
		FROM room_chat m JOIN profiles p ON p.id=m.author
		WHERE m.room_id=$1 AND ($2::bigint IS NULL OR m.seq<$2) AND ${scope} AND EXISTS (
			SELECT 1 FROM room_members rm JOIN rooms r ON r.id=rm.room_id
			LEFT JOIN room_worlds w ON w.room_id=r.id WHERE r.id=m.room_id AND r.status='open' AND rm.profile_id=$${values.length + 1}::uuid
			AND (m.club IS NULL OR (w.state->'participants'->(rm.profile_id::text)->>'club'=m.club
				AND w.state->'participants'->(rm.profile_id::text)->>'role' IN ('coach','assistant'))))
		ORDER BY m.seq DESC LIMIT 31`, [...values, profile]);
	const [marker] = await db.query<{ seq: string }>('SELECT seq::text FROM room_chat_reads WHERE room_id=$1 AND profile_id=$2 AND channel=$3', [room.id, profile, club ?? 'league']);
	return { messages: messages.slice(0, 30).reverse(), older: messages.length > 30 ? messages[29].seq : null, lastRead: marker?.seq ?? '0' };
}

export async function writeRoomChat(db: Db, room: Room, profile: string, body: Record<string, unknown>) {
	return db.transaction(async (tx) => {
		const access = await roomAccess(tx, room, profile, true);
		const club = channelClub(access, body.channel);
		if (body.action === 'read') {
			const seq = seqOf(body.seq);
			if (!seq) fail('Marcador inválido.');
			await tx.query(`INSERT INTO room_chat_reads(room_id,profile_id,channel,seq)
				SELECT $1,$2,$3,seq FROM room_chat WHERE room_id=$1 AND seq=$4 AND club IS NOT DISTINCT FROM $5
				ON CONFLICT (room_id,profile_id,channel) DO UPDATE SET seq=greatest(room_chat_reads.seq,excluded.seq)`, [room.id, profile, club ?? 'league', seq, club]);
			return { club, changed: false };
		}
		if (body.action === 'approve' || body.action === 'decline') {
			const seq = seqOf(body.seq);
			if (!club || access.role !== 'coach' || !seq) fail('Apenas o treinador pode decidir sugestões da comissão.', 403);
			const [message] = await tx.query<Message>(`SELECT author,suggestion,status FROM room_chat
				WHERE room_id=$1 AND club=$2 AND seq=$3 FOR UPDATE`, [room.id,club,seq]);
			if (!message?.suggestion) fail('Sugestão indisponível.', 404);
			if (message.status !== 'pending') return { club, changed: false };
			let revision: number | undefined;
			if (body.action === 'approve') {
				const author = await roomAccess(tx, room, message.author);
				if (author.club !== club || author.role !== 'assistant') fail('O autor deixou a comissão.', 409);
				const current = await worldSnapshot(tx, room, profile);
				const [{ same }] = await tx.query<{ same: boolean }>('SELECT $1::jsonb = $2::jsonb AS same', [
					JSON.stringify(current.tactic ?? null), JSON.stringify(message.suggestion.tacticAtSend)]);
				if (!same) fail('A tática mudou. Solicite uma nova sugestão com base na escalação atual.', 409);
				revision = (await applyWorldCommand(tx, room, profile, { action:'tactic', op: randomUUID(), revision: access.revision, tactic: message.suggestion.tactic })).revision;
			}
			await tx.query('UPDATE room_chat SET status=$2,decided_by=$3,decided_at=now() WHERE seq=$1', [seq, body.action === 'approve' ? 'approved' : 'declined', profile]);
			return { club, changed: true, revision, notice: {
				profile: message.author, id: `tactic:${seq}:${body.action}`,
				title: body.action === 'approve' ? 'Sua sugestão tática foi aprovada' : 'Sua sugestão tática foi recusada'
			} };
		}
		const op = body.op;
		const text = typeof body.text === 'string' ? body.text.trim() : '';
		if (!isSocialId(op) || !text || text.length > 500 || (body.action !== 'message' && body.action !== 'suggest')) fail('Mensagem inválida.');
		const [saved] = await tx.query('SELECT 1 FROM room_chat WHERE room_id=$1 AND author=$2 AND operation=$3', [room.id,profile,op]);
		if (saved) return { club, changed: false };
		let suggestion: Suggestion | null = null;
		if (body.action === 'suggest') {
			if (!club || access.role !== 'assistant') fail('Apenas auxiliares podem sugerir táticas.', 403);
			if (body.revision !== Number(access.revision)) fail('A escalação mudou. Atualize e revise a sugestão.', 409);
			const world = await worldSnapshot(tx,room,profile);
			const tactic = sanitizeTactic(body.tactic, world.roster);
			if (!tactic || !world.tactic) fail('Escalação inválida.');
			suggestion = { tactic, tacticAtSend: world.tactic };
		}
		await tx.query(`INSERT INTO room_chat (room_id,author,operation,club,body,suggestion,status)
			VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`, [room.id,profile,op,club,text,suggestion ? JSON.stringify(suggestion) : null,suggestion ? 'pending' : null]);
		if (suggestion && club) {
			const [coach] = await tx.query<{ profile: string }>(`
				SELECT person.key AS profile FROM room_worlds w JOIN room_members m ON m.room_id=w.room_id,
				LATERAL jsonb_each(w.state->'participants') person
				WHERE w.room_id=$1 AND person.key=m.profile_id::text AND person.value->>'club'=$2 AND person.value->>'role'='coach'`, [room.id, club]);
			if (coach) return { club, changed:true, notice: { profile:coach.profile, id:`tactic:${op}`, title:`Seu auxiliar enviou uma sugestão tática` } };
		}
		return { club, changed: true };
	});
}
