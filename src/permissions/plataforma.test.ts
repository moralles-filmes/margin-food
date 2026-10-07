import { describe, expect, it } from 'vitest';
import { MODULE_MANIFESTS } from './registry';
import { PLATFORM_COMPANY_ID, isPlatformCompany, matrizMostraSubtab } from './plataforma';

const OUTRA_UNIDADE = '79aa38ed-826e-4278-96ee-a4a8ebc3e506';

describe('Configurações → Empresas na matriz de permissões', () => {
  it('só aparece para o super admin editando usuário da plataforma', () => {
    expect(matrizMostraSubtab('configuracoes', 'empresas', { isSuperAdmin: true, companyId: PLATFORM_COMPANY_ID })).toBe(true);
    expect(matrizMostraSubtab('configuracoes', 'empresas', { isSuperAdmin: true, companyId: OUTRA_UNIDADE })).toBe(false);
    expect(matrizMostraSubtab('configuracoes', 'empresas', { isSuperAdmin: false, companyId: PLATFORM_COMPANY_ID })).toBe(false);
    expect(matrizMostraSubtab('configuracoes', 'empresas', { isSuperAdmin: true, companyId: null })).toBe(false);
  });

  it('não esconde nenhuma outra sub-aba', () => {
    const ctx = { isSuperAdmin: false, companyId: OUTRA_UNIDADE };
    const escondidas = MODULE_MANIFESTS.flatMap(m => m.subtabs
      .filter(s => !matrizMostraSubtab(m.key, s.key, ctx))
      .map(s => `${m.key}:${s.key}`));
    expect(escondidas).toEqual(['configuracoes:empresas']);
  });

  it('a sub-aba existe no registry com as 4 ações que o banco reconhece', () => {
    const empresas = MODULE_MANIFESTS.find(m => m.key === 'configuracoes')?.subtabs.find(s => s.key === 'empresas');
    expect(empresas?.actions.map(a => a.action).sort()).toEqual(['create', 'delete', 'edit', 'view']);
  });

  it('reconhece a unidade da plataforma', () => {
    expect(isPlatformCompany(PLATFORM_COMPANY_ID)).toBe(true);
    expect(isPlatformCompany(OUTRA_UNIDADE)).toBe(false);
    expect(isPlatformCompany(undefined)).toBe(false);
  });
});
