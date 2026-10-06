import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CmvAplicarPadroesDialog from './CmvAplicarPadroesDialog';
import type { CmvPreviaPadroes } from '@/hooks/useCmvFinanceiro';

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  /** Substitui `simularPadroesCmv` num teste (o resto do hook continua o real). */
  simular: null as null | ((desde: string) => Promise<unknown>),
}));
const supabase = { rpc(fn: string, args?: unknown) { const r = Promise.resolve(state.rpc(fn, args)); return Object.assign(r, { abortSignal: () => r }); } };
vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/formatters', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/formatters')>()),
  todayBR: () => '2026-09-20',
}));
vi.mock('@/hooks/useCmvFinanceiro', async importOriginal => {
  const original = await importOriginal<typeof import('@/hooks/useCmvFinanceiro')>();
  return {
    ...original,
    simularPadroesCmv: (...args: Parameters<typeof original.simularPadroesCmv>) => (
      state.simular ? state.simular(args[1]) : original.simularPadroesCmv(...args)
    ),
  };
});

const previa = {
  simulado: true, desde: '2026-09-01',
  boleto: { documentos: 1, linhas_sim: 1, centavos_sim: 1600, linhas_nao: 0, centavos_nao: 0, linhas_sem_padrao: 0, centavos_sem_padrao: 0 },
  lancamento: { documentos: 3, linhas_sim: 2, centavos_sim: 2100, linhas_nao: 1, centavos_nao: 1200, linhas_sem_padrao: 2, centavos_sem_padrao: 1800 },
};
const respostaAplicar = { simulado: false, documentos: 4, linhas: 4, centavos_sim: 3700, centavos_nao: 1200 };

/** A prévia ecoa a data pedida, como o servidor: cada data tem a sua prévia. */
function responderNormalmente() {
  state.rpc.mockImplementation((_fn: string, args: { p_simular: boolean; p_desde: string }) => (args.p_simular
    ? { data: { ...previa, desde: args.p_desde }, error: null }
    : { data: respostaAplicar, error: null }));
}

function adiado<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>(resolve => { resolver = resolve; });
  return { promessa, resolver };
}

const campoData = () => screen.getByLabelText('Competência a partir de');
const justificativa = (texto: string) => fireEvent.change(screen.getByLabelText('Justificativa (fica na auditoria)'), { target: { value: texto } });

beforeEach(() => {
  state.rpc.mockReset();
  state.toast.success.mockReset();
  state.toast.error.mockReset();
  state.simular = null;
  responderNormalmente();
});
afterEach(() => vi.restoreAllMocks());

describe('Aplicar padrões às pendentes', () => {
  it('só aplica depois da prévia e com justificativa; trocar a data pede outra prévia', async () => {
    const onAplicado = vi.fn();
    render(<CmvAplicarPadroesDialog open onOpenChange={() => {}} onAplicado={onAplicado} />);
    const aplicar = screen.getByRole('button', { name: 'Aplicar' });
    expect(aplicar).toBeDisabled();
    expect(campoData()).toHaveValue('2026-09-01');

    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(await screen.findByText('Lançamentos e conciliação')).toBeInTheDocument();
    expect(screen.getByText('2 · R$ 21,00')).toBeInTheDocument();
    expect(aplicar).toBeDisabled();

    justificativa('revisão inicial');
    expect(aplicar).toBeEnabled();

    fireEvent.change(campoData(), { target: { value: '2026-08-01' } });
    expect(screen.queryByText('Lançamentos e conciliação')).not.toBeInTheDocument();
    expect(aplicar).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await screen.findByText('Lançamentos e conciliação');
    justificativa('revisão inicial');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(onAplicado).toHaveBeenCalled());
    expect(state.rpc).toHaveBeenLastCalledWith('fin_cmv_aplicar_padroes', { p_desde: '2026-08-01', p_simular: false, p_justificativa: 'revisão inicial' });
  });

  it('enquanto a prévia carrega, a data não pode ser trocada', async () => {
    const espera = adiado<{ data: unknown; error: null }>();
    state.rpc.mockImplementationOnce(() => espera.promessa);
    render(<CmvAplicarPadroesDialog open onOpenChange={() => {}} onAplicado={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await waitFor(() => expect(campoData()).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Ver prévia' })).toBeDisabled();

    await act(async () => { espera.resolver({ data: previa, error: null }); });
    expect(await screen.findByText('Lançamentos e conciliação')).toBeInTheDocument();
    expect(campoData()).toBeEnabled();
  });

  it('prévia de outra data nunca libera o Aplicar, mesmo com justificativa', async () => {
    const dePrevia = (desde: string): CmvPreviaPadroes => ({
      desde,
      boleto: { documentos: 1, linhasSim: 1, centavosSim: 1600, linhasNao: 0, centavosNao: 0, linhasSemPadrao: 0, centavosSemPadrao: 0 },
      lancamento: { documentos: 0, linhasSim: 0, centavosSim: 0, linhasNao: 0, centavosNao: 0, linhasSemPadrao: 0, centavosSemPadrao: 0 },
    });
    state.simular = async () => dePrevia('2026-07-01');
    render(<CmvAplicarPadroesDialog open onOpenChange={() => {}} onAplicado={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await screen.findByText('Lançamentos e conciliação');
    justificativa('revisão inicial');
    expect(campoData()).toHaveValue('2026-09-01');
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(state.rpc).not.toHaveBeenCalledWith('fin_cmv_aplicar_padroes', expect.objectContaining({ p_simular: false }));

    // com a prévia da data certa, libera
    state.simular = async desde => dePrevia(desde);
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled());
  });

  it('prévia que chega depois de a data mudar é descartada', async () => {
    const espera = adiado<{ data: unknown; error: null }>();
    state.rpc.mockImplementationOnce(() => espera.promessa);
    render(<CmvAplicarPadroesDialog open onOpenChange={() => {}} onAplicado={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await waitFor(() => expect(campoData()).toBeDisabled());
    // a tela trava a data durante a consulta; o evento forçado prova que o descarte não depende só disso
    fireEvent.change(campoData(), { target: { value: '2026-08-01' } });
    expect(campoData()).toHaveValue('2026-08-01');

    await act(async () => { espera.resolver({ data: previa, error: null }); });
    expect(screen.queryByText('Lançamentos e conciliação')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
    expect(campoData()).toBeEnabled();
  });

  it('prévia que chega depois de fechar e reabrir o diálogo é descartada', async () => {
    const espera = adiado<{ data: unknown; error: null }>();
    state.rpc.mockImplementationOnce(() => espera.promessa);
    const props = { onOpenChange: () => {}, onAplicado: () => {} };
    const { rerender } = render(<CmvAplicarPadroesDialog open {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await waitFor(() => expect(campoData()).toBeDisabled());

    rerender(<CmvAplicarPadroesDialog open={false} {...props} />);
    rerender(<CmvAplicarPadroesDialog open {...props} />);
    // reabriu limpo: sem prévia e sem trava de carregamento
    expect(campoData()).toBeEnabled();

    await act(async () => { espera.resolver({ data: previa, error: null }); });
    expect(screen.queryByText('Lançamentos e conciliação')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
    expect(campoData()).toBeEnabled();

    // a resposta velha não estraga o próximo pedido
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(await screen.findByText('Lançamentos e conciliação')).toBeInTheDocument();
  });

  it('falha na prévia registra no console e avisa, sem liberar o Aplicar', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.rpc.mockImplementation(() => ({ data: null, error: { message: 'CMV_PERIODO_LONGO' } }));
    render(<CmvAplicarPadroesDialog open onOpenChange={() => {}} onAplicado={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await waitFor(() => expect(state.toast.error).toHaveBeenCalledWith('O período máximo é de 12 meses.'));
    expect(erro).toHaveBeenCalledWith('[CMV Financeiro] Falha na prévia de aplicar padrões:', expect.objectContaining({ message: 'CMV_PERIODO_LONGO' }));
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
    expect(campoData()).toBeEnabled();
  });

  it('falha ao aplicar registra no console, avisa que nada mudou e mantém o diálogo aberto', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onAplicado = vi.fn();
    const onOpenChange = vi.fn();
    render(<CmvAplicarPadroesDialog open onOpenChange={onOpenChange} onAplicado={onAplicado} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await screen.findByText('Lançamentos e conciliação');
    justificativa('revisão inicial');
    state.rpc.mockImplementation(() => ({ data: null, error: { message: 'PERMISSION_DENIED: sem acesso' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => expect(state.toast.error).toHaveBeenCalledWith('Você não tem permissão para esta ação. Nada foi alterado.'));
    expect(erro).toHaveBeenCalledWith('[CMV Financeiro] Falha ao aplicar padrões:', expect.objectContaining({ message: 'PERMISSION_DENIED: sem acesso' }));
    expect(onAplicado).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('sem nenhuma linha para mudar não pede justificativa nem libera o Aplicar', async () => {
    state.rpc.mockImplementation((_fn: string, args: { p_desde: string }) => ({
      data: {
        simulado: true, desde: args.p_desde,
        boleto: { documentos: 0, linhas_sim: 0, centavos_sim: 0, linhas_nao: 0, centavos_nao: 0, linhas_sem_padrao: 2, centavos_sem_padrao: 900 },
        lancamento: { documentos: 0, linhas_sim: 0, centavos_sim: 0, linhas_nao: 0, centavos_nao: 0, linhas_sem_padrao: 0, centavos_sem_padrao: 0 },
      },
      error: null,
    }));
    render(<CmvAplicarPadroesDialog open onOpenChange={() => {}} onAplicado={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(await screen.findByText('Nenhuma linha pendente com padrão a partir desta data.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Justificativa (fica na auditoria)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
  });
});
