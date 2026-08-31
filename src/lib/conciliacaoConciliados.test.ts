import { describe, expect, it } from 'vitest';
import {
  bankLineKey,
  buildConciliadosCounts,
  findStaleImportedRows,
  fitidKey,
  type ConciliadoRow,
  type VinculoRow,
} from './conciliacaoConciliados';

function conciliado(overrides: Partial<ConciliadoRow> = {}): ConciliadoRow {
  return {
    id: 'lanc-1',
    data_competencia: '2026-08-05',
    data_pagamento: '2026-08-05',
    valor: 3246.92,
    tipo: 'RECEITA',
    descricao: 'Pix Recebido 99 FOOD LTDA',
    ...overrides,
  };
}

function vinculo(overrides: Partial<VinculoRow> = {}): VinculoRow {
  return {
    external_id: 'FITID-DOWNLOAD-ANTIGO',
    tipo: 'RECEITA',
    lancamento_id: 'lanc-1',
    ...overrides,
  };
}

const linhaKey = bankLineKey({ data: '2026-08-05', valor: 3246.92, tipo: 'RECEITA', descricao: 'Pix Recebido 99 FOOD LTDA' });

describe('buildConciliadosCounts', () => {
  it('conta lançamento cujo vínculo aponta para FITID ausente do arquivo (Santander regenera FITID a cada download)', () => {
    // Cenário real (2026-08-21, conta Santander Marilda): o FITID do Santander
    // embute o timestamp do download; um novo download do mesmo extrato troca o
    // FITID de todas as linhas. O vínculo antigo não bate com nada no arquivo
    // novo — o lançamento PRECISA ser reconhecível por conteúdo, senão a linha
    // reaparece como "Criar novo" a cada download.
    const counts = buildConciliadosCounts(
      [conciliado()],
      [vinculo({ external_id: '0004130130282202608181441330' })],
      new Set([fitidKey('RECEITA', '0004130130282202608211830000')]),
    );
    expect(counts.get(linhaKey)).toBe(1);
  });

  it('NÃO conta lançamento cujo vínculo de FITID está presente no arquivo (será reivindicado pelo fast-path)', () => {
    // Guarda do incidente das 15 vendas (R$ 3.060,15): contar aqui também faria a
    // mesma baixa ser reivindicada duas vezes — uma pelo FITID e outra por conteúdo.
    const counts = buildConciliadosCounts(
      [conciliado()],
      [vinculo({ external_id: 'FITID-PRESENTE' })],
      new Set([fitidKey('RECEITA', 'FITID-PRESENTE')]),
    );
    expect(counts.get(linhaKey)).toBeUndefined();
  });

  it('vendas idênticas no mesmo dia: conta apenas as que não serão reivindicadas por FITID', () => {
    const counts = buildConciliadosCounts(
      [
        conciliado({ id: 'lanc-1' }),
        conciliado({ id: 'lanc-2' }),
      ],
      [vinculo({ lancamento_id: 'lanc-1', external_id: 'FITID-PRESENTE' })],
      new Set([fitidKey('RECEITA', 'FITID-PRESENTE')]),
    );
    expect(counts.get(linhaKey)).toBe(1);
  });

  it('arquivo sem FITIDs (CSV): todos os conciliados contam, mesmo com vínculo antigo', () => {
    const counts = buildConciliadosCounts(
      [conciliado({ id: 'lanc-1' }), conciliado({ id: 'lanc-2' })],
      [vinculo({ lancamento_id: 'lanc-1' })],
      new Set(),
    );
    expect(counts.get(linhaKey)).toBe(2);
  });

  it('usa data_pagamento (não data_competencia) como chave — boleto pago com atraso', () => {
    const counts = buildConciliadosCounts(
      [conciliado({ data_competencia: '2026-07-10', data_pagamento: '2026-08-05' })],
      [],
      new Set(),
    );
    expect(counts.get(linhaKey)).toBe(1);
    expect(counts.get(bankLineKey({ data: '2026-07-10', valor: 3246.92, tipo: 'RECEITA', descricao: 'Pix Recebido 99 FOOD LTDA' }))).toBeUndefined();
  });

  it('lançamento com múltiplos vínculos: basta UM FITID presente no arquivo para excluí-lo do contador', () => {
    const counts = buildConciliadosCounts(
      [conciliado()],
      [
        vinculo({ external_id: 'FITID-ANTIGO' }),
        vinculo({ external_id: 'FITID-PRESENTE' }),
      ],
      new Set([fitidKey('RECEITA', 'FITID-PRESENTE')]),
    );
    expect(counts.get(linhaKey)).toBeUndefined();
  });

  it('a comparação de FITID considera o tipo: mesmo external_id com tipo diferente não exclui', () => {
    const counts = buildConciliadosCounts(
      [conciliado()],
      [vinculo({ external_id: 'FITID-X', tipo: 'RECEITA' })],
      new Set([fitidKey('DESPESA', 'FITID-X')]),
    );
    expect(counts.get(linhaKey)).toBe(1);
  });

  it('reconhece a mesma linha com espaçamento interno diferente na descrição (Santander Gm, 2026-08-28: 143 lançamentos duplicados)', () => {
    // O MEMO do OFX do Santander varia o espaçamento interno entre downloads do
    // mesmo extrato — a chave por conteúdo precisa colapsar espaços, senão a
    // linha reimportada não bate com o lançamento já conciliado.
    const linhaComEspacamentoDiferente = bankLineKey({
      data: '2026-08-05',
      valor: 3246.92,
      tipo: 'RECEITA',
      descricao: 'Pix   Recebido      99 FOOD LTDA',
    });
    expect(linhaComEspacamentoDiferente).toBe(linhaKey);

    const counts = buildConciliadosCounts([conciliado()], [], new Set());
    expect(counts.get(linhaComEspacamentoDiferente)).toBe(1);
  });
});

describe('findStaleImportedRows', () => {
  const linkedRow = (overrides: Partial<ConciliadoRow> = {}): ConciliadoRow => ({
    id: 'ledger-1',
    data_competencia: '2026-08-05',
    data_pagamento: '2026-08-05',
    valor: 0.13,
    tipo: 'RECEITA',
    descricao: 'RENDIMENTO LIQUIDO DE CONTAMAX',
    origem: 'conciliacao',
    ...overrides,
  });
  const oldLink: VinculoRow = {
    lancamento_id: 'ledger-1',
    external_id: 'old-fitid',
    tipo: 'RECEITA',
  };

  it('flags a previously imported row that disappeared from the new statement', () => {
    const anotherFileLine = {
      data: '2026-08-05', valor: 10, tipo: 'DESPESA', descricao: 'OUTRA LINHA',
    };
    expect(findStaleImportedRows([linkedRow()], [oldLink], new Set(), [anotherFileLine])).toEqual([linkedRow()]);
  });

  it('accepts the same content when only the bank FITID changed', () => {
    const fileLine = {
      data: '2026-08-05', valor: 0.13, tipo: 'RECEITA',
      descricao: 'RENDIMENTO LIQUIDO DE CONTAMAX', fitId: 'new-fitid',
    };
    expect(findStaleImportedRows([linkedRow()], [oldLink], new Set(['RECEITA|new-fitid']), [fileLine])).toEqual([]);
  });

  it('is occurrence-sensitive when one of two repeated rows disappeared', () => {
    const second = linkedRow({ id: 'ledger-2' });
    const links = [oldLink, { ...oldLink, lancamento_id: 'ledger-2', external_id: 'old-fitid-2' }];
    const fileLine = {
      data: '2026-08-05', valor: 0.13, tipo: 'RECEITA', descricao: 'RENDIMENTO LIQUIDO DE CONTAMAX',
    };
    expect(findStaleImportedRows([linkedRow(), second], links, new Set(), [fileLine])).toEqual([second]);
  });

  it('does not flag transfers or manually-created entries', () => {
    const fileLine = { data: '2026-08-05', valor: 10, tipo: 'DESPESA', descricao: 'OUTRA LINHA' };
    expect(findStaleImportedRows([
      linkedRow({ tipo: 'TRANSFERENCIA' }),
      linkedRow({ id: 'manual', origem: 'manual' }),
    ], [oldLink, { ...oldLink, lancamento_id: 'manual' }], new Set(), [fileLine])).toEqual([]);
  });

  it('does not compare imported entries outside the period covered by the file', () => {
    const julyRow = linkedRow({ data_competencia: '2026-07-05', data_pagamento: '2026-07-05' });
    const augustLine = { data: '2026-08-05', valor: 10, tipo: 'DESPESA', descricao: 'OUTRA LINHA' };
    expect(findStaleImportedRows([julyRow], [oldLink], new Set(), [augustLine])).toEqual([]);
  });
});
