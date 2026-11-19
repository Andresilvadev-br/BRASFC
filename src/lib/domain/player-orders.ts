import type { Position } from './positions.ts';

export const PLAYER_ORDERS = {
	profundidade: { label: 'Atacar profundidade', positions: ['ATA', 'PD', 'PE', 'MEI'], attack: 7, defend: 0, width: 0 },
	aproximar: { label: 'Aproximar na construção', positions: ['ATA', 'PD', 'PE', 'MEI', 'MC', 'VOL'], attack: -6, defend: 0, width: -0.18 },
	amplitude: { label: 'Manter amplitude', positions: ['PD', 'PE', 'MEI', 'LD', 'LE'], attack: 0, defend: 0, width: 0.28 },
	cobertura: { label: 'Proteger o centro', positions: ['MC', 'VOL', 'ZAG', 'LD', 'LE'], attack: -4, defend: -4, width: -0.29 },
	ultrapassar: { label: 'Ultrapassar por fora', positions: ['LD', 'LE'], attack: 7, defend: 0, width: 0.22 },
	marcacao: { label: 'Antecipar a marcação', positions: ['ZAG', 'VOL'], attack: 0, defend: 4, width: -0.1 },
	adiantado: { label: 'Adiantar a cobertura', positions: ['GOL'], attack: 4, defend: 2, width: 0 },
	conservador: { label: 'Proteger a meta', positions: ['GOL'], attack: -3, defend: -3, width: 0 }
} satisfies Record<string, { label: string; positions: Position[]; attack: number; defend: number; width: number }>;

export type PlayerOrder = keyof typeof PLAYER_ORDERS;
export type PlayerOrders = Record<string, PlayerOrder>;
type Player = { id: string; position: Position };

export function isPlayerOrder(value: unknown): value is PlayerOrder {
	return typeof value === 'string' && Object.hasOwn(PLAYER_ORDERS, value);
}

export function fitsOrder(value: PlayerOrder, position: Position) {
	return (PLAYER_ORDERS[value].positions as readonly Position[]).includes(position);
}
export function sanitizeOrders(raw: unknown, squad: Player[]): PlayerOrders | undefined {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
	const source = raw as Record<string, unknown>;
	const entries = squad.flatMap(({ id, position }) => {
		const value = Object.hasOwn(source, id) ? source[id] : undefined;
		return isPlayerOrder(value) && fitsOrder(value, position) ? [[id, value]] : [];
	});
	return entries.length ? Object.fromEntries(entries) : undefined;
}
export function sanitizeCaptains(raw: unknown, squad: Player[]): string[] | undefined {
	if (!Array.isArray(raw)) return;
	const ids = new Set(squad.map(({ id }) => id));
	const result = [...new Set(raw.filter((id): id is string => typeof id === 'string' && ids.has(id)))].slice(0, 11);
	return result.length ? result : undefined;
}
