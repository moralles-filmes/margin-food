import { describe, expect, it, vi } from 'vitest';
import { aplicarCmvSerie, classificarCmv, fetchCmvConfig, fetchCmvLinhas, fetchCmvReport, parseCmvLista } from './useCmvFinanceiro';
import { CMV_FILTRO_SEMANA, cmvPayloadCru } from '@/test/fixtures/cmvFinanceiro';

/**
 * Cliente cujo `rpc` depende do `this`, como o do supabase-js. Um mock de função
 * solta não pega o método chamado sem o cliente — foi assim que o CMV estourou
 * em produção e levou junto o carregamento de categorias/fornecedores de Contas a Pagar.
 */
class ClienteComThis {
  chamadas: { fn: string; args?: Record<string, unknown> }[] = [];
  constructor(private respostas: Record<string, unknown>) {}
  rpc(fn: string, args?: Record<string, unknown>) {
    this.chamadas.push({ fn, args });
    const resultado = Promise.resolve({ data: this.respostas[fn] ?? null, error: null });
    return Object.assign(resultado, { abortSignal: () => resultado });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const como = (c: ClienteComThis) => c as any;

describe('useCmvFinanceiro — chamadas ao cliente Supabase', () => {
  it('chama as RPCs preservando o `this` do cliente', async () => {
    const cliente = new ClienteComThis({
      get_fin_cmv_config: { classificacao_ativa: true, categorias: [{ id: 'c1', nome: 'Peixes', cmv_sugerir: true }] },
      get_fin_cmv_financeiro: cmvPayloadCru(),
      list_fin_cmv_linhas: { total_linhas: 0, total_titulos: 0, total_centavos: 0, itens: [] },
      fin_cmv_classificar: { titulos: 1, itens: 1 },
      fin_cmv_aplicar_serie: { serie_titulos: 36, titulos_alterados: 35, linhas_alteradas: 35, simulado: false, referencia_updated_at: 't1' },
    });

    const config = await fetchCmvConfig(como(cliente));
    expect(config).toMatchObject({ classificacaoAtiva: true, categorias: [{ id: 'c1', cmvSugerir: true }] });

    const report = await fetchCmvReport(como(cliente), CMV_FILTRO_SEMANA, new AbortController().signal);
    expect(report.atual.cmvCentavos).toBeGreaterThan(0);

    const lista = await fetchCmvLinhas(como(cliente), { inicio: null, fim: null, situacao: 'pendente', categoriaId: null, limite: 50, offset: 0 });
    expect(lista.totalLinhas).toBe(0);

    await classificarCmv(como(cliente), [{ contaPagarId: 'a', rateioId: null, incluir: true, expectedUpdatedAt: '2026-01-01T00:00:00Z' }]);

    const serie = await aplicarCmvSerie(como(cliente), 'a', { expectedUpdatedAt: '2026-01-01T00:00:00Z' });
    expect(serie).toEqual({ serieTitulos: 36, titulosAlterados: 35, linhasAlteradas: 35, referenciaUpdatedAt: 't1' });

    expect(cliente.chamadas.map(c => c.fn)).toEqual([
      'get_fin_cmv_config', 'get_fin_cmv_financeiro', 'list_fin_cmv_linhas', 'fin_cmv_classificar', 'fin_cmv_aplicar_serie',
    ]);
    expect(cliente.chamadas[4].args).toEqual({
      p_conta_pagar_id: 'a', p_expected_updated_at: '2026-01-01T00:00:00Z', p_justificativa: null, p_simular: false,
    });
  });

  it('tamanho da série: banco antigo (sem o campo) vira boleto avulso', () => {
    const linha = { conta_pagar_id: 'a', descricao: 'x', updated_at: 't' };
    expect(parseCmvLista({ itens: [linha] }).itens[0].serieBoletos).toBe(1);
    expect(parseCmvLista({ itens: [{ ...linha, serie_boletos: 36 }] }).itens[0].serieBoletos).toBe(36);
  });

  it('a configuração nunca lança: falha inesperada vira "indisponível"', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const quebrado = { rpc() { throw new TypeError('boom'); } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(fetchCmvConfig(quebrado as any)).resolves.toBeNull();
    erro.mockRestore();
  });
});
