import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

import { useCan } from '@/permissions/hooks';
interface ReconciliationData {
  dbEntriesCount: number;
  dbEntriesKg: number;
  dbManipsCount: number;
  dbManipsKg: number;
  ledgerSaldo: number;
  expectedSaldo: number;
  divergence: number;
  ok: boolean;
}

export default function SalmonReconciliationReport() {
  const canViewRbac = useCan('salmon:estoque:view');
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(false);

  const runCheck = async () => {
    setLoading(true);
    try {
      const { data: kpis, error } = await supabase.rpc('get_salmon_reconciliation_kpis');
      if (error) throw error;

      const dbEntriesCount = Number(kpis.entries.count);
      const dbEntriesKg    = Number(kpis.entries.total_kg);
      const dbManipsCount  = Number(kpis.manips.count);
      const dbManipsKg     = Number(kpis.manips.total_kg);
      const ledgerSaldo    = Number(kpis.ledger_saldo);

      // Expected = entries - manips
      const expectedSaldo = dbEntriesKg - dbManipsKg;
      const divergence = Math.abs(ledgerSaldo - expectedSaldo);

      setData({
        dbEntriesCount,
        dbEntriesKg: Math.round(dbEntriesKg * 100) / 100,
        dbManipsCount,
        dbManipsKg: Math.round(dbManipsKg * 100) / 100,
        ledgerSaldo: Math.round(ledgerSaldo * 100) / 100,
        expectedSaldo: Math.round(expectedSaldo * 100) / 100,
        divergence: Math.round(divergence * 100) / 100,
        ok: divergence < 0.1,
      });
    } catch (err) {
      console.error('Reconciliation error:', err);
    }
    setLoading(false);
  };


  if (!canViewRbac) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
        <RefreshCw className="w-4 h-4 text-primary" /> Reconciliação Salmão
      </p>
      <p className="text-[11px] text-muted-foreground">
        Compara totais de entradas/manipulações com o saldo no ledger de estoque.
      </p>

      <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={runCheck} disabled={loading}>
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        {loading ? 'Verificando...' : 'Executar Verificação'}
      </Button>

      {data && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-secondary rounded-lg p-2">
              <p className="text-muted-foreground">Entradas (DB)</p>
              <p className="text-base font-bold text-foreground">{data.dbEntriesCount} ({data.dbEntriesKg} kg)</p>
            </div>
            <div className="bg-secondary rounded-lg p-2">
              <p className="text-muted-foreground">Manipulações (DB)</p>
              <p className="text-base font-bold text-foreground">{data.dbManipsCount} ({data.dbManipsKg} kg)</p>
            </div>
            <div className="bg-secondary rounded-lg p-2">
              <p className="text-muted-foreground">Saldo esperado (E - M)</p>
              <p className="text-base font-bold text-foreground">{data.expectedSaldo} kg</p>
            </div>
            <div className="bg-secondary rounded-lg p-2">
              <p className="text-muted-foreground">Saldo ledger (real)</p>
              <p className="text-base font-bold text-foreground">{data.ledgerSaldo} kg</p>
            </div>
          </div>

          <div className={`flex items-center gap-2 p-2 rounded-lg text-[11px] ${
            data.ok
              ? 'bg-success/10 text-success border border-success/30'
              : 'bg-destructive/10 text-destructive border border-destructive/30'
          }`}>
            {data.ok
              ? <><CheckCircle2 className="w-4 h-4" /> Dados consistentes — divergência: {data.divergence} kg</>
              : <><AlertTriangle className="w-4 h-4" /> Divergência detectada: {data.divergence} kg. Verifique ajustes de inventário ou movimentações manuais.</>
            }
          </div>
        </div>
      )}
    </div>
  );
}
