/**
 * Grupo obrigatório quando não há o que herdar: sem grupo próprio nem herdado,
 * a despesa some dos detalhamentos da Apresentação Sócios (caso real: R$ 111 mil
 * de CMV do Ren Sushi fora do CMV).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
const insert = vi.fn();
let categorias: Record<string, unknown>[] = [];

function consulta(data: unknown[]) {
  const resultado = Promise.resolve({ data, error: null });
  const encadeada = {
    eq: () => encadeada,
    order: () => encadeada,
    then: resultado.then.bind(resultado),
  };
  return encadeada;
}

const supabase = {
  from: (tabela: string) => ({
    select: () => consulta(tabela === 'fin_categorias' ? categorias : []),
    insert,
  }),
  rpc: vi.fn(),
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/hooks/useCompanyId', () => ({ useCompanyId: () => ({ companyId: 'company-1' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => toast }));
vi.mock('@/lib/dataEvents', () => ({ useEmitDataEvent: () => vi.fn(), useDataEvent: () => {} }));

import CadastroBaseTree from './CadastroBaseTree';

function categoria(id: string, codigo: string, ordem: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    nome: id.toUpperCase(),
    codigo,
    tipo: 'despesa',
    parent_id: null,
    ordem,
    centro_custo_padrao_id: null,
    grupo: null,
    system_key: null,
    excluir_dos_totais: false,
    ativo: true,
    updated_at: '2026-01-01T00:00:00Z',
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockResolvedValue({ error: null });
  // Ordem na tela: despesas, legado, não operacional.
  categorias = [
    categoria('despesas', '3', 10, { grupo: 'administrativa' }),
    categoria('legado', '4', 20),
    categoria('nao-operacional', '9', 90, { system_key: 'despesas_nao_operacionais', excluir_dos_totais: true }),
  ];
});
afterEach(cleanup);

async function abrirSubItem(indice: number) {
  render(<CadastroBaseTree />);
  await screen.findByText('DESPESAS');
  fireEvent.click(screen.getAllByTitle('Adicionar sub-item')[indice]);
}

function nomearECriar(nome: string) {
  const dialogo = screen.getByRole('dialog');
  // Os rótulos do diálogo não usam htmlFor: o campo é o input ao lado do rótulo.
  const campoNome = within(dialogo).getByText('Nome').parentElement!.querySelector('input')!;
  fireEvent.change(campoNome, { target: { value: nome } });
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Criar' }));
  return dialogo;
}

describe('Cadastro Base — grupo da categoria', () => {
  it('não cria categoria principal sem grupo', async () => {
    render(<CadastroBaseTree />);
    fireEvent.click(await screen.findByRole('button', { name: /Nova Raiz/ }));
    const dialogo = nomearECriar('Delivery');

    expect(within(dialogo).getByText(/Obrigatório na categoria principal/)).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Selecione o grupo da categoria');
    expect(insert).not.toHaveBeenCalled();
  });

  it('não mostra mais a Linha DRE', async () => {
    render(<CadastroBaseTree />);
    fireEvent.click(await screen.findByRole('button', { name: /Nova Raiz/ }));

    expect(within(screen.getByRole('dialog')).queryByText('Linha DRE')).not.toBeInTheDocument();
  });

  it('sub-item herda o grupo da mãe e pode ficar em branco', async () => {
    await abrirSubItem(0);
    nomearECriar('Limpeza');

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(insert.mock.calls[0][0]).toMatchObject({ parent_id: 'despesas', grupo: null });
  });

  it('exige grupo no sub-item de categoria antiga sem grupo', async () => {
    await abrirSubItem(1);
    const dialogo = nomearECriar('Frete');

    expect(within(dialogo).getByText(/nenhuma categoria acima tem grupo/)).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Selecione o grupo da categoria');
    expect(insert).not.toHaveBeenCalled();
  });

  it('não exige grupo em categoria não operacional', async () => {
    await abrirSubItem(2);
    nomearECriar('Multa contratual');

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(insert.mock.calls[0][0]).toMatchObject({ parent_id: 'nao-operacional', grupo: null });
  });
});
