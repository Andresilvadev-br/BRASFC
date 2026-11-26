import { CUP_PHASES, cupDate, type CupState, type CupView } from '#lib/domain/cup.ts';
import type { ClubId, CompetitionParticipation, ParticipationStatus } from './contract.ts';

/**
 * PROVISÓRIO (interface): situação de um clube na Copa do Brasil a partir de `CupState` e `CupView`.
 * A engine passa a fornecer `participationOf()` com a mesma forma (docs/WORLD-CONTRACT.md).
 *
 * O caso que esta função separa: um clube inscrito para uma fase futura (ex.: entra na 5ª fase) está
 * **aguardando estreia**, não "fora da edição". Antes, a tela só olhava confrontos já sorteados.
 */
export function cupParticipation(cup: CupState, view: CupView, club: ClubId): CompetitionParticipation {
	const base = { competition: 'copa-do-brasil', club, nextDate: null as string | null };
	const entry = Object.entries(cup.entrants).find(([, ids]) => ids.includes(club));
	let last: { index: number; won: boolean | null } | null = null;
	view.phases.forEach((p, index) => {
		const tie = p.ties.find((t) => t.tie.includes(club));
		if (tie) last = { index, won: tie.outcome ? tie.outcome.winner === club : null };
	});
	const played = last as { index: number; won: boolean | null } | null;
	if (!played) {
		if (!entry) return { ...base, status: 'nao-classificado', stage: null };
		const phase = CUP_PHASES[Number(entry[0]) - 1];
		// Inscrito numa fase anterior já concluída, sem confronto: ficou de fora (não deve acontecer; a engine confirma).
		const status: ParticipationStatus = view.current > phase.phase - 1 && view.phases[phase.phase - 1].ties.length ? 'nao-classificado' : 'aguardando-estreia';
		return { ...base, status, stage: phase.name, nextDate: status === 'aguardando-estreia' ? cupDate(cup.season, phase.matchdays[0]) : null };
	}
	const phase = CUP_PHASES[played.index];
	if (view.champion === club) return { ...base, status: 'campeao', stage: phase.name };
	if (played.won === false) {
		const tie = view.phases[played.index].ties.find((t) => t.tie.includes(club))!;
		return { ...base, status: 'eliminado', stage: phase.name, eliminatedStage: phase.name, eliminatedBy: tie.outcome!.winner };
	}
	if (played.won === true) {
		const next = CUP_PHASES[played.index + 1];
		return { ...base, status: 'classificado', stage: next?.name ?? phase.name, nextDate: next ? cupDate(cup.season, next.matchdays[0]) : null };
	}
	return { ...base, status: 'em-disputa', stage: phase.name, nextDate: cupDate(cup.season, phase.matchdays[0]) };
}

export const STATUS_LABEL: Record<ParticipationStatus, string> = {
	'aguardando-estreia': 'Aguardando estreia',
	'em-disputa': 'Em disputa',
	classificado: 'Classificado',
	eliminado: 'Eliminado',
	'nao-classificado': 'Não classificado',
	campeao: 'Campeão'
};
