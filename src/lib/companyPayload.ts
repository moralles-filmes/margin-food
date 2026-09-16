/** Vincula a escrita ao escopo que iniciou a operação, inclusive em lotes. */
export function withCompanyId<T extends object>(companyId: string | null, payload: T[]): (T & { company_id: string })[];
export function withCompanyId<T extends object>(companyId: string | null, payload: T): T & { company_id: string };
export function withCompanyId<T extends object>(companyId: string | null, payload: T | T[]) {
  if (!companyId) throw new Error('Unidade não selecionada');
  const attach = (row: T) => ({ ...row, company_id: companyId });
  return Array.isArray(payload) ? payload.map(attach) : attach(payload);
}
