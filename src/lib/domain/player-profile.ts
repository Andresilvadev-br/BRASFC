export const SOUTH_AMERICAN_COUNTRIES = [
	'Argentina', 'Bolívia', 'Brasil', 'Chile', 'Colômbia', 'Equador',
	'Guiana', 'Paraguai', 'Peru', 'Suriname', 'Uruguai', 'Venezuela'
] as const;

export const MIN_START_AGE = 16;
export const MAX_START_AGE = 35;
export const START_AGES = Array.from({ length: MAX_START_AGE - MIN_START_AGE + 1 }, (_, index) => MIN_START_AGE + index);
export const DOMINANT_FEET = { direito: 'Direito', esquerdo: 'Esquerdo', ambidestro: 'Ambidestro' } as const;
export type DominantFoot = keyof typeof DOMINANT_FEET;

export function isNationality(value: unknown): value is (typeof SOUTH_AMERICAN_COUNTRIES)[number] {
	return SOUTH_AMERICAN_COUNTRIES.some((country) => country === value);
}
export function isStartAge(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= MIN_START_AGE && value <= MAX_START_AGE;
}
export function isDominantFoot(value: unknown): value is DominantFoot {
	return typeof value === 'string' && Object.hasOwn(DOMINANT_FEET, value);
}
export function playerDevelopmentFactor(age: number): number {
	return age <= 21 ? 1 : age <= 27 ? 0.7 : 0.4;
}
