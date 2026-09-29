import { describe, expect, it } from 'vitest';
import { resolveNotificationTarget, type NotificationLink } from './notificationTarget';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const REQ_ID = '22222222-2222-4222-8222-222222222222';
const INV_ID = '33333333-3333-4333-8333-333333333333';

function link(link_path: string | null, module: string | null, entity?: { type: string; id: string }): NotificationLink {
  return { link_path, module, entity_type: entity?.type ?? null, entity_id: entity?.id ?? null };
}

describe('resolveNotificationTarget', () => {
  it('lê o módulo da query quando o caminho é vazio (notificações de requisição)', () => {
    expect(resolveNotificationTarget(link('/?module=estoque&sub=requisicoes', 'estoque', { type: 'requisicao_estoque', id: REQ_ID })))
      .toEqual({ tab: 'estoque-geral', subtab: 'requisicoes', record: { type: 'requisicao_estoque', id: REQ_ID }, href: null });
  });

  it('leva ao pedido de compra pelo id, com ou sem sub-aba no link', () => {
    const expected = { tab: 'compras', subtab: 'pedidos-compras', record: { type: 'purchase_order', id: ORDER_ID }, href: null };
    expect(resolveNotificationTarget(link(`/compras?subtab=pedidos-compras&order=${ORDER_ID}`, 'purchases')))
      .toEqual(expected);
    // Checklist concluído e "não entregue" gravam só `/compras`; o id vem da entidade.
    expect(resolveNotificationTarget(link('/compras', 'purchases', { type: 'purchase_order', id: ORDER_ID })))
      .toEqual(expected);
  });

  it('leva ao inventário atribuído ao conferente', () => {
    expect(resolveNotificationTarget(link('/inventario', 'inventario', { type: 'inventario', id: INV_ID })))
      .toEqual({ tab: 'inventario', subtab: null, record: { type: 'inventario', id: INV_ID }, href: null });
  });

  it('manda decisão e ata da Apresentação Sócios para a rota que lê a query', () => {
    expect(resolveNotificationTarget(link('/financeiro/relatorio-socios?decision=abc', 'financeiro', { type: 'presentation_decision', id: 'abc' })))
      .toEqual({ tab: 'financeiro', subtab: null, record: null, href: '/financeiro/apresentacao-socios?decision=abc' });
    expect(resolveNotificationTarget(link('/financeiro/relatorio-socios?session=s1&revision=r1', 'financeiro')))
      .toEqual({ tab: 'financeiro', subtab: null, record: null, href: '/financeiro/apresentacao-socios?session=s1&revision=r1' });
    // Sem decisão/sessão, o caminho antigo continua sendo o Borderô (a rota redireciona).
    expect(resolveNotificationTarget(link('/financeiro/relatorio-socios', 'financeiro'))?.href)
      .toBe('/financeiro/relatorio-socios');
  });

  it('cai no módulo da notificação quando não há link utilizável', () => {
    expect(resolveNotificationTarget(link(null, 'stock')))
      .toEqual({ tab: 'estoque-geral', subtab: null, record: null, href: null });
    expect(resolveNotificationTarget(link('/', 'finance')))
      .toEqual({ tab: 'financeiro', subtab: null, record: null, href: null });
  });

  it('usa o tipo do registro quando nem link nem módulo dizem o destino', () => {
    expect(resolveNotificationTarget(link(null, null, { type: 'purchase_order', id: ORDER_ID }))?.tab).toBe('compras');
  });

  it('não inventa destino para módulo desconhecido', () => {
    expect(resolveNotificationTarget(link('/desconhecido', null))).toBeNull();
    expect(resolveNotificationTarget(link(null, null))).toBeNull();
  });
});
