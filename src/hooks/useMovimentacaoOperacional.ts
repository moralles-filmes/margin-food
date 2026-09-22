import { useCallback, useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import type {
  MovimentacaoOperacionalRegistrada,
  MovimentacaoOperacionalTipo,
  ProdutoOperacional,
  SetorOperacional,
} from '@/domain/estoque/operacional';
import { traduzirErroOperacional } from '@/domain/estoque/operacional';

/**
 * ─── Acesso a dados do submódulo Movimentação Operacional ───
 *
 * Todas as chamadas passam pelas RPCs `op_*`. Este hook NÃO consulta `produtos`
 * nem `movimentacoes_estoque` direto: as policies dessas tabelas devolvem a
 * linha inteira via PostgREST, incluindo custo — abrir uma leitura direta aqui
 * colocaria valor financeiro no Network de um usuário operacional, que é
 * exatamente o que este módulo precisa evitar.
 */

export interface HistoricoOperacionalItem {
  id: string;
  criadoEm: string;
  produtoNome: string;
  unidadeMedida: string;
  tipo: string;
  quantidade: number;
  setor: string;
  responsavel: string;
}

interface RegistrarInput {
  produtoId: string;
  setorId: string;
  tipo: MovimentacaoOperacionalTipo;
  quantidade: number;
  observacao?: string;
  /** Gerado uma vez por confirmação; reenvio devolve a movimentação original. */
  clientRequestId: string;
}

export function useMovimentacaoOperacional() {
  const supabase = useSupabase();

  const [setores, setSetores] = useState<SetorOperacional[]>([]);
  const [setoresLoading, setSetoresLoading] = useState(true);
  const [setoresErro, setSetoresErro] = useState<string | null>(null);

  // ─── Setores autorizados ───
  const carregarSetores = useCallback(async () => {
    setSetoresLoading(true);
    setSetoresErro(null);
    const { data, error } = await supabase.rpc('op_list_setores');
    if (error) {
      console.error('[useMovimentacaoOperacional] op_list_setores', error);
      setSetoresErro(traduzirErroOperacional(error.message));
      setSetores([]);
    } else {
      setSetores((data ?? []).map(row => ({ setorId: row.setor_id, nome: row.nome })));
    }
    setSetoresLoading(false);
  }, [supabase]);

  useEffect(() => { void carregarSetores(); }, [carregarSetores]);

  // ─── Produtos do setor ───
  //
  // Cada busca carrega um token; respostas fora de ordem de requisições
  // anteriores são descartadas, senão digitar rápido faz a lista piscar com o
  // resultado de um termo antigo.
  const buscaTokenRef = useRef(0);

  const buscarProdutos = useCallback(async (
    setorId: string,
    termo: string,
  ): Promise<{ produtos: ProdutoOperacional[]; erro: string | null; obsoleto: boolean }> => {
    const token = ++buscaTokenRef.current;
    const { data, error } = await supabase.rpc('op_list_produtos', {
      p_setor_id: setorId,
      p_search: termo.trim() || undefined,
      p_limit: 50,
    });

    if (token !== buscaTokenRef.current) {
      return { produtos: [], erro: null, obsoleto: true };
    }
    if (error) {
      console.error('[useMovimentacaoOperacional] op_list_produtos', error);
      return { produtos: [], erro: traduzirErroOperacional(error.message), obsoleto: false };
    }
    return {
      produtos: (data ?? []).map(row => ({
        produtoId: row.produto_id,
        nome: row.nome,
        sku: row.sku,
        unidadeMedida: row.unidade_medida,
        saldo: Number(row.saldo) || 0,
        vinculado: !!row.vinculado,
      })),
      erro: null,
      obsoleto: false,
    };
  }, [supabase]);

  // ─── Registrar entrada/saída ───
  const registrar = useCallback(async (
    input: RegistrarInput,
  ): Promise<{ ok: true; resultado: MovimentacaoOperacionalRegistrada } | { ok: false; erro: string }> => {
    const { data, error } = await supabase.rpc('op_registrar_movimentacao', {
      p_produto_id: input.produtoId,
      p_setor_id: input.setorId,
      p_tipo: input.tipo,
      p_quantidade: input.quantidade,
      p_observacao: input.observacao || undefined,
      p_client_request_id: input.clientRequestId,
    });

    if (error) {
      console.error('[useMovimentacaoOperacional] op_registrar_movimentacao', error);
      return { ok: false, erro: traduzirErroOperacional(error.message) };
    }

    const payload = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      resultado: {
        id: String(payload.id ?? ''),
        idempotente: !!payload.idempotente,
        produtoNome: String(payload.produto_nome ?? ''),
        unidadeMedida: String(payload.unidade_medida ?? ''),
        setor: String(payload.setor ?? ''),
        tipo: (payload.tipo as MovimentacaoOperacionalTipo) ?? input.tipo,
        quantidade: Number(payload.quantidade) || input.quantidade,
        saldoAnterior: Number(payload.saldo_anterior) || 0,
        saldoNovo: Number(payload.saldo_novo) || 0,
      },
    };
  }, [supabase]);

  // ─── Histórico operacional (sem valores) ───
  const carregarHistorico = useCallback(async (
    limite = 20,
  ): Promise<HistoricoOperacionalItem[]> => {
    const { data, error } = await supabase.rpc('op_list_historico', { p_limit: limite });
    if (error) {
      console.error('[useMovimentacaoOperacional] op_list_historico', error);
      return [];
    }
    return (data ?? []).map(row => ({
      id: row.id,
      criadoEm: row.criado_em,
      produtoNome: row.produto_nome,
      unidadeMedida: row.unidade_medida,
      tipo: row.tipo,
      quantidade: Number(row.quantidade) || 0,
      setor: row.setor,
      responsavel: row.responsavel,
    }));
  }, [supabase]);

  return {
    setores, setoresLoading, setoresErro, recarregarSetores: carregarSetores,
    buscarProdutos, registrar, carregarHistorico,
  };
}
