import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PresentationDecisionGovernance from './PresentationDecisionGovernance';
import { PresentationDecisionMutationError } from '@/hooks/usePresentationDecisions';
import {
  DECISION_ID,
  RESPONSIBLE_ID,
  createPresentationDecisionDetail,
} from '@/test/fixtures/presentationDecision';
import { createPresentationPlanData } from '@/test/fixtures/presentationSocios';

const mocks = vi.hoisted(() => ({
  updateDraft: vi.fn(),
  refetchDetail: vi.fn(),
  detail: null as unknown as ReturnType<typeof createPresentationDecisionDetail>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock('@/hooks/usePresentationDecisions', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/usePresentationDecisions')>();
  return {
    ...actual,
    usePresentationResponsibleProfiles: () => ({
      data: [{ id: RESPONSIBLE_ID, nome: 'Responsável Operacional', email: 'responsavel@empresa.test', avatarUrl: null }],
      isError: false,
    }),
    usePresentationDecisions: () => ({
      isPending: false,
      isError: false,
      data: {
        contractVersion: 'presentation-decision-governance-v1.0',
        items: [], page: 1, pageSize: 20, totalCount: 0, hasMore: false,
        fetchedAt: '2026-08-25T15:30:00-03:00',
      },
      refetch: vi.fn(),
    }),
    usePresentationDecisionDetail: () => {
      return {
        isPending: false,
        isError: false,
        data: mocks.detail,
        refetch: mocks.refetchDetail,
      };
    },
    usePresentationDecisionMutations: () => ({
      createDecision: { mutateAsync: vi.fn(), isPending: false },
      updateDraft: { mutateAsync: mocks.updateDraft, isPending: false },
      addRevision: { mutateAsync: vi.fn(), isPending: false },
      transitionDecision: { mutateAsync: vi.fn(), isPending: false },
      createAction: { mutateAsync: vi.fn(), isPending: false },
      updateAction: { mutateAsync: vi.fn(), isPending: false },
      transitionAction: { mutateAsync: vi.fn(), isPending: false },
    }),
  };
});

function renderGovernance(canManage: boolean, canApprove: boolean) {
  const plan = createPresentationPlanData();
  return render(
    <MemoryRouter initialEntries={[`/financeiro/relatorio-socios?decision=${DECISION_ID}`]}>
      <PresentationDecisionGovernance
        companyId="11111111-1111-4111-8111-111111111111"
        userId="22222222-2222-4222-8222-222222222222"
        period={plan.range}
        granularity="month"
        comparisonMode="actual"
        plan={plan}
        canManage={canManage}
        canApprove={canApprove}
      />
    </MemoryRouter>,
  );
}

describe('governança executiva da Apresentação Sócios', () => {
  beforeEach(() => {
    mocks.updateDraft.mockReset();
    mocks.refetchDetail.mockReset();
    mocks.detail = createPresentationDecisionDetail();
    mocks.detail.decision.status = 'DRAFT';
    mocks.detail.revisions[0].approvedAt = null;
  });

  it('apresenta modo somente leitura sem controles mutáveis quando faltam manage/approve', () => {
    renderGovernance(false, false);
    expect(screen.getByText('Somente leitura')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar decisão' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar detalhe' })).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar decisão')).toBeInTheDocument();
  });

  it('preserva edição local e oferece resolução consciente em conflito otimista', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.updateDraft.mockRejectedValue(new PresentationDecisionMutationError(
      'OPTIMISTIC_LOCK_CONFLICT',
      'OPTIMISTIC_LOCK_CONFLICT',
    ));
    renderGovernance(true, false);
    const title = screen.getByLabelText('Título');
    fireEvent.change(title, { target: { value: 'Título local ainda não aplicado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => expect(screen.getByText('Conflito de concorrência')).toBeInTheDocument());
    expect(screen.getByLabelText('Título')).toHaveValue('Título local ainda não aplicado');
    expect(screen.getByRole('button', { name: 'Recarregar dados mais recentes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manter edição para reaplicar' })).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('não usa apenas cor e confirma antes de descartar uma ação editada', () => {
    renderGovernance(true, true);
    expect(screen.getAllByText('Rascunho').length).toBeGreaterThan(0);
    expect(screen.getByText(/pendentes/i)).toBeInTheDocument();
    expect(screen.getByText(/vencidas/i)).toBeInTheDocument();
    expect(screen.getByText(/autoaprovação não é proibida/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nova ação' }));
    fireEvent.change(screen.getByLabelText('Descrição objetiva'), { target: { value: 'Alteração local ainda não salva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar edição' }));
    expect(screen.getByRole('alertdialog', { name: 'Alterações não salvas' })).toBeInTheDocument();
  });
});
