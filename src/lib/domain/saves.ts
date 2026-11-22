import '#lib/data/brasil.ts';
import { MODE_LABELS, type Career } from './career.ts';
import { getClub } from './clubs.ts';
import { DIVISION_LABELS, type DivisionId } from './league.ts';

/** Biblioteca de saves: validação, nomes e ordenação das carreiras individuais. */
export type SaveSort = 'recentes' | 'antigos' | 'tipo' | 'nome';
export const SAVE_SORTS: Array<{ value: SaveSort; label: string }> = [
	{ value: 'recentes', label: 'Mais recentes' },
	{ value: 'antigos', label: 'Mais antigos' },
	{ value: 'tipo', label: 'Tipo' },
	{ value: 'nome', label: 'Clube ou nome' }
];

type SaveLike = Pick<Career, 'id' | 'mode' | 'personName' | 'clubId' | 'season' | 'gameDate' | 'data' | 'updatedAt' | 'createdAt'> & Partial<Pick<Career, 'label' | 'division'>>;

/**
 * Motivo pelo qual um save não pode ser aberto nesta versão (ou null se estiver íntegro).
 * Saves incompatíveis continuam listados e podem ser excluídos, mas não carregados.
 */
export function saveIssue(c: SaveLike): string | null {
	if (!(c.mode in MODE_LABELS)) return 'Modalidade desconhecida nesta versão do jogo.';
	if (!getClub(c.clubId)) return 'O clube deste save não existe nesta versão do jogo.';
	if (!/^\d{4}-\d{2}-\d{2}$/.test(c.gameDate) || !Number.isInteger(c.season)) return 'A data salva da carreira está corrompida.';
	if (c.mode === 'player' && !c.data.position) return 'Os dados do atleta estão incompletos.';
	return null;
}

/** Último save válido: o que "Continuar carreira" abre. */
export function latestValidSave<T extends SaveLike>(careers: T[]): T | undefined {
	return [...careers].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).find((c) => !saveIssue(c));
}

export function saveTitle(c: SaveLike): string {
	return c.label?.trim() || `${getClub(c.clubId)?.name ?? 'Carreira'} · ${c.season}`;
}

export function saveCompetition(c: SaveLike): string | null {
	return c.division ? DIVISION_LABELS[c.division as DivisionId] ?? null : null;
}

export function sortSaves<T extends SaveLike>(careers: T[], sort: SaveSort): T[] {
	const list = [...careers];
	const recent = (a: T, b: T) => b.updatedAt.localeCompare(a.updatedAt);
	if (sort === 'antigos') return list.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
	if (sort === 'tipo') return list.sort((a, b) => a.mode.localeCompare(b.mode) || recent(a, b));
	if (sort === 'nome') {
		const key = (c: T) => `${getClub(c.clubId)?.name ?? c.clubId} ${saveTitle(c)}`;
		return list.sort((a, b) => key(a).localeCompare(key(b), 'pt-BR') || recent(a, b));
	}
	return list.sort(recent);
}

/** "há 5 min", "ontem", "12/03/2026" — data real do último salvamento/acesso no servidor. */
export function savedAgo(iso: string, now = Date.now()): string {
	const diff = Math.max(0, now - new Date(iso).getTime());
	const min = Math.floor(diff / 60_000);
	if (min < 1) return 'agora mesmo';
	if (min < 60) return `há ${min} min`;
	const h = Math.floor(min / 60);
	if (h < 24) return `há ${h} h`;
	const d = Math.floor(h / 24);
	if (d === 1) return 'ontem';
	if (d < 7) return `há ${d} dias`;
	return new Date(iso).toLocaleDateString('pt-BR');
}
