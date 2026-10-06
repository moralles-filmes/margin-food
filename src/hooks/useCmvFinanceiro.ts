import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useDataEvent } from '@/lib/dataEvents';
import {
  CmvContractError,
  buildCmvReport,
  intervaloAnterior,
  parseCmvPayload,
  validarFiltro,
  type CmvDecisao,
  type CmvFiltro,
  type CmvReport,
} from '@/domain/financeiro/cmv';

type Supabase = ReturnType<typeof useSupabase>;
type Rpc = (fn: string, args?: Record<string, unknown>) => {
  abortSignal: (signal: AbortSignal) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
} & Promise<{ data: unknown; error: { code?: string; message: string } | null }>;

// `bind` é obrigatório: `rpc` usa `this` (o cliente). Devolver o método solto fazia toda
// chamada estourar no navegador, antes de sair a requisição.
const rpc = (supabase: Supabase): Rpc => (supabase.rpc as unknown as Rpc).bind(supabase) as Rpc;

export const CMV_QUERY_ROOT = ['financeiro', 'cmv'] as const;

/** `p_categoria_id` que pede só as linhas sem categoria em `list_fin_cmv_linhas`. */
export const CMV_SEM_CATEGORIA_UUID = '00000000-0000-0000-0000-000000000000';

export function isCmvPermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === '42501') return true;
  return typeof message === 'string' && /PERMISSION_DENIED|COMPANY_ACCESS_DENIED/.test(message);
}

/** A migration do CMV ainda não foi aplicada neste banco (função inexistente no PostgREST). */
export function isCmvIndisponivel(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === 'PGRST202' || code === '42883'
    || (typeof message === 'string' && /Could not find the function/i.test(message));
}

const MENSAGENS: [RegExp, string][] = [
  [/OPTIMISTIC_LOCK_CONFLICT/, 'Este registro foi alterado por outra pessoa. Recarregue e tente de novo.'],
  [/CMV_DECISAO_OBRIGATORIA/, 'Informe se o boleto aparece no CMV financeiro.'],
  [/Could not find the function|PGRST202/, 'Recurso ainda não disponível neste ambiente. Tente de novo em alguns minutos.'],
  [/RATEIO_NAO_FECHA/, 'A soma do rateio precisa fechar com o valor do boleto.'],
  [/CMV_ALVO_INVALIDO: lançamento fora/, 'Este lançamento não entra no CMV financeiro (baixa de boleto, receita ou transferência).'],
  [/CMV_ALVO_INVALIDO/, 'Este documento tem rateio: classifique cada linha.'],
  [/CMV_LOTE_INVALIDO/, 'Selecione de 1 a 500 linhas por vez.'],
  [/CMV_PERIODO_LONGO/, 'O período máximo é de 12 meses.'],
  [/CMV_PERIODO_/, 'Período inválido.'],
  [/JUSTIFICATIVA_OBRIGATORIA/, 'Informe a justificativa.'],
  [/COMPETENCIA_INVALIDA/, 'Transferência não aceita competência própria.'],
  [/STATUS_INVALIDO/, 'Registro cancelado não pode ser classificado.'],
  [/PERMISSION_DENIED/, 'Você não tem permissão para esta ação.'],
  [/NOT_FOUND/, 'Registro não encontrado. Recarregue a tela.'],
];

export function mensagemErroCmv(error: unknown, fallback = 'Não foi possível concluir. Tente novamente.'): string {
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message)
    : '';
  return MENSAGENS.find(([padrao]) => padrao.test(message))?.[1] ?? fallback;
}

export async function fetchCmvReport(supabase: Supabase, filtro: CmvFiltro, signal?: AbortSignal): Promise<CmvReport> {
  const anterior = intervaloAnterior(filtro);
  const chamada = rpc(supabase)('get_fin_cmv_financeiro', {
    p_inicio: filtro.inicio,
    p_fim: filtro.fim,
    p_anterior_inicio: anterior.inicio,
    p_anterior_fim: anterior.fim,
  });
  const { data, error } = await (signal ? chamada.abortSignal(signal) : chamada);
  if (error) {
    console.error('[CMV Financeiro] Falha ao carregar get_fin_cmv_financeiro:', error);
    throw error;
  }
  return buildCmvReport(parseCmvPayload(data), filtro);
}

/**
 * Relatório da unidade ativa. A chave inclui unidade e filtro: trocar o filtro
 * começa uma consulta sem dados (nada do filtro anterior fica na tela) e a
 * resposta de um filtro antigo nunca sobrescreve o atual.
 */
export function useCmvReport({ companyId, filtro, enabled }: {
  companyId: string | null | undefined;
  filtro: CmvFiltro;
  enabled: boolean;
}) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const valido = validarFiltro(filtro) === null;
  const query = useQuery({
    queryKey: [...CMV_QUERY_ROOT, 'relatorio', companyId ?? 'unresolved', filtro.modo, filtro.inicio, filtro.fim],
    queryFn: ({ signal }) => fetchCmvReport(supabase, filtro, signal),
    enabled: enabled && Boolean(companyId) && valido,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: (failureCount, error) => failureCount < 1
      && !isCmvPermissionError(error)
      && !isCmvIndisponivel(error)
      && !(error instanceof CmvContractError),
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: CMV_QUERY_ROOT });
  }, [queryClient]);
  // Boleto, rateio, competência, cadastro ou fechamento mudou: a apuração é refeita.
  useDataEvent('financeiro:*', invalidate);

  return query;
}

// ─── Configuração (ativação + padrão por categoria) ──────────────────────────

export interface CmvCategoriaConfig {
  id: string;
  nome: string;
  codigo: string | null;
  parentId: string | null;
  grupo: string | null;
  ativo: boolean;
  cmvSugerir: CmvDecisao;
  updatedAt: string;
}

export interface CmvConfig {
  classificacaoAtiva: boolean;
  categorias: CmvCategoriaConfig[];
  /** O banco já aceita a decisão em Lançamentos e na Conciliação (migration de lançamentos). */
  recursos: { lancamentos: boolean };
}

export function parseCmvConfig(raw: unknown): CmvConfig {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const categorias = Array.isArray(o.categorias) ? o.categorias : [];
  return {
    classificacaoAtiva: o.classificacao_ativa === true,
    recursos: {
      lancamentos: typeof o.recursos === 'object' && o.recursos !== null
        && (o.recursos as Record<string, unknown>).lancamentos === true,
    },
    categorias: categorias.flatMap(item => {
      const c = item as Record<string, unknown>;
      if (typeof c?.id !== 'string') return [];
      return [{
        id: c.id,
        nome: typeof c.nome === 'string' ? c.nome : '',
        codigo: typeof c.codigo === 'string' && c.codigo ? c.codigo : null,
        parentId: typeof c.parent_id === 'string' ? c.parent_id : null,
        grupo: typeof c.grupo === 'string' && c.grupo ? c.grupo : null,
        ativo: c.ativo !== false,
        cmvSugerir: typeof c.cmv_sugerir === 'boolean' ? c.cmv_sugerir : null,
        updatedAt: typeof c.updated_at === 'string' ? c.updated_at : '',
      }];
    }),
  };
}

/** `null` = CMV Financeiro indisponível neste banco (migration não aplicada) ou sem acesso. */
export async function fetchCmvConfig(supabase: Supabase): Promise<CmvConfig | null> {
  // Nunca lança: Contas a Pagar carrega isto junto com categorias e fornecedores,
  // e uma falha do CMV não pode derrubar o formulário.
  try {
    const { data, error } = await rpc(supabase)('get_fin_cmv_config');
    if (error) {
      if (!isCmvIndisponivel(error) && !isCmvPermissionError(error)) {
        console.error('[CMV Financeiro] Falha ao carregar get_fin_cmv_config:', error);
      }
      return null;
    }
    return parseCmvConfig(data);
  } catch (error) {
    console.error('[CMV Financeiro] Falha ao carregar get_fin_cmv_config:', error);
    return null;
  }
}

export function useCmvConfig({ companyId, enabled }: { companyId: string | null | undefined; enabled: boolean }) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: [...CMV_QUERY_ROOT, 'config', companyId ?? 'unresolved'],
    queryFn: () => fetchCmvConfig(supabase),
    enabled: enabled && Boolean(companyId),
    staleTime: 0,
  });
}

// ─── Detalhe / pendências ────────────────────────────────────────────────────

export type CmvSituacao = 'incluido' | 'fora' | 'pendente' | 'sem_competencia' | 'todos';

export type CmvFonte = 'boleto' | 'lancamento';

export interface CmvLinhaDetalhe {
  fonte: CmvFonte;
  /** Id do boleto (fonte boleto) ou do lançamento (fonte lançamento). */
  documentoId: string;
  /** Só boleto; `null` em lançamento. */
  contaPagarId: string | null;
  rateioId: string | null;
  descricao: string;
  fornecedor: string | null;
  /** Lançamento: 'manual' (Livro Razão) ou 'conciliacao'. `null` em boleto. */
  origem: string | null;
  /** Conta bancária do lançamento. */
  contaNome: string | null;
  dataCompetencia: string | null;
  dataVencimento: string | null;
  status: string;
  categoriaId: string | null;
  categoriaNome: string | null;
  tituloCentavos: number;
  linhaCentavos: number;
  cmvIncluir: CmvDecisao;
  updatedAt: string;
  /** Boletos da mesma série de recorrência, contando este (1 = avulso ou lançamento). */
  serieBoletos: number;
}

export interface CmvListaDetalhe {
  totalLinhas: number;
  totalTitulos: number;
  totalCentavos: number;
  itens: CmvLinhaDetalhe[];
}

export interface CmvListaParams {
  inicio: string | null;
  fim: string | null;
  situacao: CmvSituacao;
  categoriaId: string | null;
  /** Só o que foi lançado na própria categoria, sem as subcategorias. */
  soDireto?: boolean;
  limite: number;
  offset: number;
}

export function parseCmvLista(raw: unknown): CmvListaDetalhe {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const itens = Array.isArray(o.itens) ? o.itens : [];
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    totalLinhas: Number(o.total_linhas) || 0,
    totalTitulos: Number(o.total_titulos) || 0,
    totalCentavos: Number(o.total_centavos) || 0,
    itens: itens.flatMap(item => {
      const l = item as Record<string, unknown>;
      const fonte: CmvFonte = l.fonte === 'lancamento' ? 'lancamento' : 'boleto';
      const documentoId = texto(l.documento_id) ?? texto(fonte === 'lancamento' ? l.lancamento_id : l.conta_pagar_id);
      if (!documentoId) return [];
      return [{
        fonte,
        documentoId,
        contaPagarId: fonte === 'boleto' ? documentoId : null,
        rateioId: texto(l.rateio_id),
        descricao: texto(l.descricao) ?? '(sem descrição)',
        fornecedor: texto(l.fornecedor),
        origem: texto(l.origem),
        contaNome: texto(l.conta_nome),
        dataCompetencia: texto(l.data_competencia),
        dataVencimento: texto(l.data_vencimento),
        status: texto(l.status) ?? '',
        categoriaId: texto(l.categoria_id),
        categoriaNome: texto(l.categoria_nome),
        tituloCentavos: Number(l.titulo_centavos) || 0,
        linhaCentavos: Number(l.linha_centavos) || 0,
        cmvIncluir: typeof l.cmv_incluir === 'boolean' ? l.cmv_incluir : null,
        updatedAt: texto(l.updated_at) ?? '',
        serieBoletos: Math.max(1, Number(l.serie_boletos) || 1),
      }];
    }),
  };
}

export async function fetchCmvLinhas(supabase: Supabase, params: CmvListaParams, signal?: AbortSignal): Promise<CmvListaDetalhe> {
  const chamada = rpc(supabase)('list_fin_cmv_linhas', {
    p_inicio: params.inicio,
    p_fim: params.fim,
    p_situacao: params.situacao,
    p_categoria_id: params.categoriaId,
    p_limit: params.limite,
    p_offset: params.offset,
    p_so_direto: params.soDireto ?? false,
  });
  const { data, error } = await (signal ? chamada.abortSignal(signal) : chamada);
  if (error) {
    console.error('[CMV Financeiro] Falha ao carregar list_fin_cmv_linhas:', error);
    throw error;
  }
  return parseCmvLista(data);
}

/** Todas as linhas do escopo (PDF "boletos de origem"), página a página. */
export async function fetchTodasCmvLinhas(
  supabase: Supabase,
  params: Omit<CmvListaParams, 'limite' | 'offset'>,
  signal?: AbortSignal,
): Promise<CmvListaDetalhe> {
  const limite = 500;
  const primeira = await fetchCmvLinhas(supabase, { ...params, limite, offset: 0 }, signal);
  const itens = [...primeira.itens];
  while (itens.length < primeira.totalLinhas) {
    const pagina = await fetchCmvLinhas(supabase, { ...params, limite, offset: itens.length }, signal);
    if (pagina.itens.length === 0) break;
    itens.push(...pagina.itens);
  }
  return { ...primeira, itens };
}

export function useCmvLinhas({ companyId, params, enabled }: {
  companyId: string | null | undefined;
  params: CmvListaParams;
  enabled: boolean;
}) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: [...CMV_QUERY_ROOT, 'linhas', companyId ?? 'unresolved', params],
    queryFn: ({ signal }) => fetchCmvLinhas(supabase, params, signal),
    enabled: enabled && Boolean(companyId),
    staleTime: 0,
    retry: (failureCount, error) => failureCount < 1 && !isCmvPermissionError(error),
  });
}

// ─── Escritas ────────────────────────────────────────────────────────────────

/** Um item da classificação: exatamente um documento (boleto OU lançamento). */
export type CmvItemClassificacao = {
  rateioId: string | null;
  incluir: CmvDecisao;
  expectedUpdatedAt: string;
} & ({ contaPagarId: string; lancamentoId?: never } | { lancamentoId: string; contaPagarId?: never });

/** Item de classificação a partir de uma linha da lista do CMV. */
export function itemDaLinha(linha: CmvLinhaDetalhe, incluir: CmvDecisao): CmvItemClassificacao {
  return linha.fonte === 'lancamento'
    ? { lancamentoId: linha.documentoId, rateioId: linha.rateioId, incluir, expectedUpdatedAt: linha.updatedAt }
    : { contaPagarId: linha.documentoId, rateioId: linha.rateioId, incluir, expectedUpdatedAt: linha.updatedAt };
}

export async function classificarCmv(supabase: Supabase, itens: CmvItemClassificacao[], justificativa?: string) {
  const { data, error } = await rpc(supabase)('fin_cmv_classificar', {
    p_itens: itens.map(i => ({
      ...(i.lancamentoId ? { lancamento_id: i.lancamentoId } : { conta_pagar_id: i.contaPagarId }),
      rateio_id: i.rateioId,
      incluir: i.incluir,
      expected_updated_at: i.expectedUpdatedAt,
    })),
    p_justificativa: justificativa?.trim() || null,
  });
  if (error) {
    console.error('[CMV Financeiro] Falha em fin_cmv_classificar:', error);
    throw error;
  }
  return data as { titulos: number; itens: number };
}

export interface CmvSerieResultado {
  serieTitulos: number;
  titulosAlterados: number;
  linhasAlteradas: number;
  /** Versão do boleto de referência lida pelo servidor (lock da confirmação). */
  referenciaUpdatedAt: string | null;
}

/**
 * Copia a decisão de um boleto para as outras parcelas da série, categoria por
 * categoria. Com `simular`, só conta o que mudaria.
 */
export async function aplicarCmvSerie(
  supabase: Supabase,
  contaPagarId: string,
  opcoes: { expectedUpdatedAt?: string | null; justificativa?: string; simular?: boolean } = {},
): Promise<CmvSerieResultado> {
  const { data, error } = await rpc(supabase)('fin_cmv_aplicar_serie', {
    p_conta_pagar_id: contaPagarId,
    p_expected_updated_at: opcoes.expectedUpdatedAt || null,
    p_justificativa: opcoes.justificativa?.trim() || null,
    p_simular: opcoes.simular ?? false,
  });
  if (error) {
    if (!opcoes.simular) console.error('[CMV Financeiro] Falha em fin_cmv_aplicar_serie:', error);
    throw error;
  }
  const o = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  return {
    serieTitulos: Number(o.serie_titulos) || 0,
    titulosAlterados: Number(o.titulos_alterados) || 0,
    linhasAlteradas: Number(o.linhas_alteradas) || 0,
    referenciaUpdatedAt: typeof o.referencia_updated_at === 'string' ? o.referencia_updated_at : null,
  };
}

export interface CmvPreviaFonte {
  documentos: number;
  linhasSim: number;
  centavosSim: number;
  linhasNao: number;
  centavosNao: number;
  linhasSemPadrao: number;
  centavosSemPadrao: number;
}

export interface CmvPreviaPadroes {
  desde: string;
  boleto: CmvPreviaFonte;
  lancamento: CmvPreviaFonte;
}

export interface CmvPadroesAplicados {
  documentos: number;
  linhas: number;
  centavosSim: number;
  centavosNao: number;
}

const numero = (v: unknown) => Number(v) || 0;

function previaFonte(raw: unknown): CmvPreviaFonte {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    documentos: numero(o.documentos),
    linhasSim: numero(o.linhas_sim),
    centavosSim: numero(o.centavos_sim),
    linhasNao: numero(o.linhas_nao),
    centavosNao: numero(o.centavos_nao),
    linhasSemPadrao: numero(o.linhas_sem_padrao),
    centavosSemPadrao: numero(o.centavos_sem_padrao),
  };
}

/** Prévia de "Aplicar padrões": quantas linhas pendentes viram Sim/Não a partir de `desde`. Não grava. */
export async function simularPadroesCmv(supabase: Supabase, desde: string): Promise<CmvPreviaPadroes> {
  const { data, error } = await rpc(supabase)('fin_cmv_aplicar_padroes', { p_desde: desde, p_simular: true, p_justificativa: null });
  if (error) throw error;
  const o = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  return { desde, boleto: previaFonte(o.boleto), lancamento: previaFonte(o.lancamento) };
}

/** Grava o padrão da categoria nas linhas pendentes a partir de `desde` (com auditoria por documento). */
export async function aplicarPadroesCmv(supabase: Supabase, desde: string, justificativa: string): Promise<CmvPadroesAplicados> {
  const { data, error } = await rpc(supabase)('fin_cmv_aplicar_padroes', {
    p_desde: desde, p_simular: false, p_justificativa: justificativa.trim(),
  });
  if (error) {
    console.error('[CMV Financeiro] Falha em fin_cmv_aplicar_padroes:', error);
    throw error;
  }
  const o = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  return { documentos: numero(o.documentos), linhas: numero(o.linhas), centavosSim: numero(o.centavos_sim), centavosNao: numero(o.centavos_nao) };
}

export async function definirPadraoCategoria(supabase: Supabase, categoriaId: string, sugerir: CmvDecisao, expectedUpdatedAt: string) {
  const { data, error } = await rpc(supabase)('fin_cmv_set_categoria_padrao', {
    p_categoria_id: categoriaId,
    p_sugerir: sugerir,
    p_expected_updated_at: expectedUpdatedAt || null,
  });
  if (error) {
    console.error('[CMV Financeiro] Falha em fin_cmv_set_categoria_padrao:', error);
    throw error;
  }
  return data as { id: string; cmv_sugerir: CmvDecisao; updated_at: string };
}

export async function definirClassificacaoAtiva(supabase: Supabase, ativo: boolean) {
  const { error } = await rpc(supabase)('fin_cmv_set_ativo', { p_ativo: ativo });
  if (error) {
    console.error('[CMV Financeiro] Falha em fin_cmv_set_ativo:', error);
    throw error;
  }
}
