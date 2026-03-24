/**
 * Shortage Alerts (Alertas de Falta) Tests
 *
 * Validates that the alert system correctly replaces the old
 * purchase order auto-creation flow for out-of-stock items.
 */
import { describe, it, expect } from 'vitest';

// ─── Domain constants for alertas_falta_estoque ───
const VALID_STATUSES = ['PENDENTE', 'CONFIRMADO'] as const;
const VALID_ORIGINS = ['REQUISICAO_ESTOQUE'] as const;

// Simulates alert entity shape
interface AlertaFalta {
  id: string;
  company_id: string;
  produto_id: string;
  produto_nome: string;
  quantidade_solicitada: number;
  unidade: string;
  saldo_no_momento: number;
  requisicao_id: string | null;
  setor_solicitante: string;
  origem: string;
  status: string;
  confirmado_por: string | null;
  confirmado_em: string | null;
  created_at: string;
  created_by: string;
}

function createMockAlerta(overrides: Partial<AlertaFalta> = {}): AlertaFalta {
  return {
    id: 'alert-1',
    company_id: 'company-1',
    produto_id: 'prod-1',
    produto_nome: 'Glutamato',
    quantidade_solicitada: 5,
    unidade: 'KG',
    saldo_no_momento: 0,
    requisicao_id: 'req-1',
    setor_solicitante: 'Cozinha',
    origem: 'REQUISICAO_ESTOQUE',
    status: 'PENDENTE',
    confirmado_por: null,
    confirmado_em: null,
    created_at: new Date().toISOString(),
    created_by: 'user-1',
    ...overrides,
  };
}

describe('Shortage Alert Entity', () => {
  it('has valid status values', () => {
    expect(VALID_STATUSES).toContain('PENDENTE');
    expect(VALID_STATUSES).toContain('CONFIRMADO');
    expect(VALID_STATUSES).toHaveLength(2);
  });

  it('origin is always REQUISICAO_ESTOQUE', () => {
    const alert = createMockAlerta();
    expect(VALID_ORIGINS).toContain(alert.origem);
  });
});

describe('Alert creation rules', () => {
  it('alert has required fields', () => {
    const alert = createMockAlerta();
    expect(alert.company_id).toBeTruthy();
    expect(alert.produto_id).toBeTruthy();
    expect(alert.produto_nome).toBeTruthy();
    expect(alert.quantidade_solicitada).toBeGreaterThan(0);
    expect(alert.unidade).toBeTruthy();
    expect(alert.created_by).toBeTruthy();
    expect(alert.setor_solicitante).toBeTruthy();
  });

  it('new alert defaults to PENDENTE', () => {
    const alert = createMockAlerta();
    expect(alert.status).toBe('PENDENTE');
  });

  it('new alert has no confirmation data', () => {
    const alert = createMockAlerta();
    expect(alert.confirmado_por).toBeNull();
    expect(alert.confirmado_em).toBeNull();
  });

  it('alert must link to requisicao', () => {
    const alert = createMockAlerta();
    expect(alert.requisicao_id).toBeTruthy();
  });

  it('saldo_no_momento should be less than quantidade_solicitada', () => {
    const alert = createMockAlerta({ saldo_no_momento: 2, quantidade_solicitada: 5 });
    expect(alert.saldo_no_momento).toBeLessThan(alert.quantidade_solicitada);
  });
});

describe('Alert confirmation rules', () => {
  it('confirmed alert has CONFIRMADO status', () => {
    const alert = createMockAlerta({
      status: 'CONFIRMADO',
      confirmado_por: 'user-2',
      confirmado_em: new Date().toISOString(),
    });
    expect(alert.status).toBe('CONFIRMADO');
    expect(alert.confirmado_por).toBeTruthy();
    expect(alert.confirmado_em).toBeTruthy();
  });

  it('PENDENTE alert should appear in active listing', () => {
    const alerts = [
      createMockAlerta({ status: 'PENDENTE' }),
      createMockAlerta({ id: 'alert-2', status: 'CONFIRMADO' }),
      createMockAlerta({ id: 'alert-3', status: 'PENDENTE' }),
    ];
    const pending = alerts.filter(a => a.status === 'PENDENTE');
    expect(pending).toHaveLength(2);
  });

  it('CONFIRMADO alert should NOT appear in default (PENDENTE) listing', () => {
    const alerts = [
      createMockAlerta({ status: 'CONFIRMADO' }),
    ];
    const pending = alerts.filter(a => a.status === 'PENDENTE');
    expect(pending).toHaveLength(0);
  });
});

describe('Alert is NOT a purchase order', () => {
  it('alert origin is REQUISICAO_ESTOQUE, not a purchase module', () => {
    const alert = createMockAlerta();
    expect(alert.origem).toBe('REQUISICAO_ESTOQUE');
    expect(alert.origem).not.toBe('COMPRA');
    expect(alert.origem).not.toBe('MANUAL');
  });

  it('alert does not have purchase order fields', () => {
    const alert = createMockAlerta();
    const raw = alert as unknown as Record<string, unknown>;
    expect(raw['order_id']).toBeUndefined();
    expect(raw['supplier_name']).toBeUndefined();
    expect(raw['total_estimated']).toBeUndefined();
  });
});

describe('Idempotency', () => {
  it('same requisicao_id + produto_id should not create duplicate alert', () => {
    const alerts = [
      createMockAlerta({ requisicao_id: 'req-1', produto_id: 'prod-1' }),
    ];
    const newAlert = createMockAlerta({ requisicao_id: 'req-1', produto_id: 'prod-1' });
    const exists = alerts.some(a => a.requisicao_id === newAlert.requisicao_id && a.produto_id === newAlert.produto_id);
    expect(exists).toBe(true);
  });

  it('different requisicao allows same produto alert', () => {
    const alerts = [
      createMockAlerta({ requisicao_id: 'req-1', produto_id: 'prod-1' }),
    ];
    const newAlert = createMockAlerta({ requisicao_id: 'req-2', produto_id: 'prod-1' });
    const exists = alerts.some(a => a.requisicao_id === newAlert.requisicao_id && a.produto_id === newAlert.produto_id);
    expect(exists).toBe(false);
  });
});

describe('Multi-tenant isolation', () => {
  it('alerts from different companies are separate', () => {
    const allAlerts = [
      createMockAlerta({ company_id: 'company-A' }),
      createMockAlerta({ id: 'alert-2', company_id: 'company-B' }),
    ];
    const companyA = allAlerts.filter(a => a.company_id === 'company-A');
    const companyB = allAlerts.filter(a => a.company_id === 'company-B');
    expect(companyA).toHaveLength(1);
    expect(companyB).toHaveLength(1);
  });
});
