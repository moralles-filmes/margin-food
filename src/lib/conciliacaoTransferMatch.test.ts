import { describe, expect, it } from 'vitest';
import { excluirTransferenciasVinculadasNoArquivo, matchTransferCandidate, findTransferWarnings, type TransferCandidate } from './conciliacaoTransferMatch';

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

describe('findTransferWarnings', () => {
  it('avisa quando existe transferência de mesmo valor fora do limiar de reconhecimento', () => {
    // 6 dias de distância + descrições sem nada em comum: score fica abaixo de 60,
    // o matcher não reconhece — mas o usuário precisa conferir antes de recriar.
    const candidato = transfer({ data_competencia: '2026-08-04' });
    expect(
      matchTransferCandidate({ tipo: 'RECEITA', valor: 15000, data: '2026-08-10', descricao: 'Pix' }, CONTA_Y, [candidato], new Set()),
    ).toBeUndefined();

    const warnings = findTransferWarnings({ tipo: 'RECEITA', valor: 15000, data: '2026-08-10' }, CONTA_Y, [candidato], new Set());
    expect(warnings).toHaveLength(1);
    expect(warnings[0].id).toBe('transfer-1');
    expect(warnings[0].direcaoInvertida).toBe(false);
  });

  it('marca direção invertida quando a transferência existente sai da conta em vez de entrar', () => {
    const warnings = findTransferWarnings(
      { tipo: 'RECEITA', valor: 15000, data: '2026-08-10' },
      CONTA_X, // linha de ENTRADA na conta X, mas a transferência SAI de X
      [transfer()],
      new Set(),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].direcaoInvertida).toBe(true);
  });

  it('não avisa quando o valor difere', () => {
    const warnings = findTransferWarnings({ tipo: 'RECEITA', valor: 15000.5, data: '2026-08-10' }, CONTA_Y, [transfer()], new Set());
    expect(warnings).toHaveLength(0);
  });

  it('não avisa fora da janela de dias', () => {
    const warnings = findTransferWarnings({ tipo: 'RECEITA', valor: 15000, data: '2026-08-25' }, CONTA_Y, [transfer()], new Set());
    expect(warnings).toHaveLength(0);
  });

  it('não avisa quando a transferência não toca a conta selecionada', () => {
    const warnings = findTransferWarnings({ tipo: 'RECEITA', valor: 15000, data: '2026-08-10' }, 'conta-z', [transfer()], new Set());
    expect(warnings).toHaveLength(0);
  });

  it('silencia candidato já casado por outra linha do mesmo extrato (direção esperada)', () => {
    const warnings = findTransferWarnings(
      { tipo: 'RECEITA', valor: 15000, data: '2026-08-10' },
      CONTA_Y,
      [transfer()],
      new Set(['transfer-transfer-1']),
    );
    expect(warnings).toHaveLength(0);
  });

  it('mantém o aviso de direção invertida mesmo com o candidato já consumido', () => {
    const warnings = findTransferWarnings(
      { tipo: 'RECEITA', valor: 15000, data: '2026-08-10' },
      CONTA_X,
      [transfer()],
      new Set(['transfer-transfer-1']),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].direcaoInvertida).toBe(true);
  });

  it('ordena por proximidade de data e respeita o limite', () => {
    const candidatos = [
      transfer({ id: 'far', data_competencia: '2026-08-04' }),
      transfer({ id: 'near', data_competencia: '2026-08-09' }),
      transfer({ id: 'mid', data_competencia: '2026-08-07' }),
    ];
    const warnings = findTransferWarnings(
      { tipo: 'RECEITA', valor: 15000, data: '2026-08-10' },
      CONTA_Y,
      candidatos,
      new Set(),
      { limite: 2 },
    );
    expect(warnings.map(w => w.id)).toEqual(['near', 'mid']);
  });
});

describe('excluirTransferenciasVinculadasNoArquivo', () => {
  // Caso real (PagBank Gm): transferência de R$ 500 em 01/10 já vinculada à
  // própria linha pelo FITID; o Pix de R$ 500 ao Del Match em 05/10 somava 61
  // pontos contra ela e ficava "já conciliada" sem nunca virar lançamento.
  const delza = transfer({
    id: 'delza',
    valor: 500,
    data_competencia: '2026-10-01',
    descricao: 'Pix enviado - Delza Aparecida Da Silva',
  });
  const linhaDelMatch = {
    tipo: 'DESPESA' as const,
    valor: 500,
    data: '2026-10-05',
    descricao: 'QR Code Pix enviado - Del Match Delivery',
  };
  const vinculoDelza = { external_id: 'fitid-delza', tipo: 'DESPESA', lancamento_id: 'delza' };

  it('sem a exclusão, a linha de outro Pix de mesmo valor casa com a transferência já vinculada', () => {
    expect(matchTransferCandidate(linhaDelMatch, CONTA_X, [delza], new Set())?.id).toBe('delza');
  });

  it('tira dos candidatos a transferência cujo FITID vinculado está no arquivo', () => {
    const candidatos = excluirTransferenciasVinculadasNoArquivo(
      [delza],
      [vinculoDelza],
      new Set(['DESPESA|fitid-delza']),
    );
    expect(candidatos).toEqual([]);
    expect(matchTransferCandidate(linhaDelMatch, CONTA_X, candidatos, new Set())).toBeUndefined();
    expect(findTransferWarnings(linhaDelMatch, CONTA_X, candidatos, new Set())).toEqual([]);
  });

  it('mantém a transferência quando o FITID vinculado não está no arquivo (banco regenerou o FITID)', () => {
    const candidatos = excluirTransferenciasVinculadasNoArquivo(
      [delza],
      [vinculoDelza],
      new Set(['DESPESA|fitid-novo-do-mesmo-pix']),
    );
    expect(candidatos).toEqual([delza]);
    expect(matchTransferCandidate(
      { ...linhaDelMatch, data: '2026-10-01', descricao: 'Pix enviado - Delza Aparecida Da Silva' },
      CONTA_X,
      candidatos,
      new Set(),
    )?.id).toBe('delza');
  });

  it('mantém transferência sem vínculo nesta conta e compara o FITID junto com o tipo', () => {
    const outra = transfer({ id: 'outra', valor: 500, data_competencia: '2026-10-02' });
    const candidatos = excluirTransferenciasVinculadasNoArquivo(
      [delza, outra],
      [vinculoDelza],
      new Set(['RECEITA|fitid-delza']),
    );
    expect(candidatos.map(c => c.id)).toEqual(['delza', 'outra']);
  });
});
