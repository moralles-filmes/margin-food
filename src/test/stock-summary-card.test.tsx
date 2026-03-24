import { act } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StockSummaryCard from '@/components/estoque/StockSummaryCard';
import { emitDataEvent } from '@/lib/dataEvents';

const rpcMock = vi.fn();
const subscribeMock = vi.fn(() => ({ unsubscribe: vi.fn() }));
const onMock = vi.fn(function (this: unknown) {
  return this;
});
const channelMock = vi.fn(() => ({ on: onMock, subscribe: subscribeMock }));
const removeChannelMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string) => rpcMock(name),
    channel: () => channelMock(),
    removeChannel: (channel: unknown) => removeChannelMock(channel),
  },
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children,
}));

describe('StockSummaryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    rpcMock.mockResolvedValue({
      data: [
        {
          total_stock_value: 100,
          items_count: 2,
          missing_cost_items_count: 0,
          updated_at: '2026-03-19T12:00:00Z',
        },
      ],
      error: null,
    });
  });

  it('recarrega o saldo total ao receber evento de estoque:movimentacoes', async () => {
    let view: ReturnType<typeof render>;
    await act(async () => {
      view = render(<StockSummaryCard />);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('get_stock_summary');
      expect(view.container.textContent).toContain('R$100,00');
    });

    rpcMock.mockResolvedValueOnce({
      data: [
        {
          total_stock_value: 250,
          items_count: 2,
          missing_cost_items_count: 0,
          updated_at: '2026-03-19T12:05:00Z',
        },
      ],
      error: null,
    });

    await act(async () => {
      emitDataEvent('estoque:movimentacoes');
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(rpcMock).toHaveBeenCalledTimes(2);
      expect(view.container.textContent).toContain('R$250,00');
    });
  });

  it('recarrega o saldo total ao receber evento de estoque:produtos', async () => {
    let view: ReturnType<typeof render>;
    await act(async () => {
      view = render(<StockSummaryCard />);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(view.container.textContent).toContain('R$100,00');
    });

    rpcMock.mockResolvedValueOnce({
      data: [
        {
          total_stock_value: 40,
          items_count: 1,
          missing_cost_items_count: 0,
          updated_at: '2026-03-19T12:06:00Z',
        },
      ],
      error: null,
    });

    await act(async () => {
      emitDataEvent('estoque:produtos');
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(rpcMock).toHaveBeenCalledTimes(2);
      expect(view.container.textContent).toContain('R$40,00');
    });
  });
});
