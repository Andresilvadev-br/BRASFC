import type { AttributeKey } from '#lib/engine/attributes.ts';
import type { Appearance } from './appearance.ts';
import type { Position } from './positions.ts';
import type { DivisionId } from './league.ts';

export type MarketCompetition = DivisionId | 'copa-do-brasil';
export type Rating = { min: number; max: number };
export type MarketStatus = 'contratado' | 'livre' | 'emprestado' | 'fim-de-contrato';
export type MarketSort = 'overall' | 'potential' | 'age' | 'value' | 'wage' | 'name' | 'until';
export const MARKET_SORTS: Record<MarketSort, string> = {
	overall: 'Overall', potential: 'Potencial', age: 'Idade', value: 'Valor', wage: 'Salário', name: 'Nome', until: 'Término do contrato'
};
export const MARKET_STATUS: Record<MarketStatus, string> = {
	contratado: 'Sob contrato', livre: 'Sem clube', emprestado: 'Emprestado', 'fim-de-contrato': 'Última temporada de contrato'
};

export interface MarketFilters {
	world?: boolean;
	q?: string;
	position?: Position;
	secondary?: Position;
	club?: string;
	division?: MarketCompetition;
	nationality?: string;
	status?: MarketStatus;
	ageMin?: number;
	ageMax?: number;
	overallMin?: number;
	overallMax?: number;
	potentialMin?: number;
	potentialMax?: number;
	valueMin?: number;
	valueMax?: number;
	wageMin?: number;
	wageMax?: number;
	yearsMin?: number;
	yearsMax?: number;
	attribute?: AttributeKey;
	attributeMin?: number;
	listed?: boolean;
	loanable?: boolean;
	observed?: boolean;
	sort?: MarketSort;
	direction?: 'asc' | 'desc';
	page?: number;
}

export interface MarketAthlete {
	id: string;
	name: string;
	club: string;
	clubName: string;
	division: DivisionId | null;
	position: Position;
	secondary: Position[];
	nationality?: string;
	age: number | null;
	overall: Rating;
	potential: Rating | null;
	value: number;
	wage: number | null;
	until: number | null;
	years: number | null;
	status: MarketStatus;
	listed: boolean;
	loanable: boolean;
	observed: boolean;
	report: boolean;
}

export interface MarketProfile extends MarketAthlete {
	appearance: Appearance;
	attributes: Partial<Record<AttributeKey, Rating>>;
	humanSeller?: string;
	isMine: boolean;
	loanFrom?: string;
	loanUntil?: number;
	loanShare?: number;
	clause?: number;
	moveDate?: string;
	contractStart?: string;
	stats: { season: number; games: number; minutes: number; goals: number; assists: number; yellow: number; red: number }[];
	transfers: { gameDate: string; from: string | null; to: string | null; kind: string; fee: number }[];
}

export interface MarketResults {
	worldAvailable?: boolean;
	rows: MarketAthlete[];
	total: number;
	pages: number;
	page: number;
	clubs: { id: string; name: string; division: DivisionId | null }[];
	competitions: MarketCompetition[];
	nationalities: string[];
}

export function normalizeSearch(value: string): string {
	return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function ratingText(rating: Rating | null): string {
	return !rating ? '—' : rating.min === rating.max ? String(rating.min) : `${rating.min}–${rating.max}`;
}
