import type { Career } from '#lib/domain/career.ts';
import { sanitizeCoachKnowledge, type CoachKnowledge } from '#lib/domain/coach-knowledge.ts';
import type { StoredRoundResult } from '#lib/domain/league.ts';
import { careerView } from '#lib/domain/view.ts';

/**
 * Conhecimento que o treinador leva ao trocar de clube. Em saves anteriores à 2.0 ele ainda não
 * existia: nasce agora do domínio do clube que o treinador está deixando, para não se perder.
 */
export function carryKnowledge(career: Career, results: StoredRoundResult[]): CoachKnowledge | null {
	if (career.mode !== 'coach') return null;
	if (career.data.coachKnowledge) return sanitizeCoachKnowledge(career.data.coachKnowledge);
	return sanitizeCoachKnowledge(undefined, careerView(career, results).tactical);
}
