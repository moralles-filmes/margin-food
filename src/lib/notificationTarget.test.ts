import { describe, expect, it } from 'vitest';
import { resolveNotificationTarget } from './notificationTarget';

describe('resolveNotificationTarget', () => {
  it('lê o módulo da query quando o caminho é vazio (notificações de requisição)', () => {
    expect(resolveNotificationTarget('/?module=estoque&sub=requisicoes', 'estoque'))
      .toEqual({ tab: 'estoque-geral', subtab: 'requisicoes' });
  });

  it('mantém o formato com o módulo no caminho', () => {
    expect(resolveNotificationTarget('/compras?subtab=pedidos-compras&order=abc', 'purchases'))
      .toEqual({ tab: 'compras', subtab: 'pedidos-compras' });
    expect(resolveNotificationTarget('/inventario', 'inventario'))
      .toEqual({ tab: 'inventario', subtab: null });
    expect(resolveNotificationTarget('/financeiro/relatorio-socios?decision=1', 'financeiro'))
      .toEqual({ tab: 'financeiro', subtab: null });
  });

  it('cai no módulo da notificação quando não há link utilizável', () => {
    expect(resolveNotificationTarget(null, 'stock')).toEqual({ tab: 'estoque-geral', subtab: null });
    expect(resolveNotificationTarget('/', 'finance')).toEqual({ tab: 'financeiro', subtab: null });
  });

  it('não inventa destino para módulo desconhecido', () => {
    expect(resolveNotificationTarget('/desconhecido', null)).toBeNull();
    expect(resolveNotificationTarget(null, null)).toBeNull();
  });
});
