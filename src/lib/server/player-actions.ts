import { playerOffers, type PlayerCareerState } from '#lib/domain/careerlife.ts';
import type { Career } from '#lib/domain/career.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { diffDays, isIsoDate } from '#lib/domain/dates.ts';
import { divisionOf } from '#lib/domain/league.ts';
import { ManagementError } from '#lib/domain/management.ts';
import { expectedWage, formatMoney, roundMoney, tierOfDivision, transferWindow } from '#lib/domain/market.ts';
import { adjustedOverall, bounded, individualSponsor, playerState, PRESS_ANSWERS, trainBlock } from '#lib/domain/player-development.ts';
import { isPlayerFocus, isPlayerFocusForPosition } from '#lib/domain/training.ts';
import type { CareerView } from '#lib/domain/view.ts';

export function applyPlayerAction(c: Career, v: CareerView, body: Record<string, unknown>) {
	const state = playerState(c, v.division);
	if (c.mode !== 'player' || !state || !c.data.player || !c.data.position) throw new ManagementError('Ação exclusiva da carreira de jogador.');
	const d = state.daily;
	const action = body.action;
	const marketOpen = !v.seasonOver && !!transferWindow(v.nextRound);
	let clubId: string | undefined;
	let movement: 'compra' | 'emprestimo' | 'renovacao' | undefined;
	let message: string;

	switch (action) {
		case 'jogador-treinar': {
			if (!isIsoDate(body.date) || !isPlayerFocus(body.focus)) throw new ManagementError('Escolha uma data e um foco de treino.');
			if (!isPlayerFocusForPosition(body.focus, c.data.position)) throw new ManagementError('Treino incompatível com a posição.');
			const blocked = trainBlock(body.date, c.gameDate, v.clubFixtures.map((f) => f.date), state, v.step?.date ?? null);
			if (blocked) throw new ManagementError(blocked);
			d.drills = [...d.drills, { date: body.date, focus: body.focus }].sort((a, b) => a.date.localeCompare(b.date));
			message = 'Sessão individual marcada.';
			break;
		}
		case 'jogador-cancelar-treino':
			if (!isIsoDate(body.date) || body.date < c.gameDate || !d.drills.some((drill) => drill.date === body.date)) throw new ManagementError('Sessão indisponível.');
			d.drills = d.drills.filter((drill) => drill.date !== body.date);
			message = 'Sessão cancelada.';
			break;
		case 'jogador-entrevista': {
			if (!d.press || d.press.date !== body.date || typeof body.choice !== 'string' || !Object.hasOwn(PRESS_ANSWERS, body.choice)) throw new ManagementError('Entrevista indisponível.');
			const response = PRESS_ANSWERS[body.choice as keyof typeof PRESS_ANSWERS];
			d.trust = bounded(d.trust + response.trust);
			d.support.squad = bounded(d.support.squad + response.squad);
			d.support.fans = bounded(d.support.fans + response.fans);
			state.reputation = Math.max(1, bounded(state.reputation + response.reputation));
			d.lastPress = c.gameDate;
			d.press = null;
			message = response.result;
			break;
		}
		case 'jogador-sondar': {
			const kind = body.kind;
			if ((kind !== 'compra' && kind !== 'emprestimo') || !marketOpen || d.loan) throw new ManagementError('Sondagens disponíveis apenas na janela e fora de empréstimo.');
			if (d.lastSearch && diffDays(d.lastSearch, c.gameDate) < 14) throw new ManagementError('O empresário precisa de duas semanas entre sondagens.');
			d.lastSearch = c.gameDate;
			const avg = d.form.length ? d.form.reduce((a, b) => a + b, 0) / d.form.length : 6.3;
			const found = playerOffers(c.seed, c.season, v.nextRound, state, { ...c.data.player, overall: adjustedOverall(c, state) }, avg, c.clubId, v.league.divisions as Record<string, string[]>, (club) => divisionOf(v.league, club), kind);
			state.offers = [...state.offers.filter((o) => o.season === c.season && o.expiresRound >= v.nextRound), ...found].slice(-3);
			d.support.agent = bounded(d.support.agent + (found.length ? 3 : 0));
			message = found.length ? 'Seu empresário trouxe uma proposta.' : 'Nenhum clube novo demonstrou interesse.';
			break;
		}
		case 'jogador-contraproposta':
		case 'jogador-aceitar':
		case 'jogador-recusar': {
			const offer = state.offers.find((o) => o.id === body.offerId);
			if (!offer || offer.season !== c.season || offer.expiresRound < v.nextRound) throw new ManagementError('Proposta indisponível ou expirada.');
			if (action === 'jogador-recusar') {
				state.offers = state.offers.filter((o) => o.id !== offer.id);
				d.support.agent = bounded(d.support.agent - 2);
				message = 'Proposta recusada.';
				break;
			}
			if (!marketOpen || d.loan || !divisionOf(v.league, offer.clubId)) throw new ManagementError('Proposta indisponível nesta janela.');
			if (action === 'jogador-contraproposta') {
				if (offer.countered || offer.kind === 'emprestimo') throw new ManagementError('As condições desta proposta já estão definidas.');
				offer.countered = true;
				const increase = d.support.agent >= 65 && state.reputation >= 35 ? 0.10 : d.support.agent >= 45 ? 0.05 : 0;
				offer.wage = roundMoney(offer.wage * (1 + increase));
				message = increase ? 'O clube aceitou melhorar o salário.' : 'O clube manteve a proposta original.';
				break;
			}
			clubId = offer.clubId;
			movement = offer.kind ?? 'compra';
			if (movement === 'emprestimo') {
				if (state.contract.until <= c.season) throw new ManagementError('O contrato de origem termina antes do retorno.');
				d.loan = { parent: c.clubId, until: c.season };
			} else {
				state.contract = { wage: offer.wage, until: c.season + offer.years - 1, role: offer.role };
			}
			d.clubs = [...d.clubs, { clubId, date: c.gameDate, kind: movement }];
			d.drills = d.drills.filter((drill) => drill.date < c.gameDate);
			d.trust = offer.role === 'titular' ? 61 : 48;
			d.support = { ...d.support, squad: 50, fans: 50, agent: bounded(d.support.agent + 5) };
			d.press = null;
			d.renewal = null;
			state.offers = [];
			message = `${movement === 'emprestimo' ? 'Empréstimo' : 'Contrato'} assinado com ${getClub(clubId)?.name ?? clubId}.`;
			break;
		}
		case 'jogador-negociar': {
			const years = body.years;
			if (d.loan || state.contract.until > c.season + 1 || d.trust < 35 || (years !== 2 && years !== 3)) throw new ManagementError('O clube só negocia renovação perto do vencimento, com confiança de pelo menos 35.');
			const base = expectedWage(adjustedOverall(c, state), tierOfDivision(v.division), c.data.player.age);
			const wage = roundMoney(Math.max(state.contract.wage, base) * (0.91 + d.trust / 500 + (years === 2 ? 0.04 : 0)));
			if (c.season + years - 1 <= state.contract.until) throw new ManagementError('Escolha um prazo que estenda o vínculo.');
			d.renewal = { wage, years };
			message = `O clube propôs ${formatMoney(wage)} ao mês por ${years} temporadas.`;
			break;
		}
		case 'jogador-renovar':
			if (!d.renewal || d.loan) throw new ManagementError('Renovação indisponível.');
			state.contract = { ...state.contract, wage: d.renewal.wage, until: c.season + d.renewal.years - 1 };
			d.renewal = null;
			movement = 'renovacao';
			message = 'Renovação assinada.';
			break;
		case 'jogador-patrocinio': {
			const sponsor = individualSponsor(c, state);
			if (!sponsor) throw new ManagementError('Nenhuma proposta de patrocínio individual disponível.');
			d.sponsor = sponsor;
			message = `Contrato de imagem firmado com ${sponsor.brand}.`;
			break;
		}
		default:
			throw new ManagementError('Ação de jogador inválida.');
	}
	return { state, clubId, movement, message } satisfies { state: PlayerCareerState; clubId?: string; movement?: string; message: string };
}
