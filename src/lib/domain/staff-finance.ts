export type FinanceGrant = {
	mode: 'review' | 'direct';
	offers: boolean;
	contracts: boolean;
	maxFee: number;
	maxWage: number;
	maxYears: number;
};

export const DEFAULT_FINANCE_GRANT: FinanceGrant = {
	mode: 'review', offers: false, contracts: false, maxFee: 0, maxWage: 500, maxYears: 1
};

export type FinanceDraft = {
	id: string;
	author: string;
	authorName: string;
	club: string;
	player: string;
	date: string;
	command: FinancialCommand;
	status: 'pending' | 'approved' | 'declined' | 'cancelled';
};

export type FinancialCommand =
	| { action: 'deal'; target: string; player: string; fee: number }
	| { action: 'contract-deal'; id: string; wage: number; years: number; role: string }
	| { action: 'club'; request: {
		action: 'oferta' | 'renovar'; playerId: string; kind?: 'compra' | 'livre'; fee: number;
		wage: number; years: number; role: string;
	} };
