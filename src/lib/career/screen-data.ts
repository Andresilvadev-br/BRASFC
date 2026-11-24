import type { Career } from '#lib/domain/career.ts';
import type { StoredRoundResult } from '#lib/domain/league.ts';
import type { ManageView } from '#lib/domain/manageview.ts';
import type { MatchSummary } from '#lib/domain/matchday.ts';
import type { OfficeView } from '#lib/domain/officeview.ts';
import type { CareerView } from '#lib/domain/view.ts';

/**
 * Dados de uma tela de carreira — os MESMOS na carreira offline (layout da rota) e na online
 * (projeção do treinador enviada pelo servidor da liga). As visões são calculadas no cliente pelas
 * mesmas funções (careerView, manageView, officeView).
 */
export interface CareerScreenData {
	career: Career;
	view: CareerView;
	manage: ManageView;
	office: OfficeView;
	results: StoredRoundResult[];
	recent: Array<{ home: string; away: string; summary: MatchSummary }>;
}
