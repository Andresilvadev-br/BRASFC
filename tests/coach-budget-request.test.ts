import { describe, expect, it } from 'vitest';
import '#lib/data/brasil.ts';
import { CLUBS } from '#lib/domain/clubs.ts';
import type { Career } from '#lib/domain/career.ts';
import { initialLeague } from '#lib/domain/league.ts';
import { initialClubState } from '#lib/domain/management.ts';
import { initialOffice } from '#lib/domain/office.ts';
import { applyOfficeAction } from '#lib/server/office-actions.ts';

const seed = 451;
const season = 2027;
const clubId = CLUBS[0].id;
const league = initialLeague('brasfc', season);
const make = (confidence = 90) => {
  const club = initialClubState(seed, clubId, 'liga-brasfc', season);
  club.board.confidence = confidence;
  club.balance = 10_000_000;
  club.transferBudget = 1_000_000;
  club.wageBudget = 500_000;
  const office = initialOffice(season, 'E', club.coachReputation);
  const career = { mode: 'coach', seed, season, clubId, data: { office } } as Career;
  return { club, career };
};

describe('pedidos de verba ao conselho', () => {
  it('aumenta orçamento de transferências sem gerar saldo bancário', () => {
    const { club, career } = make();
    const result = applyOfficeAction(career, league, club, 12, 25, 3, { action: 'verba-solicitar', kind: 'transferencias', percent: 20 });
    expect(result.club.transferBudget).toBe(1_200_000);
    expect(result.club.balance).toBe(club.balance);
    expect(result.club.wageBudget).toBe(club.wageBudget);
    expect(result.office.decisions.at(-1)?.choice).toBe('aprovado');
  });

  it('aumenta teto de folha sem pagar salário nem criar dinheiro', () => {
    const { club, career } = make();
    const result = applyOfficeAction(career, league, club, 12, 25, 3, { action: 'verba-solicitar', kind: 'folha', percent: 10 });
    expect(result.club.wageBudget).toBe(550_000);
    expect(result.club.balance).toBe(club.balance);
  });

  it('recusa orçamento quando falta confiança', () => {
    const { club, career } = make(30);
    const result = applyOfficeAction(career, league, club, 12, 25, 3, { action: 'verba-solicitar', kind: 'transferencias', percent: 30 });
    expect(result.club.transferBudget).toBe(club.transferBudget);
    expect(result.office.decisions.at(-1)?.choice).toBe('recusado');
  });

  it('não permite repetição do mesmo pedido antes de oito rodadas', () => {
    const { club, career } = make();
    const first = applyOfficeAction(career, league, club, 12, 25, 3, { action: 'verba-solicitar', kind: 'folha', percent: 10 });
    const again = { ...career, data: { office: first.office } };
    expect(() => applyOfficeAction(again, league, first.club, 13, 25, 3, { action: 'verba-solicitar', kind: 'folha', percent: 10 })).toThrow('intervalo de 8 rodadas');
  });

  it('valida percentual e categoria no servidor', () => {
    const { club, career } = make();
    expect(() => applyOfficeAction(career, league, club, 12, 25, 3, { action: 'verba-solicitar', kind: 'folha', percent: 900 })).toThrow();
    expect(() => applyOfficeAction(career, league, club, 12, 25, 3, { action: 'verba-solicitar', kind: 'dinheiro-gratis', percent: 10 })).toThrow();
  });
});
