/**
 * Partes da store do Inventário tocadas pela contagem via código:
 *   · edição pela lista de inventário 'codigo' vira soma com valor esperado;
 *   · erro da Edge Function mostra o motivo real (4xx), nunca texto cru de 5xx.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarChavesPendentes, type ChavesPendentes } from '@/lib/chaveOperacao';

const rpc = vi.fn();
const invoke = vi.fn();
const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };

vi.mock('@/contexts/CompanyScopeContext', () => ({
  useSupabase: () => ({ rpc, functions: { invoke } }),
}));
vi.mock('@/lib/dataEvents', () => ({ useEmitDataEvent: () => vi.fn() }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => toast }));

import { useInventarioStore } from '@/hooks/useInventarioStore';

function respostaAjuste(overrides?: Record<string, unknown>) {
  return {
    item_id: 'item-1', idempotente: false, conflito: false,
    contagem_anterior: 12, contagem_apos: 20, contagem_fisica: 20,
    diferenca_qtd: 0, diferenca_percent: 0, impacto_financeiro: 0, classificacao: 'NORMAL',
    status_inventario: 'EM_CONTAGEM',
    ...overrides,
  };
}

function erroHttp(status: number, corpo: unknown) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(corpo), { status }),
  };
}

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
  Object.values(toast).forEach(fn => fn.mockReset());
});

describe('definirContagemPorLista', () => {
  it('grava a diferença para o valor exibido, exigindo que ele ainda seja o atual', async () => {
    rpc.mockResolvedValue({ data: respostaAjuste(), error: null });
    const { result } = renderHook(() => useInventarioStore());

    let ok = false;
    await act(async () => { ok = await result.current.definirContagemPorLista('item-1', 20, 12); });

    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('inventario_ajustar_contagem', expect.objectContaining({
      p_item_id: 'item-1', p_delta: 8, p_origem: 'lista', p_esperado: 12,
    }));
  });

  it('item ainda não contado: esperado NULL, e contar zero é possível', async () => {
    rpc.mockResolvedValue({ data: respostaAjuste({ contagem_anterior: null, contagem_fisica: 0 }), error: null });
    const { result } = renderHook(() => useInventarioStore());

    await act(async () => { await result.current.definirContagemPorLista('item-1', 0, null); });

    expect(rpc).toHaveBeenCalledWith('inventario_ajustar_contagem', expect.objectContaining({
      p_delta: 0, p_origem: 'lista', p_esperado: null,
    }));
  });

  it('conflito (alguém contou depois que a lista carregou) avisa e não confirma o salvamento', async () => {
    rpc.mockResolvedValue({ data: respostaAjuste({ conflito: true, contagem_fisica: 15 }), error: null });
    const { result } = renderHook(() => useInventarioStore());

    let ok = true;
    await act(async () => { ok = await result.current.definirContagemPorLista('item-1', 20, 12); });

    expect(ok).toBe(false);
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/contado de novo/));
  });

  it('erro do banco vira mensagem legível', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'INVENTARIO_FINALIZADO' } });
    const { result } = renderHook(() => useInventarioStore());

    let ok = true;
    await act(async () => { ok = await result.current.definirContagemPorLista('item-1', 20, 12); });

    expect(ok).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Este inventário já foi finalizado.');
  });
});

describe('erro da Edge Function', () => {
  it('4xx mostra o motivo que a função devolveu, não a mensagem genérica do supabase-js', async () => {
    invoke.mockResolvedValue({ data: null, error: erroHttp(400, { error: 'Inventário ainda em rascunho' }) });
    const { result } = renderHook(() => useInventarioStore());

    await act(async () => { await result.current.updateContagem('item-1', 5); });

    expect(toast.error).toHaveBeenCalledWith('Inventário ainda em rascunho');
  });

  it('5xx não expõe o texto cru da exceção na tela', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    invoke.mockResolvedValue({ data: null, error: erroHttp(500, { error: 'duplicate key value violates unique constraint "x"' }) });
    const { result } = renderHook(() => useInventarioStore());

    await act(async () => { await result.current.updateContagem('item-1', 5); });

    expect(toast.error).toHaveBeenCalledWith('Edge Function returned a non-2xx status code');
    consoleError.mockRestore();
  });
});

describe('createInventario — duplo clique e reenvio', () => {
  const payload = {
    tipo: 'parcial', data: '2026-09-29', hora: '10:00', turno_id: 'turno-1',
    categorias: ['Bebidas'], observacao: '', metodo_contagem: 'lista' as const,
  };
  const criado = { inventario: { id: 'inv-1' }, itensCount: 0, idempotent: false };
  const createCalls = () => invoke.mock.calls.filter(([, opts]) => opts.body.action === 'create');
  let chaves: ChavesPendentes;
  beforeEach(() => {
    let n = 0;
    chaves = criarChavesPendentes('inventario-criacao', { gerarSemente: () => `semente-${++n}` });
  });

  it('duplo clique: só a 1ª chamada chega à Edge', async () => {
    let liberar: (v: unknown) => void = () => {};
    invoke.mockImplementation((_fn: string, opts: { body: { action: string } }) => (
      opts.body.action === 'create'
        ? new Promise(resolve => { liberar = resolve; })
        : Promise.resolve({ data: { inventarios: [] }, error: null })
    ));
    const { result } = renderHook(() => useInventarioStore());

    let primeira: Promise<unknown> = Promise.resolve();
    let segunda: unknown = 'não chamada';
    await act(async () => {
      primeira = result.current.createInventario(payload, chaves);
      segunda = await result.current.createInventario(payload, chaves);
    });
    // A chave é derivada de forma assíncrona (SHA-256) antes da chamada.
    await vi.waitFor(() => expect(createCalls()).toHaveLength(1));
    await act(async () => { liberar({ data: criado, error: null }); await primeira; });

    expect(createCalls()).toHaveLength(1);
    expect(segunda).toBeNull();
  });

  it('retry depois de falha reaproveita a chave; conteúdo diferente usa outra', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    invoke.mockResolvedValue({ data: null, error: erroHttp(502, {}) });
    const { result } = renderHook(() => useInventarioStore());
    await act(async () => { await result.current.createInventario(payload, chaves); });

    invoke.mockResolvedValue({ data: { ...criado, idempotent: true, inventarios: [] }, error: null });
    await act(async () => { await result.current.createInventario(payload, chaves); });
    await act(async () => { await result.current.createInventario({ ...payload, hora: '11:00' }, chaves); });

    const [primeira, retry, outro] = createCalls().map(([, opts]) => opts.body.idempotency_key);
    expect(retry).toBe(primeira);
    expect(outro).not.toBe(primeira);
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/já tinha sido criado/));
    consoleError.mockRestore();
  });

  it('REQUEST_ID_REUTILIZADO (500 da Edge) vira orientação legível', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    invoke.mockResolvedValue({
      data: null,
      error: erroHttp(500, { error: 'REQUEST_ID_REUTILIZADO: a chave pertence a outro inventário' }),
    });
    const { result } = renderHook(() => useInventarioStore());
    await act(async () => { await result.current.createInventario(payload, chaves); });

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/não confere com o inventário registrado/));
    consoleError.mockRestore();
  });
});
