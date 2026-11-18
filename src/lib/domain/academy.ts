import { computeOverall, generateAttributes } from '#lib/engine/attributes.ts';
import { randomAppearance } from './appearance.ts';
import { ctDevelopment, scoutMargin, youthIntake } from './club.ts';
import type { Position } from './positions.ts';
import { createRng, deriveSeed } from './rng.ts';
import { randomName, type SquadPlayer } from './squad.ts';

/**
 * Categorias de base e olheiros (Dev 0.4).
 * Os jovens são PERSONAGENS DO UNIVERSO SIMULADO (nomes fictícios), nunca atletas reais.
 * Potencial é limitado pelo nível da base: craques são raros e não há geração ilimitada.
 */

export interface Youth {
	id: string;
	name: string;
	shortName: string;
	position: Position;
	age: number;
	/** overall atual e potencial REAL (oculto: a interface mostra a faixa estimada) */
	overall: number;
	potential: number;
	/** progresso acumulado para o próximo ponto de overall (0–1) */
	progress: number;
	joinedSeason: number;
	/** registro de evolução (temporada, semana, overall) */
	log: Array<{ season: number; round: number; overall: number }>;
	appearance: SquadPlayer['appearance'];
	attributes: SquadPlayer['attributes'];
	archetype: string;
}

const POSITIONS: Position[] = ['GOL', 'ZAG', 'ZAG', 'LD', 'LE', 'VOL', 'MC', 'MC', 'MEI', 'PD', 'PE', 'ATA', 'ATA'];

/** Turma anual da base (início da temporada). */
export function youthIntakeFor(seed: number, clubId: string, season: number, baseLevel: number): Youth[] {
	const rng = createRng(deriveSeed(seed, 'base', clubId, season));
	const n = youthIntake(baseLevel);
	const out: Youth[] = [];
	for (let k = 0; k < n; k++) {
		const position = rng.pick(POSITIONS);
		const age = rng.int(15, 17);
		// Potencial: média sobe com o nível da base; "craque" (75+) é raro e limitado a 1 por turma.
		const star = k === 0 && rng.chance(0.015 * baseLevel);
		const potential = Math.min(92, Math.round(star ? 76 + rng.int(0, 10) + baseLevel : 50 + baseLevel * 4 + rng.int(-6, 12)));
		const target = Math.round(38 + baseLevel * 2 + rng.int(0, 8));
		const { attributes, archetype } = generateAttributes(position, target, rng);
		const n_ = randomName(rng);
		out.push({
			id: `base-${clubId}-${season}-${k}`,
			name: n_.name,
			shortName: n_.shortName,
			position,
			age,
			overall: computeOverall(attributes, position),
			potential: Math.max(potential, computeOverall(attributes, position) + 3),
			progress: 0,
			joinedSeason: season,
			log: [],
			appearance: randomAppearance(rng),
			attributes,
			archetype
		});
	}
	return out;
}

/** Uma semana de treino na base: evolução depende de CT, nível da base, idade e intensidade. */
export function developYouth(y: Youth, ctLevel: number, baseLevel: number, intensity: number, seed: number, season: number, round: number): Youth {
	if (y.overall >= y.potential) return y;
	const rng = createRng(deriveSeed(seed, 'base-semana', y.id, season, round));
	const rate = 0.09 * ctDevelopment(ctLevel) * (0.85 + baseLevel * 0.06) * intensity * (y.age <= 17 ? 1.15 : 1) * (0.7 + rng.next() * 0.6);
	let progress = y.progress + rate * Math.min(1, (y.potential - y.overall) / 12 + 0.25);
	let overall = y.overall;
	let attributes = y.attributes;
	while (progress >= 1 && overall < y.potential) {
		progress -= 1;
		attributes = Object.fromEntries(Object.entries(attributes).map(([k, v]) => [k, Math.min(95, v + 1)])) as typeof attributes;
		overall = computeOverall(attributes, y.position);
	}
	const log = overall !== y.overall ? [...y.log, { season, round, overall }].slice(-24) : y.log;
	return { ...y, overall, attributes, progress: Math.round(progress * 1000) / 1000, log };
}

/** Converte um jovem promovido em atleta do elenco profissional. */
export function promoteYouth(y: Youth, number: number): SquadPlayer {
	return {
		id: y.id,
		name: y.name,
		shortName: y.shortName,
		number,
		position: y.position,
		age: y.age,
		overall: y.overall,
		potential: y.potential,
		condition: 100,
		morale: 'excelente',
		appearance: y.appearance,
		attributes: y.attributes,
		archetype: y.archetype
	};
}

/** Faixa estimada (o que a comissão "enxerga"): mais precisa com olheiros/estrutura melhores. */
export function estimateRange(real: number, margin: number, key: string): [number, number] {
	if (margin <= 0) return [real, real];
	const r = createRng(deriveSeed(0, 'estimativa', key)).next();
	const center = real + Math.round((r - 0.5) * margin * 0.8);
	return [Math.max(30, center - margin), Math.min(99, center + margin)];
}

// ─────────────────────────────────────────────────────────────── olheiros

export const REGIONS = {
	norte: ['AM', 'RR', 'AP', 'PA', 'AC', 'RO', 'TO'],
	nordeste: ['MA', 'PI', 'CE', 'RN', 'PB', 'PE', 'AL', 'SE', 'BA'],
	'centro-oeste': ['MT', 'MS', 'GO', 'DF'],
	sudeste: ['MG', 'ES', 'RJ', 'SP'],
	sul: ['PR', 'SC', 'RS']
} as const;
export type Region = keyof typeof REGIONS;
export const REGION_LABELS: Record<Region, string> = { norte: 'Norte', nordeste: 'Nordeste', 'centro-oeste': 'Centro-Oeste', sudeste: 'Sudeste', sul: 'Sul' };

export interface Scout {
	id: string;
	name: string;
	/** 1–20: precisão do julgamento */
	judgement: number;
	/** salário mensal (R$) */
	wage: number;
	region: Region;
	position: Position | 'qualquer';
	maxAge: number;
}

export interface ScoutReport {
	playerId: string;
	scoutId: string;
	season: number;
	round: number;
	overall: [number, number];
	potential: [number, number];
	verdict: 'recomendado' | 'observar' | 'descartar';
	note: string;
}

const SCOUT_FIRST = ['Álvaro', 'Benedito', 'Cristiano', 'Durval', 'Edson', 'Fausto', 'Gilmar', 'Hélio', 'Ivo', 'Jairo', 'Laércio', 'Moacir', 'Nilton', 'Osmar', 'Paulo'];
const SCOUT_LAST = ['Alencar', 'Bezerra', 'Campos', 'Dantas', 'Fragoso', 'Galvão', 'Holanda', 'Ibiapina', 'Jordão', 'Linhares', 'Mascarenhas', 'Nóbrega'];

/** Olheiros disponíveis para contratação (fictícios). */
export function scoutCandidates(seed: number, season: number): Scout[] {
	const rng = createRng(deriveSeed(seed, 'olheiros', season));
	return Array.from({ length: 5 }, (_, k) => {
		const judgement = rng.int(6, 19);
		return {
			id: `olheiro-${season}-${k}`,
			name: `${rng.pick(SCOUT_FIRST)} ${rng.pick(SCOUT_LAST)}`,
			judgement,
			wage: Math.round((4000 + judgement * judgement * 90) / 500) * 500,
			region: rng.pick(Object.keys(REGIONS) as Region[]),
			position: 'qualquer',
			maxAge: 30
		};
	});
}

export function reportFor(scout: Scout, player: Pick<SquadPlayer, 'id' | 'overall' | 'potential' | 'age'>, obsLevel: number, season: number, round: number, needOverall: number): ScoutReport {
	const margin = scoutMargin(obsLevel, scout.judgement);
	const overall = estimateRange(player.overall, margin, `${scout.id}:${player.id}:o`);
	const potential = estimateRange(player.potential, margin + 2, `${scout.id}:${player.id}:p`);
	const mid = (overall[0] + overall[1]) / 2;
	const potMid = (potential[0] + potential[1]) / 2;
	const verdict = mid >= needOverall || (player.age <= 21 && potMid >= needOverall + 4) ? 'recomendado' : mid >= needOverall - 5 ? 'observar' : 'descartar';
	const note =
		verdict === 'recomendado'
			? player.age <= 21
				? 'Jovem com margem de evolução clara.'
				: 'Entraria no time titular.'
			: verdict === 'observar'
				? 'Pode ser útil como opção de elenco.'
				: 'Abaixo do nível do nosso elenco.';
	return { playerId: player.id, scoutId: scout.id, season, round, overall, potential, verdict, note };
}
