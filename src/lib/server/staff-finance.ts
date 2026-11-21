import type { FinanceGrant, FinancialCommand } from '#lib/domain/staff-finance.ts';
import { ROLE_LABELS } from '#lib/domain/market.ts';

const amount = (value: unknown, min: number, max: number): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const objectOf = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
	? value as Record<string, unknown> : null;
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 100;
const validRole = (value: unknown): value is string => typeof value === 'string' && Object.hasOwn(ROLE_LABELS, value);

export function sanitizeFinanceGrant(value: unknown): FinanceGrant | null {
	const record = objectOf(value);
	if (!record) return null;
	const { mode, offers, contracts, maxFee, maxWage, maxYears } = record;
	if ((mode !== 'review' && mode !== 'direct') || typeof offers !== 'boolean' || typeof contracts !== 'boolean'
		|| !amount(maxFee, 0, 2e9) || !amount(maxWage, 500, 1e8) || !amount(maxYears, 1, 5)) return null;
	return { mode, offers, contracts, maxFee, maxWage, maxYears };
}

export function delegatedFinancialCommand(body: Record<string, unknown>, grant: FinanceGrant): FinancialCommand | null {
	if (body.action === 'deal' && grant.offers && id(body.target) && id(body.player) && amount(body.fee, 0, grant.maxFee)) {
		return { action: 'deal', target: body.target, player: body.player, fee: body.fee };
	}
	if (body.action === 'contract-deal' && grant.contracts && id(body.id) && amount(body.wage, 500, grant.maxWage)
		&& amount(body.years, 1, grant.maxYears) && validRole(body.role)) {
		return { action: 'contract-deal', id: body.id, wage: body.wage, years: body.years, role: body.role };
	}
	const request = body.action === 'club' ? objectOf(body.request) : null;
	if (!request) return null;
	const { action, kind, playerId, wage, years, role } = request;
	if (!id(playerId) || !amount(wage, 500, grant.maxWage) || !amount(years, 1, grant.maxYears) || !validRole(role)) return null;
	if (action === 'renovar' && grant.contracts) return { action: 'club', request: { action, playerId, wage, years, role, fee: 0 } };
	if (action !== 'oferta' || !grant.contracts || (kind === 'compra' && !grant.offers)) return null;
	const fee = kind === 'livre' ? 0 : request.fee;
	if ((kind !== 'compra' && kind !== 'livre') || !amount(fee, 0, grant.maxFee)) return null;
	return { action: 'club', request: { action, playerId, kind, wage, years, role, fee } };
}
