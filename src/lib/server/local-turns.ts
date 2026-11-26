import { randomUUID } from 'node:crypto';
import type { Career } from '#lib/domain/career.ts';
import { careerWorld } from '#lib/domain/career.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { sanitizeLeague } from '#lib/domain/league.ts';
import { makeOffer, ManagementError, sanitizeMarket, type LedgerLine } from '#lib/domain/management.ts';
import { currentClubOf, formatMoney, rosterOf, transferWindow } from '#lib/domain/market.ts';
import { clubOwner, localGroup, nextUnready, projectCoach, rebuildShared, type HumanDeal, type LocalGroup } from '#lib/domain/turns.ts';
import { careerView } from '#lib/domain/view.ts';
import { clubStateOf, rosterContext } from '#lib/domain/world.ts';
import type { Db } from './db/index.ts';
import { actionContext } from './management.ts';
import { replaceCareerData } from './repos/careers.ts';
import { insertLedger, insertMessages, insertTransfers } from './repos/management.ts';
import { listResults } from './repos/matches.ts';

/**
 * 0.13 LOCAL LEGACY — turnos e negociações entre treinadores humanos.
 * Tudo roda no jogo embutido do aplicativo (mesmo save local, sem rede): passar a vez e responder
 * propostas são gravações no save com controle de versão, então um clique duplo ou uma janela
 * reaberta nunca duplica uma transação.
 */
export class TurnError extends Error {
	constructor(message: string, readonly status = 422) {
		super(message);
	}
}

function requireGroup(career: Career): LocalGroup {
	const g = localGroup(career);
	if (!g) throw new TurnError('Esta carreira tem um treinador só.', 409);
	return g;
}

/**
 * "Ir para próxima partida": grava a preparação de quem está no controle e passa a vez ao próximo
 * treinador (ordem de criação). Quando todos já confirmaram, devolve `play: true` — o último treinador
 * libera a rodada e nada é simulado antes disso.
 */
export async function passTurn(db: Db, profileId: string, career: Career, version: number): Promise<{ career: Career; play: boolean; next: number | null }> {
	if (version !== career.version) throw new TurnError('A carreira mudou em outra janela. Recarregue para continuar.', 409);
	const g = requireGroup(career);
	if (g.deal?.status === 'aberta') throw new TurnError('Responda a negociação em andamento antes de passar a vez.', 409);
	const view = careerView(career, await listResults(db, career.id, career.season));
	const stepKey = view.step?.key ?? `fim:${career.season}`;
	const ready = g.step === stepKey ? g.ready : [];
	const me = g.coaches[g.active].id;
	const pending = { ...g, ready, step: stepKey };
	const next = nextUnready({ ...pending, ready: [...ready, me] }, g.active);
	if (next === null) return { career, play: true, next: null };
	const out = rebuildShared(career, {}, {}, { ready: [...new Set([...ready, me])], step: stepKey }, next);
	const saved = await replaceCareerData(db, profileId, career.id, out, career.version);
	return { career: saved, play: false, next };
}

const ROLES = new Set(['titular', 'rotacao', 'reserva', 'jovem']);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

/**
 * Proposta por um atleta de outro treinador humano: o controle passa ao treinador vendedor, que vê a
 * proposta e responde (aceitar, recusar ou contrapropor). As regras de mercado são as de sempre.
 */
export async function openDeal(db: Db, profileId: string, career: Career, body: Record<string, unknown>): Promise<{ career: Career; message: string; deal: HumanDeal }> {
	const g = requireGroup(career);
	if (g.deal?.status === 'aberta') throw new TurnError('Já existe uma negociação entre treinadores em andamento.', 409);
	const league = sanitizeLeague(career.data.league, careerWorld(career), career.season);
	const view = careerView(career, await listResults(db, career.id, career.season));
	if (view.seasonOver) throw new TurnError('Temporada encerrada: inicie a próxima para negociar.', 409);
	if (!transferWindow(view.nextRound)) throw new TurnError('A janela de transferências está fechada.');
	const kind = body.kind === 'emprestimo' ? 'emprestimo' : body.kind === 'compra' ? 'compra' : null;
	if (!kind) throw new TurnError('Entre treinadores, a proposta é de compra ou de empréstimo.');
	const role = String(body.role);
	if (!ROLES.has(role)) throw new TurnError('Participação inválida.');
	const fee = kind === 'compra' ? Math.round(num(body.fee)) : 0;
	const wage = kind === 'compra' ? Math.round(num(body.wage)) : 0;
	const years = num(body.years);
	const wageShare = kind === 'emprestimo' ? num(body.wageShare) : 1;
	if (!Number.isFinite(fee) || fee < 0 || fee > 2e9) throw new TurnError('Valor da proposta inválido.');
	if (kind === 'compra' && (!Number.isFinite(wage) || wage < 500 || wage > 1e8)) throw new TurnError('Salário inválido.');
	if (!Number.isInteger(years) || years < 1 || years > 5) throw new TurnError('Duração inválida (1 a 5 temporadas).');
	if (!Number.isFinite(wageShare) || wageShare < 0 || wageShare > 1) throw new TurnError('Divisão de salário inválida.');
	const roster = rosterContext(career, league);
	const playerId = String(body.playerId ?? '');
	const owner = currentClubOf(roster, playerId);
	const seller = owner ? clubOwner(career, owner) : -1;
	if (seller < 0) throw new TurnError('Este atleta não pertence a outro treinador.');
	if (seller === g.active) throw new TurnError('O atleta já é do seu clube.');
	const sellerView = projectCoach(career, seller);
	const player = rosterOf(roster, sellerView.clubId).find((p) => p.id === playerId);
	if (!player) throw new TurnError('Atleta não encontrado.');
	if (player.loan) throw new TurnError('Atleta emprestado: não pode ser negociado agora.');
	const myClub = clubStateOf(career, league);
	if (myClub.board.dismissed) throw new TurnError('Você não comanda mais o clube.');
	if (fee > myClub.transferBudget || fee > Math.max(0, myClub.balance)) throw new TurnError(`Valor acima do orçamento disponível (${formatMoney(Math.min(myClub.transferBudget, Math.max(0, myClub.balance)))}).`);
	if (rosterOf(roster, career.clubId).length >= 34) throw new TurnError('Elenco cheio (máximo de 34 atletas).');
	const deal: HumanDeal = {
		id: randomUUID(), playerId, playerName: player.name, buyer: g.active, seller, sellerClub: sellerView.clubId, buyerClub: career.clubId,
		kind, fee, wage, years, role: role as HumanDeal['role'], wageShare, turn: seller, initiator: g.active,
		history: [{ by: g.active, action: 'proposta', fee }], status: 'aberta', season: career.season, round: view.nextRound
	};
	const out = rebuildShared(career, {}, {}, { deal, dealResult: null }, seller);
	const saved = await replaceCareerData(db, profileId, career.id, out, career.version);
	return { career: saved, deal, message: `Proposta enviada. ${g.coaches[seller].personName} (${getClub(deal.sellerClub)?.name ?? deal.sellerClub}) assume o controle para responder.` };
}

/**
 * Resposta de quem está com a vez na negociação: aceitar, recusar ou contrapropor (valor livre).
 * Ao terminar, o controle volta para quem iniciou, com o turno e a preparação dele preservados.
 */
export async function answerDeal(db: Db, profileId: string, career: Career, body: Record<string, unknown>): Promise<{ career: Career; message: string; deal: HumanDeal }> {
	const g = requireGroup(career);
	const deal = g.deal;
	const version = Number(body.version);
	if (version !== career.version) throw new TurnError('A carreira mudou em outra janela. Recarregue para continuar.', 409);
	if (!deal || deal.status !== 'aberta' || deal.id !== body.dealId) throw new TurnError('Esta negociação já terminou.', 409);
	if (deal.turn !== g.active) throw new TurnError('Não é a sua vez de responder esta negociação.', 409);
	const other = g.active === deal.buyer ? deal.seller : deal.buyer;
	// `choice` (rota de turnos) ou `action` (chamada direta)
	const action = body.choice ?? body.action;
	if (action === 'contraproposta') {
		const fee = Math.round(num(body.fee));
		if (deal.kind !== 'compra') throw new TurnError('Empréstimos não têm valor de transferência: aceite ou recuse.');
		if (!Number.isFinite(fee) || fee < 0 || fee > 2e9) throw new TurnError('Valor da contraproposta inválido.');
		if (fee === deal.fee) throw new TurnError('A contraproposta precisa mudar o valor.');
		const next: HumanDeal = { ...deal, fee, turn: other, history: [...deal.history, { by: g.active, action: 'contraproposta', fee }] };
		const saved = await replaceCareerData(db, profileId, career.id, rebuildShared(career, {}, {}, { deal: next }, other), career.version);
		return { career: saved, deal: next, message: `Contraproposta de ${formatMoney(fee)} enviada a ${g.coaches[other].personName}.` };
	}
	if (action === 'recusar') {
		const closed: HumanDeal = { ...deal, status: 'recusada', history: [...deal.history, { by: g.active, action: 'recusada', fee: deal.fee }], message: `${g.coaches[g.active].personName} recusou a negociação por ${deal.playerName}.` };
		const saved = await replaceCareerData(db, profileId, career.id, rebuildShared(career, {}, {}, { deal: null, dealResult: closed }, deal.initiator), career.version);
		return { career: saved, deal: closed, message: closed.message! };
	}
	if (action !== 'aceitar') throw new TurnError('Resposta desconhecida.', 400);
	return executeDeal(db, profileId, career, g, deal);
}

/** Conclui a transferência acordada: uma única gravação (mercado, os dois clubes, lançamentos e histórico). */
async function executeDeal(db: Db, profileId: string, career: Career, g: LocalGroup, deal: HumanDeal) {
	const league = sanitizeLeague(career.data.league, careerWorld(career), career.season);
	const buyer = projectCoach(career, deal.buyer);
	const seller = projectCoach(career, deal.seller);
	const results = await listResults(db, career.id, career.season);
	const view = careerView(buyer, results);
	const roster = rosterContext(buyer, league);
	const sellerRoster = rosterOf(roster, deal.sellerClub);
	const history = [...deal.history, { by: g.active, action: 'aceita' as const, fee: deal.fee }];
	const finish = async (patches: Record<number, Partial<Career['data']>>, world: Partial<Career['data']>, closed: HumanDeal, ledgers: Array<[string | null, LedgerLine[]]>, transfers: Parameters<typeof insertTransfers>[4]) => {
		const out = rebuildShared(career, patches, world, { deal: null, dealResult: closed }, deal.initiator);
		const key = `${career.season}:negociacao:${deal.id}`;
		const saved = await db.transaction(async (tx) => {
			const s = await replaceCareerData(tx, profileId, career.id, out, career.version);
			for (const [coach, lines] of ledgers) await insertLedger(tx, career.id, career.season, career.gameDate, lines, key, coach);
			await insertTransfers(tx, career.id, career.season, career.gameDate, transfers, `${key}:t`);
			const note = { sender: 'Departamento de futebol', subject: `Negociação: ${deal.playerName}`, body: closed.message ?? '', important: true };
			await insertMessages(tx, career.id, career.gameDate, [note], g.coaches[deal.buyer].id);
			await insertMessages(tx, career.id, career.gameDate, [note], g.coaches[deal.seller].id);
			return s;
		});
		return { career: saved, deal: closed, message: closed.message ?? '' };
	};
	const fail = (message: string) => finish({}, {}, { ...deal, status: 'recusada', history, message }, [], []);
	if (!sellerRoster.some((p) => p.id === deal.playerId)) return fail(`${deal.playerName} não está mais no elenco do ${getClub(deal.sellerClub)?.name ?? 'clube'}.`);
	if (sellerRoster.length <= 16) return fail('O elenco vendedor ficaria com menos de 16 atletas.');
	const ctx = actionContext(buyer, league, roster, view.nextRound);
	let out;
	try {
		out = makeOffer(clubStateOf(buyer, league), sanitizeMarket(career.data.market), ctx, { playerId: deal.playerId, kind: deal.kind, fee: deal.fee, wage: deal.wage, years: deal.years, role: deal.role, wageShare: deal.wageShare }, undefined, deal.sellerClub);
	} catch (e) {
		if (e instanceof ManagementError) return fail(`Negociação cancelada: ${e.message}`);
		throw e;
	}
	// O atleta ainda decide (salário, papel no elenco): a recusa dele encerra a negociação.
	if (!out.negotiation?.done) return fail(out.message);
	const sellerClub = clubStateOf(seller, league);
	const sale: LedgerLine[] = deal.fee ? [{ category: 'transferencias', amount: deal.fee, description: `Venda de ${deal.playerName}` }] : [];
	// Mesma regra da venda para a IA: o valor entra no caixa e metade volta ao orçamento de contratações.
	const sellerOut = { ...sellerClub, balance: sellerClub.balance + deal.fee, transferBudget: sellerClub.transferBudget + Math.round(deal.fee * 0.5) };
	const market = { ...out.market, listed: out.market.listed.filter((x) => x !== deal.playerId) };
	const closed: HumanDeal = { ...deal, status: 'concluida', history, message: deal.kind === 'emprestimo' ? `${deal.playerName} vai emprestado ao ${getClub(deal.buyerClub)?.name ?? ''} até o fim de ${career.season}.` : `${deal.playerName} foi vendido ao ${getClub(deal.buyerClub)?.name ?? ''} por ${formatMoney(deal.fee)}.` };
	return finish(
		{ [deal.buyer]: { club: out.club }, [deal.seller]: { club: sellerOut } },
		{ market },
		closed,
		[[g.coaches[deal.buyer].id, out.ledger], [g.coaches[deal.seller].id, sale]],
		out.transfers
	);
}

/** O treinador que iniciou viu o desfecho da negociação. */
export async function dismissDealResult(db: Db, profileId: string, career: Career, version: number): Promise<Career> {
	if (version !== career.version) throw new TurnError('A carreira mudou em outra janela. Recarregue para continuar.', 409);
	const g = requireGroup(career);
	if (!g.dealResult) return career;
	return replaceCareerData(db, profileId, career.id, rebuildShared(career, {}, {}, { dealResult: null }, g.active), career.version);
}
