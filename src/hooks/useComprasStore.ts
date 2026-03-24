import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CalendarioCompras, RequisicaoCompra, PedidoCompra } from '@/types/salmon';

// Extended types for compras
export interface ItemRequisicao {
  id: string;
  requisicaoId: string;
  produtoId: string;
  quantidade: number;
  unidade: string;
  motivo: string;
  prioridade: 'alta' | 'media' | 'baixa';
}

export interface Cotacao {
  id: string;
  requisicaoId: string;
  categoria: string;
  status: 'ENVIADA' | 'RECEBIDA' | 'FECHADA';
  createdAt: string;
}

export interface CotacaoFornecedor {
  id: string;
  cotacaoId: string;
  fornecedorId: string;
  fornecedorNome: string;
  prazoEntrega: number;
  frete: number;
  observacao: string;
  itens: CotacaoItemPreco[];
}

export interface CotacaoItemPreco {
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  unidade: string;
  precoUnitario: number;
}

export interface ItemPedido {
  id: string;
  pedidoId: string;
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  precoUnitario: number;
  total: number;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch { return fallback; }
}
function saveToStorage<T>(key: string, data: T) { localStorage.setItem(key, JSON.stringify(data)); }

export function useComprasStore() {
  const [calendario, setCalendario] = useState<CalendarioCompras[]>(() => loadFromStorage('compras_calendario', []));
  const [requisicoes, setRequisicoes] = useState<RequisicaoCompra[]>(() => loadFromStorage('compras_requisicoes', []));
  const [itensRequisicao, setItensRequisicao] = useState<ItemRequisicao[]>(() => loadFromStorage('compras_itens_req', []));
  const [cotacoes, setCotacoes] = useState<Cotacao[]>(() => loadFromStorage('compras_cotacoes', []));
  const [cotacoesFornecedores, setCotacoesFornecedores] = useState<CotacaoFornecedor[]>(() => loadFromStorage('compras_cot_forn', []));
  const [pedidos, setPedidos] = useState<PedidoCompra[]>(() => loadFromStorage('compras_pedidos', []));
  const [itensPedido, setItensPedido] = useState<ItemPedido[]>(() => loadFromStorage('compras_itens_ped', []));

  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);
  useEffect(() => { if (mounted.current) saveToStorage('compras_calendario', calendario); }, [calendario]);
  useEffect(() => { if (mounted.current) saveToStorage('compras_requisicoes', requisicoes); }, [requisicoes]);
  useEffect(() => { if (mounted.current) saveToStorage('compras_itens_req', itensRequisicao); }, [itensRequisicao]);
  useEffect(() => { if (mounted.current) saveToStorage('compras_cotacoes', cotacoes); }, [cotacoes]);
  useEffect(() => { if (mounted.current) saveToStorage('compras_cot_forn', cotacoesFornecedores); }, [cotacoesFornecedores]);
  useEffect(() => { if (mounted.current) saveToStorage('compras_pedidos', pedidos); }, [pedidos]);
  useEffect(() => { if (mounted.current) saveToStorage('compras_itens_ped', itensPedido); }, [itensPedido]);

  // Calendário
  const addCalendario = useCallback((c: Omit<CalendarioCompras, 'id'>) => {
    const n: CalendarioCompras = { ...c, id: crypto.randomUUID() };
    setCalendario(prev => [...prev, n]);
    return n;
  }, []);
  const updateCalendario = useCallback((id: string, data: Partial<CalendarioCompras>) => {
    setCalendario(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
  }, []);
  const deleteCalendario = useCallback((id: string) => {
    setCalendario(prev => prev.filter(c => c.id !== id));
  }, []);

  // Requisição
  const addRequisicao = useCallback((r: Omit<RequisicaoCompra, 'id' | 'createdAt'>, itens: Omit<ItemRequisicao, 'id' | 'requisicaoId'>[]) => {
    const reqId = crypto.randomUUID();
    const n: RequisicaoCompra = { ...r, id: reqId, createdAt: new Date().toISOString() };
    setRequisicoes(prev => [n, ...prev]);
    const newItens = itens.map(i => ({ ...i, id: crypto.randomUUID(), requisicaoId: reqId }));
    setItensRequisicao(prev => [...newItens, ...prev]);
    return n;
  }, []);
  const updateRequisicao = useCallback((id: string, data: Partial<RequisicaoCompra>) => {
    setRequisicoes(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));
  }, []);

  // Cotação
  const addCotacao = useCallback((c: Omit<Cotacao, 'id' | 'createdAt'>) => {
    const n: Cotacao = { ...c, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    setCotacoes(prev => [n, ...prev]);
    return n;
  }, []);
  const addCotacaoFornecedor = useCallback((cf: Omit<CotacaoFornecedor, 'id'>) => {
    const n: CotacaoFornecedor = { ...cf, id: crypto.randomUUID() };
    setCotacoesFornecedores(prev => [...prev, n]);
    return n;
  }, []);
  const updateCotacao = useCallback((id: string, data: Partial<Cotacao>) => {
    setCotacoes(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
  }, []);

  // Pedido
  const addPedido = useCallback((p: Omit<PedidoCompra, 'id' | 'createdAt'>, itens: Omit<ItemPedido, 'id' | 'pedidoId'>[]) => {
    const pedId = crypto.randomUUID();
    const n: PedidoCompra = { ...p, id: pedId, createdAt: new Date().toISOString() };
    setPedidos(prev => [n, ...prev]);
    const newItens = itens.map(i => ({ ...i, id: crypto.randomUUID(), pedidoId: pedId }));
    setItensPedido(prev => [...newItens, ...prev]);
    return n;
  }, []);
  const updatePedido = useCallback((id: string, data: Partial<PedidoCompra>) => {
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  }, []);

  const getItensRequisicao = useCallback((reqId: string) => itensRequisicao.filter(i => i.requisicaoId === reqId), [itensRequisicao]);
  const getCotacoesFornecedor = useCallback((cotId: string) => cotacoesFornecedores.filter(cf => cf.cotacaoId === cotId), [cotacoesFornecedores]);
  const getItensPedido = useCallback((pedId: string) => itensPedido.filter(i => i.pedidoId === pedId), [itensPedido]);

  return {
    calendario, requisicoes, cotacoes, cotacoesFornecedores, pedidos, itensPedido,
    addCalendario, updateCalendario, deleteCalendario,
    addRequisicao, updateRequisicao, getItensRequisicao,
    addCotacao, addCotacaoFornecedor, updateCotacao, getCotacoesFornecedor,
    addPedido, updatePedido, getItensPedido,
  };
}
