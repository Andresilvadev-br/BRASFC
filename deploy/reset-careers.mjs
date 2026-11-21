#!/usr/bin/env node
// Use only with a database reserved for BRASFC and an isolated restore target.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { open, readFile, writeFile } from 'node:fs/promises';
import postgres from 'postgres';
import { inspectReset, applyCareerReset, validScope } from '../src/lib/server/career-reset.ts';

const [verb, scope, cutoff, archive, confirmation] = process.argv.slice(2);
const sourceUrl = process.env.DATABASE_URL;
const restoreUrl = process.env.BRASFC_RESET_RESTORE_URL;
const operator = process.env.BRASFC_RESET_OPERATOR;
const sha = /^[a-f\d]{64}$/;
const manifest = archive && `${archive}.verified.json`;

function connect(url) {
	return postgres(url, { max: 1, connect_timeout: 8, onnotice: () => {} });
}
function adapt(sql) {
	return {
		query: (statement, values) => sql.unsafe(statement, values),
		exec: (statement) => sql.unsafe(statement).simple(),
		transaction: (fn) => sql.begin((tx) => fn(adapt(tx)))
	};
}
async function hashFile(file) {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(file)) hash.update(chunk);
	return hash.digest('hex');
}
function postgresTool(command, args, url) {
	const credentials = new URL(url);
	if (!['postgres:', 'postgresql:'].includes(credentials.protocol) || credentials.search) {
		throw new Error('Use URL PostgreSQL direta, sem parâmetros. Defina PGSSLMODE conforme o ambiente.');
	}
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'ignore'], env: {
			...process.env, PGHOST: credentials.hostname, PGPORT: credentials.port || '5432',
			PGDATABASE: decodeURIComponent(credentials.pathname.slice(1)),
			PGUSER: decodeURIComponent(credentials.username), PGPASSWORD: decodeURIComponent(credentials.password),
			DATABASE_URL: '', BRASFC_RESET_RESTORE_URL: ''
		}});
		child.once('error', () => reject(new Error(`Não foi possível iniciar ${command}.`)));
		child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} falhou com código ${code}.`)));
	});
}

async function run() {
	if (!sourceUrl || !validScope(scope) || !['inventory','backup','apply'].includes(verb)) {
		throw new Error('Uso: node deploy/reset-careers.mjs inventory|backup|apply careers|rooms|both DATA_UTC [BACKUP] [HASH_DO_INVENTÁRIO]');
	}
	const source = connect(sourceUrl);
	try {
		const db = adapt(source);
		const inventory = await inspectReset(db, scope, cutoff);
		if (verb === 'inventory') return inventory;
		if (!archive || !manifest) throw new Error('Informe o caminho do backup.');
		if (verb === 'backup') {
			if (!restoreUrl) throw new Error('Defina BRASFC_RESET_RESTORE_URL para um banco vazio e isolado.');
			const restore = connect(restoreUrl);
			try {
				// Any source database that passed inventory contains application tables. This guard also rejects aliases pointing to it.
				const [target] = await restore`SELECT count(*)::int AS tables FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')`;
				if (target.tables !== 0) throw new Error('O destino da restauração não está vazio.');
				await (await open(archive, 'wx', 0o600)).close();
				await postgresTool('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', archive], sourceUrl);
				await postgresTool('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '--dbname', new URL(restoreUrl).pathname.slice(1), archive], restoreUrl);
				const restored = await inspectReset(adapt(restore), scope, cutoff);
				const [originProfiles, restoredProfiles] = await Promise.all([
					source`SELECT count(*)::text AS total FROM profiles`, restore`SELECT count(*)::text AS total FROM profiles`
				]);
				if (restored.hash !== inventory.hash || restoredProfiles[0].total !== originProfiles[0].total) {
					throw new Error('A restauração não coincide com o inventário ou com as contas da origem. Nenhum reset foi executado.');
				}
				await writeFile(manifest, JSON.stringify({ ...inventory, backupHash: await hashFile(archive), verifiedAt: new Date().toISOString() }, null, 2), { flag:'wx', mode:0o600 });
				return { ...inventory, restoreVerified: true };
			} finally { await restore.end(); }
		}
		if (!confirmation || !sha.test(confirmation) || !operator) throw new Error('Informe a aprovação operacional (hash) e BRASFC_RESET_OPERATOR.');
		const verified = JSON.parse(await readFile(manifest, 'utf8'));
		if (verified.scope !== scope || verified.cutoff !== cutoff || verified.hash !== confirmation || verified.backupHash !== await hashFile(archive)) {
			throw new Error('O backup verificado não corresponde à operação autorizada.');
		}
		return applyCareerReset(db, scope, cutoff, confirmation, verified.backupHash, operator);
	} finally { await source.end(); }
}

try { console.log(JSON.stringify(await run(), null, 2)); }
catch (error) { console.error(error?.code ? `Falha no procedimento (${error.code}).` : error.message); process.exitCode = 1; }
