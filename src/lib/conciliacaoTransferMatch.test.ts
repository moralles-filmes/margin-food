import { describe, expect, it } from 'vitest';
import {
  atribuirContrapartidasTransferencia,
  findTransferWarnings,
  periodoDoArquivo,
  prepararCandidatosTransferencia,
  type LinhaContrapartida,
  type TransferCandidate,
} from './conciliacaoTransferMatch';

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

/** Atribuição de uma linha só — id da transferência reconhecida ou undefined. */
function reconhece(
  linha: Omit<LinhaContrapartida, 'indice'>,
  contaSel: string,
  candidatos: TransferCandidate[],
): string | undefined {
  return atribuirContrapartidasTransferencia([{ ...linha, indice: 0 }], contaSel, candidatos).get(0);
}

describe('atribuirContrapartidasTransferencia — regras por par', () => {
  it('reconhece a perna de entrada (RECEITA) na conta de destino', () => {
    expect(reconhece({ tipo: 'RECEITA', valor: 15000, data: '2026-08-10', descricao: 'Pix recebido - Marilda Moraes' }, CONTA_Y, [transfer()])).toBe('transfer-1');
  });

  it('reconhece a perna de saída (DESPESA) na conta de origem', () => {
    expect(reconhece({ tipo: 'DESPESA', valor: 15000, data: '2026-08-10', descricao: 'Pix enviado' }, CONTA_X, [transfer()])).toBe('transfer-1');
  });

  it('não casa RECEITA com a conta de origem (direção errada)', () => {
    expect(reconhece({ tipo: 'RECEITA', valor: 15000, data: '2026-08-10', descricao: '' }, CONTA_X, [transfer()])).toBeUndefined();
  });

  it('não casa DESPESA com a conta de destino (direção errada)', () => {
    expect(reconhece({ tipo: 'DESPESA', valor: 15000, data: '2026-08-10', descricao: '' }, CONTA_Y, [transfer()])).toBeUndefined();
  });

  it('não casa quando valor diverge muito (score abaixo do limiar)', () => {
    expect(reconhece({ tipo: 'RECEITA', valor: 500, data: '2026-08-10', descricao: '' }, CONTA_Y, [transfer()])).toBeUndefined();
  });

  it('exige valor exato: diferença dentro da tolerância do score não reconhece', () => {
    // 0,5% e 4% de diferença no mesmo dia, mesma descrição: o score passaria de 60
    // e a linha ficaria "já conciliada" com o saldo errado pela diferença.
    const linha = { tipo: 'RECEITA' as const, data: '2026-08-10', descricao: 'Transferência: Santander Gm → PagBank Gm' };
    expect(reconhece({ ...linha, valor: 14925 }, CONTA_Y, [transfer()])).toBeUndefined();
    expect(reconhece({ ...linha, valor: 14400 }, CONTA_Y, [transfer()])).toBeUndefined();
    expect(reconhece({ ...linha, valor: 15000.004 }, CONTA_Y, [transfer()])).toBe('transfer-1');
  });

  it('não casa quando a data está fora da janela de 7 dias', () => {
    expect(reconhece({ tipo: 'RECEITA', valor: 15000, data: '2026-08-20', descricao: '' }, CONTA_Y, [transfer()])).toBeUndefined();
  });

  it('escolhe o candidato de maior score entre múltiplos', () => {
    const closeMatch = transfer({ id: 'transfer-close', data_competencia: '2026-08-10' });
    const farMatch = transfer({ id: 'transfer-far', data_competencia: '2026-08-08' });
    expect(reconhece({ tipo: 'RECEITA', valor: 15000, data: '2026-08-10', descricao: '' }, CONTA_Y, [farMatch, closeMatch])).toBe('transfer-close');
  });

  it('funciona sem FITID (linha de CSV) — não depende de identidade bancária', () => {
    expect(reconhece({ tipo: 'RECEITA', valor: 15000, data: '2026-08-10', descricao: 'Pix recebido' }, CONTA_Y, [transfer()])).toBeDefined();
  });
});

describe('atribuirContrapartidasTransferencia — uma transferência, uma linha', () => {
  // OFX vem do mais novo ao mais antigo: a linha de 12/08 chega antes da
  // contrapartida real de 10/08 e, linha a linha, pegava a transferência.
  const real: LinhaContrapartida = { indice: 1, tipo: 'RECEITA', valor: 15000, data: '2026-08-10', descricao: 'Pix recebido - Santander Gm' };
  const outra: LinhaContrapartida = { indice: 0, tipo: 'RECEITA', valor: 15000, data: '2026-08-12', descricao: 'Pix recebido - Cliente' };

  it('a contrapartida real vence a linha de mesmo valor que vem antes no arquivo', () => {
    const atribuicao = atribuirContrapartidasTransferencia([outra, real], CONTA_Y, [transfer()]);
    expect(atribuicao.get(1)).toBe('transfer-1');
    expect(atribuicao.has(0)).toBe(false);
  });

  it('o resultado não depende da ordem das linhas nem dos candidatos', () => {
    const outraTransferencia = transfer({ id: 'transfer-2', data_competencia: '2026-08-12', descricao: 'Pix recebido - Cliente' });
    const a = atribuirContrapartidasTransferencia([outra, real], CONTA_Y, [transfer(), outraTransferencia]);
    const b = atribuirContrapartidasTransferencia([real, outra], CONTA_Y, [outraTransferencia, transfer()]);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
    expect(a.get(1)).toBe('transfer-1');
    expect(a.get(0)).toBe('transfer-2');
  });

  it('duas linhas empatadas na mesma transferência: nenhuma é reconhecida', () => {
    const gemea = { ...real, indice: 2 };
    const atribuicao = atribuirContrapartidasTransferencia([real, gemea], CONTA_Y, [transfer()]);
    expect(atribuicao.size).toBe(0);
  });

  it('linha empatada entre duas transferências não é reconhecida, nem por candidato pior', () => {
    const gemea = transfer({ id: 'transfer-gemea' });
    const pior = transfer({ id: 'transfer-pior', data_competencia: '2026-08-08' });
    const atribuicao = atribuirContrapartidasTransferencia([real], CONTA_Y, [transfer(), gemea, pior]);
    expect(atribuicao.size).toBe(0);
  });

  it('uma transferência nunca é atribuída a duas linhas', () => {
    const linhas = [0, 1, 2, 3].map(indice => ({ ...outra, indice, data: `2026-08-1${indice}`, descricao: `Pix ${indice}` }));
    const atribuicao = atribuirContrapartidasTransferencia(linhas, CONTA_Y, [transfer()]);
    expect([...atribuicao.values()].filter(id => id === 'transfer-1').length).toBeLessThanOrEqual(1);
  });

  it('transferência fora do período do arquivo não é reconhecida', () => {
    // Arquivo de 11/08 em diante: a transferência de 10/08 tem a contrapartida no
    // arquivo anterior, e o Pix de mesmo valor em 11/08 não pode ficar com ela.
    const linha = { ...real, data: '2026-08-11', descricao: 'QR Code Pix enviado - Cliente' };
    const periodo = { inicio: '2026-08-11', fim: '2026-08-20' };
    expect(atribuirContrapartidasTransferencia([linha], CONTA_Y, [transfer()], periodo).size).toBe(0);
    expect(atribuirContrapartidasTransferencia([linha], CONTA_Y, [transfer()], { ...periodo, inicio: '2026-08-10' }).get(1)).toBe('transfer-1');
  });

  it('virada entre extratos: com o vínculo da linha no arquivo anterior, o Pix do dia seguinte não leva a transferência', () => {
    // T de 15/10 vinculada pelo FITID da linha do arquivo 1; o arquivo 2 começa em 16/10.
    const t = transfer({ id: 't', valor: 500, data_competencia: '2026-10-15' });
    const candidatos = prepararCandidatosTransferencia([t], [{ external_id: 'f-d1', tipo: 'RECEITA', lancamento_id: 't' }], new Set(['RECEITA|f-d2']));
    const d2 = { indice: 0, tipo: 'RECEITA' as const, valor: 500, data: '2026-10-16', descricao: 'Pix recebido - Del Match' };
    expect(atribuirContrapartidasTransferencia([d2], CONTA_Y, candidatos, { inicio: '2026-10-16', fim: '2026-10-31' }).size).toBe(0);
    // Mesmo sem o período (arquivo sem datas válidas), a data tem que ser a mesma.
    expect(atribuirContrapartidasTransferencia([d2], CONTA_Y, candidatos).size).toBe(0);
  });
});

describe('periodoDoArquivo', () => {
  it('devolve a menor e a maior data e ignora data inválida', () => {
    expect(periodoDoArquivo(['2026-10-05', '2026-10-01', 'x', '2026-10-09T00:00'])).toEqual({ inicio: '2026-10-01', fim: '2026-10-09' });
    expect(periodoDoArquivo([])).toBeUndefined();
  });
});

describe('findTransferWarnings', () => {
  it('avisa quando existe transferência de mesmo valor fora do limiar de reconhecimento', () => {
    // 6 dias de distância + descrições sem nada em comum: score fica abaixo de 60,
    // o matcher não reconhece — mas o usuário precisa conferir antes de recriar.
    const candidato = transfer({ data_competencia: '2026-08-04' });
    expect(
      reconhece({ tipo: 'RECEITA', valor: 15000, data: '2026-08-10', descricao: 'Pix' }, CONTA_Y, [candidato]),
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

describe('prepararCandidatosTransferencia', () => {
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

  it('sem vínculo, a linha de outro Pix de mesmo valor casa com a transferência (score 61)', () => {
    expect(reconhece(linhaDelMatch, CONTA_X, [delza])).toBe('delza');
  });

  it('tira dos candidatos e dos avisos a transferência cujo FITID vinculado está no arquivo', () => {
    const candidatos = prepararCandidatosTransferencia([delza], [vinculoDelza], new Set(['DESPESA|fitid-delza']));
    expect(candidatos).toEqual([]);
    expect(reconhece(linhaDelMatch, CONTA_X, candidatos)).toBeUndefined();
    expect(findTransferWarnings(linhaDelMatch, CONTA_X, candidatos, new Set())).toEqual([]);
  });

  it('FITID vinculado fora do arquivo: só a mesma linha reimportada (valor e data iguais) é reconhecida', () => {
    // Arquivo parcial que não contém a linha da Delza: o Del Match não pode capturá-la.
    const candidatos = prepararCandidatosTransferencia([delza], [vinculoDelza], new Set(['DESPESA|fitid-novo']));
    expect(candidatos).toEqual([{ ...delza, vinculoForaDoArquivo: true }]);
    expect(reconhece(linhaDelMatch, CONTA_X, candidatos)).toBeUndefined();
    expect(reconhece({ ...linhaDelMatch, data: '2026-10-03', descricao: 'Pix enviado - Delza Aparecida Da Silva' }, CONTA_X, candidatos)).toBeUndefined();
    // Banco que regenera FITID: a mesma linha reimportada continua reconhecida.
    expect(reconhece({ ...linhaDelMatch, data: '2026-10-01', descricao: 'Pix enviado - Delza Aparecida Da Silva' }, CONTA_X, candidatos)).toBe('delza');
    expect(reconhece({ ...linhaDelMatch, data: '2026-10-01', descricao: 'Pix enviado' }, CONTA_X, candidatos)).toBe('delza');
    expect(reconhece({ ...linhaDelMatch, data: '2026-10-02', descricao: 'Pix enviado - Delza Aparecida Da Silva' }, CONTA_X, candidatos)).toBeUndefined();
    expect(reconhece({ ...linhaDelMatch, valor: 500.5, data: '2026-10-01' }, CONTA_X, candidatos)).toBeUndefined();
    // Continua aparecendo como aviso para a linha que não foi reconhecida.
    expect(findTransferWarnings(linhaDelMatch, CONTA_X, candidatos, new Set()).map(w => w.id)).toEqual(['delza']);
  });

  it('mantém transferência sem vínculo nesta conta e compara o FITID junto com o tipo', () => {
    const outra = transfer({ id: 'outra', valor: 500, data_competencia: '2026-10-02' });
    const candidatos = prepararCandidatosTransferencia([delza, outra], [vinculoDelza], new Set(['RECEITA|fitid-delza']));
    expect(candidatos.map(c => [c.id, !!c.vinculoForaDoArquivo])).toEqual([['delza', true], ['outra', false]]);
  });
});
