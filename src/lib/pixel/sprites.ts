import { CLOTHING_COLORS, type Outfit } from '#lib/domain/wardrobe.ts';
import { HAIR_COLORS, SKIN_TONES, type Appearance, type HairStyle } from '#lib/domain/appearance.ts';

/**
 * Personagens em pixel art do BRASFC — desenho original, paramétrico.
 * Proporção "chibi esportiva": cabeça grande (~45% da altura), tronco com a
 * largura da cabeça, braços abertos e pernas curtas e firmes em passada, com a bola no pé.
 * Cada caractere da grade é uma chave de paleta; "." é transparente.
 *
 *   O contorno   S pele   s sombra da pele   c bochecha   W branco do olho   E olho/sobrancelha   M boca
 *   H cabelo     h reflexo/sombra do cabelo
 *   J camisa     j sombra da camisa   K detalhe (gola, mangas, faixa do meião)
 *   P calção     p costura   D meião   B chuteira   L bola   l detalhe da bola
 */

export const HEAD_W = 18;

// Cabeça 18×15 sem cabelo (o penteado é aplicado por cima, linha a linha).
const HEAD_BASE = [
	'..................',
	'.....OOOOOOOO.....',
	'...OOSSSSSSSSOO...',
	'..OSSSSSSSSSSSSO..',
	'..OSSSSSSSSSSSSO..',
	'.OSSSSSSSSSSSSSSO.',
	'.OSEEESSSSSSEEESO.',
	'OsSSEESSSSSSEESSsO',
	'OsSSEWSSSSSSEWSSsO',
	'.OSccSSSsSSSSccSO.',
	'.OSSSSSSSSSSSSSSO.',
	'..OSSSSSMMMSSSSO..',
	'..OSSSSSSSSSSSSO..',
	'...OOSSSSSSSSOO...',
	'.....OOSSSSOO.....'
];

// Linhas substituídas por penteado (índice da linha → conteúdo).
const HAIR: Record<HairStyle, Record<number, string>> = {
	curto: {
		0: '.....OOOOOOOO.....',
		1: '...OOHHHHHHHHOO...',
		2: '..OHHHHHHHHHHHHO..',
		3: '.OHHHhHHHHhHHHHHO.',
		4: '.OHHHHHHHHHHHHHHO.',
		5: '.OHHSSSSSSSHHHHHO.',
		6: '.OHEEESSSSSSEEEHO.'
	},
	espetado: {
		0: '....O.O.O.O.O.O...',
		1: '...OHOHOHOHOHOHO..',
		2: '..OHHHHHHHHHHHHO..',
		3: '.OHHhHHhHHhHHhHHO.',
		4: '.OHHHHHHHHHHHHHHO.',
		5: '.OHHHHHHHHHHHHHHO.',
		6: '.OHEEESSSSSSEEEHO.'
	},
	raspado: {
		1: '.....OOOOOOOO.....',
		2: '...OOhhhhhhhhOO...',
		3: '..OhhhhhhhhhhhhO..',
		4: '..OhSSSSSSSSSShO..'
	},
	cacheado: {
		0: '....OOOOOOOOOO....',
		1: '..OOHHhHHhHHhHOO..',
		2: '.OHHHHHHHHHHHHHHO.',
		3: 'OHHhHHhHHhHHhHHhHO',
		4: 'OHHHHHHHHHHHHHHHHO',
		5: 'OHHSSSSSSSSSSSSHHO',
		6: 'OHSEEESSSSSSEEESHO',
		7: 'OHSSEESSSSSSEESSHO',
		8: 'OHSSEWSSSSSSEWSSHO'
	},
	moicano: {
		0: '.......OOOO.......',
		1: '.....OOHHHHOO.....',
		2: '...OOSSHhhHSSOO...',
		3: '..OSSSSHHHHSSSSO..'
	},
	crespo: {
		0: '...OOOOOOOOOOOO...',
		1: '.OOHhHhHhHhHhHOO..',
		2: 'OHHhHhHhHhHhHhHHHO',
		3: 'OHHHHHHHHHHHHHHHHO',
		4: '.OHHHHHHHHHHHHHHO.',
		5: '.OHHHSSSSSSSSHHHO.'
	},
	medio: {
		0: '.....OOOOOOOO.....',
		1: '...OOHHHHHHHHOO...',
		2: '..OHHHHHHHHHHHHO..',
		3: '.OHHHHHhHHHHHHHHO.',
		4: '.OHHHHhHHHHHHHHHO.',
		5: '.OHHHSSSSSSSHHHHO.',
		6: 'OHHHEESSSSSSEEHHHO',
		7: 'OHHSSESSSSSESSEHHO',
		8: '.OHHEWSSSSSSEWHHO.'
	},
	'liso-lateral': {
		0: '.....OOOOOOOO.....',
		1: '...OOHHHHHHHHOO...',
		2: '..OHHhHHHHHHHHHO..',
		3: '.OHHHHhHHHHHHHHHO.',
		4: '.OHHHHHhHHHHHHHHO.',
		5: '.OHHHHSSSSSSSSSHO.',
		6: '.OHHEESSSSSSEEEHO.'
	},
	coque: {
		0: '......OOHHOO......',
		1: '.....OHHHHHHO.....',
		2: '...OOHHHHHHHHOO...',
		3: '..OHHhhHHhhHHHHO..',
		4: '.OHSSSSSSSSSSSSHO.',
		5: '.OHSSSSSSSSSSSSHO.'
	},
	'black-power': {
		0: '..OOOOOOOOOOOOOO..',
		1: '.OHHHhHHHHHhHHHHO.',
		2: 'OHHhHHHHhHHHHhHHHO',
		3: 'OHHHHHHHHHHHHHHHHO',
		4: 'OHHHHHHHHHHHHHHHHO',
		5: 'OHHHSSSSSSSSSSHHHO',
		6: 'OHSEEESSSSSSEEESHO',
		7: 'OHSSEESSSSSSEESSHO'
	},
	'trancas': {
		0: '.....OOOOOOOO.....',
		1: '...OOHHHHHHHHOO...',
		2: '..OHhHhHhHhHhHHO..',
		3: '.OHHhHhHhHhHhHHHO.',
		4: '.OHHHHHHHHHHHHHHO.',
		5: '.OHHSSSSSSSSSSHHO.',
		6: '.OHEEESSSSSSEEEHO.',
		7: 'OHHSEESSSSSSEESHHO',
		8: 'OHhSEWSSSSSSEWShHO',
		9: 'OHHccSSSsSSSSccHHO',
		10: 'OhHSSSSSSSSSSSSHhO'
	},
	'topete': {
		0: '......OOOOOO......',
		1: '....OOHHHHhHOO....',
		2: '...OHHHhHHHHHHO...',
		3: '..OHHHHHHHHHHHHO..',
		4: '.OHHHHHHHHHHHHHHO.',
		5: '.OHSSSSSSSSSSSSHO.'
	},
	'franja': {
		0: '.....OOOOOOOO.....',
		1: '...OOHHHHHHHHOO...',
		2: '..OHHHHHHHHHHHHO..',
		3: '.OHHHHHHHHHHHHHHO.',
		4: '.OHHhHHhHHhHHhHHO.',
		5: '.OHHHHHHHHHHHHHHO.',
		6: '.OHEEESSSSSSEEEHO.'
	},
	// careca: só o contorno da cabeça (sem linhas de cabelo)
	careca: {},
	longo: {
		0: '.....OOOOOOOO.....',
		1: '...OOHHHHHHHHOO...',
		2: '..OHHHHHHHHHHHHO..',
		3: '.OHHHhHHHHhHHHHHO.',
		4: '.OHHHHHHHHHHHHHHO.',
		5: '.OHHSSSSSSSSSSHHO.',
		6: '.OHEEESSSSSSEEEHO.',
		7: 'OHHSEESSSSSSEESHHO',
		8: 'OHHSEWSSSSSSEWSHHO',
		9: 'OHHccSSSsSSSSccHHO',
		10: 'OHHSSSSSSSSSSSSHHO',
		11: '.OHSSSSSMMMSSSSHO.'
	}
};

// Ombros do busto (18 colunas), abaixo da cabeça.
const BUST_SHOULDERS = ['...OOJJKSSKJJOO...', '.OOKJJJJKKJJJJKOO.', 'OKKJJJJJJJJJJJJKKO'];

// Corpo inteiro (30 colunas; a cabeça entra deslocada 6 colunas).
// Bola nas colunas 0–6 das linhas 12–18 do corpo, junto ao pé da frente.
const HEAD_OFFSET = 6;
const BODY = [
	'.......OOJJJJKSSKJJJJOO.......',
	'.....OOKJJJJJJKKJJJJJJKOO.....',
	'....OKKKJJJJJJJJJJJJJJKKKO....',
	'...OSSSOJJJJJJJJJJJJJJOSSSO...',
	'..OSSSO.OjJJJJJJJJJJjO.OSSSO..',
	'.OSSSO..OjJJJJJJJJJJjO..OSSSO.',
	'..OSSSSOOJJJJJJJJJJJJO.OSSSO..',
	'...OSSSSOJJJJJJJJJJJJO.OSSO...',
	'....OOOOPPPPPPPPPPPPPPO.OO....',
	'......OPPPPPPPPPPPPPPPPO......',
	'......OPPPPPPPPpPPPPPPPO......',
	'......OPPPPPPO..OPPPPPPO......',
	'..OOO..OSSSSO....OSSSSO.......',
	'.OLLLO.OSSSSO....OSSSSO.......',
	'OLLlLLOOsSSO.....OSsSSO.......',
	'OLlllLOODDDO.....ODDDDO.......',
	'OLLlLLOOKKKO.....OKKKKO.......',
	'.OLLLO.OBBBBO....ODDDDO.......',
	'..OOO..OOOOOO...OBBBBBBO......',
	'................OOOOOOOO......'
];
const BALL_ROWS = [12, 18] as const;
const BALL_COLS = 7;

export interface Kit {
	shirt: string;
	trim: string;
	shorts: string;
	socks: string;
}

export const COACH_KIT: Kit = { shirt: '#262E35', trim: '#E7EDF0', shorts: '#1A2026', socks: '#1A2026' };

export function headGrid(style: HairStyle, details?: Appearance): string[] {
	const rows = [...HEAD_BASE];
	for (const [i, row] of Object.entries(HAIR[style])) rows[Number(i)] = row;
	// Rostos (0.13: sem barba/bigode). Cada traço troca poucos pixels da mesma grade 18×15.
	const put = (row: number, col: number, text: string) => { rows[row] = rows[row].slice(0, col) + text + rows[row].slice(col + text.length); };
	switch (details?.face) {
		case 'sorriso': put(10, 6, 'MSSSSM'); put(11, 7, 'MMMM'); break;
		case 'serio': put(5, 3, 'EE'); put(5, 13, 'EE'); put(11, 7, 'MMMM'); break;
		case 'determinado': put(6, 3, 'EEEE'); put(6, 11, 'EEEE'); put(8, 5, 'E'); put(8, 13, 'E'); break;
		case 'sardas': put(9, 3, 'scs'); put(9, 12, 'scs'); put(10, 4, 's'); put(10, 13, 's'); break;
		case 'cicatriz': put(5, 12, 's'); put(6, 11, 's'); put(9, 12, 'ss'); break;
	}
	if (details?.accessory === 'faixa') rows[5] = rows[5].replace(/[SHh]/g, 'K');
	if (details?.accessory === 'oculos') {
		rows[7] = rows[7].slice(0, 3) + 'OOOOOssOOOOO' + rows[7].slice(15);
		rows[8] = rows[8].slice(0, 3) + 'OWWOOssOOWWO' + rows[8].slice(15);
	}
	if (details?.accessory === 'brinco') rows[9] = rows[9].slice(0, 1) + 'K' + rows[9].slice(2);
	return rows;
}

/** Retrato 18×18: cabeça + ombros. */
export function bustGrid(style: HairStyle, details?: Appearance): string[] {
	return [...headGrid(style, details), ...BUST_SHOULDERS];
}

/** Corpo inteiro 30×35. Sem bola para o treinador. */
export function bodyGrid(style: HairStyle, { ball = true, details, outfit }: { ball?: boolean; details?: Appearance; outfit?: Outfit } = {}): string[] {
	const pad = '.'.repeat(HEAD_OFFSET);
	const right = '.'.repeat(BODY[0].length - HEAD_W - HEAD_OFFSET);
	const head = headGrid(style, details).map((r) => pad + r + right);
	const body = BODY.map((row, i) => {
		if (!ball && i >= BALL_ROWS[0] && i <= BALL_ROWS[1]) row = '.'.repeat(BALL_COLS) + row.slice(BALL_COLS);
		if (details?.body === 'forte' && i >= 1 && i <= 3) {
			const left = row.indexOf('O');
			const right = row.lastIndexOf('O');
			row = row.slice(0, left - 1) + 'OJ' + row.slice(left + 1, right) + 'JO' + row.slice(right + 2);
		}
		if (details?.body === 'esguio' && i >= 1 && i <= 7) row = '.' + row.slice(0, 14) + row.slice(16) + '.';
		if (details?.sleeves === 'longa' && i >= 3 && i <= 5) row = row.replace(/S/g, 'J');
		if (details?.accessory === 'munhequeira' && i === 6) row = row.replace('SSS', 'KKS');
		if (details?.socks === 'alto' && i >= 12 && i <= 14) row = row.replace(/[Ss]/g, 'D');
		if (details?.shirt === 'fora' && i === 8) row = row.replace(/P/g, 'j');
		if (outfit) row = dressRow(row, i, outfit);
		return row;
	});
	return [...head, ...body];
}

function dressRow(row: string, i: number, outfit: Outfit) {
	const { top, bottom, shoes } = outfit;
	const isJacket = ['jaqueta', 'agasalho', 'blazer', 'terno', 'clubeJaqueta', 'casaco', 'clubeTerno', 'moletom', 'cortaVento'].includes(top);
	const isFormal = ['social', 'blazer', 'terno', 'clubeTerno', 'colete'].includes(top);
	const longSleeve = isJacket || top === 'social' || top === 'camisa';
	if (longSleeve && i >= 3 && i <= 6) row = row.replace(/S/g, i === 6 ? 'K' : 'J');
	if ((isJacket || isFormal || top === 'polo') && i >= 1 && i <= (isJacket ? 7 : 4)) {
		const front = row.length / 2 - 1;
		const chest = isFormal && i <= 3 ? 'K' : isJacket ? (i === 4 ? 'K' : 'j') : 'K';
		row = row.slice(0, front) + chest + row.slice(front + 1);
	}
	if (top === 'treino' && i === 2) row = row.replace(/JJJJ/, 'JKKJ');
	if (top === 'moletom' && i === 5) row = row.replace(/JJJJJJ/, 'JjjjjJ');
	if (top === 'cortaVento' && (i === 2 || i === 6)) row = row.replace(/JJJJJJ/, 'KKKKKK');
	if (top === 'viagem' && i === 5) row = row.replace(/JJJJJJ/, 'JKKKKJ');
	if (top === 'clubeJaqueta' && i === 6) row = row.replace(/JJJJ/, 'JKKJ');
	if (top === 'casaco' && i === 8) row = row.replace(/P/g, 'j');
	if (!['shorts', 'bermuda'].includes(bottom) && i >= 12 && i <= 17) row = row.replace(/[SsDK]/g, i === 15 ? 'p' : 'P');
	else if (outfit.category === 'casual' && i >= 15) row = row.replace(/D/g, 'S');
	if (i === 17 && shoes === 'tenis') row = row.replace(/BBBB/g, 'BKBB');
	if (i === 18 && shoes === 'chuteira') row = row.replace(/OOOOOO/, 'OBOBOO');
	if (i === 17 && shoes === 'mocassim') row = row.replace(/BBBB/g, 'BOBB');
	return row;
}

export function wardrobeKit(outfit: Outfit, kit: Kit): Kit {
	const club = outfit.category === 'clube' || outfit.top === 'uniforme';
	const top = club ? kit.shirt : CLOTHING_COLORS[outfit.color];
	return {
		shirt: top, trim: club ? kit.trim : ['social', 'blazer', 'terno', 'polo'].includes(outfit.top) ? '#f1f1e8' : shade(top, .42),
		shorts: outfit.bottom === 'jeans' ? '#253653' : outfit.bottom === 'sarja' ? '#837258' : outfit.bottom === 'social' ? '#252830' : kit.shorts,
		socks: club ? kit.socks : '#51565d'
	};
}

/** Escurece/clareia uma cor hexadecimal (fator -1..1). */
export function shade(hex: string, amount: number): string {
	const n = parseInt(hex.slice(1), 16);
	const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
		Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)
	);
	return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function palette(appearance: Appearance, kit: Kit, outfit?: Outfit): Record<string, string> {
	const skin = SKIN_TONES[appearance.skin] ?? SKIN_TONES[2];
	const hair = HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[1];
	return {
		O: '#15110E',
		S: skin,
		s: shade(skin, -0.18),
		c: shade(skin, 0.14),
		W: '#F4F7F8',
		E: '#15110E',
		M: shade(skin, -0.45),
		H: hair,
		h: shade(hair, appearance.hairColor === 0 ? 0.22 : 0.18),
		J: kit.shirt,
		j: shade(kit.shirt, -0.22),
		K: kit.trim,
		P: kit.shorts,
		p: shade(kit.shorts, -0.25),
		D: kit.socks,
		B: outfit?.shoes === 'tenis' ? '#e0e1d9' : outfit?.shoes === 'mocassim' ? '#694736' : outfit?.shoes === 'casual' ? '#7d5a45' : '#1B1F24',
		L: '#F4F7F8',
		l: '#10B981'
	};
}

export interface PixelRun {
	x: number;
	y: number;
	w: number;
	color: string;
}

/** Converte a grade em retângulos horizontais (uma <rect> por sequência de mesma cor). */
export function toRuns(grid: string[], colors: Record<string, string>): PixelRun[] {
	const runs: PixelRun[] = [];
	grid.forEach((row, y) => {
		let x = 0;
		while (x < row.length) {
			const key = row[x];
			if (key === '.' || !colors[key]) {
				x++;
				continue;
			}
			let w = 1;
			while (row[x + w] === key) w++;
			runs.push({ x, y, w, color: colors[key] });
			x += w;
		}
	});
	return runs;
}
