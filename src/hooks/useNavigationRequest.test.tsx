import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import {
  dropNavigationRequest,
  requestNavigation,
  useNavigationRecord,
  useNavigationSubtab,
  useNavigationTab,
  type NavigationRecord,
} from '@/hooks/useNavigationRequest';

const ORDER = { type: 'purchase_order', id: 'pedido-1' };

function Pedidos({ onRecord }: { onRecord: (record: NavigationRecord) => void }) {
  useNavigationRecord('compras', ['purchase_order'], onRecord);
  return <div>pedidos</div>;
}

/** Espelha ComprasView: só monta a lista de pedidos quando a sub-aba é escolhida. */
function Compras({ onRecord }: { onRecord: (record: NavigationRecord) => void }) {
  const [view, setView] = useState('cotacao');
  useNavigationSubtab('compras', setView);
  return view === 'pedidos-compras' ? <Pedidos onRecord={onRecord} /> : <div>{view}</div>;
}

/** Espelha Index: a view do módulo é lazy e só existe depois da troca de aba. */
function App({ onRecord }: { onRecord: (record: NavigationRecord) => void }) {
  const [tab, setTab] = useState('estoque-geral');
  useNavigationTab(setTab);
  return tab === 'compras' ? <Compras onRecord={onRecord} /> : <div>{tab}</div>;
}

afterEach(() => {
  cleanup();
  dropNavigationRequest();
  vi.useRealTimers();
});

describe('requestNavigation', () => {
  it('abre o registro mesmo quando o módulo de destino ainda não estava montado', () => {
    const onRecord = vi.fn();
    const view = render(<App onRecord={onRecord} />);

    act(() => requestNavigation({ tab: 'compras', subtab: 'pedidos-compras', record: ORDER }));

    expect(view.getByText('pedidos')).toBeTruthy();
    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(onRecord).toHaveBeenCalledWith(ORDER);
  });

  it('entrega na hora quando a tela já está aberta, e só uma vez', () => {
    const onRecord = vi.fn();
    render(<Pedidos onRecord={onRecord} />);

    act(() => requestNavigation({ tab: 'compras', record: ORDER }));
    act(() => { window.dispatchEvent(new CustomEvent('app-navigation-request', { detail: 'compras' })); });

    expect(onRecord).toHaveBeenCalledTimes(1);
  });

  it('não entrega registro de outro módulo nem de outro tipo', () => {
    const onRecord = vi.fn();
    render(<Pedidos onRecord={onRecord} />);

    act(() => requestNavigation({ tab: 'estoque-geral', record: ORDER }));
    act(() => requestNavigation({ tab: 'compras', record: { type: 'requisicao_estoque', id: 'r-1' } }));

    expect(onRecord).not.toHaveBeenCalled();
  });

  it('descarta pedido antigo que ninguém consumiu', () => {
    vi.useFakeTimers();
    const onRecord = vi.fn();
    requestNavigation({ tab: 'compras', record: ORDER });
    vi.advanceTimersByTime(16_000);

    render(<Pedidos onRecord={onRecord} />);

    expect(onRecord).not.toHaveBeenCalled();
  });
});
