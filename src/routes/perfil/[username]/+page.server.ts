import { error, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { getRealtimeHub } from '#lib/server/realtime/hub.ts';
import { socialInbox } from '#lib/server/repos/social.ts';
import { usernameOf } from '#lib/server/repos/accounts.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (process.env.BRASFC_OFFLINE === '1') error(503, 'Perfis BRASFC precisam do modo online.');
	if (!locals.profile?.username) redirect(303, '/conta');
	const username = usernameOf(params.username);
	if (!username) error(404, 'Perfil indisponível.');
	const db = await getDb();
	const [person] = await db.query<{ id:string; username:string; display_name:string; avatar:number }>(
		'SELECT id,username,display_name,avatar FROM profiles WHERE username=$1', [username]);
	if (!person) error(404, 'Perfil indisponível.');
	const self = locals.profile.id === person.id;
	type History = { club: string; role: 'coach'|'assistant'|'player'|'left'; date: string };
	type Award = { season: number; label?: string; competition?: string; club?: string };
	const [shared, social] = await Promise.all([
		db.query<{ id:string; code:string; name:string; status:'open'|'closed'; club:string|null;
			role:'coach'|'assistant'|'player'|null; season:string|null; history: History[]; awards: Award[] }>(`
			SELECT r.id,r.code,r.name,r.status, w.state->'participants'->$2::text->>'club' AS club,
				w.state->'participants'->$2::text->>'role' AS role, w.state->'league'->>'season' AS season,
				COALESCE(w.state->'participants'->$2::text->'history',w.state->'alumniHistory'->$2::text,'[]'::jsonb) AS history,
				COALESCE(w.state->'awards'->$2::text,'[]'::jsonb) ||
					COALESCE(w.state->'participants'->$2::text->'athlete'->'playerCareer'->'awards','[]'::jsonb) AS awards
			FROM room_members m JOIN room_members other ON other.room_id=m.room_id AND other.profile_id=($2::text)::uuid
			JOIN rooms r ON r.id=m.room_id LEFT JOIN room_worlds w ON w.room_id=r.id
			WHERE m.profile_id=$1 ORDER BY r.created_at DESC LIMIT 40`, [locals.profile.id,person.id]),
		socialInbox(db, locals.profile.id)
	]);
	return { person: { username, displayName:person.display_name, avatar:person.avatar }, self,
		friends: self ? social.friends.filter((friend) => friend.accepted) : [],
		friend: !self && social.friends.some((friend) => friend.id === person.id && friend.accepted),
		invites: social.invites.filter((invite) => self || invite.sender === person.id || invite.recipient === person.id),
		profileId: locals.profile.id,
		leagues: shared.map(({ id, ...league }) => ({ ...league, online: getRealtimeHub().onlineProfiles(id).has(person.id) })) };
};
