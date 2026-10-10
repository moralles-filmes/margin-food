import { describe, expect, it } from 'vitest';
import { acumularArquivo, lerArquivoConciliacao } from './conciliacaoArquivo';
import { buildConciliadosCounts, bankLineKey, type ConciliadoRow, type VinculoRow } from './conciliacaoConciliados';
import { atribuirContrapartidasTransferencia, prepararCandidatosTransferencia } from './conciliacaoTransferMatch';

describe('acumularArquivo', () => {
  const linhas = [
    { tipo: 'DESPESA', fitId: 'f1', data: '2026-10-05' },
    { tipo: 'RECEITA', fitId: 'f2', data: '2026-10-01' },
    { tipo: 'DESPESA', fitId: null, data: '2026-10-09' },
  ];

  it('arquivo novo: FITIDs com o tipo e o período de todas as linhas', () => {
    expect(acumularArquivo(null, linhas)).toEqual({
      fitids: ['DESPESA|f1', 'RECEITA|f2'],
      periodo: { inicio: '2026-10-01', fim: '2026-10-09' },
    });
  });

  it('linhas que sobraram na lista não encolhem o arquivo da sessão', () => {
    const arquivo = acumularArquivo(null, linhas);
    const restante = [{ tipo: 'DESPESA', fitId: null, data: '2026-10-09' }];
    expect(acumularArquivo(arquivo, restante)).toEqual(arquivo);
  });

  it('lista vazia e sem arquivo guardado: nada no arquivo', () => {
    expect(acumularArquivo(undefined, [])).toEqual({ fitids: [], periodo: undefined });
  });
});

describe('lerArquivoConciliacao', () => {
  it('aceita o formato gravado e recusa o resto', () => {
    const arquivo = { fitids: ['DESPESA|f1'], periodo: { inicio: '2026-10-01', fim: '2026-10-09' } };
    expect(lerArquivoConciliacao(JSON.parse(JSON.stringify(arquivo)))).toEqual(arquivo);
    expect(lerArquivoConciliacao({ fitids: ['x'] })).toEqual({ fitids: ['x'] });
    expect(lerArquivoConciliacao({ fitids: ['x'], periodo: { inicio: 1 } })).toEqual({ fitids: ['x'] });
    expect(lerArquivoConciliacao({ fitids: [1] })).toBeNull();
    expect(lerArquivoConciliacao('x')).toBeNull();
    expect(lerArquivoConciliacao(null)).toBeNull();
  });
});

describe('linha processada continua dona do seu vínculo depois de sair da lista', () => {
  // Duas vendas iguais (FITIDs f1 e f2). A de f1 foi processada: lançamento L1,
  // vinculado a f1, e saiu da lista. Sobrou a de f2, ainda pendente.
  const venda = { data: '2026-10-05', valor: 80, tipo: 'RECEITA', descricao: 'Pix recebido - Cliente' };
  const conciliados: ConciliadoRow[] = [{ id: 'L1', ...venda, data_pagamento: venda.data, data_competencia: venda.data }];
  const vinculos: VinculoRow[] = [{ external_id: 'f1', tipo: 'RECEITA', lancamento_id: 'L1' }];
  const arquivo = acumularArquivo(null, [{ ...venda, fitId: 'f1' }, { ...venda, fitId: 'f2' }]);

  it('L1 não entra na contagem por conteúdo, então não cobre a venda de f2', () => {
    const soRestante = acumularArquivo(null, [{ ...venda, fitId: 'f2' }]);
    // Calculado só com a lista restante (o defeito), L1 cobriria a venda de f2.
    expect(buildConciliadosCounts(conciliados, vinculos, new Set(soRestante.fitids)).get(bankLineKey(venda))).toBe(1);
    expect(buildConciliadosCounts(conciliados, vinculos, new Set(arquivo.fitids)).get(bankLineKey(venda)) ?? 0).toBe(0);
  });

  it('a transferência criada pela linha processada não vira contrapartida da linha que sobrou', () => {
    const t = { id: 'T', conta_id: 'x', conta_destino_id: 'y', valor: 80, data_competencia: '2026-10-05', descricao: null };
    const tVinculos = [{ external_id: 'f1', tipo: 'RECEITA', lancamento_id: 'T' }];
    const candidatos = prepararCandidatosTransferencia([t], tVinculos, new Set(arquivo.fitids));
    expect(candidatos).toEqual([]);
    const linha = { indice: 0, tipo: 'RECEITA' as const, valor: 80, data: '2026-10-05', descricao: 'Pix recebido - Cliente' };
    expect(atribuirContrapartidasTransferencia([linha], 'y', candidatos, arquivo.periodo).size).toBe(0);
  });
});
