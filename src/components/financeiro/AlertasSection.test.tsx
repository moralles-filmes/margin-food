import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AlertasSection from './AlertasSection';

const state = vi.hoisted(() => ({
  rpcCalls: [] as string[],
  resposta: null as unknown,
  erro: false,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const supabase = {
  rpc(name: string) {
    state.rpcCalls.push(name);
    return Promise.resolve(state.erro ? { data: null, error: { message: 'falha simulada' } } : { data: state.resposta, error: null });
  },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined }));

const VAZIO = { cp_vencidas: [], cp_vencer: [], cr_atrasadas: [], cr_vencer: [], contas_saldo_negativo: [], lancamentos_sem_categoria: 0, lancamentos_sem_conta: 0, recorrencias_pendentes: [] };

beforeEach(() => {
  state.rpcCalls = [];
  state.erro = false;
  state.resposta = {
    ...VAZIO,
    cp_vencidas: [{ descricao: 'Boleto atrasado', data_vencimento: '2026-09-28', valor: 100 }],
    cr_vencer: [{ descricao: 'Reserva', cliente: 'Cliente Teste', data_vencimento: '2026-10-08', valor: 50 }],
  };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Central de Alertas (V2)', () => {
  it('falha de carga mostra erro com nova tentativa, nunca "Tudo sob controle" (PF-013)', async () => {
    state.erro = true;
    render(<AlertasSection />);

    expect(await screen.findByText('Não foi possível carregar os alertas')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum alerta no momento')).not.toBeInTheDocument();
    expect(screen.queryByText(/Tudo sob controle/)).not.toBeInTheDocument();

    state.erro = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('VENCIDA: Boleto atrasado')).toBeInTheDocument();
  });

  it('vazio só depois de uma carga bem-sucedida', async () => {
    state.resposta = VAZIO;
    render(<AlertasSection />);
    expect(await screen.findByText('Nenhum alerta no momento')).toBeInTheDocument();
    expect(screen.getByText('Tudo sob controle!')).toBeInTheDocument();
  });

  it('carga vazia seguida de falha: só o erro, sem "Tudo sob controle!"', async () => {
    state.resposta = VAZIO;
    render(<AlertasSection />);
    expect(await screen.findByText('Tudo sob controle!')).toBeInTheDocument();

    state.erro = true;
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByText('Não foi possível carregar os alertas')).toBeInTheDocument();
    expect(screen.queryByText(/Tudo sob controle/)).not.toBeInTheDocument();
    expect(screen.queryByText('Não foi possível atualizar os alertas')).not.toBeInTheDocument();
  });

  it('filtro por severidade em chips com aria-pressed e rótulo no vazio do filtro', async () => {
    render(<AlertasSection />);
    const todos = await screen.findByRole('button', { name: /Todos/ });
    expect(todos).toHaveAttribute('aria-pressed', 'true');

    const critico = screen.getByRole('button', { name: /Crítico/ });
    fireEvent.click(critico);
    expect(critico).toHaveAttribute('aria-pressed', 'true');
    expect(todos).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('VENCIDA: Boleto atrasado')).toBeInTheDocument();
    expect(screen.queryByText('A receber: Reserva')).not.toBeInTheDocument();
  });

  it('refresh com falha mantém a última lista e avisa', async () => {
    render(<AlertasSection />);
    expect(await screen.findByText('VENCIDA: Boleto atrasado')).toBeInTheDocument();
    state.erro = true;
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByText('Não foi possível atualizar os alertas')).toBeInTheDocument();
    expect(screen.getByText('VENCIDA: Boleto atrasado')).toBeInTheDocument();
  });
});
