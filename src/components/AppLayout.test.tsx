import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import AppLayout from './AppLayout';

const mobile = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile.value }));
vi.mock('@/components/NotificationBell', () => ({ default: () => <button type="button">Notificações</button> }));
vi.mock('@/contexts/ModuleBadgesContext', () => ({ useModuleBadges: () => ({ totalsByTab: { compras: 3 } }) }));

const auth = vi.hoisted(() => ({
  profile: { nome: 'Pessoa Teste', email: 'pessoa@example.test', sector: null },
  signOut: vi.fn(),
  roles: ['admin'],
  // Libera Salmão, Compras e Financeiro; nada de super admin.
  hasPermission: (key: string) => /^(salmon|compras|financeiro):/.test(key),
  permissionState: 'READY',
  rbacDebug: null,
  accessibleCompanies: [{ id: 'A', nome: 'Loja Centro' }, { id: 'B', nome: 'Loja Shopping' }],
  activeCompanyId: 'A',
  setActiveCompany: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });
beforeEach(() => { mobile.value = false; localStorage.clear(); });
afterEach(cleanup);

function mount(activeTab: 'salmon' | 'financeiro' = 'financeiro') {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <AppLayout activeTab={activeTab} onTabChange={vi.fn()} isOffline={false}>
          <button type="button">Conteúdo</button>
        </AppLayout>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('AppLayout — sidebar', () => {
  it('mostra só os módulos permitidos, com o ativo marcado e o badge anunciado', () => {
    mount();
    const nav = screen.getByRole('navigation', { name: 'Módulos' });
    expect(within(nav).getByRole('button', { name: 'Financeiro' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('button', { name: /Compras/ })).toHaveTextContent('3 pendências');
    expect(within(nav).queryByRole('button', { name: /Controle de Estoque/ })).toBeNull();
    expect(within(nav).queryByRole('button', { name: 'Admin' })).toBeNull();
  });

  it('as duas entradas de Salmão continuam e ficam ativas juntas', () => {
    mount('salmon');
    const nav = screen.getByRole('navigation', { name: 'Módulos' });
    expect(within(nav).getByRole('button', { name: 'Dashboard Salmão' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('button', { name: 'Controle de Salmão' })).toHaveAttribute('aria-current', 'page');
  });

  it('conta do usuário fica no rodapé da sidebar, não no cabeçalho', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Menu da conta: Pessoa Teste' }).closest('aside')).not.toBeNull();
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: /conta|usuário/i })).toBeNull();
  });

  it('recolhida mantém a unidade identificável e volta a expandir', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Trocar unidade: Loja Centro' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recolher menu' }));
    expect(screen.getByRole('button', { name: 'Trocar unidade: Loja Centro' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Margin Food' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu da conta: Pessoa Teste' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expandir menu' }));
    expect(screen.getByRole('button', { name: 'Recolher menu' })).toBeInTheDocument();
  });

  it('largura padrão de 256 px e respeita a largura salva', () => {
    const { unmount } = mount();
    expect(screen.getByRole('navigation', { name: 'Módulos' }).closest('aside')).toHaveStyle({ width: '256px' });
    unmount();
    localStorage.setItem('app:sidebar:width', '320');
    mount();
    expect(screen.getByRole('navigation', { name: 'Módulos' }).closest('aside')).toHaveStyle({ width: '320px' });
  });
});

describe('AppLayout — gaveta do celular', () => {
  it('fechada sai do Tab; aberta recebe o foco, isola o conteúdo e fecha com Escape', () => {
    mobile.value = true;
    mount();
    const drawer = document.getElementById('app-sidebar') as HTMLElement & { inert: boolean };
    const main = screen.getByRole('main').parentElement as HTMLElement & { inert: boolean };
    expect(drawer.inert).toBe(true);
    expect(main.inert).toBe(false);

    const open = screen.getByRole('button', { name: 'Abrir menu' });
    fireEvent.click(open);
    expect(drawer).toHaveAttribute('role', 'dialog');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(drawer.inert).toBe(false);
    expect(main.inert).toBe(true);
    expect(screen.getByRole('button', { name: 'Fechar menu' })).toHaveFocus();
    expect(open).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(drawer.inert).toBe(true);
    expect(main.inert).toBe(false);
    expect(open).toHaveFocus();
  });

  it('voltar do celular para o desktop não deixa a sidebar inerte', () => {
    mobile.value = true;
    const { rerender } = mount();
    const drawer = document.getElementById('app-sidebar') as HTMLElement & { inert: boolean };
    expect(drawer.inert).toBe(true);
    mobile.value = false;
    rerender(
      <MemoryRouter>
        <TooltipProvider>
          <AppLayout activeTab="financeiro" onTabChange={vi.fn()} isOffline={false}><span /></AppLayout>
        </TooltipProvider>
      </MemoryRouter>,
    );
    const aside = screen.getByRole('navigation', { name: 'Módulos' }).closest('aside') as HTMLElement & { inert?: boolean };
    expect(aside).not.toBe(drawer);
    expect(aside.inert ?? false).toBe(false);
    expect((screen.getByRole('main').parentElement as HTMLElement & { inert: boolean }).inert).toBe(false);
  });

  it('gaveta aberta fecha ao virar desktop e não reabre sozinha ao voltar ao celular', () => {
    mobile.value = true;
    const tree = () => (
      <MemoryRouter>
        <TooltipProvider>
          <AppLayout activeTab="financeiro" onTabChange={vi.fn()} isOffline={false}><span /></AppLayout>
        </TooltipProvider>
      </MemoryRouter>
    );
    const { rerender } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(document.getElementById('app-sidebar')).toHaveAttribute('role', 'dialog');
    mobile.value = false;
    rerender(tree());
    mobile.value = true;
    rerender(tree());
    const drawer = document.getElementById('app-sidebar') as HTMLElement & { inert: boolean };
    expect(drawer).not.toHaveAttribute('role');
    expect(drawer.inert).toBe(true);
  });

  it('mostra o menu completo mesmo se o desktop estava recolhido', () => {
    const { rerender } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Recolher menu' }));
    mobile.value = true;
    rerender(
      <MemoryRouter>
        <TooltipProvider>
          <AppLayout activeTab="financeiro" onTabChange={vi.fn()} isOffline={false}><span /></AppLayout>
        </TooltipProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('FINANCEIRO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trocar unidade: Loja Centro' })).toHaveTextContent('Loja Centro');
  });
});
