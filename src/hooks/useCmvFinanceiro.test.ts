import { describe, expect, it, vi } from 'vitest';
import {
  aplicarCmvSerie, aplicarPadroesCmv, classificarCmv, fetchCmvConfig, fetchCmvLinhas, fetchCmvReport,
  itemDaLinha, mensagemErroCmv, parseCmvConfig, parseCmvLista, simularPadroesCmv,
} from './useCmvFinanceiro';
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

  it('lista: item de lançamento identifica a fonte; item de boleto mantém o id do boleto', () => {
    const lista = parseCmvLista({ itens: [
      { fonte: 'lancamento', documento_id: 'l1', lancamento_id: 'l1', conta_pagar_id: null, origem: 'conciliacao', conta_nome: 'Banco', descricao: 'PIX', updated_at: 't' },
      { conta_pagar_id: 'b1', descricao: 'Boleto', updated_at: 't' },
    ] });
    expect(lista.itens[0]).toMatchObject({ fonte: 'lancamento', documentoId: 'l1', contaPagarId: null, origem: 'conciliacao', contaNome: 'Banco' });
    expect(lista.itens[1]).toMatchObject({ fonte: 'boleto', documentoId: 'b1', contaPagarId: 'b1', origem: null });
  });

  it('classificar envia lancamento_id para lançamento e conta_pagar_id para boleto', async () => {
    const cliente = new ClienteComThis({ fin_cmv_classificar: { titulos: 2, itens: 2 } });
    const [lanc, bol] = parseCmvLista({ itens: [
      { fonte: 'lancamento', documento_id: 'l1', rateio_id: null, descricao: 'PIX', updated_at: 't1' },
      { fonte: 'boleto', documento_id: 'b1', conta_pagar_id: 'b1', rateio_id: 'r1', descricao: 'Boleto', updated_at: 't2' },
    ] }).itens;
    await classificarCmv(como(cliente), [itemDaLinha(lanc, true), itemDaLinha(bol, false)]);
    expect(cliente.chamadas[0].args).toEqual({ p_itens: [
      { lancamento_id: 'l1', rateio_id: null, incluir: true, expected_updated_at: 't1' },
      { conta_pagar_id: 'b1', rateio_id: 'r1', incluir: false, expected_updated_at: 't2' },
    ], p_justificativa: null });
  });

  it('configuração informa o recurso de lançamentos; banco antigo responde sem ele', () => {
    expect(parseCmvConfig({ classificacao_ativa: true, categorias: [], recursos: { lancamentos: true } }).recursos.lancamentos).toBe(true);
    expect(parseCmvConfig({ classificacao_ativa: true, categorias: [] }).recursos.lancamentos).toBe(false);
  });

  it('aplicar padrões: prévia e gravação chamam a mesma RPC', async () => {
    const cliente = new ClienteComThis({ fin_cmv_aplicar_padroes: {
      simulado: true, desde: '2026-09-01',
      boleto: { documentos: 1, linhas_sim: 1, centavos_sim: 1600, linhas_nao: 0, centavos_nao: 0, linhas_sem_padrao: 0, centavos_sem_padrao: 0 },
      lancamento: { documentos: 3, linhas_sim: 2, centavos_sim: 2100, linhas_nao: 1, centavos_nao: 1200, linhas_sem_padrao: 2, centavos_sem_padrao: 1800 },
    } });
    const previa = await simularPadroesCmv(como(cliente), '2026-09-01');
    expect(previa.lancamento).toEqual({ documentos: 3, linhasSim: 2, centavosSim: 2100, linhasNao: 1, centavosNao: 1200, linhasSemPadrao: 2, centavosSemPadrao: 1800 });
    expect(cliente.chamadas[0].args).toEqual({ p_desde: '2026-09-01', p_simular: true, p_justificativa: null });

    const gravacao = new ClienteComThis({ fin_cmv_aplicar_padroes: { simulado: false, documentos: 4, linhas: 4, centavos_sim: 3700, centavos_nao: 1200 } });
    expect(await aplicarPadroesCmv(como(gravacao), '2026-09-01', '  revisão inicial ')).toEqual({ documentos: 4, linhas: 4, centavosSim: 3700, centavosNao: 1200 });
    expect(gravacao.chamadas[0].args).toEqual({ p_desde: '2026-09-01', p_simular: false, p_justificativa: 'revisão inicial' });
  });

  it('mensagens do servidor: lançamento fora do CMV vem antes do aviso genérico de rateio', () => {
    expect(mensagemErroCmv({ message: 'CMV_ALVO_INVALIDO: lançamento fora do CMV financeiro' })).toMatch(/Este lançamento não entra no CMV financeiro/);
    expect(mensagemErroCmv({ message: 'CMV_ALVO_INVALIDO' })).toBe('Este documento tem rateio: classifique cada linha.');
    expect(mensagemErroCmv({ message: 'NOT_FOUND: documento' })).toBe('Registro não encontrado. Recarregue a tela.');
    expect(mensagemErroCmv({ message: 'STATUS_INVALIDO' })).toBe('Registro cancelado não pode ser classificado.');
  });

  it('tempo esgotado no servidor (statement_timeout) diz que nada foi gravado, em vez da mensagem genérica', () => {
    expect(mensagemErroCmv({ code: '57014', message: 'canceling statement due to statement timeout' }))
      .toBe('A operação demorou demais e foi cancelada; nada foi gravado. Tente de novo ou use um período menor.');
  });

  it('a configuração nunca lança: falha inesperada vira "indisponível"', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const quebrado = { rpc() { throw new TypeError('boom'); } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(fetchCmvConfig(quebrado as any)).resolves.toBeNull();
    erro.mockRestore();
  });
});
