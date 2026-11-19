export const WARDROBE = {
	casual: {
		label: 'Casual', tops: { camiseta: 'Camiseta', camisa: 'Camisa', polo: 'Polo', jaqueta: 'Jaqueta' },
		bottoms: { jeans: 'Jeans', sarja: 'Calça de sarja', bermuda: 'Bermuda' }, shoes: { tenis: 'Tênis', casual: 'Calçado casual' }
	},
	esportivo: {
		label: 'Esportivo', tops: { treino: 'Camisa de treino', agasalho: 'Agasalho', uniforme: 'Uniforme' },
		bottoms: { shorts: 'Shorts', moletom: 'Calça esportiva' }, shoes: { tenis: 'Tênis', chuteira: 'Chuteira' }
	},
	formal: {
		label: 'Formal', tops: { social: 'Camisa social', blazer: 'Blazer', terno: 'Terno' },
		bottoms: { social: 'Calça social' }, shoes: { couro: 'Sapato social', mocassim: 'Mocassim' }
	},
	clube: {
		label: 'Clube', tops: { viagem: 'Camisa de viagem', clubeJaqueta: 'Jaqueta do clube', casaco: 'Casaco do clube', clubeTerno: 'Terno do clube' },
		bottoms: { moletom: 'Calça de viagem', social: 'Calça social', shorts: 'Shorts' }, shoes: { tenis: 'Tênis', couro: 'Sapato social' }
	}
} as const;

export const CLOTHING_COLORS = ['#23282e', '#286151', '#354c72', '#9a3c3c', '#af8659', '#dde2e5'] as const;
export type WardrobeCategory = keyof typeof WARDROBE;
export type Outfit = { category: WardrobeCategory; top: string; bottom: string; shoes: string; color: number };

export function defaultOutfit(category: WardrobeCategory): Outfit {
	const options = WARDROBE[category];
	return { category, top: Object.keys(options.tops)[0], bottom: Object.keys(options.bottoms)[0], shoes: Object.keys(options.shoes)[0], color: 0 };
}

export function isOutfit(value: unknown): value is Outfit {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const outfit = value as Outfit;
	if (!Object.hasOwn(WARDROBE, outfit.category)) return false;
	const options = WARDROBE[outfit.category];
	return typeof outfit.top === 'string' && Object.hasOwn(options.tops, outfit.top)
		&& typeof outfit.bottom === 'string' && Object.hasOwn(options.bottoms, outfit.bottom)
		&& typeof outfit.shoes === 'string' && Object.hasOwn(options.shoes, outfit.shoes)
		&& (outfit.top !== 'clubeTerno' || (outfit.bottom === 'social' && outfit.shoes === 'couro'))
		&& (outfit.top !== 'uniforme' || (outfit.bottom === 'shorts' && outfit.shoes === 'chuteira'))
		&& Number.isInteger(outfit.color) && outfit.color >= 0 && outfit.color < CLOTHING_COLORS.length;
}
