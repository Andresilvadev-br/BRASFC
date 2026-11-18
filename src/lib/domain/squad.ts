import '#lib/data/brasil.ts'; // registra os clubes reais (generateSquad aceita qualquer clube)
import { computeOverall, generateAttributes, type Attributes } from '#lib/engine/attributes.ts';
import { randomAppearance, type Appearance } from './appearance.ts';
import { requireClub } from './clubs.ts';
import { POSITION_INFO, type Position } from './positions.ts';
import { createRng, deriveSeed, type Rng } from './rng.ts';

/**
 * Elencos DEMONSTRATIVOS gerados de forma determinística.
 * Nomes são combinações aleatórias de nomes comuns — não representam atletas reais.
 */
const FIRST_NAMES = [
	'Rafael', 'Lucas', 'Matheus', 'Gabriel', 'Pedro', 'João', 'Thiago', 'Felipe', 'Bruno', 'Diego',
	'Caio', 'Vitor', 'Igor', 'Renan', 'Leandro', 'Murilo', 'Otávio', 'Wesley', 'Douglas', 'Henrique',
	'Davi', 'Enzo', 'Samuel', 'Yuri', 'Danilo', 'Rodrigo', 'Alan', 'Fábio', 'Marcos', 'Ícaro',
	'Breno', 'Kauã', 'Luan', 'Nícolas', 'Ruan', 'Talles', 'Vinícius', 'Wallace', 'Jonas', 'Elias'
] as const;

const LAST_NAMES = [
	'Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Farias', 'Gonçalves', 'Henriques', 'Lacerda', 'Macedo',
	'Nogueira', 'Oliveira', 'Pacheco', 'Queiroz', 'Rezende', 'Sampaio', 'Teixeira', 'Valente', 'Xavier', 'Moura',
	'Siqueira', 'Brandão', 'Coutinho', 'Damasceno', 'Fontes', 'Guimarães', 'Leal', 'Medeiros', 'Peixoto', 'Ramos',
	'Tavares', 'Vieira', 'Bastos', 'Cunha', 'Freitas', 'Lima', 'Prado', 'Rocha', 'Serra', 'Torres'
] as const;

const COMPOSITION: Array<[Position, number]> = [
	['GOL', 3], ['LD', 2], ['ZAG', 4], ['LE', 2], ['VOL', 3], ['MC', 3], ['MEI', 2], ['PD', 2], ['PE', 2], ['ATA', 2]
];

export type Morale = 'excelente' | 'boa' | 'regular';

export interface SquadPlayer {
	id: string;
	name: string;
	shortName: string;
	number: number;
	position: Position;
	age: number;
	overall: number;
	potential: number;
	/** 0–100 */
	condition: number;
	morale: Morale;
	appearance: Appearance;
	/** atributos de jogo (escala 1–99), usados pelo motor de partidas */
	attributes: Attributes;
	/** perfil do atleta (ex.: "Ponta velocista") */
	archetype: string;
	/** vaga genérica de elenco real ainda não importado (sem nome de pessoa) */
	pending?: boolean;
}

export const MORALE_LABELS: Record<Morale, string> = {
	excelente: 'Excelente',
	boa: 'Boa',
	regular: 'Regular'
};

export function randomName(rng: Rng): { name: string; shortName: string } {
	const first = rng.pick(FIRST_NAMES);
	const last = rng.pick(LAST_NAMES);
	return { name: `${first} ${last}`, shortName: rng.chance(0.5) ? first : last };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function generateSquad(clubId: string, seed: number): SquadPlayer[] {
	return generateSquadFor(requireClub(clubId), seed);
}

/**
 * Gera um elenco para qualquer clube (fictício ou real).
 * Com `pending`, o elenco real ainda não foi importado: os atletas recebem nomes
 * FICTÍCIOS (combinações aleatórias, marcados como `pending`) e a interface avisa
 * que não são jogadores reais do clube.
 */
export function generateSquadFor(club: { id: string; reputation: number; tier?: number }, seed: number, opts: { pending?: boolean } = {}): SquadPlayer[] {
	const clubId = club.id;
	const rng = createRng(deriveSeed(seed, 'squad', clubId));
	const base = 57 + club.reputation * 3 + (club.tier ?? 0); // 60 (modesto) a 72 (gigante); Série D/estaduais abaixo
	const players: SquadPlayer[] = [];
	const perPosition = new Map<Position, number>();
	const usedNumbers = new Set<number>();
	const usedNames = new Set<string>();
	let index = 0;

	for (const [position, count] of COMPOSITION) {
		for (let k = 0; k < count; k++) {
			let n = randomName(rng);
			while (usedNames.has(n.name)) n = randomName(rng);
			usedNames.add(n.name);

			const starter = k === 0 || (position === 'ZAG' && k === 1);
			const age = rng.int(18, 34);
			const overall = clamp(base + (starter ? rng.int(2, 8) : rng.int(-9, 2)), 40, 92);
			const youthBonus = age < 23 ? rng.int(4, 14) : age < 27 ? rng.int(0, 5) : 0;
			const number = pickNumber(position, k, usedNumbers, rng);
			players.push({
				id: `${clubId}-${String(index).padStart(2, '0')}`,
				name: n.name,
				shortName: n.shortName,
				number,
				position,
				age,
				overall,
				potential: clamp(overall + youthBonus, overall, 95),
				condition: rng.int(92, 100),
				morale: rng.pick(['excelente', 'boa', 'boa', 'regular'] as const),
				appearance: randomAppearance(rng),
				attributes: {} as Attributes,
				archetype: '',
				...(opts.pending ? { pending: true } : {})
			});
			index++;
		}
	}
	// Atributos com semente própria por atleta: não altera nomes/números já gerados.
	for (const p of players) {
		const { attributes, archetype } = generateAttributes(p.position, p.overall, createRng(deriveSeed(seed, 'attr', p.id)));
		p.attributes = attributes;
		p.archetype = archetype;
		p.overall = computeOverall(attributes, p.position);
		p.potential = Math.max(p.potential, p.overall);
	}
	return players;
}

const PREFERRED_NUMBERS: Record<Position, number[]> = {
	GOL: [1, 12, 23], LD: [2, 13], ZAG: [3, 4, 14, 15], LE: [6, 16], VOL: [5, 8, 17],
	MC: [8, 18, 20], MEI: [10, 21], PD: [7, 19], PE: [11, 22], ATA: [9, 24]
};

function pickNumber(position: Position, k: number, used: Set<number>, rng: Rng): number {
	const preferred = PREFERRED_NUMBERS[position][k];
	let n = preferred && !used.has(preferred) ? preferred : rng.int(25, 40);
	while (used.has(n)) n++;
	used.add(n);
	return n;
}

/** Força média do elenco (usada em textos e na seleção de clube). */
export function squadStrength(players: SquadPlayer[]): number {
	const best = [...players].sort((a, b) => b.overall - a.overall).slice(0, 11);
	return Math.round(best.reduce((s, p) => s + p.overall, 0) / Math.max(1, best.length));
}

export function sectorOf(position: Position) {
	return POSITION_INFO[position].sector;
}
