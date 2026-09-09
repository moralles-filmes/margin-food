import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@/integrations/supabase/types';
import { loadAccessibleCompanies, loadCompanyProfile } from './companyAccess';

// Contrato do cliente/HTTP. A RLS é verificada nos testes de PostgreSQL reais.
const client = createClient<Database>('http://127.0.0.1:54321', 'test-publishable-key', {
  accessToken: async () => 'local-test-session',
});
const missingRpc = { code: 'PGRST202', message: 'Could not find the function public.list_my_companies without parameters in the schema cache' };
const missingColumn = { code: '42703', message: 'column user_roles.company_id does not exist' };
const original = { id: 'user-1', company_id: 'A', nome: 'Usuário', email: 'one@example.test', avatar_url: null,
  sector: null, job_role_id: null, companies: { id: 'A', nome: 'Loja A', ativo: true } };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const signal = () => AbortSignal.timeout(5_000);
afterEach(() => vi.unstubAllGlobals());

describe('compatibilidade de acesso antes da migração', () => {
  it.each([
    { code: '42501', message: 'COMPANY_ACCESS_DENIED' },
    { code: 'PGRST301', message: 'JWT expired' },
    { code: 'PGRST003', message: 'Connection timed out' },
    { code: 'PGRST202', message: 'Could not find the function public.unrelated' },
  ])('não usa o perfil legado para contornar $code / $message', async error => {
    const fetcher = vi.fn(async () => json(error, 403));
    vi.stubGlobal('fetch', fetcher);
    await expect(loadAccessibleCompanies(client, 'user-1', signal())).rejects.toMatchObject(error);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('bloqueia publicação parcial quando a estrutura de permissões já foi migrada', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(missingRpc, 404)).mockResolvedValueOnce(json([]));
    vi.stubGlobal('fetch', fetcher);
    await expect(loadAccessibleCompanies(client, 'user-1', signal())).rejects.toMatchObject(missingRpc);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    null,
    { ...original, companies: { ...original.companies, ativo: false } },
    { ...original, company_id: '00000000-0000-0000-0000-000000000001' },
  ])('não oferece unidade para perfil ausente, empresa inativa ou placeholder', async profile => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(missingRpc, 404))
      .mockResolvedValueOnce(json(missingColumn, 400)).mockResolvedValueOnce(json(profile)));
    await expect(loadAccessibleCompanies(client, 'user-1', signal())).resolves.toEqual({ companies: [], mode: 'single-company' });
  });

  it('rejeita outra unidade antes de carregar permissões no banco antigo', async () => {
    const fetcher = vi.fn(async () => json(original));
    vi.stubGlobal('fetch', fetcher);
    await expect(loadCompanyProfile(client, 'user-1', 'B', 'single-company', signal())).rejects.toThrow('COMPANY_ACCESS_DENIED');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('não aceita contexto legado se assert_tenant divergir do perfil', async () => {
    vi.stubGlobal('fetch', vi.fn(async input => {
      const url = String(input);
      if (url.includes('/profiles')) return json(original);
      if (url.includes('/assert_tenant')) return json('B');
      return json([]);
    }));
    await expect(loadCompanyProfile(client, 'user-1', 'A', 'single-company', signal())).rejects.toThrow('COMPANY_SCOPE_MISMATCH');
  });

  it('não recua para o perfil original quando o contexto multiunidades falha', async () => {
    const error = { code: 'PGRST202', message: 'Could not find the function public.get_my_company_context' };
    const fetcher = vi.fn(async () => json(error, 404));
    vi.stubGlobal('fetch', fetcher);
    await expect(loadCompanyProfile(client, 'user-1', 'A', 'memberships', signal())).rejects.toMatchObject(error);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
