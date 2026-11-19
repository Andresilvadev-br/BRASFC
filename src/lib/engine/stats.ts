import { roleGroup } from './attributes.ts';
import type { Match } from './match.ts';
import type { MatchEvent, MatchResult, PlayerStats, Side, TeamStats } from './types.ts';

/**
 * Todas as estatísticas são DERIVADAS do registro de eventos da simulação.
 * Nada é contado "por fora": se não houve evento, não há estatística.
 */
export function emptyTeamStats(): TeamStats {
	return {
		goals: 0, shots: 0, shotsOnTarget: 0, xg: 0, passes: 0, passesCompleted: 0, possessionTicks: 0,
		corners: 0, fouls: 0, offsides: 0, yellows: 0, reds: 0, subs: 0, tackles: 0, interceptions: 0
	};
}

export function emptyPlayerStats(): PlayerStats {
	return {
		minutes: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, passes: 0, passesCompleted: 0, keyPasses: 0,
		dribbles: 0, dribblesFailed: 0, tackles: 0, interceptions: 0, clearances: 0, aerialsWon: 0, foulsCommitted: 0,
		foulsWon: 0, saves: 0, goalsConceded: 0, yellow: 0, red: 0, offsides: 0, errorsLeadingToGoal: 0, rating: 6, condition: 100
	};
}

const OTHER: Record<Side, Side> = { home: 'away', away: 'home' };

export function teamStatsFromEvents(events: MatchEvent[]): Record<Side, TeamStats> {
	const t = { home: emptyTeamStats(), away: emptyTeamStats() };
	for (const e of events) {
		if (!e.side) continue;
		const s = t[e.side];
		switch (e.type) {
			case 'goal': s.goals++; s.shotsOnTarget++; break;
			case 'shot': s.shots++; s.xg += Number(e.data?.xg ?? 0); break;
			case 'shot_saved': t[OTHER[e.side]].shotsOnTarget++; break;
			case 'pass': s.passes++; s.passesCompleted++; break;
			case 'pass_fail': s.passes++; break;
			case 'corner': s.corners++; break;
			case 'foul': s.fouls++; break;
			case 'offside': s.offsides++; break;
			case 'yellow': s.yellows++; break;
			case 'red': s.reds++; break;
			case 'sub': s.subs++; break;
			case 'tackle': s.tackles++; break;
			case 'interception': s.interceptions++; break;
		}
	}
	for (const side of ['home', 'away'] as const) t[side].xg = Math.round(t[side].xg * 100) / 100;
	return t;
}

/** Intervalos em campo de cada atleta, a partir do estado final da partida. */
function intervals(m: Match): Map<string, [number, number]> {
	const out = new Map<string, [number, number]>();
	for (const s of m.states.values()) out.set(s.id, [s.minutesIn, s.minuteOut ?? m.tick]);
	return out;
}

export function playerStatsFromEvents(m: Match): Record<string, PlayerStats> {
	const stats: Record<string, PlayerStats> = {};
	const span = intervals(m);
	const get = (id?: string) => (id ? (stats[id] ??= emptyPlayerStats()) : null);
	for (const [id, [a, b]] of span) {
		const p = get(id)!;
		p.minutes = Math.max(0, Math.round((b - a) / 60));
		p.condition = Math.round(m.states.get(id)!.condition);
	}
	for (const e of m.events) {
		const p = get(e.player);
		switch (e.type) {
			case 'goal': {
				p!.goals++;
				p!.shotsOnTarget++;
				const assist = get(e.data?.assist as string | undefined);
				if (assist) assist.assists++;
				const err = get(e.data?.error as string | undefined);
				if (err) err.errorsLeadingToGoal++;
				// Gols sofridos por quem estava em campo do outro lado
				for (const [id, [a, b]] of span) {
					const st = m.states.get(id)!;
					if (st.side !== e.side && e.tick >= a && e.tick <= b) stats[id].goalsConceded++;
				}
				break;
			}
			case 'shot': {
				p!.shots++;
				const kp = get(e.data?.keyPassFrom as string | undefined);
				if (kp) kp.keyPasses++;
				break;
			}
			case 'shot_saved': {
				if (p) p.saves++;
				const shooter = get(e.other);
				if (shooter) shooter.shotsOnTarget++;
				break;
			}
			case 'pass': p!.passes++; p!.passesCompleted++; break;
			case 'pass_fail': p!.passes++; break;
			case 'dribble': p!.dribbles++; break;
			case 'dribble_fail': p!.dribblesFailed++; break;
			case 'tackle': p!.tackles++; break;
			case 'interception': p!.interceptions++; break;
			case 'clearance': p!.clearances++; break;
			case 'aerial': if (p) p.aerialsWon++; break;
			case 'foul': {
				p!.foulsCommitted++;
				const v = get(e.other);
				if (v) v.foulsWon++;
				break;
			}
			case 'yellow': p!.yellow++; break;
			case 'red': p!.red++; break;
			case 'offside': p!.offsides++; break;
		}
	}
	for (const [id, s] of Object.entries(stats)) {
		const info = m.player(id)!;
		s.rating = rate(s, info.position);
	}
	return stats;
}

/**
 * Nota de 3,0 a 10,0 a partir da atuação: parte de 6,0 e soma/subtrai pelo que o
 * atleta fez, com pesos por função (um desarme vale mais para um zagueiro; uma
 * defesa difícil, para o goleiro). Não há bônus automático por vitória.
 */
export function rate(s: PlayerStats, position: Parameters<typeof roleGroup>[0]): number {
	if (s.minutes === 0) return 6;
	const g = roleGroup(position);
	const def = g === 'ZAG' || g === 'LAT' || g === 'VOL';
	const gk = g === 'GOL';
	let r = 6.0;
	r += s.goals * (g === 'ATA' ? 1.0 : 1.25);
	r += s.assists * 0.7;
	r += s.keyPasses * 0.12;
	r += (s.shotsOnTarget - s.goals) * 0.08 - (s.shots - s.shotsOnTarget) * 0.04;
	r += s.passesCompleted * (g === 'MC' || g === 'MEI' || g === 'VOL' ? 0.004 : 0.003);
	r -= (s.passes - s.passesCompleted) * (g === 'MEI' ? 0.015 : 0.02);
	r += s.dribbles * 0.08 - s.dribblesFailed * 0.04;
	// O motor registra muitas disputas curtas (roubadas): cada uma vale pouco na nota.
	r += s.tackles * (def ? 0.03 : 0.02) + s.interceptions * (def ? 0.025 : 0.015) + s.clearances * (def ? 0.03 : 0.01);
	r += s.aerialsWon * 0.04;
	r += s.foulsWon * 0.03 - s.foulsCommitted * 0.07;
	r -= s.yellow * 0.3 + s.red * 1.6 + s.offsides * 0.03 + s.errorsLeadingToGoal * 0.6;
	if (gk) r += s.saves * 0.25 - s.goalsConceded * 0.3;
	else if (def) r -= s.goalsConceded * 0.12;
	// Pouco tempo em campo: nota tende ao neutro.
	if (s.minutes < 25) r = 6 + (r - 6) * (s.minutes / 25);
	return Math.round(Math.max(3, Math.min(10, r)) * 10) / 10;
}

export function computeResult(m: Match): MatchResult {
	const stats = teamStatsFromEvents(m.events);
	stats.home.possessionTicks = m.possession.home;
	stats.away.possessionTicks = m.possession.away;
	return {
		seed: m.seed,
		homeGoals: m.score.home,
		awayGoals: m.score.away,
		events: m.events,
		decisions: m.applied,
		stats,
		players: playerStatsFromEvents(m),
		addedTime: [...m.added] as [number, number],
		durationTicks: m.tick
	};
}

export function possessionPct(stats: Record<Side, TeamStats>): Record<Side, number> {
	const total = stats.home.possessionTicks + stats.away.possessionTicks || 1;
	const home = Math.round((stats.home.possessionTicks / total) * 100);
	return { home, away: 100 - home };
}
