import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PresentationDetailPage from './PresentationDetailPage';
import { createPresentationSociosData } from '@/test/fixtures/presentationSocios';

const detailMocks = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  series: {} as Record<string, unknown>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock('@/hooks/usePresentationDetail', () => ({
  usePresentationDetailRows: () => detailMocks.rows,
  usePresentationDetailSeries: () => detailMocks.series,
  isPresentationDetailPermissionError: (error: unknown) => (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '42501'
  ),
}));

function renderDetail() {
  return render(
    <PresentationDetailPage
      companyId="11111111-1111-4111-8111-111111111111"
      target="revenue"
      data={createPresentationSociosData()}
      rankingLimit={10}
      unitName="Moralles"
      onBack={() => {}}
      onSelectCategory={() => {}}
    />,
  );
}

beforeEach(() => {
  detailMocks.rows = {
    data: { pages: [{ page: 1, pageSize: 25, hasMore: false, items: [] }] },
    error: null,
    isPending: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  };
  detailMocks.series = {
    data: [{
      key: '2026-08',
      start: '2026-08-01',
      endExclusive: '2026-09-01',
      amount: 1200,
      revenue: 1200,
      revenueSharePercent: 100,
    }],
    error: null,
    isPending: false,
    fetchStatus: 'idle',
  };
});

describe('estados do painel compartilhado de detalhe', () => {
  it('renderiza detalhe e vazio paginado sem Infinity/NaN', () => {
    const view = renderDetail();
    expect(screen.getByRole('heading', { name: 'Receita operacional' })).toBeInTheDocument();
    expect(screen.getByText('Nenhum registro relacionado')).toBeInTheDocument();
    expect(view.container.textContent).not.toMatch(/Infinity|NaN/);
  });

  it('expõe loading incremental de forma acessível', () => {
    detailMocks.rows = {
      ...detailMocks.rows,
      data: undefined,
      isPending: true,
    };
    renderDetail();
    expect(screen.getByRole('status')).toHaveTextContent('Carregando detalhes');
  });

  it('distingue sem permissão de erro genérico', () => {
    detailMocks.rows = {
      ...detailMocks.rows,
      data: undefined,
      error: { code: '42501' },
    };
    const denied = renderDetail();
    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
    denied.unmount();

    detailMocks.rows = {
      ...detailMocks.rows,
      data: undefined,
      error: { code: 'XX000' },
    };
    renderDetail();
    expect(screen.getByText('Erro ao carregar linhas')).toBeInTheDocument();
  });
});
