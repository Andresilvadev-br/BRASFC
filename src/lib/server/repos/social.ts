import { randomUUID } from 'node:crypto';
import type { Db } from '../db/index.ts';
import { applyWorldCommand } from '../connected-world.ts';
import { joinRoom, roleMatchesMode, RoomError, type Room } from './rooms.ts';
import { usernameOf } from './accounts.ts';

export const isSocialId = (value: unknown): value is string =>
	typeof value === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);

type Person = { id: string; username: string; display_name: string; avatar: number };
type Invite = {
	id: string; code: string; name: string; mode: Room['entryMode']; club: string | null; role: 'assistant' | 'coach' | null;
	status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
	sender: string; recipient: string; sender_name: string; recipient_name: string; created_at: string;
};

function refuse(message: string, status = 400): never { throw new RoomError(message, status); }

export async function socialInbox(db: Db, profile: string) {
	return {
		invites: await db.query<Invite>(`SELECT i.id,r.code,r.name,r.entry_mode AS mode,i.club,i.role,i.sender,i.recipient,i.created_at::text,
			a.display_name AS sender_name,b.display_name AS recipient_name,
			CASE WHEN i.status='pending' AND (i.expires_at <= now() OR r.status='closed') THEN 'expired' ELSE i.status END AS status
			FROM room_invitations i JOIN rooms r ON r.id=i.room_id
			JOIN profiles a ON a.id=i.sender JOIN profiles b ON b.id=i.recipient
			WHERE i.sender=$1 OR i.recipient=$1
			ORDER BY i.created_at DESC LIMIT 60`, [profile]),
		friends: await db.query<Person & { incoming: boolean; accepted: boolean }>(`SELECT p.id,p.username,p.display_name,p.avatar,
			f.recipient=$1 AS incoming,f.accepted FROM profile_friendships f
			JOIN profiles p ON p.id=CASE WHEN f.applicant=$1 THEN f.recipient ELSE f.applicant END
			WHERE f.applicant=$1 OR f.recipient=$1 ORDER BY f.accepted,p.display_name LIMIT 100`, [profile])
	};
}

export async function searchProfiles(db: Db, profile: string, input: unknown) {
	const q = usernameOf(input);
	if (!q) return [];
	return db.query<Person>(`SELECT id,username,display_name,avatar FROM profiles
		WHERE id<>$1 AND username LIKE $2 ESCAPE '!' ORDER BY username LIMIT 12`, [profile, q.replaceAll('_', '!_') + '%']);
}

export async function friendship(db: Db, profile: string, action: unknown, target: unknown) {
	if (!isSocialId(target) || target === profile) refuse('Usuário inválido.');
	if (action === 'friend') {
		const rows = await db.query(`INSERT INTO profile_friendships(applicant,recipient)
			SELECT $1,id FROM profiles WHERE id=$2 AND username IS NOT NULL
			ON CONFLICT DO NOTHING RETURNING recipient`, [profile, target]);
		return { target, changed: !!rows.length };
	}
	if (action === 'friend-accept') {
		await db.query('UPDATE profile_friendships SET accepted=true WHERE applicant=$2 AND recipient=$1', [profile, target]);
	} else if (action === 'friend-remove') {
		await db.query(`DELETE FROM profile_friendships WHERE (applicant=$1 AND recipient=$2) OR (recipient=$1 AND applicant=$2)`, [profile, target]);
	} else refuse('Ação social inválida.');
	return { target, changed: true };
}

type WorldAccess = { revision: number; mode: Room['entryMode']; role: string | null; club: string | null; invite_open: string | null };
export async function roomAccess(db: Db, room: Room, profile: string, lock = false) {
	const [row] = await db.query<WorldAccess & { status: string; owner_id: string }>(`
		SELECT r.status,r.owner_id,r.entry_mode AS mode,COALESCE(w.revision,0) AS revision,
			w.state->'participants'->$2::text->>'role' AS role,w.state->'participants'->$2::text->>'club' AS club,
			w.state->>'inviteOpen' AS invite_open
		FROM rooms r JOIN room_members m ON m.room_id=r.id AND m.profile_id=($2::text)::uuid
		LEFT JOIN room_worlds w ON w.room_id=r.id WHERE r.id=$1 ${lock ? 'FOR UPDATE OF r' : ''}`, [room.id, profile]);
	if (!row || row.status !== 'open') refuse('Liga indisponível.', 404);
	return row;
}

export async function sendInvitation(db: Db, room: Room, profile: string, body: Record<string, unknown>) {
	const target = usernameOf(body.username);
	// Dev 0.12: não existe mais auxiliar técnico humano (o auxiliar é sempre da IA).
	const role = body.role === 'coach' ? body.role : body.role === 'member' ? null : body.role === 'assistant' ? refuse('O auxiliar técnico agora é sempre controlado pela IA.', 410) : refuse('Função inválida.');
	const hours = body.hours ?? 72;
	if (!target || typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1 || hours > 168) refuse('Convite inválido.');
	return db.transaction(async (tx) => {
		const access = await roomAccess(tx, room, profile, true);
		if (role && !roleMatchesMode(access.mode, role)) refuse('A função não pertence ao modo desta liga.', 403);
		if (access.mode !== 'mixed' && !access.role) refuse('Confirme sua participação antes de convidar.', 409);
		const [person] = await tx.query<Person>('SELECT id FROM profiles WHERE username=$1 AND id<>$2', [target, profile]);
		if (!person) refuse('Conta BRASFC não encontrada.', 404);
		const club = role === 'coach' && typeof body.club === 'string' ? body.club : null;
		if (access.owner_id !== profile) refuse('Somente o anfitrião pode oferecer vagas.', 403);
		if (access.invite_open === 'false') refuse('A liga fechou os convites.', 403);
		if (role === 'coach' && (!club || !(await tx.query(`SELECT 1 FROM room_worlds w,
			jsonb_each(w.state->'league'->'divisions') d WHERE w.room_id=$1 AND d.value ? $2`, [room.id, club])).length)) refuse('Clube inválido para a liga.');
		const [identical] = await tx.query<{ id: string }>(`SELECT id FROM room_invitations WHERE room_id=$1 AND sender=$2
			AND recipient=$3 AND club IS NOT DISTINCT FROM $4 AND role IS NOT DISTINCT FROM $5
			AND status='pending' AND expires_at>now()`, [room.id, profile, person.id, club, role]);
		if (identical) return { id: identical.id, recipient: person.id, role, club, changed: false };
		if (role && (await tx.query(`SELECT 1 FROM room_worlds w, jsonb_each(w.state->'participants') p
			WHERE w.room_id=$1 AND p.value->>'role'=$2 AND p.value->>'club'=$3`, [room.id, role, club])).length) refuse('A vaga já está ocupada.', 409);
		if (role && (await tx.query(`SELECT 1 FROM room_invitations WHERE room_id=$1 AND role=$2 AND club=$3
			AND status='pending' AND expires_at>now() AND recipient<>$4`, [room.id, role, club, person.id])).length) refuse('Esta vaga já foi reservada.', 409);
		await tx.query(`UPDATE room_invitations SET status='cancelled' WHERE room_id=$1 AND recipient=$2
			AND status='pending' AND (sender=$3 OR expires_at<=now())`, [room.id, person.id, profile]);
		const [created] = await tx.query<{ id: string }>(`INSERT INTO room_invitations (id,room_id,sender,recipient,club,role,expires_at)
			VALUES ($1,$2,$3,$4,$5,$6,now()+$7::int*interval '1 hour') ON CONFLICT DO NOTHING RETURNING id`,
			[randomUUID(), room.id, profile, person.id, club, role, hours]);
		if (!created) refuse('Este usuário já tem um convite pendente.', 409);
		return { id: created.id, recipient: person.id, role, club, changed: true };
	});
}

export async function answerInvitation(db: Db, profile: string, id: unknown, accept: boolean) {
	if (!isSocialId(id)) refuse('Convite inválido.');
	return db.transaction(async (tx) => {
		const [locked] = await tx.query<{ room_id: string; code: string }>(`SELECT r.id AS room_id,r.code FROM rooms r
			JOIN room_invitations i ON i.room_id=r.id WHERE i.id=$1 AND i.recipient=$2 FOR UPDATE OF r`, [id, profile]);
		if (!locked) refuse('Convite indisponível.', 404);
		const [invite] = await tx.query<Invite & { expired: boolean }>(`SELECT id,sender,role,club,status,expires_at<=now() AS expired
			FROM room_invitations WHERE id=$1 FOR UPDATE`, [id]);
		if (invite.status === 'accepted' && accept) return { ...locked, sender: invite.sender, changed: false };
		if (invite.status !== 'pending' || invite.expired) refuse('Convite expirado ou encerrado.', 410);
		if (accept) {
			const room = await joinRoom(tx, locked.code, profile, true);
			const sender = await roomAccess(tx, room, invite.sender);
			if (invite.role && !roleMatchesMode(sender.mode, invite.role)) refuse('Este convite oferece uma função incompatível com a liga.', 409);
			if (sender.invite_open === 'false') refuse('A liga fechou os convites.', 403);
			if (invite.role === 'assistant' && (sender.role !== 'coach' || sender.club !== invite.club)) refuse('O técnico já deixou este clube.', 409);
			if (invite.role !== 'assistant' && sender.owner_id !== invite.sender) refuse('O responsável pelo convite mudou.', 409);
			if (invite.role) {
				const recipient = await roomAccess(tx, room, profile);
				if (recipient.role) refuse('Você já tem uma função nesta liga.', 409);
				await applyWorldCommand(tx, room, profile, { action: 'assign', op: id, revision: Number(recipient.revision), role: invite.role, club: invite.club });
			}
		}
		await tx.query('UPDATE room_invitations SET status=$2 WHERE id=$1', [id, accept ? 'accepted' : 'declined']);
		return { ...locked, sender: invite.sender, changed: true };
	});
}
