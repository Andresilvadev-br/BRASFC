import { COACH_PROFILES } from '#lib/engine/ai-coach.ts';
import { presetInstructions } from '#lib/engine/instructions.ts';
import { roleCompatibility, ROLES, type RoleId } from '#lib/engine/roles.ts';
import { clubCoach } from './coaches.ts';
import { getClub } from './clubs.ts';
import type { MatchSummary } from './matchday.ts';
import { positionFit } from './positions.ts';
import type { SquadPlayer } from './squad.ts';
import { similarity, type TacticalState } from './tactical.ts';
import { autoLineup, FORMATION_IDS, FORMATIONS, lineupFamiliarity, type FormationId, type Tactic } from './tactics.ts';

/**
 * Auxiliar técnico (Dev 0.3): recomendações explicáveis, todas calculadas a partir de
 * dados do jogo (atributos, domínio tático, condição física, partidas anteriores e o
 * perfil público do próximo adversário). Nenhuma mensagem é sorteada.
 */
export type TipKind = 'formacao' | 'posicao' | 'funcao' | 'dominio' | 'defesa' | 'ataque' | 'fisico' | 'adversario';

export interface Tip {
	id: string;
	kind: TipKind;
	priority: number;
	title: string;
	text: string;
	/** dados que sustentam a recomendação */
	evidence: string[];
	action?:
		| { type: 'formation'; formation: FormationId }
		| { type: 'role'; slot: number; role: RoleId }
		| { type: 'training' }
		| { type: 'tactics' };
}

export interface AssistantInput {
	squad: SquadPlayer[];
	tactic: Tactic & { roles: RoleId[] };
	tactical: TacticalState;
	fitness: Record<string, number>;
	recent: Array<{ summary: MatchSummary; home: string; away: string }>;
	clubId: string;
	nextOpponent: string | null;
	careerSeed: number;
	season: number;
	firstSeason: number;
	dismissed?: string[];
}

const pct = (v: number) => `${Math.round(v)}`;

export function analyze(input: AssistantInput): Tip[] {
	const tips: Tip[] = [];
	const byId = new Map(input.squad.map((p) => [p.id, p]));
	const t = input.tactic;
	const slots = FORMATIONS[t.formation];

	// 1. Formação mais adequada ao elenco (encaixe de posições + o que o time já domina).
	const score = (f: FormationId) => lineupFamiliarity(f, autoLineup(f, input.squad), input.squad) * 0.6 + (input.tactical.formations[f] ?? 20) * 0.4;
	const current = score(t.formation);
	const best = [...FORMATION_IDS].sort((a, b) => score(b) - score(a))[0];
	if (best !== t.formation && score(best) - current >= 6) {
		const fitBest = lineupFamiliarity(best, autoLineup(best, input.squad), input.squad);
		const fitCur = lineupFamiliarity(t.formation, t.lineup, input.squad);
		tips.push({
			id: `formacao:${best}`,
			kind: 'formacao',
			priority: 60,
			title: `O elenco encaixa melhor no ${best}`,
			text: `As posições dos seus atletas se encaixam melhor no ${best}. ${similarity(best, t.formation) >= 0.6 ? `Como é parecido com o ${t.formation}, parte do que o time aprendeu é aproveitada.` : 'Trocar exige tempo: o domínio começa mais baixo.'}`,
			evidence: [`encaixe ${pct(fitBest)} × ${pct(fitCur)} no ${t.formation}`, `domínio ${pct(input.tactical.formations[best])} × ${pct(input.tactical.formations[t.formation])}`],
			action: { type: 'formation', formation: best }
		});
	}

	// 2. Atletas fora de posição.
	slots.forEach((slot, i) => {
		const p = byId.get(t.lineup[i]);
		if (!p) return;
		const fit = positionFit(p.position, slot.position);
		if (fit < 0.8) {
			tips.push({
				id: `posicao:${p.id}:${slot.position}`,
				kind: 'posicao',
				priority: 70 - fit * 20,
				title: `${p.shortName} está fora de posição`,
				text: `${p.name} é ${p.position} e está jogando de ${slot.position}. Ele rende menos e decide pior nessa função.`,
				evidence: [`encaixe na posição ${Math.round(fit * 100)}%`],
				action: { type: 'tactics' }
			});
		}
	});

	// 3. Funções com maior compatibilidade.
	slots.forEach((slot, i) => {
		const p = byId.get(t.lineup[i]);
		if (!p) return;
		const cur = roleCompatibility(p.attributes, t.roles[i], slot.position);
		const options = Object.values(ROLES).filter((r) => r.positions.includes(slot.position));
		const top = options.map((r) => ({ r, c: roleCompatibility(p.attributes, r.id, slot.position) })).sort((a, b) => b.c - a.c)[0];
		if (top && top.r.id !== t.roles[i] && top.c - cur >= 15) {
			const keys = Object.keys(top.r.key).slice(0, 2) as Array<keyof typeof p.attributes>;
			tips.push({
				id: `funcao:${p.id}:${top.r.id}`,
				kind: 'funcao',
				priority: 40 + (top.c - cur) / 2,
				title: `${p.shortName} combina mais com ${top.r.label}`,
				text: `${top.r.summary} ${p.shortName} tem ${keys.map((k) => `${k} ${p.attributes[k]}`).join(' e ')}.`,
				evidence: [`compatibilidade ${top.c} × ${cur} em ${ROLES[t.roles[i]].label}`],
				action: { type: 'role', slot: i, role: top.r.id }
			});
		}
	});

	// 4. Falta de familiaridade tática.
	const fDom = input.tactical.formations[t.formation] ?? 20;
	const sDom = input.tactical.styles[t.style] ?? 20;
	if (fDom < 45 || sDom < 40) {
		tips.push({
			id: `dominio:${t.formation}:${t.style}:${Math.floor(fDom / 10)}`,
			kind: 'dominio',
			priority: 55,
			title: 'O time ainda está aprendendo o sistema',
			text: `Manter o ${t.formation} por várias rodadas e treinar formação e estilo acelera o domínio. Trocar de esquema agora atrasaria esse processo.`,
			evidence: [`domínio da formação ${pct(fDom)}`, `domínio do estilo ${pct(sDom)}`],
			action: { type: 'training' }
		});
	}

	// 5–7. Problemas observados nas últimas partidas.
	const last = input.recent.slice(-3);
	if (last.length) {
		const sideOf = (m: (typeof last)[number]) => m.summary.mySide ?? (m.home === input.clubId ? 'home' : 'away');
		const other = (s: 'home' | 'away') => (s === 'home' ? 'away' : 'home');
		const avg = (f: (m: (typeof last)[number]) => number) => last.reduce((s, m) => s + f(m), 0) / last.length;
		const shotsAgainst = avg((m) => m.summary.stats[other(sideOf(m))].shots);
		const shotsFor = avg((m) => m.summary.stats[sideOf(m)].shots);
		const conceded = avg((m) => m.summary.stats[other(sideOf(m))].goals);
		if (shotsAgainst >= 15 || conceded >= 2) {
			tips.push({
				id: `defesa:${last.length}:${Math.round(shotsAgainst)}`,
				kind: 'defesa',
				priority: 65,
				title: 'A defesa está muito exposta',
				text: 'Nos últimos jogos o adversário finalizou demais. Um bloco mais compacto ou laterais mais contidos reduzem o espaço.',
				evidence: [`${shotsAgainst.toFixed(1)} finalizações sofridas por jogo`, `${conceded.toFixed(1)} gols sofridos por jogo`],
				action: { type: 'tactics' }
			});
		}
		if (shotsFor <= 8) {
			tips.push({
				id: `ataque:${last.length}:${Math.round(shotsFor)}`,
				kind: 'ataque',
				priority: 50,
				title: 'Pouca chegada ao ataque',
				text: 'O time finaliza pouco. Mais presença na área ou movimentos em profundidade ajudam — desde que os atacantes tenham velocidade para isso.',
				evidence: [`${shotsFor.toFixed(1)} finalizações por jogo`],
				action: { type: 'tactics' }
			});
		}
	}

	// 6. Cansaço dos titulares.
	const tired = t.lineup.map((id) => byId.get(id)).filter((p): p is SquadPlayer => !!p && (input.fitness[p.id] ?? 95) < 72);
	if (tired.length) {
		tips.push({
			id: `fisico:${tired.map((p) => p.id).join(',')}`,
			kind: 'fisico',
			priority: 62 + tired.length * 3,
			title: `${tired.length} titular(es) cansado(s)`,
			text: `${tired.map((p) => `${p.shortName} (${Math.round(input.fitness[p.id])}%)`).join(', ')}. Considere poupar ou aliviar a carga de treino desta semana.`,
			evidence: tired.map((p) => `${p.shortName}: ${Math.round(input.fitness[p.id])}%`),
			action: { type: 'training' }
		});
	}

	// 8. Próximo adversário (perfil público do treinador + nossas armas).
	if (input.nextOpponent) {
		const coach = clubCoach(input.careerSeed, input.nextOpponent, input.season, input.firstSeason);
		const prof = COACH_PROFILES[coach.profile.id];
		const ins = presetInstructions(prof.mentality, prof.style);
		const name = getClub(input.nextOpponent)?.name ?? input.nextOpponent;
		const wingers = t.lineup.map((id) => byId.get(id)).filter((p): p is SquadPlayer => !!p && ['PD', 'PE', 'ATA'].includes(p.position));
		const pace = wingers.length ? wingers.reduce((s, p) => s + p.attributes.velocidade, 0) / wingers.length : 0;
		let text = '';
		if (ins.pressao >= 4) text = `O ${name} pressiona alto. Uma saída mais direta e atacantes rápidos podem achar espaço às costas.`;
		else if (ins.laterais === 3) text = `O ${name} sobe muito os laterais.${pace >= 68 ? ' Seus atacantes rápidos podem explorar os espaços na transição.' : ' Contra-ataques pelos lados podem render.'}`;
		else if (ins.bloco === 1 || ins.linha <= 2) text = `O ${name} costuma se fechar atrás. Amplitude e paciência ajudam a abrir a defesa.`;
		else if (ins.linha >= 4) text = `O ${name} joga com a linha alta.${pace >= 68 ? ' Movimentos em profundidade podem funcionar com seus atacantes.' : ''}`;
		else text = `O ${name} joga de forma equilibrada; o domínio do seu próprio sistema tende a pesar mais.`;
		tips.push({
			id: `adversario:${input.nextOpponent}:${input.season}`,
			kind: 'adversario',
			priority: 58,
			title: `Próximo adversário: ${name}`,
			text,
			evidence: [`perfil do técnico: ${prof.label}${coach.changed ? ' (técnico novo nesta temporada)' : ''}`, `velocidade média do seu ataque: ${Math.round(pace)}`],
			action: { type: 'tactics' }
		});
	}

	const dismissed = new Set(input.dismissed ?? []);
	return tips.filter((x) => !dismissed.has(x.id)).sort((a, b) => b.priority - a.priority);
}
