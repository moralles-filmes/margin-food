/**
 * Unidade da plataforma (Moralles): a única onde Configurações → Empresas existe.
 * Espelha `public.platform_company_id()` no banco — mudar exige migration.
 */
export const PLATFORM_COMPANY_ID = 'e6df6541-154e-4576-ad0c-86047bc57490';

export function isPlatformCompany(companyId: string | null | undefined): boolean {
  return companyId === PLATFORM_COMPANY_ID;
}

/**
 * A matriz de permissões só oferece Configurações → Empresas ao super admin
 * editando um usuário da plataforma. Para os demais o banco ignora a chave
 * (fora da plataforma) ou mantém o estado atual (outros gestores da plataforma).
 */
export function matrizMostraSubtab(
  moduleKey: string,
  subtabKey: string,
  ctx: { isSuperAdmin: boolean; companyId: string | null | undefined },
): boolean {
  if (moduleKey === 'configuracoes' && subtabKey === 'empresas') {
    return ctx.isSuperAdmin && isPlatformCompany(ctx.companyId);
  }
  return true;
}
