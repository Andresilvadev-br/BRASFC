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

export function headGrid(style: HairStyle): string[] {
	const rows = [...HEAD_BASE];
	for (const [i, row] of Object.entries(HAIR[style])) rows[Number(i)] = row;
	return rows;
}

/** Retrato 18×18: cabeça + ombros. */
export function bustGrid(style: HairStyle): string[] {
	return [...headGrid(style), ...BUST_SHOULDERS];
}

/** Corpo inteiro 30×35. Sem bola para o treinador. */
export function bodyGrid(style: HairStyle, { ball = true }: { ball?: boolean } = {}): string[] {
	const pad = '.'.repeat(HEAD_OFFSET);
	const right = '.'.repeat(BODY[0].length - HEAD_W - HEAD_OFFSET);
	const head = headGrid(style).map((r) => pad + r + right);
	const body = BODY.map((row, i) =>
		ball || i < BALL_ROWS[0] || i > BALL_ROWS[1] ? row : '.'.repeat(BALL_COLS) + row.slice(BALL_COLS)
	);
	return [...head, ...body];
}

/** Escurece/clareia uma cor hexadecimal (fator -1..1). */
export function shade(hex: string, amount: number): string {
	const n = parseInt(hex.slice(1), 16);
	const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
		Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)
	);
	return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function palette(appearance: Appearance, kit: Kit): Record<string, string> {
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
		B: '#1B1F24',
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
