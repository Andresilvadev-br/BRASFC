import { describe, expect, it } from 'vitest';
import catalog from '#lib/data/world/2026/catalog.json' with { type: 'json' };

describe('catálogo internacional de pesquisa', () => {
  it('preserva cobertura e IDs únicos', () => {
    const ids = catalog.clubs.map(c => c.id);
    expect(ids).toHaveLength(66);
    expect(new Set(ids).size).toBe(ids.length);
    expect(catalog.leagues).toHaveLength(17);
    const ucl = catalog.competitions.find(c => c.id === 'ucl')!;
    const mls = catalog.competitions.find(c => c.id === 'mls')!;
    expect(ucl.clubIds).toHaveLength(36);
    expect(mls.clubIds).toHaveLength(30);
    expect(mls.conferences?.east).toHaveLength(15);
    expect(mls.conferences?.west).toHaveLength(15);
    for (const league of catalog.leagues) {
      expect(league.clubIds.every(id => catalog.clubs.some(c => c.id === id && c.leagueId === league.id))).toBe(true);
    }
    expect(catalog.leagues.filter(l => l.coverage === 'ucl-league-phase-only')).toHaveLength(16);
  });
  it('não apresenta formações observadas ou dados pendentes como elencos prontos', () => {
    const observations = catalog.clubs.flatMap(c => 'formation' in c.tactics ? [c.tactics.formation] : []);
    expect(observations).toHaveLength(36);
    expect(new Set(observations).size).toBeGreaterThan(4);
    expect(catalog.clubs.every(c => c.rosterStatus === 'pending')).toBe(true);
    expect(catalog.status).toBe('research-only');
    for (const sample of catalog.matchSamples) {
      expect(sample.players).toHaveLength(11);
      expect(new Set(sample.players.map(p => p.number)).size).toBe(11);
      expect(sample.players.filter(p => p.position === 'GOL')).toHaveLength(1);
      expect(sample.positionKind).toBe('match-slot-not-natural-position');
    }
  });
});
