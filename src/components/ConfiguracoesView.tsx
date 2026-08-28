import { useState } from 'react';
import { SubmoduleSwitcher } from '@/components/ui/SubmoduleSwitcher';
import { Settings, Users, ShieldAlert, Database, Fish, Shield, ShieldCheck, Activity, Plug } from 'lucide-react';
import AuditView from './AuditView';
import SecurityAuditView from './SecurityAuditView';
import GlobalAuditView from './GlobalAuditView';
import PerformanceMonitorView from './PerformanceMonitorView';
import AdminUsersView from './AdminUsersView';
import IntegracoesView from './configuracoes/IntegracoesView';
import { useSalmonStore } from '@/hooks/useSalmonStore';

import { useCan, useModuleAccess } from '@/permissions';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/brl-input';
import { DecimalInput, parseDecimal } from '@/components/ui/decimal-input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import KpiCard from '@/components/ui/KpiCard';
import { toast } from 'sonner';
import { normalizeBRLMoneyToNumber } from '@/lib/money';

// Map internal subtab keys to module registry keys
const SUBTAB_MAP: Record<string, string> = {
  'geral': 'geral',
  'integracoes': 'integracoes',
  'salmao': 'salmon',
  'usuarios': 'usuarios',
  'audit-global': 'auditoria-sistema',
  'performance': 'performance',
  'seguranca': 'auditoria-seguranca',
  'auditoria': 'auditoria-compras',
};

type SubView = 'geral' | 'integracoes' | 'salmao' | 'usuarios' | 'auditoria' | 'seguranca' | 'audit-global' | 'performance';

const allSubViews: { id: SubView; label: string; icon: typeof Settings; registryKey: string }[] = [
  { id: 'geral', label: 'Geral', icon: Settings, registryKey: 'geral' },
  { id: 'integracoes', label: 'Integrações', icon: Plug, registryKey: 'integracoes' },
  { id: 'salmao', label: 'Salmão', icon: Fish, registryKey: 'salmon' },
  { id: 'usuarios', label: 'Usuários', icon: Users, registryKey: 'usuarios' },
  { id: 'audit-global', label: 'Auditoria Sistema', icon: ShieldCheck, registryKey: 'auditoria-sistema' },
  { id: 'performance', label: 'Performance', icon: Activity, registryKey: 'performance' },
  { id: 'seguranca', label: 'Auditoria Segurança', icon: Shield, registryKey: 'auditoria-seguranca' },
  { id: 'auditoria', label: 'Auditoria Compras', icon: ShieldAlert, registryKey: 'auditoria-compras' },
];

interface Props {
  store: ReturnType<typeof useSalmonStore>;
  initialSubTab?: SubView;
}

export default function ConfiguracoesView({ store, initialSubTab }: Props) {
  const [activeView, setActiveView] = useState<SubView>(initialSubTab ?? 'geral');
  const { stockConfig, setStockConfig } = store;
  const { visibleSubtabs } = useModuleAccess('configuracoes');

  // Granular permission checks for actions
  const canManageGeral = useCan('configuracoes:geral:manage');
  const canManageUsuarios = useCan('configuracoes:usuarios:manage');

  const [perdaPercent, setPerdaPercent] = useState(String(stockConfig.perdaPercentAlerta ?? 15));
  const [perdaValor, setPerdaValor] = useState(String(stockConfig.perdaValorAlerta ?? 500));
  const [validadeDias, setValidadeDias] = useState(String(stockConfig.validadePadraoDias ?? 2));
  const [alertaVencimento, setAlertaVencimento] = useState(String(stockConfig.alertaVencimentoDias ?? 1));

  const handleSaveSalmaoConfig = () => {
    setStockConfig({
      ...stockConfig,
      perdaPercentAlerta: parseDecimal(perdaPercent) || 15,
      perdaValorAlerta: normalizeBRLMoneyToNumber(perdaValor) || 500,
      validadePadraoDias: parseInt(validadeDias) || 2,
      alertaVencimentoDias: parseInt(alertaVencimento) || 1,
    });
    toast.success('Configurações de salmão atualizadas!');
  };

  // Filter subtabs by permission
  const visibleViews = allSubViews.filter(v => visibleSubtabs.includes(v.registryKey));

  // If active view is not visible, switch to first visible
  const effectiveActive = visibleViews.some(v => v.id === activeView)
    ? activeView
    : (visibleViews[0]?.id || 'geral');

  if (visibleViews.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Shield className="w-12 h-12 mx-auto text-destructive/30 mb-3" />
          <p className="text-sm font-medium text-foreground">Acesso Negado</p>
          <p className="text-xs text-muted-foreground">Você não possui permissões para acessar as configurações.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">Configurações</h2>
        <p className="text-xs text-muted-foreground">Sistema, usuários, segurança e auditoria</p>
      </div>

      <SubmoduleSwitcher
        items={visibleViews}
        value={effectiveActive}
        onChange={(id) => setActiveView(id as SubView)}
      />

      {effectiveActive === 'geral' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-primary" /> Dados do Sistema
          </p>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Entradas salmão" value={store.entries.length} />
            <KpiCard label="Manipulações" value={store.manipulations.length} />
            <KpiCard label="Fornecedores" value={store.suppliers.length} />
            <KpiCard label="Auditorias" value={store.auditorias.length} />
          </div>
        </div>
      )}

      {effectiveActive === 'salmao' && (
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Fish className="w-4 h-4 text-primary" /> Alertas de Perda (Manipulação)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <p className="text-[11px] text-muted-foreground">Limites para destaque visual de perda nas manipulações.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground font-medium">Perda % máxima</label>
                  <div className="flex items-center gap-1.5">
                    <DecimalInput value={perdaPercent} onValueChange={raw => setPerdaPercent(raw)} maxDecimals={2} suffix="%" className="bg-secondary border-border text-foreground h-8 text-sm" disabled={!canManageGeral} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground font-medium">Perda R$ máxima</label>
                  <div className="flex items-center gap-1.5">
                    <CurrencyInput value={perdaValor} onValueChange={raw => setPerdaValor(raw)} showPrefix className="bg-secondary border-border text-foreground h-8 text-sm" disabled={!canManageGeral} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Fish className="w-4 h-4 text-success" /> Validade do Salmão Limpo</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <p className="text-[11px] text-muted-foreground">Configure a validade padrão após manipulação e o alerta de vencimento.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground font-medium">Validade padrão (dias)</label>
                  <div className="flex items-center gap-1.5">
                    <Input type="number" step="1" value={validadeDias} onChange={e => setValidadeDias(e.target.value)} className="bg-secondary border-border text-foreground h-8 text-sm" disabled={!canManageGeral} />
                    <span className="text-xs text-muted-foreground">dias</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground font-medium">Alerta de vencimento (dias antes)</label>
                  <div className="flex items-center gap-1.5">
                    <Input type="number" step="1" value={alertaVencimento} onChange={e => setAlertaVencimento(e.target.value)} className="bg-secondary border-border text-foreground h-8 text-sm" disabled={!canManageGeral} />
                    <span className="text-xs text-muted-foreground">dias</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {canManageGeral && (
            <Button size="sm" className="text-xs" onClick={handleSaveSalmaoConfig}>
              Salvar Configurações
            </Button>
          )}
        </div>
      )}

      {effectiveActive === 'integracoes' && <IntegracoesView />}

      {effectiveActive === 'usuarios' && (
        canManageUsuarios ? <AdminUsersView /> : (
          <Card>
            <CardContent className="p-8 text-center">
              <Shield className="w-12 h-12 mx-auto text-destructive/30 mb-3" />
              <p className="text-sm font-medium text-foreground">Acesso Restrito</p>
              <p className="text-xs text-muted-foreground">Você pode visualizar esta aba, mas a gestão de usuários requer a permissão <code className="text-[10px] bg-muted px-1 rounded">configuracoes:usuarios:manage</code>.</p>
            </CardContent>
          </Card>
        )
      )}
      {effectiveActive === 'audit-global' && <GlobalAuditView />}
      {effectiveActive === 'performance' && <PerformanceMonitorView />}
      {effectiveActive === 'seguranca' && <SecurityAuditView />}
      {effectiveActive === 'auditoria' && <AuditView store={store} />}
    </div>
  );
}
