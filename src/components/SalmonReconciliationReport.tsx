import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

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
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(false);

  const runCheck = async () => {
    setLoading(true);
    try {
      // 1. Get entries totals from salmon_entries
      const { data: entries } = await supabase
        .from('salmon_entries')
        .select('gross_kg')
        .eq('status', 'ACTIVE');

      const dbEntriesCount = entries?.length || 0;
      const dbEntriesKg = entries?.reduce((s, e) => s + Number(e.gross_kg), 0) || 0;

      // 2. Get manipulations totals
      const { data: manips } = await supabase
        .from('salmon_manipulations')
        .select('gross_out_kg')
        .eq('status', 'ACTIVE');

      const dbManipsCount = manips?.length || 0;
      const dbManipsKg = manips?.reduce((s, m) => s + Number(m.gross_out_kg), 0) || 0;

      // 3. Get ledger saldo from movimentacoes_estoque directly
      const { data: ledgerRows } = await supabase
        .from('movimentacoes_estoque')
        .select('direction, tipo, quantidade')
        .eq('source_module', 'salmon')
        .eq('status', 'ATIVO');

      const ledgerSaldo = (ledgerRows ?? []).reduce((s, r) => {
        if (['ENTRADA_ESTORNO', 'SAIDA_ESTORNO'].includes(r.tipo)) return s;
        return s + (r.direction === 'IN' ? Number(r.quantidade) : -Number(r.quantidade));
      }, 0);

      // 4. Expected = entries - manips
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
