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
  [/OPTIMISTIC_LOCK_CONFLICT/, 'Este boleto foi alterado por outra pessoa. Recarregue e tente de novo.'],
  [/CMV_DECISAO_OBRIGATORIA/, 'Informe se o boleto aparece no CMV financeiro.'],
  [/RATEIO_NAO_FECHA/, 'A soma do rateio precisa fechar com o valor do boleto.'],
  [/CMV_ALVO_INVALIDO/, 'Este boleto tem rateio: classifique cada linha.'],
  [/CMV_LOTE_INVALIDO/, 'Selecione de 1 a 500 linhas por vez.'],
  [/CMV_PERIODO_LONGO/, 'O período máximo é de 12 meses.'],
  [/CMV_PERIODO_/, 'Período inválido.'],
  [/STATUS_INVALIDO/, 'Boleto cancelado não pode ser classificado.'],
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
}

export function parseCmvConfig(raw: unknown): CmvConfig {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const categorias = Array.isArray(o.categorias) ? o.categorias : [];
  return {
    classificacaoAtiva: o.classificacao_ativa === true,
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

export interface CmvLinhaDetalhe {
  contaPagarId: string;
  rateioId: string | null;
  descricao: string;
  fornecedor: string | null;
  dataCompetencia: string | null;
  dataVencimento: string | null;
  status: string;
  categoriaId: string | null;
  categoriaNome: string | null;
  tituloCentavos: number;
  linhaCentavos: number;
  cmvIncluir: CmvDecisao;
  updatedAt: string;
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
      if (typeof l?.conta_pagar_id !== 'string') return [];
      return [{
        contaPagarId: l.conta_pagar_id,
        rateioId: texto(l.rateio_id),
        descricao: texto(l.descricao) ?? '(sem descrição)',
        fornecedor: texto(l.fornecedor),
        dataCompetencia: texto(l.data_competencia),
        dataVencimento: texto(l.data_vencimento),
        status: texto(l.status) ?? '',
        categoriaId: texto(l.categoria_id),
        categoriaNome: texto(l.categoria_nome),
        tituloCentavos: Number(l.titulo_centavos) || 0,
        linhaCentavos: Number(l.linha_centavos) || 0,
        cmvIncluir: typeof l.cmv_incluir === 'boolean' ? l.cmv_incluir : null,
        updatedAt: texto(l.updated_at) ?? '',
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

export interface CmvItemClassificacao {
  contaPagarId: string;
  rateioId: string | null;
  incluir: CmvDecisao;
  expectedUpdatedAt: string;
}

export async function classificarCmv(supabase: Supabase, itens: CmvItemClassificacao[], justificativa?: string) {
  const { data, error } = await rpc(supabase)('fin_cmv_classificar', {
    p_itens: itens.map(i => ({
      conta_pagar_id: i.contaPagarId,
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
