import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { zipEntries, zipRead } from '#lib/crests/zip.ts';

/** ZIP mínimo (sem compressão e com deflate), no formato dos pacotes do Brasfoot Next. */
function makeZip(files: Array<{ name: string; data: Uint8Array; deflate?: boolean }>): ArrayBuffer {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;
	for (const f of files) {
		const name = Buffer.from(f.name);
		const body = f.deflate ? deflateRawSync(f.data) : Buffer.from(f.data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(f.deflate ? 8 : 0, 8);
		local.writeUInt32LE(body.length, 18); local.writeUInt32LE(f.data.length, 22); local.writeUInt16LE(name.length, 26);
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(f.deflate ? 8 : 0, 10);
		central.writeUInt32LE(body.length, 20); central.writeUInt32LE(f.data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
		locals.push(local, name, body);
		centrals.push(central, name);
		offset += 30 + name.length + body.length;
	}
	const dir = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
	const all = Buffer.concat([...locals, dir, end]);
	return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

describe('Pacotes do Brasfoot Next · leitor de .zip', () => {
	const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);
	const zip = makeZip([
		{ name: 'clubs/bra/sport/crest.png', data: png },
		{ name: 'clubs/bra/sport/club.toml', data: new TextEncoder().encode('name = "Sport"'), deflate: true },
		{ name: 'clubs/bra/', data: new Uint8Array() }
	]);

	it('lista as entradas (pastas de fora) e extrai sem compressão e com deflate', async () => {
		const entries = zipEntries(zip);
		expect(entries.map((e) => e.name)).toEqual(['clubs/bra/sport/crest.png', 'clubs/bra/sport/club.toml']);
		expect(await zipRead(zip, entries[0])).toEqual(png);
		expect(new TextDecoder().decode((await zipRead(zip, entries[1]))!)).toBe('name = "Sport"');
	});

	it('recusa arquivo que não é .zip', () => {
		expect(() => zipEntries(new TextEncoder().encode('não sou um zip').buffer as ArrayBuffer)).toThrow(/inválido/);
	});
});

describe('Catálogo mundial embutido no instalador', () => {
	const require = createRequire(import.meta.url);
	const { installBundledCatalog } = require('../desktop/world-catalog-install.js') as { installBundledCatalog: (src: string, dest: string) => { installed: boolean; id?: string } };
	const manifest = JSON.parse(readFileSync('desktop/assets/world/catalog.json', 'utf8'));

	it('o arquivo versionado confere com o manifesto, a licença e as inscrições da engine', () => {
		expect(manifest.catalog_id).toMatch(/^[a-f0-9]{24}$/);
		expect(manifest.source.license).toBe('CC BY-SA 4.0');
		expect(manifest.counts.membership).toBeGreaterThan(0);
		expect(existsSync('desktop/assets/world/LICENSE-CC-BY-SA-4.0.txt')).toBe(true);
	});

	it('instala uma vez, confere o SHA-256 e não sobrescreve o catálogo existente', () => {
		const dest = join(mkdtempSync(join(tmpdir(), 'brasfc-cat-')), 'world-catalogs');
		expect(installBundledCatalog('desktop/assets/world', dest)).toEqual({ installed: true, id: manifest.catalog_id });
		const file = join(dest, `${manifest.catalog_id}.sqlite`);
		expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(manifest.sqlite_sha256);
		expect(existsSync(join(dest, 'LICENSE-CC-BY-SA-4.0.txt'))).toBe(true);
		expect(installBundledCatalog('desktop/assets/world', dest).installed).toBe(false);
	});

	it('recusa catálogo corrompido sem deixar arquivo pela metade', () => {
		const src = mkdtempSync(join(tmpdir(), 'brasfc-src-'));
		cpSync('desktop/assets/world', src, { recursive: true });
		writeFileSync(join(src, 'catalog.json'), JSON.stringify({ ...manifest, sqlite_sha256: '0'.repeat(64) }));
		const dest = join(mkdtempSync(join(tmpdir(), 'brasfc-dst-')), 'world-catalogs');
		expect(() => installBundledCatalog(src, dest)).toThrow(/corrompido/);
		expect(existsSync(join(dest, `${manifest.catalog_id}.sqlite`))).toBe(false);
	});
});
