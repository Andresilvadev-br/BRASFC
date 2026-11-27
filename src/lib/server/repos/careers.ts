import { registerClubs } from '#lib/domain/clubs.ts';
import type { WorldPlan } from '#lib/domain/world-league.ts';
import { randomUUID, randomInt } from 'node:crypto';
import {
	careerStart,
	initialCareerData,
	welcomeMessages,
	type Career,
	type CareerData,
	type CreateCareerInput
} from '#lib/domain/career.ts';
import type { Db } from '../db/index.ts';
import { initialGroup, MAX_LOCAL_COACHES, type CoachDraft } from '#lib/domain/turns.ts';
import { isActiveClub } from '#lib/domain/league.ts';
import { newestWorldCatalog } from '../world-catalog.ts';

/** Mensagem do treinador da vez (NULL = carreira de um treinador só). */
const MINE = `(m.coach IS NULL OR m.coach = c.data->'local'->'coaches'->((c.data->'local'->>'active')::int)->>'id')`;

type CareerRow = {
	id: string;
	mode: Career['mode'];
	person_name: string;
	club_id: string;
	seed: string | number | bigint;
	season: number;
	game_date: string;
	data: CareerData | string;
	version: number;
	created_at: Date | string;
	updated_at: Date | string;
	unread?: string | number | bigint | null;
	label?: string | null;
	division?: string | null;
};

const COLUMNS = `c.id, c.mode, c.person_name, c.club_id, c.seed, c.season, c.game_date::text AS game_date,
	c.data, c.version, c.created_at, c.updated_at, c.label`;

function mapCareer(r: CareerRow): Career {
	return {
		id: r.id,
		mode: r.mode,
		personName: r.person_name,
		clubId: r.club_id,
		seed: Number(r.seed),
		season: Number(r.season),
		gameDate: r.game_date,
		data: typeof r.data === 'string' ? (JSON.parse(r.data) as CareerData) : r.data,
		version: Number(r.version),
		createdAt: new Date(r.created_at).toISOString(),
		updatedAt: new Date(r.updated_at).toISOString(),
		unreadMessages: r.unread == null ? undefined : Number(r.unread),
		label: r.label ?? null,
		...(r.division !== undefined ? { division: r.division } : {})
	};
}

export const MAX_CAREERS_PER_PROFILE = 12;

export class CareerLimitError extends Error {}
export class VersionConflictError extends Error {}

/**
 * Cria a carreira. `others` são os demais treinadores locais (0.13), na ordem de criação: todos
 * entram no mesmo universo, cada um com o próprio clube (nunca o mesmo clube para dois treinadores).
 */
export async function createCareer(db: Db, profileId: string, input: CreateCareerInput, seed = randomInt(1, 2 ** 31 - 1), others: CoachDraft[] = [], plan: WorldPlan | null = null): Promise<Career> {
	const id = randomUUID();
	if (plan) registerClubs(plan.snapshot.clubs);
	const data = initialCareerData(input, seed, plan);
	if (data.world === 'brasil' && data.league?.selection) {
		const catalog = newestWorldCatalog();
		if (catalog) data.worldCatalog = catalog;
	}
	const drafts: CoachDraft[] = [{ personName: input.personName, clubId: input.clubId, appearance: input.appearance }, ...others];
	if (drafts.length > MAX_LOCAL_COACHES) throw new CareerLimitError(`No máximo ${MAX_LOCAL_COACHES} treinadores por carreira.`);
	if (new Set(drafts.map((d) => d.clubId)).size !== drafts.length) throw new CareerLimitError('Dois treinadores não podem comandar o mesmo clube.');
	if (data.league?.selection && drafts.some((draft) => !isActiveClub(data.league!, draft.clubId))) {
		throw new CareerLimitError('Todos os treinadores devem comandar clubes de divisões ativas.');
	}
	const coachIds = drafts.map(() => randomUUID());
	if (drafts.length > 1) data.local = initialGroup(drafts, coachIds);
	return db.transaction(async (tx) => {
		const [{ count }] = await tx.query<{ count: string | number }>(
			'SELECT count(*)::int AS count FROM careers WHERE profile_id = $1',
			[profileId]
		);
		if (Number(count) >= MAX_CAREERS_PER_PROFILE) {
			throw new CareerLimitError(`Limite de ${MAX_CAREERS_PER_PROFILE} carreiras por perfil.`);
		}
		const rows = await tx.query<CareerRow>(
			`INSERT INTO careers (id, profile_id, mode, person_name, club_id, seed, season, game_date, data)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::jsonb)
			 RETURNING ${COLUMNS.replaceAll('c.', '')}`,
			[id, profileId, input.mode, input.personName, input.clubId, seed, careerStart(data.world ?? 'brasfc').season, careerStart(data.world ?? 'brasfc').date, JSON.stringify(data)]
		);
		let seq = 0;
		let firstCount = 0;
		for (const [k, d] of drafts.entries()) {
			const messages = welcomeMessages({ ...input, personName: d.personName, clubId: d.clubId, appearance: d.appearance }, data.league);
			if (k === 0) firstCount = messages.length;
			for (const m of messages) {
				await tx.query(
					`INSERT INTO career_messages (id, career_id, kind, sender, subject, body, game_date, seq, coach)
					 VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9)`,
					[randomUUID(), id, m.kind, m.sender, m.subject, m.body, m.gameDate, seq++, drafts.length > 1 ? coachIds[k] : null]
				);
			}
		}
		return { ...mapCareer(rows[0]), unreadMessages: firstCount };
	});
}

export async function listCareers(db: Db, profileId: string, compact = false): Promise<Career[]> {
	const columns = compact
		? COLUMNS.replace('c.data,', "jsonb_strip_nulls(jsonb_build_object('appearance', c.data->'appearance', 'position', c.data->'position', 'world', c.data->'world', 'player', c.data->'player')) AS data,")
		: COLUMNS;
	// Divisão atual do clube (biblioteca de saves): procura o clube nas listas da liga salva.
	const division = compact
		? `, (SELECT d.key FROM jsonb_each(CASE WHEN jsonb_typeof(c.data->'league'->'divisions') = 'object' THEN c.data->'league'->'divisions' ELSE '{}'::jsonb END) d
			WHERE jsonb_typeof(d.value) = 'array' AND d.value @> to_jsonb(c.club_id) LIMIT 1) AS division`
		: '';
	const rows = await db.query<CareerRow>(
		`SELECT ${columns}${division},
			(SELECT count(*) FROM career_messages m WHERE m.career_id = c.id AND m.read_at IS NULL AND ${MINE}) AS unread
		 FROM careers c WHERE c.profile_id = $1 ORDER BY c.updated_at DESC`,
		[profileId]
	);
	return rows.map(mapCareer);
}

export async function getCareer(db: Db, profileId: string, id: string): Promise<Career | null> {
	if (!isUuid(id)) return null;
	const rows = await db.query<CareerRow>(
		`SELECT ${COLUMNS},
			(SELECT count(*) FROM career_messages m WHERE m.career_id = c.id AND m.read_at IS NULL AND ${MINE}) AS unread
		 FROM careers c WHERE c.id = $1 AND c.profile_id = $2`,
		[id, profileId]
	);
	return rows[0] ? mapCareer(rows[0]) : null;
}

export async function getCareerForMarket(db: Db, profileId: string, id: string): Promise<Career | null> {
	if (!isUuid(id)) return null;
	const columns = COLUMNS.replace('c.data,', `jsonb_build_object(
		'world', c.data->'world', 'league', c.data->'league', 'cup', c.data->'cup',
		'rosterCatalog', c.data->'rosterCatalog', 'firstSeason', c.data->'firstSeason',
		'market', c.data->'market', 'club', c.data->'club', 'local', c.data->'local',
		'worldCatalog', c.data->'worldCatalog',
		'worldSnapshot', c.data->'worldSnapshot') AS data,`);
	const [row] = await db.query<CareerRow>(`SELECT ${columns} FROM careers c WHERE c.id=$1 AND c.profile_id=$2`, [id, profileId]);
	return row ? mapCareer(row) : null;
}

/**
 * Mescla campos em `data` com controle otimista de versão:
 * se outra aba salvou antes, a gravação é recusada em vez de sobrescrever.
 */
export async function patchCareerData(
	db: Db,
	profileId: string,
	id: string,
	patch: Partial<CareerData>,
	expectedVersion: number
): Promise<Career> {
	const rows = await db.query<CareerRow>(
		`UPDATE careers c SET data = c.data || $3::jsonb, version = c.version + 1, updated_at = now()
		 WHERE c.id = $1 AND c.profile_id = $2 AND c.version = $4
		 RETURNING ${COLUMNS}`,
		[id, profileId, JSON.stringify(patch), expectedVersion]
	);
	if (!rows[0]) {
		const exists = await getCareer(db, profileId, id);
		if (!exists) throw new Error('Carreira não encontrada');
		throw new VersionConflictError('A carreira foi alterada em outra janela. Recarregue para continuar.');
	}
	return mapCareer(rows[0]);
}

/**
 * Atualiza data, temporada e campos de `data` numa única gravação com controle de versão
 * (usado ao fechar rodadas e temporadas).
 */
export async function saveCareerProgress(
	db: Db,
	profileId: string,
	id: string,
	change: { gameDate: string; season?: number; clubId?: string; data: Partial<CareerData> },
	expectedVersion: number
): Promise<Career> {
	const rows = await db.query<CareerRow>(
		`UPDATE careers c SET game_date = $3::date, season = COALESCE($4, c.season), club_id = COALESCE($7, c.club_id), data = c.data || $5::jsonb, version = c.version + 1, updated_at = now()
		 WHERE c.id = $1 AND c.profile_id = $2 AND c.version = $6
		 RETURNING ${COLUMNS}`,
		[id, profileId, change.gameDate, change.season ?? null, JSON.stringify(change.data), expectedVersion, change.clubId ?? null]
	);
	if (!rows[0]) throw new VersionConflictError('A carreira foi alterada em outra janela. Recarregue para continuar.');
	return mapCareer(rows[0]);
}

/** Avança a data do jogo (após uma rodada), com controle otimista de versão. */
export async function advanceCareerDate(db: Db, profileId: string, id: string, gameDate: string, expectedVersion: number): Promise<Career> {
	const rows = await db.query<CareerRow>(
		`UPDATE careers c SET game_date = $3::date, version = c.version + 1, updated_at = now()
		 WHERE c.id = $1 AND c.profile_id = $2 AND c.version = $4
		 RETURNING ${COLUMNS}`,
		[id, profileId, gameDate, expectedVersion]
	);
	if (!rows[0]) throw new VersionConflictError('A carreira foi alterada em outra janela. Recarregue para continuar.');
	return mapCareer(rows[0]);
}

/**
 * 0.13: grava o save inteiro de uma vez (troca do treinador da vez, negociação entre humanos):
 * clube, nome e dados completos, com controle otimista de versão.
 */
export async function replaceCareerData(db: Db, profileId: string, id: string, change: { personName: string; clubId: string; data: CareerData; gameDate?: string; season?: number }, expectedVersion: number): Promise<Career> {
	const rows = await db.query<CareerRow>(
		`UPDATE careers c SET person_name = $3, club_id = $4, data = $5::jsonb, game_date = COALESCE($7::date, c.game_date), season = COALESCE($8, c.season), version = c.version + 1, updated_at = now()
		 WHERE c.id = $1 AND c.profile_id = $2 AND c.version = $6
		 RETURNING ${COLUMNS}`,
		[id, profileId, change.personName, change.clubId, JSON.stringify(change.data), expectedVersion, change.gameDate ?? null, change.season ?? null]
	);
	if (!rows[0]) throw new VersionConflictError('A carreira foi alterada em outra janela. Recarregue para continuar.');
	return mapCareer(rows[0]);
}

export async function touchCareer(db: Db, profileId: string, id: string): Promise<boolean> {
	const rows = await db.query('UPDATE careers SET updated_at = now() WHERE id = $1 AND profile_id = $2 RETURNING id', [id, profileId]);
	return rows.length === 1;
}

export const MAX_CAREER_LABEL = 40;

/** Nome exibido na biblioteca: aparado, sem quebras e com limite de tamanho. Vazio remove o nome. */
export function cleanCareerLabel(value: unknown): string | null | undefined {
	if (value === null) return null;
	if (typeof value !== 'string') return undefined;
	const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
	if (text.length > MAX_CAREER_LABEL) return undefined;
	return text || null;
}

/**
 * Renomeia o save sem mexer no identificador, na versão nem nos dados da carreira:
 * uma janela aberta em outra aba continua salvando normalmente.
 */
export async function renameCareer(db: Db, profileId: string, id: string, label: string | null): Promise<boolean> {
	if (!isUuid(id)) return false;
	const rows = await db.query('UPDATE careers SET label = $3 WHERE id = $1 AND profile_id = $2 RETURNING id', [id, profileId, label]);
	return rows.length === 1;
}

export async function deleteCareer(db: Db, profileId: string, id: string): Promise<boolean> {
	if (!isUuid(id)) return false;
	const rows = await db.query('DELETE FROM careers WHERE id = $1 AND profile_id = $2 RETURNING id', [id, profileId]);
	return rows.length > 0;
}

export interface CareerMessage {
	id: string;
	kind: 'important' | 'normal';
	sender: string;
	subject: string;
	body: string;
	gameDate: string;
	read: boolean;
}

type MessageRow = {
	id: string;
	kind: CareerMessage['kind'];
	sender: string;
	subject: string;
	body: string;
	game_date: string;
	read_at: Date | string | null;
};

export async function listMessages(db: Db, profileId: string, careerId: string, limit: number | null = null): Promise<CareerMessage[]> {
	if (!isUuid(careerId)) return [];
	const rows = await db.query<MessageRow>(
		`SELECT m.id, m.kind, m.sender, m.subject, m.body, m.game_date::text AS game_date, m.read_at
		 FROM career_messages m JOIN careers c ON c.id = m.career_id
		 WHERE m.career_id = $1 AND c.profile_id = $2 AND ${MINE}
		 ORDER BY CASE WHEN $3::int IS NOT NULL THEN m.read_at IS NOT NULL ELSE false END, m.game_date DESC, m.seq ASC LIMIT $3`,
		[careerId, profileId, limit]
	);
	return rows.map((r) => ({
		id: r.id,
		kind: r.kind,
		sender: r.sender,
		subject: r.subject,
		body: r.body,
		gameDate: r.game_date,
		read: r.read_at != null
	}));
}

/** Marca uma mensagem (ou todas, com messageId = null) como lida. Retorna quantas mudaram. */
export async function markMessagesRead(db: Db, profileId: string, careerId: string, messageId: string | null): Promise<number> {
	if (!isUuid(careerId) || (messageId !== null && !isUuid(messageId))) return 0;
	const rows = await db.query(
		`UPDATE career_messages m SET read_at = now()
		 FROM careers c
		 WHERE c.id = m.career_id AND c.profile_id = $2 AND m.career_id = $1 AND ${MINE}
		   AND m.read_at IS NULL AND ($3::uuid IS NULL OR m.id = $3::uuid)
		 RETURNING m.id`,
		[careerId, profileId, messageId]
	);
	return rows.length;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
	return typeof v === 'string' && UUID.test(v);
}
