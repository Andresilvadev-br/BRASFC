import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CLUBES_2026 } from '#lib/data/brasil.ts';
import { buildCrestIndex, type ClubName, type CrestIndex, type CrestSource } from '#lib/crests/match.ts';
import { CREST_SIZE, isWebp, MAX_OUTPUT_BYTES } from '#lib/crests/normalize.ts';
import type { ClubId, CrestManifest } from '#lib/world/contract.ts';
import { newestWorldCatalog, openWorldCatalog } from './world-catalog.ts';

/**
 * Pacote local de escudos importados pelo próprio jogador. Ele fica fora do instalador e do repositório,
 * na pasta de dados ao lado dos saves. Cada imagem é um WebP padronizado e endereçado pelo conteúdo,
 * então dois clubes com a mesma imagem compartilham um arquivo.
 */
export const CREST_FILE = /^[a-f0-9]{16}\.webp$/;
const CLUB_ID = /^(world\/[a-z]{3}\/[a-z0-9-]+|[a-z0-9-]+)$/;
const SOURCES: CrestSource[] = ['brasfoot-next', 'megapatch', 'pasta-local'];

export const crestDirectory = () => process.env.BRASFC_CRESTS ?? join(dirname(process.env.PGLITE_DIR ?? './data/pglite'), 'crests');
const manifestPath = () => join(crestDirectory(), 'manifest.json');

const empty = (): CrestManifest => ({ version: 1, size: CREST_SIZE, entries: {}, importedAt: '' });
let cached: { dir: string; value: CrestManifest } | undefined;

export function readCrestManifest(): CrestManifest {
	const dir = crestDirectory();
	if (cached?.dir === dir) return cached.value;
	let value = empty();
	try {
		const raw = JSON.parse(readFileSync(manifestPath(), 'utf8')) as CrestManifest;
		if (raw?.version === 1 && raw.entries && typeof raw.entries === 'object') {
			// Entrada cujo arquivo sumiu volta ao escudo gerado, em vez de mostrar imagem quebrada.
			const entries = Object.fromEntries(Object.entries(raw.entries).filter(([club, e]) => CLUB_ID.test(club) && CREST_FILE.test(e.file) && existsSync(join(dir, e.file))));
			value = { version: 1, size: raw.size || CREST_SIZE, entries, importedAt: String(raw.importedAt ?? '') };
		}
	} catch {
		// Sem pacote ou manifesto ilegível: o jogo segue com os escudos gerados.
	}
	cached = { dir, value };
	return value;
}

/** Mapa compacto clube → arquivo para a interface. */
export function crestMap(): Record<ClubId, string> {
	return Object.fromEntries(Object.entries(readCrestManifest().entries).map(([club, e]) => [club, e.file]));
}

function writeManifest(manifest: CrestManifest) {
	const dir = crestDirectory();
	mkdirSync(dir, { recursive: true });
	const tmp = manifestPath() + '.tmp';
	writeFileSync(tmp, JSON.stringify(manifest));
	renameSync(tmp, manifestPath());
	cached = { dir, value: manifest };
}

export interface CrestUpload { club: string; source: string; data: Uint8Array }

/** Grava um lote já normalizado no cliente. A validação aqui é de segurança: só WebP pequeno, clube conhecido e fonte conhecida. */
export function saveCrests(items: CrestUpload[], known: (club: string) => boolean): { saved: number; rejected: number } {
	const manifest = structuredClone(readCrestManifest());
	const dir = crestDirectory();
	mkdirSync(dir, { recursive: true });
	let saved = 0, rejected = 0;
	for (const item of items) {
		if (!CLUB_ID.test(item.club) || !known(item.club) || !SOURCES.includes(item.source as CrestSource) || item.data.length > MAX_OUTPUT_BYTES || !isWebp(item.data)) {
			rejected++;
			continue;
		}
		const file = createHash('sha256').update(item.data).digest('hex').slice(0, 16) + '.webp';
		if (!existsSync(join(dir, file))) writeFileSync(join(dir, file), item.data);
		manifest.entries[item.club] = { club: item.club, file, source: item.source };
		saved++;
	}
	manifest.importedAt = new Date().toISOString();
	writeManifest(manifest);
	removeOrphans(manifest);
	return { saved, rejected };
}

function removeOrphans(manifest: CrestManifest) {
	const used = new Set(Object.values(manifest.entries).map((e) => e.file));
	for (const file of readdirSync(crestDirectory())) if (CREST_FILE.test(file) && !used.has(file)) rmSync(join(crestDirectory(), file), { force: true });
}

/** Volta aos escudos gerados, apagando só os arquivos do pacote importado. */
export function clearCrests() {
	writeManifest(empty());
	removeOrphans(empty());
}

let indexCache: { key: string; value: { index: CrestIndex; clubs: Set<ClubId>; total: { native: number; world: number } } } | undefined;

/** Índice de nomes: clubes nativos brasileiros e o catálogo mundial instalado (se houver). */
export function crestIndex(catalogId = newestWorldCatalog() ?? null) {
	const key = catalogId ?? '-';
	if (indexCache?.key === key) return indexCache.value;
	const native: ClubName[] = CLUBES_2026.map((c) => ({ id: c.id, name: c.nome, country: 'bra' }));
	const world: ClubName[] = [];
	const db = catalogId ? openWorldCatalog(catalogId) : undefined;
	if (db) for (const r of db.prepare('SELECT id, name, country FROM club').all()) world.push({ id: `world/${r.id}`, name: String(r.name), country: String(r.country) });
	const index = buildCrestIndex(native, world);
	const clubs = new Set<ClubId>([...native.map((c) => c.id), ...index.world]);
	const value = { index, clubs, total: { native: native.length, world: index.world.size } };
	indexCache = { key, value };
	return value;
}

/** Cobertura atual, separando os clubes nacionais dos internacionais. */
export function crestCoverage() {
	const { total } = crestIndex();
	const entries = Object.keys(readCrestManifest().entries);
	return {
		native: { covered: entries.filter((id) => !id.startsWith('world/')).length, total: total.native },
		world: { covered: entries.filter((id) => id.startsWith('world/')).length, total: total.world }
	};
}
