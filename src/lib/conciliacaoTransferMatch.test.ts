import { describe, expect, it } from 'vitest';
import { matchTransferCandidate, type TransferCandidate } from './conciliacaoTransferMatch';

const CONTA_X = 'conta-x';
const CONTA_Y = 'conta-y';

function transfer(overrides: Partial<TransferCandidate> = {}): TransferCandidate {
  return {
    id: 'transfer-1',
    conta_id: CONTA_X,
    conta_destino_id: CONTA_Y,
    valor: 15000,
    data_competencia: '2026-08-10',
    descricao: 'Transferência: Santander Gm → PagBank Gm',
    ...overrides,
  };
}

describe('matchTransferCandidate', () => {
  it('reconhece a perna de entrada (RECEITA) na conta de destino', () => {
    const result = matchTransferCandidate(
      { tipo: 'RECEITA', valor: 15000, data: '2026-08-10', descricao: 'Pix recebido - Marilda Moraes' },
      CONTA_Y,
      [transfer()],
      new Set(),
    );
    expect(result?.id).toBe('transfer-1');
  });

  it('reconhece a perna de saída (DESPESA) na conta de origem', () => {
    const result = matchTransferCandidate(
      { tipo: 'DESPESA', valor: 15000, data: '2026-08-10', descricao: 'Pix enviado' },
      CONTA_X,
      [transfer()],
      new Set(),
    );
    expect(result?.id).toBe('transfer-1');
  });

  it('não casa RECEITA com a conta de origem (direção errada)', () => {
    const result = matchTransferCandidate(
      { tipo: 'RECEITA', valor: 15000, data: '2026-08-10', descricao: '' },
      CONTA_X,
      [transfer()],
      new Set(),
    );
    expect(result).toBeUndefined();
  });

  it('não casa DESPESA com a conta de destino (direção errada)', () => {
    const result = matchTransferCandidate(
      { tipo: 'DESPESA', valor: 15000, data: '2026-08-10', descricao: '' },
      CONTA_Y,
      [transfer()],
      new Set(),
    );
    expect(result).toBeUndefined();
  });

  it('ignora candidato já consumido em usedIds (evita duas linhas casarem a mesma transferência)', () => {
    const result = matchTransferCandidate(
      { tipo: 'RECEITA', valor: 15000, data: '2026-08-10', descricao: '' },
      CONTA_Y,
      [transfer()],
      new Set(['transfer-transfer-1']),
    );
    expect(result).toBeUndefined();
  });

  it('não casa quando valor diverge muito (score abaixo do limiar)', () => {
    const result = matchTransferCandidate(
      { tipo: 'RECEITA', valor: 500, data: '2026-08-10', descricao: '' },
      CONTA_Y,
      [transfer()],
      new Set(),
    );
    expect(result).toBeUndefined();
  });

  it('não casa quando a data está fora da janela de 7 dias', () => {
    const result = matchTransferCandidate(
      { tipo: 'RECEITA', valor: 15000, data: '2026-08-20', descricao: '' },
      CONTA_Y,
      [transfer()],
      new Set(),
    );
    expect(result).toBeUndefined();
  });

  it('escolhe o candidato de maior score entre múltiplos', () => {
    const closeMatch = transfer({ id: 'transfer-close', data_competencia: '2026-08-10' });
    const farMatch = transfer({ id: 'transfer-far', data_competencia: '2026-08-08' });
    const result = matchTransferCandidate(
      { tipo: 'RECEITA', valor: 15000, data: '2026-08-10', descricao: '' },
      CONTA_Y,
      [farMatch, closeMatch],
      new Set(),
    );
    expect(result?.id).toBe('transfer-close');
  });

  it('funciona sem FITID (linha de CSV) — não depende de identidade bancária', () => {
    // O ponto central do bug: CSV nunca tem FITID, mas o matcher não usa esse campo.
    const result = matchTransferCandidate(
      { tipo: 'RECEITA', valor: 15000, data: '2026-08-10', descricao: 'Pix recebido' },
      CONTA_Y,
      [transfer()],
      new Set(),
    );
    expect(result).toBeDefined();
  });
});
