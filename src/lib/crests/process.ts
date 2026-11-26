import { CREST_SIZE, MAX_OUTPUT_BYTES, MAX_SOURCE_BYTES, placement, visibleBox, type Box } from './normalize.ts';

/**
 * Padroniza um escudo no próprio app, com o canvas do navegador/Electron: recorta só as bordas
 * transparentes, enquadra no quadro de 128 px com margem uniforme e exporta WebP. Não há dependências
 * nativas nem rede. Reduções grandes são feitas em etapas de metade para preservar traços finos.
 */
export interface ProcessedCrest { data: Uint8Array; box: Box; sourceWidth: number; sourceHeight: number }

function canvas(w: number, h: number) {
	const c = document.createElement('canvas');
	c.width = Math.max(1, Math.round(w));
	c.height = Math.max(1, Math.round(h));
	const g = c.getContext('2d', { willReadFrequently: true });
	if (!g) throw new Error('Canvas indisponível.');
	g.imageSmoothingEnabled = true;
	g.imageSmoothingQuality = 'high';
	return { c, g };
}

export async function processCrest(file: Blob): Promise<ProcessedCrest | null> {
	if (file.size > MAX_SOURCE_BYTES) return null;
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return null; // arquivo corrompido ou formato que o navegador não decodifica
	}
	try {
		const { width, height } = bitmap;
		if (width < 8 || height < 8 || width > 4096 || height > 4096) return null;
		const src = canvas(width, height);
		src.g.drawImage(bitmap, 0, 0);
		const box = visibleBox(src.g.getImageData(0, 0, width, height).data, width, height);
		if (!box) return null;
		const place = placement(box);
		// Recorte da arte visível, reduzido pela metade enquanto ainda for maior que o dobro do destino.
		let stage = canvas(box.w, box.h);
		stage.g.drawImage(src.c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
		while (stage.c.width > place.w * 2 && stage.c.height > place.h * 2) {
			const half = canvas(stage.c.width / 2, stage.c.height / 2);
			half.g.drawImage(stage.c, 0, 0, half.c.width, half.c.height);
			stage = half;
		}
		const out = canvas(CREST_SIZE, CREST_SIZE);
		out.g.drawImage(stage.c, place.x, place.y, place.w, place.h);
		for (const quality of [0.92, 0.8, 0.65]) {
			const blob = await new Promise<Blob | null>((resolve) => out.c.toBlob(resolve, 'image/webp', quality));
			if (!blob || blob.type !== 'image/webp') return null; // navegador sem codificador WebP
			if (blob.size <= MAX_OUTPUT_BYTES) return { data: new Uint8Array(await blob.arrayBuffer()), box, sourceWidth: width, sourceHeight: height };
		}
		return null;
	} finally {
		bitmap.close();
	}
}

export function toBase64(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(s);
}
