export interface AccessibleCompany { id: string; nome: string }
export function resolveCompanySelection(companies: readonly AccessibleCompany[], preferred?: string | null): string | null {
  if (preferred && companies.some(company => company.id === preferred)) return preferred;
  return companies.length === 1 ? companies[0].id : null;
}
export function companyPreferenceKey(userId: string) { return `marginpro:last-company:${userId}`; }
export function readCompanyPreference(userId: string): string | null {
  try { return localStorage.getItem(companyPreferenceKey(userId)); } catch { return null; }
}
export function writeCompanyPreference(userId: string, companyId: string) {
  try { localStorage.setItem(companyPreferenceKey(userId), companyId); } catch { /* Preferência opcional. */ }
}
