import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CriarLancamentoExtratoDialog from './CriarLancamentoExtratoDialog';
import type { CmvConfig } from '@/hooks/useCmvFinanceiro';

const state = vi.hoisted(() => ({ rpc: vi.fn(), updates: [] as { table: string; payload: Record<string, unknown> }[] }));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order']) b[m] = () => b;
  b.update = (payload: Record<string, unknown>) => { state.updates.push({ table, payload }); return b; };
  b.then = (resolve: (r: unknown) => unknown) => Promise.resolve({
    data: table === 'fin_categorias'
      ? [
        { id: 'cat1', nome: 'Peixes', tipo: 'despesa', codigo: null, parent_id: null, centro_custo_padrao_id: null },
        { id: 'cat2', nome: 'Vendas', tipo: 'receita', codigo: null, parent_id: null, centro_custo_padrao_id: null },
        { id: 'cat3', nome: 'Embalagens', tipo: 'despesa', codigo: null, parent_id: null, centro_custo_padrao_id: 'cc9' },
      ]
      : [],
    error: null,
  }).then(resolve);
  return b;
}
const supabase = { from: (t: string) => builder(t), rpc: (n: string, p?: unknown) => state.rpc(n, p) };

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/dataEvents', () => ({ useEmitDataEvent: () => () => undefined }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/components/financeiro/SupplierCombobox', () => ({ default: () => null }));
vi.mock('@/components/financeiro/CategoryCombobox', () => ({
  default: ({ value, onValueChange, options }: { value: string; onValueChange: (v: string) => void; options: { id: string; nome: string }[] }) => (
    <select aria-label="Categoria" value={value} onChange={e => onValueChange(e.target.value)}>
      <option value="">—</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
    </select>
  ),
}));

const linha = { data: '2026-09-10', descricao: 'PIX ARROZ', valor: 55, tipo: 'DESPESA' as const };
const linhaReceita = { data: '2026-09-10', descricao: 'PIX CLIENTE', valor: 55, tipo: 'RECEITA' as const };
const config = (lancamentos: boolean): CmvConfig => ({
  classificacaoAtiva: true,
  categorias: [{ id: 'cat1', nome: 'Peixes', codigo: null, parentId: null, grupo: null, ativo: true, cmvSugerir: true, updatedAt: '' }],
  recursos: { lancamentos },
});

beforeEach(() => {
  state.updates = [];
  state.rpc.mockReset();
  state.rpc.mockImplementation((nome: string) => Promise.resolve(
    nome === 'reconcile_import_lancamento' ? { data: { status: 'ok', lancamento_id: 'l1' }, error: null } : { data: null, error: null },
  ));
});

type ExtratoLinha = { data: string; descricao: string; valor: number; tipo: 'RECEITA' | 'DESPESA' };

function abrir(cfg: CmvConfig, extrato: ExtratoLinha = linha, ocorrencia?: number) {
  render(
    <CriarLancamentoExtratoDialog
      open onOpenChange={() => {}} linha={extrato} ocorrencia={ocorrencia}
      contaBancariaId="conta-1" onCreated={() => {}} cmvConfig={cfg}
    />,
  );
}

async function criarCom(
  cfg: CmvConfig,
  { extrato = linha, ocorrencia, categoria = 'cat1', competencia = '2026-09-03' }: {
    extrato?: ExtratoLinha; ocorrencia?: number; categoria?: string; competencia?: string;
  } = {},
) {
  abrir(cfg, extrato, ocorrencia);
  await screen.findByRole('option', { name: extrato.tipo === 'RECEITA' ? 'Vendas' : 'Peixes' });
  fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: categoria } });
  fireEvent.change(screen.getByLabelText('Data Competência'), { target: { value: competencia } });
  fireEvent.click(screen.getByRole('button', { name: /Criar e Conciliar/ }));
  await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('reconcile_import_lancamento', expect.anything()));
  return state.rpc.mock.calls.find(([n]) => n === 'reconcile_import_lancamento')![1] as Record<string, unknown>;
}

describe('Criar a partir do extrato — CMV e datas', () => {
  it('com o recurso: data do banco no p_data, competência à parte e a decisão sugerida pelo padrão', async () => {
    const args = await criarCom(config(true));
    const grupo = screen.getByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' });
    expect(within(grupo).getByRole('radio', { name: 'Sim' })).toHaveAttribute('aria-checked', 'true');
    expect(args).toMatchObject({
      p_data: '2026-09-10', p_data_competencia: '2026-09-03',
      p_rateio_linhas: [expect.objectContaining({ categoria_id: 'cat1', cmv_incluir: true })],
    });
    await waitFor(() => expect(state.updates.length).toBeGreaterThan(0));
    expect(state.updates.some(u => 'data_pagamento' in u.payload)).toBe(false);
  });

  it('banco sem o recurso: exatamente o fluxo de antes', async () => {
    const args = await criarCom(config(false));
    expect(screen.queryByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' })).not.toBeInTheDocument();
    expect(args).toMatchObject({ p_data: '2026-09-03' });
    expect(args).not.toHaveProperty('p_data_competencia');
    expect((args.p_rateio_linhas as Record<string, unknown>[])[0]).not.toHaveProperty('cmv_incluir');
    await waitFor(() => expect(state.updates.some(u => u.payload.data_pagamento === '2026-09-10')).toBe(true));
  });

  it('com o recurso, a data de pagamento do lançamento é a do banco e não se edita; sem o recurso segue editável', async () => {
    const { unmount } = render(
      <CriarLancamentoExtratoDialog open onOpenChange={() => {}} linha={linha} contaBancariaId="conta-1" onCreated={() => {}} cmvConfig={config(true)} />,
    );
    const campo = await screen.findByLabelText('Data Pagamento');
    expect(campo).toBeDisabled();
    expect(campo).toHaveValue('2026-09-10');
    expect(screen.getByText('Data do banco — não muda.')).toBeInTheDocument();
    unmount();

    abrir(config(false));
    const livre = await screen.findByLabelText('Data Pagamento');
    expect(livre).toBeEnabled();
    expect(livre).toHaveValue('2026-09-10');
    expect(screen.queryByText('Data do banco — não muda.')).not.toBeInTheDocument();
  });

  it('com o recurso, mexer só na competência mantém o índice de ocorrência da linha', async () => {
    const args = await criarCom(config(true), { ocorrencia: 1 });
    expect(args).toMatchObject({ p_data: '2026-09-10', p_data_competencia: '2026-09-03', p_occurrence_index: 1 });
  });

  it('com o recurso, receita não pergunta o CMV nem manda a decisão no rateio', async () => {
    const args = await criarCom(config(true), { extrato: linhaReceita, categoria: 'cat2' });
    expect(screen.queryByRole('radiogroup', { name: /Aparecer no CMV financeiro/ })).not.toBeInTheDocument();
    expect(args).toMatchObject({ p_tipo: 'RECEITA', p_data: '2026-09-10' });
    expect((args.p_rateio_linhas as Record<string, unknown>[])[0]).not.toHaveProperty('cmv_incluir');
  });

  it('rateio aberto só para responder Sim/Não: o centro de custo padrão da categoria vai junto', async () => {
    abrir(config(true));
    await screen.findByRole('option', { name: 'Embalagens' });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'cat3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ratear' }));
    const grupo = screen.getByRole('radiogroup', { name: 'Aparecer no CMV financeiro? — linha 1 do rateio' });
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Não' }));
    fireEvent.click(screen.getByRole('button', { name: /Criar e Conciliar/ }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('reconcile_import_lancamento', expect.anything()));
    const args = state.rpc.mock.calls.find(([n]) => n === 'reconcile_import_lancamento')![1] as Record<string, unknown>;
    expect(args.p_rateio_linhas).toEqual([
      expect.objectContaining({ categoria_id: 'cat3', centro_custo_id: 'cc9', cmv_incluir: false }),
    ]);
  });

  it('conta a pagar não muda: a data do campo de pagamento continua editável e vai como antes', async () => {
    abrir(config(true));
    await screen.findByRole('option', { name: 'Peixes' });
    fireEvent.click(screen.getByRole('radio', { name: 'Conta a Pagar' }));
    expect(screen.getByLabelText('Data Pagamento')).toBeEnabled();
    expect(screen.queryByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'cat1' } });
    fireEvent.change(screen.getByLabelText('Data Competência'), { target: { value: '2026-09-03' } });
    fireEvent.change(screen.getByLabelText('Data Pagamento'), { target: { value: '2026-09-12' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar e Conciliar/ }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('reconcile_create_titulo_from_extrato', expect.anything()));
    const lanc = state.rpc.mock.calls.find(([n]) => n === 'reconcile_import_lancamento')![1] as Record<string, unknown>;
    expect(lanc).toMatchObject({ p_data: '2026-09-03' });
    expect(lanc).not.toHaveProperty('p_data_competencia');
    expect((lanc.p_rateio_linhas as Record<string, unknown>[])[0]).not.toHaveProperty('cmv_incluir');
    expect(state.rpc).toHaveBeenCalledWith('reconcile_create_titulo_from_extrato', expect.objectContaining({
      p_data_competencia: '2026-09-03', p_data_baixa: '2026-09-12',
    }));
  });
});
