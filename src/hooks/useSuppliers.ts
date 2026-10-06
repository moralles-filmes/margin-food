import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useDataEvent, useEmitDataEvent } from '@/lib/dataEvents';
import { sortByName } from '@/lib/sortByName';
import { useCan } from '@/permissions/hooks';
import {
  SUPPLIER_KEYS_COMPRAS, SUPPLIER_KEYS_FINANCEIRO, mapSupplierRow, mensagemErroFornecedor, supplierContactInfo,
  type AcaoFornecedor,
} from '@/domain/compras/fornecedores';
import type { Supplier } from '@/types/salmon';

export type NovoFornecedor = Omit<Supplier, 'id' | 'createdAt'>;
type Cliente = ReturnType<typeof useSupabase>;

/** Canal de dados avisado a cada gravação em `suppliers` (fora de `compras:*` para não recontar badges). */
export const CANAL_FORNECEDORES = 'fornecedores';

const CAMPOS_CONTATO = ['cnpj', 'contact', 'notes', 'categoriasAtendidas', 'prazoEntregaPadrao', 'formaPagamentoPadrao'] as const;

/**
 * Grava um fornecedor sem carregar a lista (atalho de cadastro rápido).
 * Lança `Error` com a mensagem já traduzida para a tela.
 */
export async function inserirFornecedor(client: Cliente, companyId: string | null, s: NovoFornecedor): Promise<Supplier> {
  if (!companyId) throw new Error('Unidade não selecionada');
  const { data, error } = await client
    .from('suppliers')
    .insert({
      company_id: companyId,
      name: s.name,
      is_active: s.active,
      contact_info: supplierContactInfo(s),
      minimum_order_value: s.pedidoMinimoValor ?? 0,
      minimum_order_quantity: s.pedidoMinimoQtd ?? 0,
      whatsapp_number: s.whatsappNumber || null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- contact_info é jsonb livre nos tipos gerados
    } as any)
    .select()
    .single();
  if (error) {
    console.error('Erro ao cadastrar fornecedor', error);
    throw new Error(mensagemErroFornecedor('cadastrar', error));
  }
  return mapSupplierRow(data);
}

/**
 * Fonte única do cadastro de fornecedores (`suppliers`) da unidade ativa —
 * a mesma lista em Compras, Salmão e Financeiro. Gravações avisam o erro e
 * lançam, para a tela não mostrar sucesso de algo que o banco recusou.
 */
export function useSuppliers() {
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const toast = useScopedToast();
  const emitDataEvent = useEmitDataEvent();
  const [suppliersRaw, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const cargaRef = useRef(0);

  const carregar = useCallback(async () => {
    const carga = ++cargaRef.current;
    const { data, error } = await supabase.from('suppliers').select('*').order('name', { ascending: true });
    if (carga !== cargaRef.current) return; // superada por troca de unidade ou recarga mais nova
    if (error) console.error('Erro ao carregar fornecedores', error);
    else setSuppliers((data ?? []).map(mapSupplierRow));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void carregar();
    // Contador de cargas, não nó do DOM: avançar na limpeza descarta a resposta em voo.
    const cargas = cargaRef;
    return () => { cargas.current++; };
  }, [carregar]);

  // Cada tela tem sua instância (Compras/Salmão pelo provider, Financeiro própria):
  // quem grava avisa, e todas recarregam — senão uma edição no Financeiro só
  // chegaria à Cotação ou ao Salmão depois de recarregar a página.
  useDataEvent(CANAL_FORNECEDORES, () => { void carregar(); });

  const suppliers = useMemo(() => sortByName(suppliersRaw, s => s.name), [suppliersRaw]);
  const activeSuppliers = useMemo(() => suppliers.filter(s => s.active), [suppliers]);

  const recusar = useCallback((acao: AcaoFornecedor, error: { code?: string; message?: string }): never => {
    console.error(`Erro ao ${acao} fornecedor`, error);
    const mensagem = mensagemErroFornecedor(acao, error);
    toast.error(mensagem);
    throw new Error(mensagem);
  }, [toast]);

  const addSupplier = useCallback(async (s: NovoFornecedor) => {
    try {
      const novo = await inserirFornecedor(supabase, companyId, s);
      setSuppliers(prev => [novo, ...prev]);
      emitDataEvent(CANAL_FORNECEDORES);
      return novo;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cadastrar fornecedor');
      throw err;
    }
  }, [supabase, companyId, toast, emitDataEvent]);

  const updateSupplier = useCallback(async (id: string, data: Partial<Supplier>): Promise<void> => {
    const current = suppliers.find(s => s.id === id);
    if (!current) return recusar('atualizar', { message: 'fornecedor não encontrado na lista; recarregue a tela' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload parcial de colunas tipadas como Json
    const updatePayload: any = {};
    // contact_info é gravado inteiro, então só vai quando a tela mexeu no contato:
    // ativar/desativar não pode regravar o contato a partir de uma lista velha.
    if (CAMPOS_CONTATO.some(campo => campo in data)) {
      updatePayload.contact_info = supplierContactInfo({ ...current, ...data });
    }
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.active !== undefined) updatePayload.is_active = data.active;
    if (data.pedidoMinimoValor !== undefined) updatePayload.minimum_order_value = data.pedidoMinimoValor ?? 0;
    if (data.pedidoMinimoQtd !== undefined) updatePayload.minimum_order_quantity = data.pedidoMinimoQtd ?? 0;
    if (data.whatsappNumber !== undefined) updatePayload.whatsapp_number = data.whatsappNumber || null;

    // Linha barrada pelo USING da RLS volta 0 linhas sem erro: sem o select, a tela diria "atualizado".
    const { data: alteradas, error } = await supabase.from('suppliers').update(updatePayload).eq('id', id).select('id');
    if (error) return recusar('atualizar', error);
    if (!alteradas?.length) {
      void carregar();
      return recusar('atualizar', { code: '42501', message: 'nenhuma linha atualizada' });
    }
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    emitDataEvent(CANAL_FORNECEDORES);
  }, [supabase, suppliers, recusar, carregar, emitDataEvent]);

  const deleteSupplier = useCallback(async (id: string): Promise<void> => {
    const { data: removidas, error } = await supabase.from('suppliers').delete().eq('id', id).select('id');
    if (error) return recusar('excluir', error);
    if (!removidas?.length) {
      void carregar();
      return recusar('excluir', { code: '42501', message: 'nenhuma linha removida' });
    }
    setSuppliers(prev => prev.filter(s => s.id !== id));
    emitDataEvent(CANAL_FORNECEDORES);
  }, [supabase, recusar, carregar, emitDataEvent]);

  return { suppliers, activeSuppliers, loading, addSupplier, updateSupplier, deleteSupplier };
}

export type SuppliersStore = ReturnType<typeof useSuppliers>;

/** Quem pode criar fornecedor em qualquer um dos módulos — o mesmo gate da RLS de INSERT em `suppliers`. */
export function usePodeCadastrarFornecedor(): boolean {
  const compras = useCan(SUPPLIER_KEYS_COMPRAS.create);
  const financeiro = useCan(SUPPLIER_KEYS_FINANCEIRO.create);
  return compras || financeiro;
}
