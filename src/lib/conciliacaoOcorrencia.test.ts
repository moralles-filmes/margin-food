import { describe, expect, it } from 'vitest';
import { bankLineKey } from '@/lib/conciliacaoConciliados';
import { reservarOcorrencias, type LinhaComOcorrencia } from '@/lib/conciliacaoOcorrencia';

type Linha = LinhaComOcorrencia & { id: string; fitId?: string };

const venda = (id: string, extra: Partial<Linha> = {}): Linha => ({
  id,
  data: '2026-09-29',
  valor: 57.3,
  tipo: 'RECEITA',
  descricao: 'VENDA CREDITO VISA',
  ...extra,
});

const CHAVE = bankLineKey(venda('x'));

function indicesDe(reserva: { indices: Map<Linha, number> }, linhas: Linha[]) {
  return linhas.map(l => reserva.indices.get(l));
}

describe('reservarOcorrencias', () => {
  it('três vendas iguais no mesmo envio recebem 0, 1 e 2', () => {
    const linhas = [venda('a'), venda('b'), venda('c')];
    const reserva = reservarOcorrencias(linhas, linhas, {});
    expect(indicesDe(reserva, linhas)).toEqual([0, 1, 2]);
    expect(reserva.livres[CHAVE]).toBe(3);
  });

  it('continua depois das linhas iguais já reconhecidas (igual à fórmula antiga num envio só)', () => {
    const linhas = [venda('a', { jaConciliada: true }), venda('b'), venda('c')];
    const reserva = reservarOcorrencias(linhas, linhas.slice(1), {});
    expect(indicesDe(reserva, linhas.slice(1))).toEqual([1, 2]);
  });

  it('linha reconhecida pelo FITID depois das novas também conta — não vira possível duplicata', () => {
    const linhas = [venda('a'), venda('b'), venda('c', { fitId: 'F3', jaConciliada: true })];
    const reserva = reservarOcorrencias(linhas, linhas.slice(0, 2), {});
    expect(indicesDe(reserva, linhas.slice(0, 2))).toEqual([1, 2]);
  });

  it('processar em etapas não repete o índice da 1ª venda', () => {
    const [a, b, c] = [venda('a'), venda('b'), venda('c')];
    const primeira = reservarOcorrencias([a, b, c], [a], {});
    expect(primeira.indices.get(a)).toBe(0);

    // `a` foi gravada e saiu da lista; a 2ª etapa parte do que ficou gravado.
    const segunda = reservarOcorrencias([b, c], [b], primeira.livres);
    expect(segunda.indices.get(b)).toBe(1);
    const terceira = reservarOcorrencias([c], [c], segunda.livres);
    expect(terceira.indices.get(c)).toBe(2);
  });

  it('fora de ordem os índices seguem a ordem de criação, não a posição no arquivo', () => {
    const [a, b, c] = [venda('a'), venda('b'), venda('c')];
    const primeira = reservarOcorrencias([a, b, c], [c], {});
    expect(primeira.indices.get(c)).toBe(0);
    const segunda = reservarOcorrencias([a, b], [a, b], primeira.livres);
    expect(indicesDe(segunda, [a, b])).toEqual([1, 2]);
  });

  it('linha recusada como possível duplicata reenvia com o índice guardado', () => {
    const a = venda('a', { ocorrencia: 0 });
    const c = venda('c');
    const reserva = reservarOcorrencias([a, c], [a, c], { [CHAVE]: 2 });
    expect(reserva.indices.get(a)).toBe(0);
    expect(reserva.indices.get(c)).toBe(2);
  });

  it('sem o registro da sessão, linha nova nunca repete um índice guardado', () => {
    const a = venda('a', { ocorrencia: 3 });
    const b = venda('b');
    const reserva = reservarOcorrencias([a, b], [b], {});
    expect(reserva.indices.get(b)).toBe(4);
  });

  it('repetir o mesmo envio devolve os mesmos índices', () => {
    const linhas = [venda('a', { jaConciliada: true }), venda('b'), venda('c')];
    const livres = { [CHAVE]: 1 };
    const um = reservarOcorrencias(linhas, linhas.slice(1), livres);
    const dois = reservarOcorrencias(linhas, linhas.slice(1), livres);
    expect(indicesDe(um, linhas.slice(1))).toEqual(indicesDe(dois, linhas.slice(1)));
    expect(livres).toEqual({ [CHAVE]: 1 });
  });

  it('conta separado por conteúdo; espaço e acento na descrição não mudam o conteúdo', () => {
    const a = venda('a');
    const b = venda('b', { descricao: '  venda   crédito visa ' });
    const outra = venda('c', { valor: 12 });
    const reserva = reservarOcorrencias([a, b, outra], [a, b, outra], {});
    expect(indicesDe(reserva, [a, b, outra])).toEqual([0, 1, 0]);
  });
});
