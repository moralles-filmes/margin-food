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
  system_key: string | null;
  excluir_dos_totais: boolean;
  ativo: boolean;
  updated_at: string;
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
  /** Herdado da raiz por trigger: fora do resultado do DRE/DFC e dos relatórios. */
  excluir_dos_totais?: boolean | null;
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
  /** Data em que o dinheiro saiu/entrou. É esta — não a competência — que bate
   *  com a linha do extrato quando o lançamento veio de uma baixa em CP/CR. */
  data_pagamento?: string | null;
  valor: number;
  tipo: string;
  descricao: string;
  conciliado: boolean | null;
  conta_id: string;
  origem?: string | null;
  /** Runtime flag: true if from same bank account */
  _sameAccount?: boolean;
  /** Runtime flag: lançamento já realizado e conciliado que veio de Contas a
   *  Pagar/Receber — casar com ele significa vincular, nunca criar outro. */
  _jaNoRazao?: boolean;
}

/** Boleto em aberto no seletor manual da conciliação (list_fin_contas_pagar_abertas) */
export interface ContaPagarAberta {
  id: string;
  descricao: string;
  fornecedor: string | null;
  valor: number;
  status: string;
  data_vencimento: string;
  data_competencia: string | null;
  conta_id: string | null;
  categoria_id: string | null;
  tem_categoria: boolean;
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

