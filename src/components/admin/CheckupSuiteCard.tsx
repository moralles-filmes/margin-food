import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Stethoscope, Copy, CheckCircle2, XCircle, MinusCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useScopedToast } from '@/hooks/useScopedToast';

interface CheckupSection {
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  details: Record<string, unknown>;
}

interface CheckupResult {
  meta: { ran_at: string; company_id: string; actor_user_id: string };
  sections: Record<string, CheckupSection>;
}

const SECTION_LABELS: Record<string, string> = {
  tenant_identity: 'A) Tenant & Identidade',
  company_id_integrity: 'B) Integridade company_id',
  rls_force_rls: 'C) RLS / FORCE RLS',
  policy_safety_scan: 'D) Policy Safety Scan',
  estoque_sanity: 'E) Estoque Sanity',
  relatorios_sanity: 'F) Relatórios Sanity',
  rbac_sql_lint: 'G) RBAC SQL Lint',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  PASS: <CheckCircle2 className="w-4 h-4 text-success" />,
  FAIL: <XCircle className="w-4 h-4 text-destructive" />,
  SKIPPED: <MinusCircle className="w-4 h-4 text-muted-foreground" />,
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold">
      {STATUS_ICON[status] || STATUS_ICON.SKIPPED}
      {status}
    </span>
  );
}

function SectionRow({ title, status, children }: { title: string; status: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg">
      <button
        className="w-full flex items-center justify-between p-3 text-left hover:bg-surface-hover transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        <StatusBadge status={status} />
      </button>
      {open && children && (
        <div className="px-3 pb-3 border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
}

function DetailRenderer({ details }: { details: Record<string, unknown> }) {
  const toast = useScopedToast();
  // Render tables array (rls, policies, rpcs)
  if (details.tables && Array.isArray(details.tables)) {
    return (
      <div className="space-y-1 mt-2">
        {(details.tables as Array<Record<string, unknown>>).map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-xs font-mono flex-wrap">
            <StatusBadge status={String(t.status)} />
            <span className="text-foreground">{String(t.table)}</span>
            {t.error && <span className="text-destructive">({String(t.error)})</span>}
            {t.note && <span className="text-muted-foreground">({String(t.note)})</span>}
            {t.rls_enabled !== undefined && !t.rls_enabled && <span className="text-destructive">RLS=off</span>}
            {t.force_rls !== undefined && !t.force_rls && <span className="text-destructive">FORCE=off</span>}
          </div>
        ))}
      </div>
    );
  }

  if (details.rpcs && Array.isArray(details.rpcs)) {
    return (
      <div className="space-y-1 mt-2">
        {(details.rpcs as Array<Record<string, unknown>>).map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-xs font-mono flex-wrap">
            <StatusBadge status={String(r.status)} />
            <span className="text-foreground">{String(r.rpc)}</span>
            {r.error && <span className="text-destructive truncate max-w-64">({String(r.error)})</span>}
          </div>
        ))}
      </div>
    );
  }

  if (details.suspicious_policies && Array.isArray(details.suspicious_policies)) {
    const pols = details.suspicious_policies as Array<Record<string, unknown>>;
    if (pols.length === 0) return <p className="text-xs text-muted-foreground mt-2">Nenhuma policy suspeita detectada.</p>;
    return (
      <div className="space-y-1 mt-2">
        {pols.map((p, i) => (
          <div key={i} className="text-xs font-mono text-destructive">
            {String(p.table)}.{String(p.policy)} ({String(p.cmd)}) — {String(p.qual_preview)}
          </div>
        ))}
      </div>
    );
  }

  // RBAC lint items (array format from old edge)
  if (details.items && Array.isArray(details.items)) {
    const items = details.items as Array<Record<string, unknown>>;
    return (
      <div className="space-y-2 mt-2">
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-muted-foreground">Total: {String(details.total ?? items.length)}</span>
          <span className="text-destructive">Falhas: {String(details.failures ?? 0)}</span>
        </div>
        <div className="space-y-1 max-h-60 overflow-auto">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-mono flex-wrap">
              <StatusBadge status={String(item.status === 'FAIL' ? 'FAIL' : 'PASS')} />
              <span className="text-foreground">{String(item.check || item.table || item.name || `item-${i}`)}</span>
              {item.detail && <span className="text-muted-foreground truncate max-w-80">({String(item.detail)})</span>}
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs mt-1"
          onClick={() => { navigator.clipboard.writeText(JSON.stringify(items, null, 2)); toast.success('Lint report copiado'); }}>
          <Copy className="w-3 h-3" /> Copiar lint report
        </Button>
      </div>
    );
  }

  // RBAC lint jsonb report format (from rbac_sql_lint_report_admin)
  if (details.status !== undefined && details.fail_count !== undefined) {
    // Support both full and quick mode section keys
    const fullSections = ['tables_without_rls','tables_without_force_rls','business_tables_missing_company_id',
      'company_id_without_fk','security_definer_without_guard','has_permission_one_arg_calls'] as const;
    const quickSections = ['force_rls_critical','dangerous_policies','has_permission_single_arg','extensions_in_public'] as const;
    const sections = details.mode === 'quick' ? quickSections : fullSections;
    const debug = details.debug as Record<string, unknown> | undefined;
    return (
      <div className="space-y-2 mt-2">
        {debug?.version && (
          <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground border-b border-border pb-1 mb-1">
            <span>version: {String(debug.version)}</span>
            {debug.mode && <span>mode: {String(debug.mode)}</span>}
            <span>sql: {String(debug.executed_sql ?? '—')}</span>
          </div>
        )}
        <div className="flex items-center gap-3 text-xs font-mono">
          <StatusBadge status={String(details.status)} />
          <span className="text-muted-foreground">Falhas: {String(details.fail_count)}</span>
        </div>
        <div className="space-y-1 max-h-60 overflow-auto">
          {sections.map(key => {
            const val = details[key];
            if (val === undefined || val === null) return null;
            const isArray = Array.isArray(val);
            // Count only items with explicit status=FAIL, or total length for flat arrays without per-item status
            let failCount = 0;
            if (isArray) {
              const arr = val as Array<Record<string, unknown>>;
              const hasStatus = arr.length > 0 && 'status' in arr[0];
              failCount = hasStatus
                ? arr.filter(item => item.status === 'FAIL').length
                : arr.length;
            } else if (typeof val === 'object' && val !== null && 'count' in (val as Record<string, unknown>)) {
              failCount = Number((val as Record<string, unknown>).count);
            }
            const warnCount = isArray
              ? (val as Array<Record<string, unknown>>).filter(item => item.status === 'WARN').length
              : 0;
            const sectionStatus = failCount > 0 ? 'FAIL' : warnCount > 0 ? 'WARN' : 'PASS';
            return (
              <div key={key} className="flex items-center gap-2 text-xs font-mono flex-wrap">
                <StatusBadge status={sectionStatus === 'WARN' ? 'SKIPPED' : sectionStatus} />
                <span className="text-foreground">{key}</span>
                <span className="text-muted-foreground">
                  {failCount > 0 ? `(${failCount} fail)` : warnCount > 0 ? `(${warnCount} warn)` : '(0)'}
                </span>
              </div>
            );
          })}
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs mt-1"
          onClick={() => { navigator.clipboard.writeText(JSON.stringify(details, null, 2)); toast.success('Lint report copiado'); }}>
          <Copy className="w-3 h-3" /> Copiar lint report
        </Button>
      </div>
    );
  }

  // Generic key-value
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono mt-2">
      {Object.entries(details).map(([k, v]) => (
        <div key={k} className="flex justify-between col-span-2">
          <span className="text-muted-foreground">{k}:</span>
          <span className="text-foreground">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
        </div>
      ))}
    </div>
  );
}

export default function CheckupSuiteCard() {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lintLoading, setLintLoading] = useState(false);

  const runCheckup = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await (supabase.rpc as any)('admin_checkup_suite');
      if (err) {
        setError(err.message);
      } else {
        setResult(data as CheckupResult);
        // Try fetching rbac lint from edge
        fetchRbacLint(data as CheckupResult);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const fetchRbacLint = async (current: CheckupResult, mode: 'quick' | 'full' = 'quick') => {
    setLintLoading(true);
    const endpoint = mode === 'full' ? '/functions/v1/rbac-lint-full' : '/functions/v1/rbac-lint-quick';
    try {
      const { data, error, response: resp } = await supabase.functions.invoke(mode === 'full' ? 'rbac-lint-full' : 'rbac-lint-quick');
      if (!resp) throw error ?? new Error('Sem resposta do servidor');
      const bodyText = resp.ok ? (typeof data === 'string' ? data : JSON.stringify(data)) : await resp.text();

      if (!resp.ok) {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(bodyText); } catch { /* ignore */ }
        updateLintSection(current, 'FAIL', {
          http_status: resp.status,
          endpoint,
          response_text: bodyText.slice(0, 500),
          ...parsed,
        });
        return;
      }

      let lintData: { status: string; details?: Record<string, unknown>; report?: Record<string, unknown>; debug?: Record<string, unknown> };
      try {
        lintData = JSON.parse(bodyText);
      } catch {
        updateLintSection(current, 'FAIL', { http_status: resp.status, endpoint, response_text: bodyText.slice(0, 500), error: 'Resposta não é JSON válido' });
        return;
      }

      const normalizedDetails = lintData.details ?? { ...(lintData.report ?? {}), debug: lintData.debug ?? {} };
      updateLintSection(current, lintData.status as any, normalizedDetails);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      updateLintSection(current, 'FAIL', { endpoint, error: msg });
    } finally {
      setLintLoading(false);
    }
  };

  const updateLintSection = (current: CheckupResult, status: 'PASS' | 'FAIL' | 'SKIPPED', details: Record<string, unknown>) => {
    setResult({
      ...current,
      sections: {
        ...current.sections,
        rbac_sql_lint: { status, details },
      },
    });
  };

  const copyReport = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    toast.success('Relatório copiado para a área de transferência');
  };

  const overallStatus = result
    ? Object.values(result.sections).some(s => s.status === 'FAIL') ? 'HAS FAILURES' : 'ALL PASS'
    : null;

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Stethoscope className="w-4 h-4" /> Checkup Suite
          {overallStatus && (
            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${
              overallStatus === 'ALL PASS' ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive'
            }`}>
              {overallStatus}
            </span>
          )}
          {lintLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Button variant="default" size="sm" className="gap-1.5 text-xs" onClick={runCheckup} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Stethoscope className="w-3 h-3" />}
            {loading ? 'Executando...' : 'Executar Checkup'}
          </Button>
          {result && !lintLoading && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => fetchRbacLint(result, 'full')} disabled={loading}>
              🔬 Rodar FULL Lint (pode demorar)
            </Button>
          )}
          {result && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={copyReport}>
              <Copy className="w-3 h-3" /> Copiar relatório (JSON)
            </Button>
          )}
        </div>

        {error && <span className="text-destructive text-xs">ERROR: {error}</span>}

        {result && (
          <div className="space-y-2">
            {Object.entries(SECTION_LABELS).map(([key, label]) => {
              const section = result.sections[key];
              if (!section) return null;
              return (
                <SectionRow key={key} title={label} status={section.status}>
                  <DetailRenderer details={section.details} />
                </SectionRow>
              );
            })}

            <p className="text-[10px] text-muted-foreground mt-2">
              Executado em: {(() => { try { return new Date(result.meta.ran_at).toLocaleString('pt-BR'); } catch { return result.meta.ran_at; } })()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
