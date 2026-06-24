// ────────────────────────────────────────────────────────────────────────────
// Tipos do sub-módulo Cotação (RFQ) em COMPRAS.
//
// ISOLADO do legado: NÃO confundir com os tipos `Cotacao`/`CotacaoFornecedor`
// de `src/hooks/useComprasStore.ts` (localStorage, sem Supabase). Este módulo
// usa exclusivamente os tipos abaixo, espelhando o schema de banco
// (migration 20260624100100_cotacoes_schema.sql).
// ────────────────────────────────────────────────────────────────────────────

export type CotacaoStatus =
  | 'RASCUNHO'
  | 'EM_COTACAO'
  | 'RESPONDIDA'
  | 'EM_ANALISE'
  | 'NEGOCIANDO'
  | 'ENCERRADA'
  | 'CONVERTIDA'
  | 'CANCELADA';

export type CotacaoOriginType = 'MANUAL' | 'ALERTA' | 'REQUISICAO';

export type CotacaoFornecedorStatus =
  | 'AGUARDANDO'
  | 'ENVIADO'
  | 'RESPONDIDO'
  | 'RECUSADO'
  | 'NEGOCIANDO'
  | 'FECHADO';

export type CotacaoSugestaoTipo =
  | 'MENOR_PRECO'
  | 'OTIMIZADA_PEDIDO_MINIMO'
  | 'MENOS_FORNECEDORES'
  | 'CUSTO_BENEFICIO'
  | 'IA'
  | 'MANUAL';

export type CotacaoWhatsappTipo =
  | 'SOLICITACAO_COTACAO'
  | 'COBRANCA_RESPOSTA'
  | 'NEGOCIACAO'
  | 'FECHAMENTO_PEDIDO'
  | 'CONFIRMACAO_PRAZO';

export type CotacaoWhatsappStatus = 'PENDING' | 'SENT' | 'ERROR';

/** Cabeçalho da cotação (tabela `cotacoes`). */
export interface Cotacao {
  id: string;
  company_id: string;
  codigo: string;
  titulo: string;
  status: CotacaoStatus;
  data_envio: string | null;
  data_validade: string | null;
  observacao: string | null;
  origin_type: CotacaoOriginType | null;
  origin_ref: string | null;
  total_estimado: number;
  economia_estimada: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

/** Item a cotar (tabela `cotacao_itens`). */
export interface CotacaoItem {
  id: string;
  cotacao_id: string;
  company_id: string;
  produto_id: string | null;
  produto_nome_snapshot: string;
  unidade_snapshot: string | null;
  purchase_unit_snapshot: string | null;
  quantidade: number;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}

/** Fornecedor participante (tabela `cotacao_fornecedores`). */
export interface CotacaoFornecedor {
  id: string;
  cotacao_id: string;
  company_id: string;
  supplier_id: string | null;
  supplier_nome_snapshot: string;
  whatsapp_snapshot: string | null;
  pedido_minimo_snapshot: number;
  status: CotacaoFornecedorStatus;
  prazo_entrega_dias: number | null;
  condicao_pagamento: string | null;
  frete: number;
  observacao: string | null;
  mensagem_enviada_em: string | null;
  respondido_em: string | null;
  created_at: string;
  updated_at: string;
}

/** Resposta de preço (tabela `cotacao_respostas`). */
export interface CotacaoResposta {
  id: string;
  cotacao_fornecedor_id: string;
  cotacao_item_id: string;
  company_id: string;
  preco_unitario: number | null;
  quantidade_disponivel: number | null;
  disponivel: boolean;
  observacao: string | null;
  selecionado: boolean;
  created_at: string;
  updated_at: string;
}

/** Sugestão/recomendação persistida (tabela `cotacao_sugestoes`). */
export interface CotacaoSugestao {
  id: string;
  cotacao_id: string;
  company_id: string;
  tipo: CotacaoSugestaoTipo;
  total_estimado: number;
  economia_estimada: number;
  dados_json: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

/** Log de WhatsApp/Z-API (tabela `cotacao_whatsapp_logs`). */
export interface CotacaoWhatsappLog {
  id: string;
  cotacao_id: string;
  cotacao_fornecedor_id: string | null;
  company_id: string;
  tipo: CotacaoWhatsappTipo;
  phone: string | null;
  message: string | null;
  zapi_response: Record<string, unknown> | null;
  status: CotacaoWhatsappStatus;
  sent_at: string | null;
  created_by: string;
  created_at: string;
}

/** Config Z-API por empresa (tabela `cotacao_zapi_config`). */
export interface CotacaoZapiConfig {
  id: string;
  company_id: string;
  instance_id: string | null;
  token: string | null;
  client_token: string | null;
  base_url: string;
  default_phone: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/** Contadores para os cards de resumo da tela principal. */
export interface CotacaoCounts {
  emAberto: number;        // RASCUNHO + EM_COTACAO + NEGOCIANDO
  aguardandoResposta: number; // EM_COTACAO
  emAnalise: number;       // RESPONDIDA + EM_ANALISE
  convertidas: number;     // CONVERTIDA
  economiaMes: number;     // soma de economia_estimada no mês corrente
}

/** Status que contam como "cotação aberta" (badge no SubmoduleSwitcher). */
export const COTACAO_STATUS_ABERTOS: CotacaoStatus[] = ['RASCUNHO', 'EM_COTACAO', 'NEGOCIANDO'];
