import type { Career } from './career.ts';
import { clubEconomy, stadiumCapacity } from './club.ts';
import { initialWageBudget, payroll } from './management.ts';
import { freeAgents, rosterOf, tierOfDivision, transferWindow } from './market.ts';
import type { CareerView } from './view.ts';
import { clubStateOf, rosterContext } from './world.ts';

/** Visão de gestão do clube (navegador e servidor calculam igual a partir do estado salvo). */
export function manageView(career: Career, view: CareerView) {
	const ctx = rosterContext(career, view.league);
	const savedClub = clubStateOf(career, view.league);
	const roster = rosterOf(ctx, career.clubId);
	const tier = tierOfDivision(view.division);
	const eco = clubEconomy(career.clubId, tier);
	const wages = payroll(roster);
	const club = savedClub.wageBudget ? savedClub : { ...savedClub, wageBudget: initialWageBudget(wages, eco.tvAnnual) };
	const sponsorsMonthly = club.sponsors.reduce((s, x) => s + x.monthly, 0);
	const monthlyIncome = eco.tvAnnual / 12 + sponsorsMonthly;
	return {
		ctx,
		club,
		market: ctx.market,
		roster,
		tier,
		eco,
		capacity: stadiumCapacity(eco.capacity, club.infra.estadio.level),
		window: view.seasonOver ? null : transferWindow(view.nextRound),
		payroll: wages,
		monthlyIncome,
		/** projeção simples do mês: receitas fixas − folha − estrutura aproximada */
		monthlyResult: monthlyIncome - wages,
		freeAgents: () => freeAgents(ctx)
	};
}

export type ManageView = ReturnType<typeof manageView>;
