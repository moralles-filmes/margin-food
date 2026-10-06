import SuppliersView from '@/components/SuppliersView';
import { useSuppliers } from '@/hooks/useSuppliers';
import { SUPPLIER_KEYS_FINANCEIRO } from '@/domain/compras/fornecedores';

/**
 * Fornecedores em Cadastros Base: a mesma tabela e a mesma tela de Compras.
 * Muda só a permissão de gerenciar (`financeiro:cadastros:*`).
 */
export default function FornecedoresFinSection() {
  const store = useSuppliers();
  return <SuppliersView store={store} permissionKeys={SUPPLIER_KEYS_FINANCEIRO} />;
}
