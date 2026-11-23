import { describe, expect, it } from 'vitest';
import '#lib/data/brasil.ts';
import { CLUBS } from '#lib/domain/clubs.ts';
import { initialLeague } from '#lib/domain/league.ts';
import { initialClubState } from '#lib/domain/management.ts';
import { initialOffice } from '#lib/domain/office.ts';
import { officeSeasonEnd } from '#lib/server/universe.ts';
import type { Career } from '#lib/domain/career.ts';
import type { UniverseState } from '#lib/domain/universe.ts';

const season = 2027;
const clubId = CLUBS[0].id;
const next = initialLeague('brasfc', season + 1);
const career = { mode: 'coach', clubId, seed: 900, season } as Career;
const universe = { clubs: {} } as UniverseState;

function endWith(options: { auto: boolean; declined?: boolean; confidence?: number }) {
  const club = initialClubState(900, clubId, 'liga-brasfc', season);
  club.board.confidence = options.confidence ?? 75;
  const office = initialOffice(season, 'E', club.coachReputation);
  office.contract.until = season;
  office.autoRenewal = options.auto;
  if (options.declined) office.renewalDeclinedSeason = season;
  return officeSeasonEnd({
    career,
    office,
    club,
    universe,
    division: 'liga-brasfc',
    position: 6,
    outcome: 'permanece',
    next
  });
}

describe('fim de contrato da carreira de treinador', () => {
  it('renova automaticamente com aprovação da diretoria', () => {
    const result = endWith({ auto: true, confidence: 80 });
    expect(result.club.board.dismissed).toBe(false);
    // A diretoria decide a duração (2 ou 3 temporadas) pelo desempenho e pela confiança.
    expect(result.office.contract.until).toBeGreaterThanOrEqual(season + 2);
    expect(result.office.contract.until).toBeLessThanOrEqual(season + 3);
    expect(result.news.some((message) => message.subject === 'Contrato renovado automaticamente')).toBe(true);
  });

  it('recusa explícita prevalece sobre a opção automática', () => {
    const result = endWith({ auto: true, declined: true, confidence: 90 });
    expect(result.club.board.dismissed).toBe(true);
    expect(result.office.contract.until).toBe(season);
    expect(result.news.some((message) => message.subject === 'Fim de contrato')).toBe(true);
  });

  it('sem confiança da diretoria, a opção automática não impõe renovação', () => {
    const result = endWith({ auto: true, confidence: 25 });
    expect(result.club.board.dismissed).toBe(true);
  });

  it('sem a opção automática, contrato vencido encerra o vínculo', () => {
    const result = endWith({ auto: false, confidence: 90 });
    expect(result.club.board.dismissed).toBe(true);
  });
});
