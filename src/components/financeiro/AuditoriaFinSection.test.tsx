import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuditoriaFinSection from './AuditoriaFinSection';

/**
 * Cliente falso da Auditoria (Redesign V2, Fase 06A). `_guarded_list_fin_audit_logs` é LEITURA apesar
 * do prefixo; qualquer outra chamada seria escrita e fica registrada. 60 eventos: 50 na 1ª página e 10
 * na seguinte (cursor). O resumo vem do servidor (período + entidade + ação), não da página.
 */
const state = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  falharPagina: 0 as 0 | 1 | 2,
  perms: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  sheets: [] as unknown[],
}));

const EVENTOS = Array.from({ length: 60 }, (_, i) => ({
  id: `ev-${String(i).padStart(3, '0')}`,
  created_at: new Date(Date.UTC(2026, 9, 5, 12) - i * 3600_000).toISOString(),
  acao: i === 1 ? 'UPDATE' : i % 2 ? 'DELETE' : 'INSERT',
  entidade: 'fin_lancamentos',
  entidade_id: `reg-${String(i).padStart(30, '0')}`,
  justificativa: i === 1 ? 'Justificativa sintética longa para conferir que o texto inteiro aparece no detalhe do evento' : null,
  antes: i === 1 ? { valor: 100, metadados: { rateio: [{ categoria: 'Pescados', valor: 60 }] } } : null,
  depois: i === 1 ? { valor: 150, metadados: { rateio: [{ categoria: 'Pescados', valor: 90 }] } } : { valor: i },
  user_id: 'u-1',
  user_nome: 'Usuária Teste',
  user_email: 'teste@exemplo.test',
  origem_log: 'fin_audit_logs',
  metadata: null,
}));

const supabase = {
  rpc(name: string, args: Record<string, unknown>) {
    state.rpcCalls.push({ name, args });
    if (name !== '_guarded_list_fin_audit_logs') return Promise.resolve({ data: null, error: null });
    const pagina = args.p_cursor_id ? 2 : 1;
    if (state.falharPagina === pagina) return Promise.resolve({ data: null, error: { message: 'falha simulada' } });
    const items = pagina === 1 ? EVENTOS.slice(0, 50) : EVENTOS.slice(50);
    return Promise.resolve({
      data: {
        items,
        has_more: pagina === 1,
        next_cursor_created_at: items[items.length - 1].created_at,
        next_cursor_id: items[items.length - 1].id,
        summary: { total: 73, inserts: 30, updates: 13, deletes: 30, usuarios_ativos: 4 },
      },
      error: null,
    });
  },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: (perm: string) => state.perms.has(perm) }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined }));
vi.mock('@/lib/safeXlsx', () => ({
  utils: { book_new: () => ({}), json_to_sheet: (rows: unknown) => { state.sheets.push(rows); return {}; }, book_append_sheet: () => undefined },
  writeFile: () => undefined,
}));

const largura = (px: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });
const escritas = () => state.rpcCalls.filter(c => c.name !== '_guarded_list_fin_audit_logs');
/** A montagem lê duas vezes (o debounce da busca zera a lista 400 ms depois — preexistente, PF-113): espera as duas. */
const aguardaCargaInicial = async () => {
  await waitFor(() => expect(state.rpcCalls.filter(c => c.name === '_guarded_list_fin_audit_logs').length).toBeGreaterThanOrEqual(2), { timeout: 3000 });
  await screen.findByText(/50 carregado\(s\)/);
};

beforeEach(() => {
  state.rpcCalls = [];
  state.sheets = [];
  state.falharPagina = 0;
  state.perms = new Set(['financeiro:auditoria:view', 'financeiro:auditoria:export']);
  largura(1366);
});
afterEach(() => { cleanup(); largura(1024); vi.clearAllMocks(); });

describe('Auditoria Financeira (V2)', () => {
  it('resumo do servidor rotulado com período e filtros; lista com contagem honesta; só lê', async () => {
    render(<AuditoriaFinSection />);
    const resumo = await screen.findByRole('region', { name: 'Resumo do período' });
    expect(within(resumo).getByText('73')).toBeInTheDocument();
    expect(screen.getByText('Últimos 30 dias · todas as entidades · todas as ações')).toBeInTheDocument();
    expect(screen.getByText(/a busca não altera estas contagens/)).toBeInTheDocument();
    expect(screen.getByText('50 carregado(s), do mais recente ao mais antigo · há mais eventos para carregar')).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Entidade' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveTextContent('Últimos 30 dias');
    expect(state.rpcCalls[0]).toEqual({ name: '_guarded_list_fin_audit_logs', args: { p_entidade: null, p_acao: null, p_search: null, p_dias: 30, p_limit: 50 } });
    expect(escritas()).toEqual([]);
  });

  it('detalhe por botão nomeado com aria-expanded: registro inteiro, justificativa e diff Antes/Depois', async () => {
    render(<AuditoriaFinSection />);
    await aguardaCargaInicial();
    const botao = screen.getAllByRole('button', { name: /^Ver detalhes: UPDATE em lancamentos/ })[0];
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(EVENTOS[1].entidade_id)).toBeInTheDocument();
    expect(screen.getByText(EVENTOS[1].justificativa as string, { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getAllByText('Antes:').length).toBeGreaterThan(0);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText(/"valor": 90/)).toBeInTheDocument();
  });

  it('"Carregar mais" usa o cursor e acrescenta; falha na página seguinte mantém a lista', async () => {
    render(<AuditoriaFinSection />);
    await aguardaCargaInicial();
    state.falharPagina = 2;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' })); });
    expect(await screen.findByText('Não foi possível carregar mais eventos')).toBeInTheDocument();
    expect(screen.getByText(/50 carregado\(s\)/)).toBeInTheDocument();
    expect(screen.queryByText('Erro ao carregar auditoria')).not.toBeInTheDocument();
    state.falharPagina = 0;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' })); });
    await waitFor(() => expect(screen.getByText('60 carregado(s), do mais recente ao mais antigo')).toBeInTheDocument());
    const ultima = state.rpcCalls[state.rpcCalls.length - 1];
    expect(ultima.args).toMatchObject({ p_cursor_id: 'ev-049', p_cursor_created_at: EVENTOS[49].created_at });
    expect(escritas()).toEqual([]);
  });

  it('erro na primeira carga vira estado de erro com nova tentativa (nunca lista vazia)', async () => {
    state.falharPagina = 1;
    render(<AuditoriaFinSection />);
    expect(await screen.findByText('Erro ao carregar auditoria')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum log de auditoria encontrado')).not.toBeInTheDocument();
  });

  it('no celular vira lista com o detalhe pelo botão (sem tabela)', async () => {
    largura(390);
    render(<AuditoriaFinSection />);
    const lista = await screen.findByRole('list', { name: 'Eventos de auditoria' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const botao = within(lista).getAllByRole('button', { name: /^Ver detalhes: UPDATE/ })[0];
    fireEvent.click(botao);
    expect(within(lista).getByText(EVENTOS[1].entidade_id)).toBeInTheDocument();
  });

  it('Excel com as mesmas colunas de antes, só com o que foi carregado', async () => {
    render(<AuditoriaFinSection />);
    await aguardaCargaInicial();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Excel/ })); });
    const linhas = state.sheets[0] as Array<Record<string, string>>;
    expect(linhas).toHaveLength(50);
    expect(Object.keys(linhas[0])).toEqual(['Data/Hora', 'Ação', 'Entidade', 'Registro', 'Usuário', 'Email', 'Justificativa', 'Origem']);
    expect(linhas[0].Entidade).toBe('fin_lancamentos');
  });

  it('sem permissão mostra acesso restrito', () => {
    state.perms = new Set();
    render(<AuditoriaFinSection />);
    expect(screen.getByText('Você não tem permissão para visualizar a auditoria financeira.')).toBeInTheDocument();
  });
});
