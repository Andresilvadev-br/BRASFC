export const POSITIONS = ['GOL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MEI', 'PD', 'PE', 'ATA'] as const;
export type Position = (typeof POSITIONS)[number];

export type Sector = 'goleiro' | 'defesa' | 'meio' | 'ataque';

export const POSITION_INFO: Record<Position, { label: string; sector: Sector }> = {
	GOL: { label: 'Goleiro', sector: 'goleiro' },
	LD: { label: 'Lateral direito', sector: 'defesa' },
	ZAG: { label: 'Zagueiro', sector: 'defesa' },
	LE: { label: 'Lateral esquerdo', sector: 'defesa' },
	VOL: { label: 'Volante', sector: 'meio' },
	MC: { label: 'Meio-campista', sector: 'meio' },
	MEI: { label: 'Meia ofensivo', sector: 'meio' },
	PD: { label: 'Ponta direita', sector: 'ataque' },
	PE: { label: 'Ponta esquerda', sector: 'ataque' },
	ATA: { label: 'Atacante', sector: 'ataque' }
};

export const SECTOR_LABELS: Record<Sector, string> = {
	goleiro: 'Goleiros',
	defesa: 'Defensores',
	meio: 'Meio-campistas',
	ataque: 'Atacantes'
};

/** Posições aceitáveis como alternativa (familiaridade parcial). */
const RELATED: Record<Position, Position[]> = {
	GOL: [],
	LD: ['ZAG', 'PD'],
	ZAG: ['VOL', 'LD', 'LE'],
	LE: ['ZAG', 'PE'],
	VOL: ['MC', 'ZAG'],
	MC: ['VOL', 'MEI'],
	MEI: ['MC', 'PD', 'PE', 'ATA'],
	PD: ['PE', 'MEI', 'ATA'],
	PE: ['PD', 'MEI', 'ATA'],
	ATA: ['PD', 'PE', 'MEI']
};

/** 1 = posição natural, 0.6 = posição relacionada, 0.2 = fora de posição. */
export function positionFit(natural: Position, slot: Position): number {
	if (natural === slot) return 1;
	if (RELATED[natural].includes(slot)) return 0.6;
	return 0.2;
}

export function isPosition(value: unknown): value is Position {
	return typeof value === 'string' && (POSITIONS as readonly string[]).includes(value);
}
