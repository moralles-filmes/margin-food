import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260826021702_presentation_socios_budget_projection.sql'),
  'utf8',
);

describe('contrato SQL de metas, orçamento e projeção executiva', () => {
  it('resolve tenant e permissão no backend, sem aceitar company_id do cliente', () => {
    expect(migration.match(/public\.assert_tenant\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain('financeiro:relatorio-socios:view');
    expect(migration).toContain('financeiro:orcamento:edit');
    expect(migration).not.toMatch(/p_company_id/);
    expect(migration).toContain('PRESENTATION_CATEGORY_OUT_OF_SCOPE');
  });

  it('revoga execução pública, concede apenas papéis esperados e limita paginação', () => {
    expect(migration.match(/FROM PUBLIC, anon/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain('TO authenticated, service_role');
    expect(migration).toContain('p_page_size > 50');
    expect(migration).toContain("numbered.row_number > v_offset");
    expect(migration).toContain("numbered.row_number <= v_offset + p_page_size");
  });

  it('preserva rateio, competência, exclusões e classificação semântica herdada de CMV', () => {
    expect(migration.match(/public\.fin_lancamento_rateios allocation/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(/WHERE NOT EXISTS \(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("ledger.tipo IN ('RECEITA', 'DESPESA')");
    expect(migration).toContain("ledger.origem = 'conciliacao'");
    expect(migration).toContain('ledger.data_competencia');
    expect(migration).toContain("amount.effective_group = 'cmv'");
    expect(migration).toContain('resolved.excluir_dos_relatorios IS NOT TRUE');
    expect(migration).not.toMatch(/ILIKE\s+'%cmv%'/i);
  });

  it('usa somente as fontes canônicas e não mistura títulos em aberto na projeção', () => {
    expect(migration).toContain("'actual', 'fin_lancamentos'");
    expect(migration).toContain("'budget', 'fin_orcamentos'");
    expect(migration).toContain("'cmvTarget', 'metas_cmv.meta_cmv_total'");
    expect(migration).toContain("'openItemsIncluded', false");
    expect(migration).not.toMatch(/fin_contas_(pagar|receber)/);
    expect(migration).toContain('v_sample_days < 7');
    expect(migration).toContain('v_total_days::numeric / v_sample_days::numeric');
  });

  it('protege hierarquia, concorrência e auditoria das mutações de orçamento', () => {
    expect(migration).toContain('trg_fin_validate_orcamento_scope');
    expect(migration).toContain('related_categories');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('OPTIMISTIC_LOCK_REQUIRED');
    expect(migration).toContain('OPTIMISTIC_LOCK_CONFLICT');
    expect(migration).toContain('INSERT INTO public.fin_audit_logs');
  });
});
