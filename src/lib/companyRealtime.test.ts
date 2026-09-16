import { describe, expect, it, vi } from 'vitest';
import { companyRealtimeListener } from './companyRealtime';

describe('lifetime de eventos por unidade', () => {
  it('descarta evento atrasado de A depois da troca para B', () => {
    const refetchA = vi.fn(), refetchB = vi.fn();
    const a = companyRealtimeListener('A', refetchA);
    a.dispose();
    const b = companyRealtimeListener('B', refetchB);
    a.receive({ eventType: 'INSERT', new: { company_id: 'A' } });
    b.receive({ eventType: 'UPDATE', new: { company_id: 'A' } });
    expect(refetchA).not.toHaveBeenCalled(); expect(refetchB).not.toHaveBeenCalled();
    b.receive({ eventType: 'UPDATE', new: { company_id: 'B' } });
    expect(refetchB).toHaveBeenCalledOnce();
  });
  it('DELETE apenas pede releitura autorizada e para após cleanup', () => {
    const refetch = vi.fn(); const listener = companyRealtimeListener('A', refetch);
    listener.receive({ eventType: 'DELETE', new: {} });
    expect(refetch).toHaveBeenCalledWith();
    listener.dispose(); listener.receive({ eventType: 'DELETE', new: {} });
    expect(refetch).toHaveBeenCalledOnce();
  });
});
