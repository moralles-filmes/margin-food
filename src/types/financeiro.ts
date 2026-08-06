/**
 * Typed contracts for Financeiro module — eliminates `any[]` in components.
 */

/** Cursor-paginated list response from _guarded RPCs */
export interface CursorListResponse<T> {
  items: T[];
  has_more: boolean;
}

/** Status counts returned by get_fin_counts_by_status */
export interface FinStatusCounts {
  total_pagar_pendente: number;
  vencidas_pagar: number;
  total_receber_pendente: number;
  vencidas_receber: number;
}

/** DFC summary RPC response */
export interface DfcSummary {
  categorias: DfcCategoria[];
  valores_por_categoria: Record<string, number>;
  saldo_inicial: number;
}

export interface DfcCategoria {
  id: string;
  nome: string;
  tipo: string;
  codigo: string | null;
  parent_id: string | null;
  ordem: number | null;
  grupo: string | null;
  linha_dre: string | null;
}

/** Job role (admin panel) */
export interface JobRole {
  id: string;
  nome: string;
  descricao: string | null;
  is_active: boolean;
  created_at: string;
}

/** Conta bancária (projection: id, nome + campos opcionais para verificação de extrato) */
export interface ContaBancariaRef {
  id: string;
  nome: string;
  numero_conta?: string | null;
  agencia?: string | null;
  banco?: string | null;
}

/** Categoria financeira (projection used in conciliação) */
export interface CategoriaFinRef {
  id: string;
  nome: string;
  tipo?: string | null;
  centro_custo_padrao_id: string | null;
}

/** Centro de custo (projection: id, nome) */
export interface CentroCustoRef {
  id: string;
  nome: string;
}

/** Lançamento financeiro row (conciliação projection) */
export interface LancamentoConciliacao {
  id: string;
  data_competencia: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  valor: number;
  tipo: string;
  descricao: string;
  observacoes: string | null;
  conta_id: string;
  categoria_id: string | null;
  centro_custo_id: string | null;
  forma_pagamento: string | null;
  status: string;
  origem: string;
  recorrente: boolean | null;
  conciliado: boolean | null;
  conciliado_em: string | null;
  conciliado_por: string | null;
  created_at: string;
  updated_at: string;
}

/** Lançamento candidate for matching (broader projection) */
export interface LancamentoCandidate {
  id: string;
  data_competencia: string;
  valor: number;
  tipo: string;
  descricao: string;
  conciliado: boolean | null;
  conta_id: string;
  /** Runtime flag: true if from same bank account */
  _sameAccount?: boolean;
}

/** Conta a pagar candidate for matching */
export interface ContaPagarCandidate {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  status: string;
  fornecedor: string | null;
  recorrente: boolean;
  recorrencia_config: unknown;
}

/** Conta a receber candidate for matching */
export interface ContaReceberCandidate {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  status: string;
  cliente: string | null;
  recorrente: boolean;
  recorrencia_config: unknown;
}

/** Paginated response contract */
export interface PaginatedResponse<T> {
  data: T[];
  count: number | null;
  hasMore: boolean;
}

/** Audit log row */
export interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  module: string;
  severity: string;
  actor_email: string | null;
  actor_role: string | null;
  created_at: string;
  before: unknown;
  after: unknown;
  metadata: unknown;
}
