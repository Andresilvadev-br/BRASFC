/**
 * Leitor mínimo de ZIP para os pacotes do Brasfoot Next (e pastas de patch compactadas), sem dependências:
 * lê o diretório central e extrai entradas sem compressão (método 0) ou com deflate (método 8, via
 * `DecompressionStream`, disponível no Chromium/Electron e no Node 18+). Não suporta ZIP64 nem criptografia,
 * que os pacotes de jogo não usam. Uma entrada desses tipos é ignorada, sem derrubar a importação.
 */
export interface ZipEntry {
	name: string;
	method: number;
	compressedSize: number;
	size: number;
	/** deslocamento do cabeçalho local */
	offset: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function zipEntries(buffer: ArrayBuffer): ZipEntry[] {
	const view = new DataView(buffer);
	// O registro final fica nos últimos 22 bytes + comentário (até 64 KB).
	let end = -1;
	for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 0xffff); i--) {
		if (view.getUint32(i, true) === EOCD) { end = i; break; }
	}
	if (end < 0) throw new Error('Arquivo .zip inválido.');
	const count = view.getUint16(end + 10, true);
	let at = view.getUint32(end + 16, true);
	const decoder = new TextDecoder();
	const out: ZipEntry[] = [];
	for (let i = 0; i < count; i++) {
		if (at + 46 > buffer.byteLength || view.getUint32(at, true) !== CENTRAL) throw new Error('Diretório do .zip corrompido.');
		const flags = view.getUint16(at + 8, true);
		const method = view.getUint16(at + 10, true);
		const compressedSize = view.getUint32(at + 20, true);
		const size = view.getUint32(at + 24, true);
		const nameLength = view.getUint16(at + 28, true);
		const extraLength = view.getUint16(at + 30, true);
		const commentLength = view.getUint16(at + 32, true);
		const offset = view.getUint32(at + 42, true);
		const name = decoder.decode(new Uint8Array(buffer, at + 46, nameLength));
		const encrypted = (flags & 1) === 1;
		const zip64 = compressedSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff;
		if (!encrypted && !zip64 && !name.endsWith('/')) out.push({ name, method, compressedSize, size, offset });
		at += 46 + nameLength + extraLength + commentLength;
	}
	return out;
}

export async function zipRead(buffer: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array | null> {
	const view = new DataView(buffer);
	if (entry.offset + 30 > buffer.byteLength || view.getUint32(entry.offset, true) !== LOCAL) return null;
	const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
	if (start + entry.compressedSize > buffer.byteLength) return null;
	const raw = new Uint8Array(buffer, start, entry.compressedSize);
	if (entry.method === 0) return raw.slice();
	if (entry.method !== 8 || typeof DecompressionStream === 'undefined') return null;
	const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	const data = new Uint8Array(await new Response(stream).arrayBuffer());
	return data.length === entry.size ? data : null;
}
