import type { MatchEvent, Side } from './types.ts';

/**
 * Narração em texto gerada a partir dos eventos da simulação.
 * Não inventa lances: cada frase corresponde a um evento registrado.
 */
export interface NarrationContext {
	name: (id?: string) => string;
	team: (side?: Side) => string;
	minute: (tick: number) => string;
}

export type NarrationTone = 'goal' | 'chance' | 'card' | 'info' | 'whistle';

export interface NarrationLine {
	tick: number;
	minute: string;
	text: string;
	tone: NarrationTone;
	side?: Side;
}

/** Frases variadas, escolhidas de forma determinística pelo tick (sem RNG extra). */
function pick(tick: number, options: string[]): string {
	return options[tick % options.length];
}

export function narrate(e: MatchEvent, ctx: NarrationContext): NarrationLine | null {
	const p = ctx.name(e.player);
	const o = ctx.name(e.other);
	const t = ctx.team(e.side);
	const base = { tick: e.tick, minute: ctx.minute(e.tick), side: e.side };
	const xg = typeof e.data?.xg === 'number' ? e.data.xg : 0;
	switch (e.type) {
		case 'kickoff':
			return { ...base, tone: 'whistle', text: 'Bola rolando! Começa a partida.' };
		case 'half_time':
			return { ...base, tone: 'whistle', text: 'Fim do primeiro tempo.' };
		case 'second_half':
			return { ...base, tone: 'whistle', text: 'Recomeça o jogo para o segundo tempo.' };
		case 'full_time':
			return { ...base, tone: 'whistle', text: 'Apita o árbitro: fim de jogo!' };
		case 'goal_disallowed':
			return { ...base, tone: 'whistle', text: `Gol anulado${e.data?.reason === 'impedimento' ? ' por impedimento' : ''}. ${p} balançou a rede e o placar permanece ${e.data?.score ?? 'inalterado'}.` };
		case 'goal':
			return {
				...base,
				tone: 'goal',
				text: e.data?.penalty
					? `GOOOL! ${p} cobra o pênalti e marca para o ${t}!`
					: e.other
						? `GOOOL do ${t}! ${p} balança a rede${pick(e.tick, [` após passe de ${o}`, `, servido por ${o}`, `; assistência de ${o}`])}!`
						: `GOOOL do ${t}! ${p} ${pick(e.tick, ['manda para o fundo da rede', 'não perdoa', 'marca um belo gol'])}!`
			};
		case 'shot':
			if ((xg < 0.3 && !e.data?.header) || e.data?.penalty) return null;
			return { ...base, tone: 'chance', text: e.data?.header ? `${p} sobe e cabeceia!` : `${p} ${pick(e.tick, ['finaliza', 'bate para o gol', 'arrisca'])} — chance clara!` };
		case 'shot_saved':
			return { ...base, tone: 'chance', text: `${pick(e.tick, ['Defende', 'Que defesa de', 'Espalma'])} ${p}!` };
		case 'shot_off':
			return { ...base, tone: 'info', text: `${p} ${pick(e.tick, ['manda para fora', 'erra o alvo', 'finaliza por cima'])}.` };
		case 'shot_blocked':
			return { ...base, tone: 'info', text: `${p} bloqueia a finalização de ${o}.` };
		case 'penalty':
			return { ...base, tone: 'chance', text: `Pênalti para o ${t}!` };
		case 'penalty_miss':
			return { ...base, tone: 'chance', text: `${p} desperdiça a cobrança!` };
		case 'yellow':
			return { ...base, tone: 'card', text: `Cartão amarelo para ${p}.` };
		case 'red':
			return { ...base, tone: 'card', text: e.data?.secondYellow ? `Segundo amarelo: ${p} está expulso!` : `Vermelho direto! ${p} está expulso.` };
		case 'injury':
			return { ...base, tone: 'info', text: `${p} sente uma lesão e recebe atendimento.` };
		case 'sub':
			return { ...base, tone: 'info', text: `Substituição no ${t}: entra ${p}, sai ${o}.` };
		case 'tactic':
			return { ...base, tone: 'info', text: `O ${t} muda a ${e.data?.kind === 'formation' ? 'formação' : e.data?.kind === 'style' ? 'forma de jogar' : 'mentalidade'}.` };
		case 'corner':
			return { ...base, tone: 'info', text: `Escanteio para o ${t}.` };
		case 'offside':
			return { ...base, tone: 'info', text: `Impedimento de ${p}.` };
		default:
			return null;
	}
}
