import { createHash, randomUUID } from 'node:crypto';
import type { Db } from './db/index.ts';

const careerTables = ['careers', 'career_messages', 'career_matches', 'career_transfers', 'career_ledger', 'career_history'] as const;
const roomTables = ['rooms', 'room_members', 'room_worlds', 'room_world_operations', 'room_world_matches', 'room_live_rounds', 'room_invitations', 'room_chat', 'room_chat_reads'] as const;
export type ResetScope = 'careers' | 'rooms' | 'both';
export const validScope = (value: unknown): value is ResetScope => value === 'careers' || value === 'rooms' || value === 'both';
const included = (scope: ResetScope, kind: 'careers' | 'rooms') => scope === 'both' || scope === kind;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function inspectReset(db: Pick<Db, 'query'>, scope: ResetScope, cutoff: string) {
	if (!validScope(scope) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(cutoff) || !Number.isFinite(Date.parse(cutoff))) {
		throw new Error('Informe um escopo válido e uma data UTC explícita.');
	}
	const counts: Record<string, number> = {};
	const selected: Record<string, string> = {};
	for (const [root, children] of [['careers', careerTables], ['rooms', roomTables]] as const) {
		if (!included(scope, root)) continue;
		for (const table of children) {
			const predicate = table === root ? 'x.created_at < $1' :
				`x.${root === 'careers' ? 'career_id' : 'room_id'} IN (SELECT id FROM ${root} WHERE created_at < $1)`;
			const [row] = await db.query<{ count: string; signature: string }>(`SELECT count(*)::text AS count,
				COALESCE(md5(string_agg(checksum,'' ORDER BY checksum)),'') AS signature
				FROM (SELECT md5(to_jsonb(x)::text) AS checksum FROM ${table} x WHERE ${predicate}) rows`, [cutoff]);
			counts[table] = Number(row.count);
			selected[table] = row.signature;
		}
	}
	const playing = included(scope, 'rooms') && counts.room_live_rounds > 0;
	return { scope, cutoff, counts, hash: digest({ scope, cutoff, counts, selected }), playing };
}

export async function applyCareerReset(db: Pick<Db, 'transaction'>, scope: ResetScope, cutoff: string, confirmation: string,
	backupHash: string, operator: string) {
	if (!/^[a-f\d]{64}$/.test(backupHash) || !operator.trim() || operator.length > 120) throw new Error('Backup ou operador inválido.');
	return db.transaction(async (tx) => {
		// All game writes acquire locks on at least one of these roots or dependent tables.
		await tx.exec(`LOCK TABLE ${[...careerTables, ...roomTables].join(', ')} IN SHARE ROW EXCLUSIVE MODE`);
		const inventory = await inspectReset(tx, scope, cutoff);
		if (inventory.hash !== confirmation) throw new Error('O inventário mudou. Gere e valide outro backup antes do reset.');
		if (inventory.playing) throw new Error('Há rodadas em execução no escopo. Finalize-as antes do reset.');
		if (included(scope, 'careers')) await tx.query('DELETE FROM careers WHERE created_at < $1', [cutoff]);
		if (included(scope, 'rooms')) await tx.query('DELETE FROM rooms WHERE created_at < $1', [cutoff]);
		await tx.query(`INSERT INTO career_reset_audit (id,scope,cutoff,inventory_hash,backup_hash,affected,operator_name)
			VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`, [randomUUID(), scope, cutoff, confirmation, backupHash, JSON.stringify(inventory.counts), operator]);
		return inventory;
	});
}
