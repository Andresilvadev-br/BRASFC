// Gols e finalizações por par de mentalidades (mesmos clubes, mesmo estilo).
import '../src/lib/data/brasil.ts';
import { CLUBES_2026 } from '../src/lib/data/brasil.ts';
import { requireClub } from '../src/lib/domain/clubs.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';
const N = Number(process.argv[2] ?? 50);
const ids = CLUBES_2026.filter((c) => c.serie === 'A' || c.serie === 'B').map((c) => c.id);
const t = (id: string, m: 'defensiva' | 'equilibrada' | 'ofensiva', style: string) => {
	const c = requireClub(id);
	return buildTeamSetup({ id, name: c.name, short: c.short, colors: c.colors }, generateSquad(id, 1), { formation: '4-3-3', mentality: m, style: style as 'posse' });
};
for (const [hm, am, st] of [['equilibrada', 'equilibrada', 'posse'], ['ofensiva', 'ofensiva', 'posse'], ['ofensiva', 'defensiva', 'posse'], ['defensiva', 'defensiva', 'posse'], ['ofensiva', 'ofensiva', 'pressao'], ['equilibrada', 'equilibrada', 'vertical']] as const) {
	let g = 0, sh = 0, big = 0;
	for (let i = 0; i < N; i++) {
		const r = simulateMatch({ home: t(ids[i % ids.length], hm, st), away: t(ids[(i * 7 + 5) % ids.length], am, st), seed: 777 + i });
		g += r.homeGoals + r.awayGoals; sh += r.stats.home.shots + r.stats.away.shots; if (r.homeGoals + r.awayGoals >= 5) big++;
	}
	console.log(`${hm[0]}x${am[0]} ${st}: gols ${(g / N).toFixed(2)} chutes/time ${(sh / N / 2).toFixed(1)} 5+ ${Math.round((big / N) * 100)}%`);
}
