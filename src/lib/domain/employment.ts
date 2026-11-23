import type { Career } from './career.ts';
import type { JobOfferDetail } from './careerlife.ts';
import type { ClubState } from './management.ts';
import type { OfficeState } from './office.ts';
import { createRng, deriveSeed } from './rng.ts';

/**
 * Vínculo do treinador (Carreira de Treinador 2.0).
 *
 * O estado não é duplicado: ele é derivado do que já está salvo.
 *  - `club.board.dismissed`       → sem clube (demitido ou contrato expirado);
 *  - `office.renewalDeclinedSeason` → saída confirmada ao fim do vínculo;
 *  - propostas abertas enquanto sem clube → em negociação.
 * "Contrato expirado" e "Novo contrato" são transições registradas no histórico e nas decisões.
 */
export type EmploymentKey = 'contratado' | 'saida-confirmada' | 'sem-clube' | 'em-negociacao';

export const EMPLOYMENT_LABELS: Record<EmploymentKey, string> = {
	contratado: 'Contratado',
	'saida-confirmada': 'Saída confirmada',
	'sem-clube': 'Sem clube',
	'em-negociacao': 'Em negociação'
};

export interface EmploymentStatus {
	key: EmploymentKey;
	label: string;
	detail: string;
}

/** Treinador sem vínculo ativo: não comanda nem administra o clube salvo na carreira. */
export function isUnemployed(career: Pick<Career, 'mode' | 'data'>): boolean {
	return career.mode === 'coach' && !!(career.data.club as ClubState | undefined)?.board?.dismissed;
}

/** O momento da carreira em que o treinador está (para o servidor e para a interface). */
export function employmentStatus(office: Pick<OfficeState, 'contract' | 'renewalDeclinedSeason' | 'unemployedSince'>, club: Pick<ClubState, 'board' | 'jobOffers'>, season: number, round: number): EmploymentStatus {
	if (club.board.dismissed) {
		const open = openOffers(club.jobOffers, season, round);
		const reason = office.unemployedSince?.reason === 'fim-contrato' ? 'Contrato encerrado' : office.unemployedSince?.reason === 'demitido' ? 'Demitido pela diretoria' : 'Sem vínculo';
		return open.length
			? { key: 'em-negociacao', label: EMPLOYMENT_LABELS['em-negociacao'], detail: `${reason}. ${open.length} ${open.length === 1 ? 'proposta aberta' : 'propostas abertas'}.` }
			: { key: 'sem-clube', label: EMPLOYMENT_LABELS['sem-clube'], detail: `${reason}. Nenhuma proposta no momento.` };
	}
	if (office.renewalDeclinedSeason === season || (office.contract.until <= season && office.renewalDeclinedSeason !== undefined && office.renewalDeclinedSeason >= season)) {
		return { key: 'saida-confirmada', label: EMPLOYMENT_LABELS['saida-confirmada'], detail: `Você deixa o clube ao fim de ${season}. Até lá, segue no comando.` };
	}
	return { key: 'contratado', label: EMPLOYMENT_LABELS.contratado, detail: `Contrato até ${office.contract.until}.` };
}

// ─────────────────────────────────────────────────────────────── propostas

export type OfferSource = 'janela' | 'demissao' | 'fim-contrato' | 'desemprego' | 'temporada';

export const OFFER_SOURCE_LABEL: Record<OfferSource, string> = {
	janela: 'Sondagem durante a temporada',
	demissao: 'Após a demissão',
	'fim-contrato': 'Fim de contrato',
	desemprego: 'Mercado de treinadores',
	temporada: 'Planejamento da próxima temporada'
};

/** Rodadas de liga em que o mercado de treinadores se movimenta (~25%, ~60% e ~85% da temporada). */
export function offerWindowRounds(totalRounds: number): number[] {
	if (totalRounds < 4) return [];
	const at = (pct: number) => Math.max(2, Math.min(totalRounds - 1, Math.round(totalRounds * pct)));
	return [...new Set([at(0.25), at(0.6), at(0.85)])];
}

/** Rodada (da temporada `season`) até a qual a proposta continua válida; `null` = até o fim da temporada. */
export function offerDeadline(o: JobOfferDetail): { season: number; round: number | null } {
	return { season: o.expiresSeason, round: typeof o.expiresRound === 'number' ? o.expiresRound : null };
}

/** Proposta ainda pode ser respondida no momento (temporada/rodada) informado. */
export function isOfferOpen(o: JobOfferDetail, season: number, round: number): boolean {
	if (o.status && o.status !== 'aberta') return false;
	if (o.expiresSeason > season) return true;
	if (o.expiresSeason < season) return false;
	return typeof o.expiresRound !== 'number' || round <= o.expiresRound;
}

export function openOffers(offers: JobOfferDetail[] | undefined, season: number, round: number): JobOfferDetail[] {
	return (offers ?? []).filter((o) => isOfferOpen(o, season, round));
}

/** Mantém propostas abertas e as últimas encerradas (para o histórico da tela), sem crescer sem limite. */
export function pruneOffers(offers: JobOfferDetail[], season: number, round: number): JobOfferDetail[] {
	const out = offers.map((o) => (o.status === 'aberta' || !o.status) && !isOfferOpen(o, season, round) ? { ...o, status: 'expirada' as const } : o);
	const open = out.filter((o) => o.status === 'aberta' || !o.status);
	const closed = out.filter((o) => o.status && o.status !== 'aberta').slice(-6);
	return [...closed, ...open];
}

/** Junta propostas novas às existentes sem repetir clube com proposta aberta. */
export function mergeOffers(current: JobOfferDetail[], incoming: JobOfferDetail[], season: number, round: number): JobOfferDetail[] {
	const openClubs = new Set(openOffers(current, season, round).map((o) => o.clubId));
	const seen = new Set(current.map((o) => o.id));
	const fresh = incoming.filter((o) => !openClubs.has(o.clubId) && !seen.has(o.id));
	return pruneOffers([...current, ...fresh], season, round);
}

/**
 * Quantas sondagens chegam numa janela, pelo momento do treinador. Uma janela pode passar sem
 * propostas: elas representam oportunidades, não uma obrigação de inventar interesse.
 */
export function windowInterest(seed: number, season: number, round: number, o: { reputation: number; confidence: number; position: number | null; size: number }): number {
	const rng = createRng(deriveSeed(seed, 'janela-tecnico', season, round));
	const share = o.position && o.size ? 1 - (o.position - 1) / Math.max(1, o.size - 1) : 0.5; // 1 = líder
	const score = o.reputation / 100 * 0.5 + share * 0.35 + (o.confidence >= 50 ? 0.1 : 0) + rng.next() * 0.35;
	return score >= 0.78 ? 3 : score >= 0.6 ? 2 : score >= 0.45 ? 1 : 0;
}

/** Enquanto sem clube: novas oportunidades surgem a cada poucas rodadas, nunca deixando a carreira presa. */
export function unemployedOfferDue(seed: number, season: number, round: number, lastOfferRound: number | null): boolean {
	const since = lastOfferRound === null ? 99 : round - lastOfferRound;
	if (since >= 6) return true; // garantia: no máximo 6 rodadas sem nenhuma oportunidade
	if (since < 3) return false;
	return createRng(deriveSeed(seed, 'desempregado', season, round)).next() < 0.55;
}

// ─────────────────────────────────────────────────────────────── renovação

export interface RenewalVerdict {
	approved: boolean;
	years: number;
	wageFactor: number;
	reasons: string[];
}

/**
 * Avaliação da diretoria para a renovação automática: confiança, resultado esportivo, objetivo,
 * saúde financeira e reputação. Recusa explícita do treinador sempre prevalece (tratada antes).
 */
export function renewalVerdict(o: { confidence: number; outcome: 'campeao' | 'acesso' | 'queda' | 'permanece'; objectiveMet: boolean | null; balance: number; monthlyWages: number; reputation: number; profile: string }): RenewalVerdict {
	const reasons: string[] = [];
	let score = o.confidence;
	if (o.outcome === 'campeao') { score += 15; reasons.push('título conquistado'); }
	else if (o.outcome === 'acesso') { score += 12; reasons.push('acesso conquistado'); }
	else if (o.outcome === 'queda') { score -= 25; reasons.push('rebaixamento'); }
	if (o.objectiveMet === true) { score += 8; reasons.push('objetivo da temporada cumprido'); }
	else if (o.objectiveMet === false) { score -= 10; reasons.push('objetivo da temporada não cumprido'); }
	const months = o.monthlyWages > 0 ? o.balance / o.monthlyWages : 12;
	if (months < 1) { score -= 10; reasons.push('caixa apertado para novos compromissos'); }
	else if (months > 6) { score += 3; reasons.push('finanças saudáveis'); }
	if (o.reputation >= 70) { score += 4; reasons.push('reputação alta do treinador'); }
	const threshold = o.profile === 'rigida' ? 66 : o.profile === 'ambiciosa' ? 62 : 58;
	const approved = score >= threshold;
	const years = !approved ? 0 : score >= threshold + 20 ? 3 : 2;
	const wageFactor = !approved ? 1 : o.outcome === 'campeao' || o.outcome === 'acesso' ? 1.12 : score >= threshold + 15 ? 1.06 : 1;
	return { approved, years, wageFactor, reasons };
}

/** Registro de saída do treinador (para o gabinete e o histórico). */
export function markUnemployed(office: OfficeState, season: number, round: number, reason: 'demitido' | 'fim-contrato'): OfficeState {
	return { ...office, unemployedSince: { season, round, reason }, autoRenewal: false, meeting: null, press: null, ultimatum: null };
}
