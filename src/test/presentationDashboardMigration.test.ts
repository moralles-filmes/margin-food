import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260826211500_harden_presentation_dashboard_search_path.sql'),
  'utf8',
);

describe('hardening das RPCs SECURITY DEFINER do dashboard', () => {
  it('remove o schema public mutável do search_path das duas funções', () => {
    expect(migration).toContain('ALTER FUNCTION public.get_fin_dashboard_summary(date, date)');
    expect(migration).toContain('ALTER FUNCTION public.get_fin_dashboard_charts(date, date)');
    expect(migration.match(/SET search_path = ''/g)).toHaveLength(2);
    expect(migration).toContain('MIGRATION_CHECK_FAILED');
  });
});
