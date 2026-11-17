import type { Rng } from './rng.ts';

/**
 * Aparência dos personagens em pixel art.
 * Estrutura pronta para a personalização completa (rosto, acessórios,
 * mangas, meiões) prevista para uma etapa posterior.
 */
export const SKIN_TONES = ['#F6D3B3', '#E8B48C', '#C98E62', '#A06A43', '#7A4B2C', '#553320'] as const;
export const HAIR_COLORS = ['#1B1410', '#3B2417', '#6B3F1F', '#A0612B', '#D9A441', '#9AA0A6'] as const;
export const HAIR_STYLES = ['curto', 'espetado', 'raspado', 'cacheado', 'moicano', 'longo'] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];

export interface Appearance {
	skin: number;
	hairColor: number;
	hairStyle: HairStyle;
}

export const HAIR_STYLE_LABELS: Record<HairStyle, string> = {
	curto: 'Curto',
	espetado: 'Espetado',
	raspado: 'Raspado',
	cacheado: 'Cacheado',
	moicano: 'Moicano',
	longo: 'Longo'
};

export function randomAppearance(rng: Rng): Appearance {
	return {
		skin: rng.int(0, SKIN_TONES.length - 1),
		hairColor: rng.int(0, HAIR_COLORS.length - 2), // grisalho fica raro: só via escolha
		hairStyle: rng.pick(HAIR_STYLES)
	};
}

export function isAppearance(value: unknown): value is Appearance {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	return (
		Number.isInteger(v.skin) &&
		(v.skin as number) >= 0 &&
		(v.skin as number) < SKIN_TONES.length &&
		Number.isInteger(v.hairColor) &&
		(v.hairColor as number) >= 0 &&
		(v.hairColor as number) < HAIR_COLORS.length &&
		typeof v.hairStyle === 'string' &&
		(HAIR_STYLES as readonly string[]).includes(v.hairStyle)
	);
}

export const DEFAULT_APPEARANCE: Appearance = { skin: 2, hairColor: 1, hairStyle: 'espetado' };
