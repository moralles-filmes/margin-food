import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { CompanyScopeProvider } from '@/contexts/CompanyScopeProvider';
import { CompanySelector } from '@/components/CompanySelector';
import { Button } from '@/components/ui/button';

export function PresentationCompanyScope({ children }: {
  children: (scope: { companySelector: ReactNode; localUnitOverride: boolean }) => ReactNode;
}) {
  const { user, activeCompanyId, accessibleCompanies } = useAuth();
  const [params, setParams] = useSearchParams();
  const companyId = params.get('presentationUnit') ?? activeCompanyId;
  const selectCompany = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === activeCompanyId) next.delete('presentationUnit');
    else next.set('presentationUnit', id);
    // Identifiers and available bounds belong to the previous company's data.
    for (const key of ['category','decision','session','agendaItem','revision','decisionResponsible','sessionResponsible','sessionParticipant']) next.delete(key);
    if (next.get('period') === 'all-time') { next.delete('from'); next.delete('to'); }
    setParams(next);
  };
  if (!user || !companyId) return null;
  if (!accessibleCompanies.some(company => company.id === companyId)) return <div role="alert" className="space-y-3 p-6">
    <p>Você não tem acesso à unidade desta apresentação.</p>
    <Button variant="outline" onClick={() => activeCompanyId && selectCompany(activeCompanyId)}>Voltar à unidade atual</Button>
  </div>;
  return <CompanyScopeProvider companyId={companyId} userId={user.id}>
    {children({ companySelector: <CompanySelector companies={accessibleCompanies} value={companyId} onChange={selectCompany} label="Unidade da apresentação" />,
      localUnitOverride: companyId !== activeCompanyId })}
  </CompanyScopeProvider>;
}
