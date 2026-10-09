import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CriarLancamentoExtratoDialog from './CriarLancamentoExtratoDialog';
import type { CmvConfig } from '@/hooks/useCmvFinanceiro';

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  toastErro: vi.fn(),
  updates: [] as { table: string; payload: Record<string, unknown> }[],
}));

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
// `rpc` usa o `this` como o cliente de verdade: chamada solta (sem `.bind(supabase)`) estoura aqui como no navegador.
const supabase = {
  chamadas: [] as string[],
  from: (t: string) => builder(t),
  rpc(this: { chamadas: string[] }, n: string, p?: unknown) { this.chamadas.push(n); return state.rpc(n, p); },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => ({ success: vi.fn(), error: state.toastErro }) }));
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
  state.toastErro.mockReset();
  state.rpc.mockReset();
  state.rpc.mockImplementation((nome: string) => Promise.resolve(
    nome === 'reconcile_import_lancamento' ? { data: { status: 'ok', lancamento_id: 'l1' }, error: null } : { data: null, error: null },
  ));
});

type ExtratoLinha = NonNullable<ComponentProps<typeof CriarLancamentoExtratoDialog>['linha']>;

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
    // A competência própria vale também para receita: o servidor só recusa TRANSFERENCIA.
    expect(args).toMatchObject({ p_tipo: 'RECEITA', p_data: '2026-09-10', p_data_competencia: '2026-09-03' });
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

  describe('o que foi ajustado na própria linha do extrato', () => {
    const ajustada: ExtratoLinha = { ...linha, competencia: '2026-09-03', categoriaId: 'cat1', cmvIncluir: false };

    it('com o recurso: abre com a competência, a categoria e a resposta da linha e grava com elas', async () => {
      abrir(config(true), ajustada);
      await screen.findByRole('option', { name: 'Peixes' });
      expect(screen.getByLabelText('Data Competência')).toHaveValue('2026-09-03');
      expect(screen.getByLabelText('Categoria')).toHaveValue('cat1');
      const grupo = screen.getByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' });
      expect(within(grupo).getByRole('radio', { name: 'Não' })).toHaveAttribute('aria-checked', 'true');
      expect(within(grupo).getByRole('radio', { name: 'Sim' })).toHaveAttribute('aria-checked', 'false');
      fireEvent.click(screen.getByRole('button', { name: /Criar e Conciliar/ }));
      await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('reconcile_import_lancamento', expect.anything()));
      expect(state.rpc.mock.calls.find(([n]) => n === 'reconcile_import_lancamento')![1]).toMatchObject({
        p_data: '2026-09-10', p_data_competencia: '2026-09-03',
        p_rateio_linhas: [expect.objectContaining({ categoria_id: 'cat1', cmv_incluir: false })],
      });
    });

    it('rateio de uma linha: a resposta é a do rateio; de várias linhas: categoria e resposta vazias', async () => {
      const item = (cmv: boolean | null) => ({ categoria_id: 'cat1', centro_custo_id: '', valor: 55, percentual: 100, observacao: '', cmv_incluir: cmv });
      const { unmount } = render(
        <CriarLancamentoExtratoDialog
          open onOpenChange={() => {}} contaBancariaId="conta-1" onCreated={() => {}} cmvConfig={config(true)}
          linha={{ ...linha, categoriaId: 'cat1', rateioLinhas: [item(true)] }}
        />,
      );
      await screen.findByRole('option', { name: 'Peixes' });
      expect(within(screen.getByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' })).getByRole('radio', { name: 'Sim' }))
        .toHaveAttribute('aria-checked', 'true');
      unmount();

      render(
        <CriarLancamentoExtratoDialog
          open onOpenChange={() => {}} contaBancariaId="conta-1" onCreated={() => {}} cmvConfig={config(true)}
          linha={{ ...linha, categoriaId: 'cat1', cmvIncluir: true, rateioLinhas: [item(true), { ...item(false), valor: 0, percentual: 0 }] }}
        />,
      );
      await screen.findByRole('option', { name: 'Peixes' });
      // O rateio não vem para o diálogo: a categoria fica vazia, como antes, e a resposta espera por ela.
      expect(screen.getByLabelText('Categoria')).toHaveValue('');
      const grupo = screen.getByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' });
      expect(within(grupo).getByRole('radio', { name: 'Sim' })).toHaveAttribute('aria-checked', 'false');
      expect(within(grupo).getByRole('radio', { name: 'Não' })).toHaveAttribute('aria-checked', 'false');
    });

    it('banco sem o recurso: o rascunho ajustado não vaza — data do banco, categoria vazia, fluxo de antes', async () => {
      abrir(config(false), ajustada);
      await screen.findByRole('option', { name: 'Peixes' });
      expect(screen.getByLabelText('Data Competência')).toHaveValue('2026-09-10');
      expect(screen.getByLabelText('Categoria')).toHaveValue('');
      expect(screen.queryByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' })).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'cat1' } });
      fireEvent.click(screen.getByRole('button', { name: /Criar e Conciliar/ }));
      await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('reconcile_import_lancamento', expect.anything()));
      const args = state.rpc.mock.calls.find(([n]) => n === 'reconcile_import_lancamento')![1] as Record<string, unknown>;
      expect(args).toMatchObject({ p_data: '2026-09-10' });
      expect(args).not.toHaveProperty('p_data_competencia');
      expect((args.p_rateio_linhas as Record<string, unknown>[])[0]).not.toHaveProperty('cmv_incluir');
    });

    it('configuração que chega com o diálogo aberto não refaz o formulário nem apaga o que foi digitado', async () => {
      const props = { open: true, onOpenChange: () => {}, linha: ajustada, contaBancariaId: 'conta-1', onCreated: () => {} };
      const { rerender } = render(<CriarLancamentoExtratoDialog {...props} cmvConfig={null} />);
      await screen.findByRole('option', { name: 'Peixes' });
      fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'DESCRIÇÃO EDITADA' } });
      rerender(<CriarLancamentoExtratoDialog {...props} cmvConfig={config(true)} />);
      expect(screen.getByLabelText('Descrição')).toHaveValue('DESCRIÇÃO EDITADA');
      // A herança só vale com a configuração já carregada na abertura.
      expect(screen.getByLabelText('Data Competência')).toHaveValue('2026-09-10');
      expect(screen.getByLabelText('Categoria')).toHaveValue('');
    });

    it('categoria herdada que não está na lista: não grava sem categoria', async () => {
      abrir(config(true), { ...linha, categoriaId: 'catInexistente' });
      await screen.findByRole('option', { name: 'Peixes' });
      fireEvent.click(screen.getByRole('button', { name: /Criar e Conciliar/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: /Criar e Conciliar/ })).toBeEnabled());
      expect(state.rpc).not.toHaveBeenCalledWith('reconcile_import_lancamento', expect.anything());
      expect(state.toastErro).toHaveBeenCalledWith('Categoria indisponível. Selecione outra.');
    });

    it('categorias ainda carregando: pede para tentar de novo em vez de dizer que a categoria sumiu', async () => {
      abrir(config(true), { ...linha, categoriaId: 'cat1' });
      // Sem esperar a lista: a categoria da linha já está escolhida, mas as opções ainda não chegaram.
      fireEvent.click(screen.getByRole('button', { name: /Criar e Conciliar/ }));
      expect(state.toastErro).toHaveBeenCalledWith('Carregando categorias… tente de novo em instantes.');
      expect(state.rpc).not.toHaveBeenCalledWith('reconcile_import_lancamento', expect.anything());
      await screen.findByRole('option', { name: 'Peixes' });
    });

    it('rateio de uma linha salvo com outra categoria: categoria e resposta vêm do rateio, como no Processar', async () => {
      const rateio = [{ categoria_id: 'cat1', centro_custo_id: '', valor: 55, percentual: 100, observacao: '', cmv_incluir: false }];
      abrir(config(true), { ...linha, categoriaId: 'cat-velha', rateioLinhas: rateio });
      await screen.findByRole('option', { name: 'Peixes' });
      expect(screen.getByLabelText('Categoria')).toHaveValue('cat1');
      const grupo = screen.getByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' });
      expect(within(grupo).getByRole('radio', { name: 'Não' })).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(screen.getByRole('button', { name: /Criar e Conciliar/ }));
      await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('reconcile_import_lancamento', expect.anything()));
      expect(state.rpc.mock.calls.find(([n]) => n === 'reconcile_import_lancamento')![1]).toMatchObject({
        p_rateio_linhas: [expect.objectContaining({ categoria_id: 'cat1', cmv_incluir: false })],
      });
    });

    it('competência própria só vale em despesa: em receita, um valor solto do rascunho não entra', async () => {
      abrir(config(true), { ...linhaReceita, competencia: '2026-09-03' });
      await screen.findByRole('option', { name: 'Vendas' });
      expect(screen.getByLabelText('Data Competência')).toHaveValue('2026-09-10');
    });

    describe('destino conta a pagar/receber', () => {
      const comCompetencia: ExtratoLinha = { ...linha, competencia: '2026-09-03' };
      const destino = (nome: string) => fireEvent.click(screen.getByRole('radio', { name: nome }));

      it('a competência herdada fica só no lançamento: no título a data padrão é a do banco e o p_data também', async () => {
        abrir(config(true), comCompetencia);
        await screen.findByRole('option', { name: 'Peixes' });
        expect(screen.getByLabelText('Data Competência')).toHaveValue('2026-09-03');

        destino('Conta a Pagar');
        expect(screen.getByLabelText('Data Competência')).toHaveValue('2026-09-10');
        fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'cat1' } });
        fireEvent.click(screen.getByRole('button', { name: /Criar e Conciliar/ }));
        await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('reconcile_create_titulo_from_extrato', expect.anything()));
        const lanc = state.rpc.mock.calls.find(([n]) => n === 'reconcile_import_lancamento')![1] as Record<string, unknown>;
        expect(lanc).toMatchObject({ p_data: '2026-09-10', p_tipo: 'DESPESA' });
        expect(lanc).not.toHaveProperty('p_data_competencia');
        expect(state.rpc).toHaveBeenCalledWith('reconcile_create_titulo_from_extrato', expect.objectContaining({
          p_data_competencia: '2026-09-10', p_data_baixa: '2026-09-10',
        }));
      });

      it('voltar para lançamento sem mexer na data restaura a competência herdada', async () => {
        abrir(config(true), comCompetencia);
        await screen.findByRole('option', { name: 'Peixes' });
        destino('Conta a Receber');
        expect(screen.getByLabelText('Data Competência')).toHaveValue('2026-09-10');
        destino('Lançamento');
        expect(screen.getByLabelText('Data Competência')).toHaveValue('2026-09-03');
      });

      it('data digitada pelo usuário no diálogo é respeitada ao trocar de destino', async () => {
        abrir(config(true), comCompetencia);
        await screen.findByRole('option', { name: 'Peixes' });
        fireEvent.change(screen.getByLabelText('Data Competência'), { target: { value: '2026-09-05' } });
        destino('Conta a Pagar');
        expect(screen.getByLabelText('Data Competência')).toHaveValue('2026-09-05');
        destino('Lançamento');
        expect(screen.getByLabelText('Data Competência')).toHaveValue('2026-09-05');
      });
    });
  });

  it('trocar a categoria de uma resposta já dada avisa "Categoria trocada: confira." até responder de novo', async () => {
    abrir(config(true));
    await screen.findByRole('option', { name: 'Peixes' });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'cat1' } });
    // Só sugerida pelo padrão: sem aviso de troca.
    expect(screen.queryByText('Categoria trocada: confira.')).not.toBeInTheDocument();
    const grupo = screen.getByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' });
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Não' }));
    // Embalagens não tem padrão: a resposta dada volta a pendente, e o aviso diz isso.
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'cat3' } });
    expect(screen.getByText('Categoria trocada: confira.')).toBeInTheDocument();
    expect(within(grupo).getByRole('radio', { name: 'Sim' })).toHaveAttribute('aria-checked', 'false');
    expect(within(grupo).getByRole('radio', { name: 'Não' })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Sim' }));
    expect(screen.queryByText('Categoria trocada: confira.')).not.toBeInTheDocument();
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
