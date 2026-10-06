/**
 * Centros de Custo: o servidor recusa o cadastro duplicado (índice único por
 * nome entre ativos) e a tela traduz a recusa, em vez
 * de mostrar "duplicate key value violates unique constraint".
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { mensagemCadastroDuplicado } from '@/domain/financeiro/cadastros';

const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
const insert = vi.fn();
const selectLista = vi.fn();
const supabase = {
  from: () => ({
    select: () => ({ eq: () => ({ order: selectLista }) }),
    insert,
  }),
  rpc: vi.fn(),
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/hooks/useCompanyId', () => ({ useCompanyId: () => ({ companyId: 'company-1' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => toast }));
vi.mock('@/lib/dataEvents', () => ({ useEmitDataEvent: () => vi.fn() }));

import CentrosCustoFinSection from '@/components/financeiro/CentrosCustoFinSection';

const DUPLICADO = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "uq_fin_centros_custo_nome_ativo"',
};

beforeEach(() => {
  vi.clearAllMocks();
  selectLista.mockResolvedValue({ data: [], error: null });
});
afterEach(cleanup);

async function abrirENomear(nome: string) {
  render(<CentrosCustoFinSection canCreate canEdit canDelete />);
  fireEvent.click(await screen.findByRole('button', { name: /Novo Centro/ }));
  fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: nome } });
  return screen.getByRole('button', { name: 'Salvar' });
}

describe('Centros de Custo — cadastro duplicado', () => {
  it('duplo clique antes do próximo render grava uma vez só', async () => {
    insert.mockReturnValue(new Promise(() => {}));
    const salvar = await abrirENomear('Cozinha');
    fireEvent.click(salvar);
    fireEvent.click(salvar);
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
  });

  it('recusa do índice vira mensagem legível e recarrega a lista (o envio anterior pode ter gravado)', async () => {
    insert.mockResolvedValue({ data: null, error: DUPLICADO });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const salvar = await abrirENomear('Cozinha');
    const cargasAntes = selectLista.mock.calls.length;
    fireEvent.click(salvar);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'Já existe um centro de custo ativo com este nome. Confira a lista.',
    ));
    await waitFor(() => expect(selectLista.mock.calls.length).toBeGreaterThan(cargasAntes));
    expect(toast.success).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('Centros de Custo — padronização do nome', () => {
  it('grava o nome digitado em caixa alta no padrão', async () => {
    insert.mockResolvedValue({ data: null, error: null });
    fireEvent.click(await abrirENomear('CENTRO DE CUSTO COZINHA'));
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(insert.mock.calls[0][0]).toMatchObject({ nome: 'Centro de Custo Cozinha' });
  });
});

describe('mensagemCadastroDuplicado', () => {
  it('traduz a recusa do índice', () => {
    expect(mensagemCadastroDuplicado(DUPLICADO.message)).toMatch(/centro de custo ativo com este nome/);
  });

  it('devolve null para os demais erros', () => {
    expect(mensagemCadastroDuplicado('Permission denied')).toBeNull();
    expect(mensagemCadastroDuplicado(undefined)).toBeNull();
  });
});

describe('migração: unicidade de Centros de Custo e Plano de Contas', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260930130020_financeiro_cadastros_unicidade.sql'),
    'utf8',
  ).replace(/\s+/g, ' ');

  it('o preflight conta duplicatas antes de criar os índices', () => {
    expect(migration.indexOf('PREFLIGHT')).toBeGreaterThanOrEqual(0);
    expect(migration.indexOf('PREFLIGHT')).toBeLessThan(migration.indexOf('CREATE UNIQUE INDEX'));
  });

  it('centro de custo: nome normalizado por empresa, só entre ativos', () => {
    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_centros_custo_nome_ativo ON public.fin_centros_custo "
      + "(company_id, (regexp_replace(lower(public.immutable_unaccent(btrim(nome))), '\\s+', ' ', 'g'))) WHERE ativo;",
    );
  });

});
