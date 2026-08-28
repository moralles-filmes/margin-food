import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PresentationMeetingGovernance from './PresentationMeetingGovernance';
import { createPresentationMeetingDetail, MEETING_ID } from '@/test/fixtures/presentationMeeting';
import { RESPONSIBLE_ID } from '@/test/fixtures/presentationDecision';
import { createPresentationPlanData } from '@/test/fixtures/presentationSocios';

const mocks = vi.hoisted(() => ({
  detail: null as unknown as ReturnType<typeof createPresentationMeetingDetail>,
  listError: null as Error | null,
  start: vi.fn(),
  submit: vi.fn(),
  transition: vi.fn(),
  refetchList: vi.fn(),
  refetchDetail: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

vi.mock('@/hooks/usePresentationDecisions', () => ({
  usePresentationResponsibleProfiles: () => ({
    data: [{ id: RESPONSIBLE_ID, nome: 'Responsável Operacional', email: 'responsavel@empresa.test', avatarUrl: null }],
  }),
  usePresentationDecisions: () => ({
    data: { items: [] },
    isPending: false,
    error: null,
  }),
  usePresentationDecisionDetail: () => ({ data: undefined, isPending: false }),
}));

vi.mock('@/hooks/usePresentationMeetings', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/usePresentationMeetings')>();
  return {
    ...actual,
    usePresentationMeetings: () => ({
      data: {
        items: [mocks.detail?.session],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        hasMore: false,
      },
      isPending: false,
      error: mocks.listError,
      refetch: mocks.refetchList,
    }),
    usePresentationMeetingDetail: () => ({
      data: mocks.detail,
      isPending: false,
      error: null,
      refetch: mocks.refetchDetail,
    }),
    usePresentationPreviousMeetingDetail: () => ({
      data: undefined,
      isPending: false,
      error: null,
    }),
    usePresentationMeetingMutations: () => ({
      createSession: { mutateAsync: vi.fn(), isPending: false },
      saveSession: { mutateAsync: vi.fn(), isPending: false },
      startSession: { mutateAsync: mocks.start, isPending: false },
      submitMinutes: { mutateAsync: mocks.submit, isPending: false },
      transitionSession: { mutateAsync: mocks.transition, isPending: false },
    }),
  };
});

function renderGovernance(options: { canManage?: boolean; canApprove?: boolean; canExport?: boolean } = {}) {
  const plan = createPresentationPlanData();
  return render(
    <MemoryRouter initialEntries={[`/financeiro/apresentacao-socios?session=${MEETING_ID}`]}>
      <PresentationMeetingGovernance
        companyId="99999999-2222-4999-8999-999999999999"
        userId="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        period={plan.range}
        granularity="month"
        comparisonMode="actual"
        rankingLimit={10}
        plan={plan}
        canManage={options.canManage ?? false}
        canApprove={options.canApprove ?? false}
        canExport={options.canExport ?? false}
      />
    </MemoryRouter>,
  );
}

describe('área de reuniões e atas', () => {
  beforeEach(() => {
    mocks.detail = createPresentationMeetingDetail();
    mocks.listError = null;
    mocks.start.mockReset().mockResolvedValue({ id: MEETING_ID });
    mocks.submit.mockReset().mockResolvedValue({ id: MEETING_ID });
    mocks.transition.mockReset().mockResolvedValue({ id: MEETING_ID });
    mocks.refetchList.mockReset();
    mocks.refetchDetail.mockReset();
  });

  it('respeita RBAC visual e mantém estados textuais além da cor', () => {
    renderGovernance();
    expect(screen.getByText('Reuniões e atas')).toBeInTheDocument();
    expect(screen.getAllByText('Aprovada').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Preparar reunião' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar pauta e notas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ata PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar ata' })).not.toBeInTheDocument();
  });

  it('mostra exportação somente com export e explicita follow-up sem progresso inferido', () => {
    renderGovernance({ canExport: true });
    expect(screen.getByRole('button', { name: 'Ata PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ata PowerPoint' })).toBeInTheDocument();
    expect(screen.getByText('Sem percentual, score de risco ou causalidade financeira inferidos.')).toBeInTheDocument();
    expect(screen.getByText('Ações vencidas')).toBeInTheDocument();
    expect(screen.getByText('Ações sem prazo')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Exibir' })).toBeInTheDocument();
  });

  it('inicia reunião somente após confirmação explícita e congela o snapshot atual', async () => {
    mocks.detail = createPresentationMeetingDetail({ status: 'DRAFT', revisionState: 'IN_REVIEW' });
    mocks.detail.session.snapshot = null;
    mocks.detail.session.currentRevisionId = null;
    mocks.detail.revisions = [];
    renderGovernance({ canManage: true });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar reunião' }));
    expect(mocks.start).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Iniciar reunião' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: MEETING_ID,
      snapshot: expect.objectContaining({
        contractVersion: 'presentation-meeting-snapshot-v1.0',
        formulaVersion: 'presentation-plan-v1.0',
        sources: expect.objectContaining({ actual: 'fin_lancamentos' }),
      }),
      expectedUpdatedAt: mocks.detail.session.updatedAt,
    }));
  });

  it('oferece navegação por teclado no modo reunião e edição explícita de notas', () => {
    mocks.detail = createPresentationMeetingDetail({ status: 'IN_PROGRESS' });
    renderGovernance({ canManage: true });
    fireEvent.click(screen.getByRole('button', { name: 'Modo reunião' }));
    expect(screen.getByRole('dialog', { name: 'Modo reunião' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByText('Item executivo extenso 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar notas' })).toBeInTheDocument();
  });

  it('expõe erro da listagem sem selecionar uma sessão alternativa', () => {
    mocks.listError = new Error('falha');
    renderGovernance();
    expect(screen.getByText('Falha ao carregar sessões')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(mocks.refetchList).toHaveBeenCalledOnce();
  });
});
