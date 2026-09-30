import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PresentationDecisionRegisterDialog from './PresentationDecisionRegisterDialog';
import { RESPONSIBLE_ID } from '@/test/fixtures/presentationDecision';
import { createPresentationPlanData } from '@/test/fixtures/presentationSocios';

const createDecision = vi.fn();

vi.mock('@/hooks/usePresentationDecisions', () => ({
  PresentationDecisionMutationError: class extends Error {
    readonly code: string;
    constructor(code: string, message: string) { super(message); this.code = code; }
  },
  usePresentationDecisionMutations: () => ({
    createDecision: { mutateAsync: createDecision, isPending: false },
  }),
}));

const period = { start: '2026-03-01', endExclusive: '2026-04-01' } as const;

function renderDialog(overrides: Partial<React.ComponentProps<typeof PresentationDecisionRegisterDialog>> = {}) {
  const props: React.ComponentProps<typeof PresentationDecisionRegisterDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    companyId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    period,
    granularity: 'month',
    defaultMode: 'actual',
    plan: createPresentationPlanData(),
    profiles: [{ id: RESPONSIBLE_ID, nome: 'Responsável', email: 'responsavel@empresa.test', avatarUrl: null }],
    onCreated: vi.fn(),
    ...overrides,
  };
  return { ...render(<PresentationDecisionRegisterDialog {...props} />), props };
}

describe('registro explícito de decisão', () => {
  beforeEach(() => {
    sessionStorage.clear();
    createDecision.mockReset();
    createDecision.mockResolvedValue({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  });

  it('não persiste decisão automaticamente e expõe campos com labels acessíveis', async () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Registrar decisão' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título *')).toBeInTheDocument();
    expect(screen.getByLabelText('Contexto e justificativa *')).toHaveAttribute('maxlength', '10000');
    expect(screen.getByRole('button', { name: 'Registrar decisão' })).toBeDisabled();
    await waitFor(() => expect(createDecision).not.toHaveBeenCalled());
  });

  it('salva somente o rascunho textual em sessionStorage isolado e registra após clique explícito', async () => {
    const { props } = renderDialog();
    fireEvent.change(screen.getByLabelText('Título *'), { target: { value: 'Decisão de custos' } });
    fireEvent.change(screen.getByLabelText('Contexto e justificativa *'), {
      target: { value: 'Contexto aprovado em reunião e informado pelo usuário.' },
    });

    const key = `presentation-decision-draft:${props.companyId}:${props.userId}:${period.start}:${period.endExclusive}`;
    await waitFor(() => {
      const stored = sessionStorage.getItem(key);
      expect(stored).toContain('Decisão de custos');
      expect(stored).not.toContain('metrics');
      expect(stored).not.toContain('snapshot');
    });
    expect(createDecision).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar decisão' }));
    await waitFor(() => expect(createDecision).toHaveBeenCalledOnce());
    expect(createDecision).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Decisão de custos',
      context: 'Contexto aprovado em reunião e informado pelo usuário.',
      referenceType: 'BASE',
      snapshot: expect.objectContaining({ sourceMode: 'actual', metrics: expect.objectContaining({ revenue: 1_200 }) }),
    }));
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(props.onCreated).toHaveBeenCalledWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('duplo clique envia uma vez; o retry depois de falha reaproveita a semente e o sucesso a troca', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let liberar: (value: { id: string }) => void = () => undefined;
    createDecision.mockImplementationOnce(() => new Promise(resolve => { liberar = resolve; }));
    renderDialog();
    fireEvent.change(screen.getByLabelText('Título *'), { target: { value: 'Decisão de custos' } });
    fireEvent.change(screen.getByLabelText('Contexto e justificativa *'), { target: { value: 'Contexto informado.' } });
    const botao = screen.getByRole('button', { name: 'Registrar decisão' });

    fireEvent.click(botao);
    fireEvent.click(botao);
    await waitFor(() => expect(createDecision).toHaveBeenCalledOnce());
    liberar({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    await waitFor(() => expect(createDecision).toHaveBeenCalledOnce());
    const sementeSucesso = createDecision.mock.calls[0][0].semente as string;

    createDecision.mockRejectedValueOnce(new Error('rede caiu'));
    fireEvent.change(screen.getByLabelText('Título *'), { target: { value: 'Outra decisão' } });
    fireEvent.change(screen.getByLabelText('Contexto e justificativa *'), { target: { value: 'Outro contexto.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar decisão' }));
    await waitFor(() => expect(createDecision).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Registrar decisão' }));
    await waitFor(() => expect(createDecision).toHaveBeenCalledTimes(3));

    const [falha, retry] = [createDecision.mock.calls[1][0].semente, createDecision.mock.calls[2][0].semente];
    expect(falha).toBe(retry);
    expect(falha).not.toBe(sementeSucesso);
  });

  it('restaura rascunho válido da sessão e descarta conteúdo expirado', async () => {
    const companyId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const key = `presentation-decision-draft:${companyId}:${userId}:${period.start}:${period.endExclusive}`;
    sessionStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      draft: { title: 'Rascunho restaurado', context: 'Contexto restaurado', sourceMode: 'actual', executiveResponsibleUserId: '' },
    }));
    const view = renderDialog({ companyId, userId });
    await waitFor(() => expect(screen.getByLabelText('Título *')).toHaveValue('Rascunho restaurado'));
    view.unmount();

    sessionStorage.setItem(key, JSON.stringify({
      savedAt: Date.now() - 25 * 60 * 60 * 1000,
      draft: { title: 'Expirado', context: 'Expirado', sourceMode: 'actual', executiveResponsibleUserId: '' },
    }));
    renderDialog({ companyId, userId });
    await waitFor(() => expect(screen.getByLabelText('Título *')).toHaveValue(''));
    expect(sessionStorage.getItem(key)).not.toContain('Expirado');
  });

  it('descarta rascunho local excessivo ou com enum desconhecido', async () => {
    const companyId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const key = `presentation-decision-draft:${companyId}:${userId}:${period.start}:${period.endExclusive}`;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sessionStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      draft: { title: 'x'.repeat(70_000), context: '', sourceMode: 'actual', executiveResponsibleUserId: '' },
    }));
    const first = renderDialog({ companyId, userId });
    await waitFor(() => expect(screen.getByLabelText('Título *')).toHaveValue(''));
    expect(sessionStorage.getItem(key)).not.toContain('x'.repeat(1_000));
    first.unmount();

    sessionStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      draft: { title: 'Inválido', context: 'Contexto', sourceMode: 'inventado', executiveResponsibleUserId: '' },
    }));
    renderDialog({ companyId, userId });
    await waitFor(() => expect(screen.getByLabelText('Título *')).toHaveValue(''));
    expect(sessionStorage.getItem(key)).not.toContain('inventado');
    expect(consoleError).toHaveBeenCalled();
  });
});
