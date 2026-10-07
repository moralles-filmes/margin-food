/**
 * Cadastro de fornecedores (`suppliers`) — compartilhado por Compras, Salmão e
 * Financeiro. A mesma linha do banco serve aos três módulos; aqui ficam só o
 * mapeamento linha → `Supplier` e a tradução das recusas do banco.
 */
import type { Supplier } from '@/types/salmon';

/** Chaves que liberam criar/editar/excluir. A tabela é a mesma; muda só quem gerencia em cada módulo. */
export interface SupplierPermissionKeys {
  create: string;
  edit: string;
  delete: string;
}

export const SUPPLIER_KEYS_COMPRAS: SupplierPermissionKeys = {
  create: 'compras:fornecedores:create',
  edit: 'compras:fornecedores:edit',
  delete: 'compras:fornecedores:delete',
};

export const SUPPLIER_KEYS_FINANCEIRO: SupplierPermissionKeys = {
  create: 'financeiro:cadastros:create',
  edit: 'financeiro:cadastros:edit',
  delete: 'financeiro:cadastros:delete',
};

type SupplierContactInfo =Pick<Supplier, 'cnpj' | 'contact' | 'notes' | 'categoriasAtendidas' | 'prazoEntregaPadrao' | 'formaPagamentoPadrao'>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- linha crua do PostgREST (contact_info é jsonb livre)
export function mapSupplierRow(row: any): Supplier {
  const info = row.contact_info ?? {};
  return {
    id: row.id,
    name: row.name,
    cnpj: info.cnpj || '',
    contact: info.contact || '',
    notes: info.notes || '',
    active: row.is_active,
    categoriasAtendidas: info.categoriasAtendidas || [],
    prazoEntregaPadrao: info.prazoEntregaPadrao || 0,
    formaPagamentoPadrao: info.formaPagamentoPadrao || '',
    createdAt: row.created_at,
    pedidoMinimoValor: Number(row.minimum_order_value) || 0,
    pedidoMinimoQtd: Number(row.minimum_order_quantity) || 0,
    whatsappNumber: row.whatsapp_number || '',
  };
}

/** Campos guardados no jsonb `contact_info`. */
export function supplierContactInfo(s: Partial<Supplier>): SupplierContactInfo {
  return {
    cnpj: s.cnpj || '',
    contact: s.contact || '',
    notes: s.notes || '',
    categoriasAtendidas: s.categoriasAtendidas || [],
    prazoEntregaPadrao: s.prazoEntregaPadrao || 0,
    formaPagamentoPadrao: s.formaPagamentoPadrao || '',
  };
}

export type AcaoFornecedor = 'cadastrar' | 'atualizar' | 'excluir';

/**
 * Traduz a recusa do banco. A exclusão física falha por FK quando o fornecedor
 * já está em conta a pagar/receber, pedido ou cotação — o caminho é desativar.
 */
export function mensagemErroFornecedor(acao: AcaoFornecedor, error: { code?: string; message?: string }): string {
  if (error.code === '23503') {
    return 'Este fornecedor já foi usado em contas, pedidos ou cotações e não pode ser excluído. Desative-o para tirá-lo das listas.';
  }
  if (error.code === '23505' && (error.message ?? '').includes('suppliers_name_company_key')) {
    return 'Já existe um fornecedor com este nome nesta unidade. Confira a lista.';
  }
  if (error.code === '42501') {
    return `Sem permissão para ${acao} fornecedores nesta unidade.`;
  }
  return `Erro ao ${acao} fornecedor: ${error.message ?? 'erro desconhecido'}`;
}
