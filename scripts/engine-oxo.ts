// Ablação rápida: gols em ofensiva x ofensiva (posse) com parâmetros alterados por variável de ambiente.
import '../src/lib/data/brasil.ts';
import { CLUBES_2026 } from '../src/lib/data/brasil.ts';
import { requireClub } from '../src/lib/domain/clubs.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';
const N = Number(process.argv[2] ?? 60);
const m = (process.argv[3] ?? 'ofensiva') as 'ofensiva';
const st = (process.argv[4] ?? 'posse') as 'posse';
const ids = CLUBES_2026.filter((c) => c.serie === 'A' || c.serie === 'B').map((c) => c.id);
const t = (id: string) => { const c = requireClub(id); return buildTeamSetup({ id, name: c.name, short: c.short, colors: c.colors }, generateSquad(id, 1), { formation: '4-3-3', mentality: m, style: st }); };
let g = 0, sh = 0, xg = 0;
for (let i = 0; i < N; i++) { const r = simulateMatch({ home: t(ids[i % ids.length]), away: t(ids[(i * 7 + 5) % ids.length]), seed: 777 + i }); g += r.homeGoals + r.awayGoals; sh += r.stats.home.shots + r.stats.away.shots; xg += r.stats.home.xg + r.stats.away.xg; }
console.log(`${process.env.TAG ?? ''} ${m} ${st}: gols ${(g / N).toFixed(2)} chutes ${(sh / N / 2).toFixed(1)} xG/chute ${(xg / sh).toFixed(3)}`);
