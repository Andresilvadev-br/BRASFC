/**
 * Padrão visual dos escudos importados (docs/WORLD-CONTRACT.md):
 *  - quadro quadrado de CREST_SIZE px, arte centralizada;
 *  - margem uniforme de CREST_MARGIN do lado, proporção original preservada (nunca estica nem corta a arte);
 *  - só bordas 100 % transparentes são removidas antes do enquadramento. Imagens opacas ficam inteiras.
 */
export const CREST_SIZE = 128;
export const CREST_MARGIN = 0.06;
/** opacidade mínima para um pixel contar como arte, filtrando o halo de antisserrilhado quase invisível */
export const ALPHA_THRESHOLD = 8;
/** limite de leitura: arquivos maiores não são escudos de jogo */
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 64 * 1024;

export interface Box { x: number; y: number; w: number; h: number }

/** Caixa da arte visível em dados RGBA. Imagem sem transparência devolve o quadro inteiro, e uma imagem vazia devolve null. */
export function visibleBox(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, threshold = ALPHA_THRESHOLD): Box | null {
	let minX = width, minY = height, maxX = -1, maxY = -1, transparent = false;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const a = rgba[(y * width + x) * 4 + 3];
			if (a < 255) transparent = true;
			if (a > threshold) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (!transparent) return { x: 0, y: 0, w: width, h: height };
	if (maxX < 0) return null;
	return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Onde desenhar a arte no quadro de saída: escala uniforme, centralizada e com margem igual nos quatro lados. */
export function placement(box: Pick<Box, 'w' | 'h'>, size = CREST_SIZE, margin = CREST_MARGIN): Box & { scale: number } {
	const inner = size * (1 - 2 * margin);
	const scale = inner / Math.max(box.w, box.h);
	const w = box.w * scale;
	const h = box.h * scale;
	return { x: (size - w) / 2, y: (size - h) / 2, w, h, scale };
}

/** Confirma a assinatura RIFF/WEBP: o servidor só grava WebP. */
export function isWebp(bytes: Uint8Array): boolean {
	return bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
}
