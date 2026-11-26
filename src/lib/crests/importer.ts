import { api } from '#lib/api.ts';
import { processCrest, toBase64 } from './process.ts';
import { zipEntries, zipRead } from './zip.ts';

/**
 * Pipeline de escudos do app (cliente), compartilhado entre "Importar pasta" e "Baixar escudos":
 * caminhos → correspondência no servidor → padronização local (canvas) → gravação em lotes.
 */
export type Coverage = { native: { covered: number; total: number }; world: { covered: number; total: number } };
export type ImportReport = { scanned: number; matched: number; saved: number; unreadable: number; rejected: number };
export type Progress = (stage: 'baixando' | 'lendo' | 'padronizando', done: number, total: number) => void;
type Group = { club: string; candidates: Array<{ path: string; source: string }> };

const BATCH = 24;
/** só o necessário dos pacotes: escudos de clubes (camisas, troféus e seleções ficam de fora) */
const WANTED = /(^|\/)clubs\/[^/]+\/[^/]+\/crest\.png$|\.(png|gif|jpe?g|webp|bmp)$/i;

/** Expande os .zip de uma pasta (ex.: instalação do Brasfoot Next, que guarda o banco em clubs-*.zip). */
export async function expandZips(files: Map<string, Blob>, progress?: Progress): Promise<Map<string, Blob>> {
	const out = new Map<string, Blob>();
	const zips = [...files].filter(([path]) => /\.zip$/i.test(path));
	let done = 0;
	for (const [path, file] of files) if (!/\.zip$/i.test(path)) out.set(path, file);
	for (const [path, file] of zips) {
		progress?.('lendo', done++, zips.length);
		try {
			await addZip(out, path.replace(/\.zip$/i, ''), await file.arrayBuffer());
		} catch {
			// .zip corrompido ou de outro tipo: segue com os demais arquivos
		}
	}
	return out;
}

async function addZip(out: Map<string, Blob>, prefix: string, buffer: ArrayBuffer) {
	for (const entry of zipEntries(buffer)) {
		if (!WANTED.test(entry.name) || /(^|\/)(kits?|uniformes|camisas|trofeus|trophies|national-teams)\//i.test(entry.name)) continue;
		const data = await zipRead(buffer, entry);
		if (data) out.set(`${prefix}/${entry.name}`, new Blob([data as BlobPart]));
	}
}

export async function importCrestFiles(files: Map<string, Blob>, progress?: Progress, onCoverage?: (c: Coverage) => void): Promise<ImportReport> {
	const { groups, scanned } = await api<{ groups: Group[]; scanned: number }>('/api/crests', { body: { action: 'match', paths: [...files.keys()] } });
	let saved = 0, unreadable = 0, rejected = 0, done = 0;
	let batch: Array<{ club: string; source: string; data: string }> = [];
	const flush = async () => {
		if (!batch.length) return;
		const r = await api<{ saved: number; rejected: number; coverage: Coverage }>('/api/crests', { body: { action: 'save', items: batch } });
		saved += r.saved;
		rejected += r.rejected;
		onCoverage?.(r.coverage);
		batch = [];
	};
	for (const group of groups) {
		// Entre as fontes disponíveis, fica a de maior arte visível (melhor resolução).
		let best: { data: Uint8Array; area: number; source: string } | null = null;
		for (const candidate of group.candidates) {
			const file = files.get(candidate.path);
			const out = file ? await processCrest(file) : null;
			if (!out) continue;
			const area = out.box.w * out.box.h;
			if (!best || area > best.area) best = { data: out.data, area, source: candidate.source };
		}
		if (best) batch.push({ club: group.club, source: best.source, data: toBase64(best.data) });
		else unreadable++;
		progress?.('padronizando', ++done, groups.length);
		if (batch.length >= BATCH) await flush();
	}
	await flush();
	return { scanned, matched: groups.length, saved, unreadable, rejected };
}

interface PackIndex { commit: string; manifest: { version: string }; chunks: Array<{ file: string; sha256: string; size: number }> }

async function sha256(buffer: ArrayBuffer) {
	return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Baixa os pacotes oficiais do Brasfoot Next pelo servidor local (que só repassa arquivos da fonte oficial),
 * confere o SHA-256 publicado no índice de cada pacote e extrai só os escudos dos clubes.
 * Um pacote por vez, para manter a memória baixa em computadores modestos.
 */
export async function downloadOfficialCrests(progress?: Progress): Promise<{ files: Map<string, Blob>; version: string; bytes: number }> {
	const index = await api<PackIndex>('/api/crests/pack/index.json');
	const chunks = index.chunks.filter((c) => /^clubs-[a-z0-9]+\.zip$/.test(c.file));
	const total = chunks.reduce((sum, c) => sum + c.size, 0);
	const files = new Map<string, Blob>();
	let bytes = 0;
	progress?.('baixando', 0, total);
	for (const chunk of chunks) {
		const response = await fetch(`/api/crests/pack/${chunk.file}`);
		if (!response.ok) throw new Error(`Não foi possível baixar ${chunk.file} (${response.status}).`);
		const buffer = await response.arrayBuffer();
		if ((await sha256(buffer)) !== chunk.sha256) throw new Error(`O pacote ${chunk.file} chegou diferente do publicado. Tente de novo.`);
		await addZip(files, 'brasfoot-next', buffer);
		bytes += buffer.byteLength;
		progress?.('baixando', bytes, total);
	}
	return { files, version: index.manifest?.version ?? index.commit?.slice(0, 7) ?? '', bytes };
}
