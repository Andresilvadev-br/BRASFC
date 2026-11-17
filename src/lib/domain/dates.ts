/**
 * Datas do jogo como texto ISO (AAAA-MM-DD), sempre em UTC.
 * Evita diferenças de fuso entre servidor e navegador.
 */
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] as const;
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
	if (typeof value !== 'string' || !ISO.test(value)) return false;
	const d = toDate(value);
	return !Number.isNaN(d.getTime()) && fromDate(d) === value;
}

export function toDate(iso: string): Date {
	return new Date(`${iso}T00:00:00Z`);
}

export function fromDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
	const d = toDate(iso);
	d.setUTCDate(d.getUTCDate() + days);
	return fromDate(d);
}

export function diffDays(from: string, to: string): number {
	return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

export function weekday(iso: string): number {
	return toDate(iso).getUTCDay();
}

/** Segunda-feira da semana da data. */
export function startOfWeek(iso: string): string {
	const wd = weekday(iso);
	return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function formatLong(iso: string): string {
	const d = toDate(iso);
	return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export function formatShort(iso: string): string {
	const d = toDate(iso);
	return `${WEEKDAYS_SHORT[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

export function formatDayMonth(iso: string): string {
	const d = toDate(iso);
	return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(year: number, month: number): string {
	const name = MONTHS[month];
	return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function weekdayShort(index: number): string {
	return WEEKDAYS_SHORT[index];
}

/** Grade mensal começando na segunda-feira (6 semanas × 7 dias). */
export function monthGrid(year: number, month: number): string[] {
	const first = fromDate(new Date(Date.UTC(year, month, 1)));
	const start = startOfWeek(first);
	return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function relativeDays(from: string, to: string): string {
	const d = diffDays(from, to);
	if (d === 0) return 'hoje';
	if (d === 1) return 'amanhã';
	if (d > 1) return `em ${d} dias`;
	if (d === -1) return 'ontem';
	return `há ${-d} dias`;
}
