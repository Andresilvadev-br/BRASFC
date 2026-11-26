import { isOutfit, type Outfit } from './wardrobe.ts';
import type { Rng } from './rng.ts';

export const APPEARANCE_OPTIONS = {
	// 0.13: sem barba/bigode (tinham problemas visuais); saves antigos com eles continuam válidos e aparecem sem pelos.
	face: { neutro: 'Clássico', sorriso: 'Sorridente', serio: 'Sério', determinado: 'Determinado', sardas: 'Sardas', cicatriz: 'Cicatriz' },
	body: { atletico: 'Atlético', esguio: 'Esguio', forte: 'Forte' },
	accessory: { nenhum: 'Nenhum', faixa: 'Faixa', munhequeira: 'Munhequeira', oculos: 'Óculos', brinco: 'Brinco' },
	sleeves: { curta: 'Curta', longa: 'Longa' },
	socks: { curto: 'Curto', alto: 'Alto' },
	shirt: { dentro: 'Por dentro', fora: 'Por fora' }
} as const;

export const APPEARANCE_FIELDS: Record<keyof typeof APPEARANCE_OPTIONS, string> = {
	face: 'Rosto', body: 'Corpo', accessory: 'Acessório', sleeves: 'Manga', socks: 'Meião', shirt: 'Camisa'
};

export type AppearanceDetails = { [K in keyof typeof APPEARANCE_OPTIONS]?: keyof (typeof APPEARANCE_OPTIONS)[K] };

export const SKIN_TONES = ['#F6D3B3', '#E8B48C', '#C98E62', '#A06A43', '#7A4B2C', '#553320'] as const;
export const HAIR_COLORS = ['#1B1410', '#3B2417', '#6B3F1F', '#A0612B', '#D9A441', '#9AA0A6', '#E8E2D6', '#8E2F25'] as const;
export const HAIR_STYLES = ['curto', 'espetado', 'raspado', 'cacheado', 'moicano', 'longo', 'crespo', 'medio', 'liso-lateral', 'coque', 'black-power', 'trancas', 'topete', 'franja', 'careca'] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];

export interface Appearance extends AppearanceDetails {
	wardrobe?: Outfit;
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
	longo: 'Longo',
	crespo: 'Crespo',
	medio: 'Médio',
	'liso-lateral': 'Liso lateral',
	coque: 'Coque',
	'black-power': 'Black power',
	trancas: 'Tranças',
	topete: 'Topete',
	franja: 'Franja',
	careca: 'Careca'
};

/** Rostos de versões anteriores (sem desenho próprio desde a 0.13): continuam aceitos nos saves. */
const LEGACY_FACES = new Set(['barba', 'bigode']);

export function randomAppearance(rng: Rng): Appearance {
	return {
		skin: rng.int(0, SKIN_TONES.length - 1),
		hairColor: rng.int(0, 4), // grisalho, branco e ruivo ficam raros: só via escolha
		hairStyle: rng.pick(HAIR_STYLES.slice(0, 6))
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
		(HAIR_STYLES as readonly string[]).includes(v.hairStyle) &&
		(v.wardrobe === undefined || isOutfit(v.wardrobe)) &&
		Object.entries(APPEARANCE_OPTIONS).every(([key, options]) =>
			v[key] === undefined || (typeof v[key] === 'string' && (Object.hasOwn(options, v[key]) || (key === 'face' && LEGACY_FACES.has(v[key] as string))))
		)
	);
}

export const DEFAULT_APPEARANCE: Appearance = { skin: 2, hairColor: 1, hairStyle: 'espetado' };
