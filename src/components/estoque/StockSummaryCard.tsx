import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Package, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { parseUTCToBR } from '@/lib/datetime';
import { fmtBRL } from '@/lib/money';
import { useDataEvent } from '@/lib/dataEvents';

interface StockSummary {
  total_stock_value: number;
  items_count: number;
  missing_cost_items_count: number;
  updated_at: string;
}

export default function StockSummaryCard() {
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_stock_summary');
      if (!error && data) {
        const row = Array.isArray(data) ? data[0] : data;
        setSummary((row as unknown as StockSummary) ?? null);
      }
    } catch (e) {
      console.error('Erro ao buscar resumo estoque:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // Refresh when stock movements or product cost/status change via app events
  useDataEvent('estoque:movimentacoes', fetchSummary);
  useDataEvent('estoque:produtos', fetchSummary);

  // Listen for realtime changes on stock movements and products to auto-refresh
  useEffect(() => {
    const channel = supabase
      .channel('stock-summary-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimentacoes_estoque' }, fetchSummary)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, fetchSummary)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchSummary]);

  const formatCurrency = fmtBRL;

  const formatTime = (iso: string | undefined) => {
    if (!iso) return '—';
    try {
      return parseUTCToBR(iso);
    } catch { return '—'; }
  };

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* Main value card */}
        <Card className="sm:col-span-1 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Saldo Total em Estoque</p>
              {loading ? (
                <div className="h-6 w-24 bg-muted animate-pulse rounded mt-0.5" />
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-lg font-display font-bold text-foreground truncate cursor-help">
                      {formatCurrency(summary?.total_stock_value || 0)}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    Calculado por: saldo atual × custo médio 30 dias (unidade base), com fallback para última compra e custo padrão.
                  </TooltipContent>
                </Tooltip>
              )}
              <p className="text-[9px] text-muted-foreground">
                Atualizado: {summary ? formatTime(summary.updated_at) : '--:--'}
              </p>
            </div>
            <button onClick={fetchSummary} disabled={loading} className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
            </button>
          </CardContent>
        </Card>

        {/* Items count */}
        <Card className="border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Itens Ativos</p>
              {loading ? (
                <div className="h-6 w-12 bg-muted animate-pulse rounded mt-0.5" />
              ) : (
                <p className="text-lg font-display font-bold text-foreground">{summary?.items_count || 0}</p>
              )}
              <p className="text-[9px] text-muted-foreground">Custo: Média 30 dias</p>
            </div>
          </CardContent>
        </Card>

        {/* Missing cost warning */}
        <Card className={`border-border ${(summary?.missing_cost_items_count || 0) > 0 ? 'border-warning/30' : ''}`}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${(summary?.missing_cost_items_count || 0) > 0 ? 'bg-warning/15' : 'bg-secondary'}`}>
              <AlertCircle className={`w-5 h-5 ${(summary?.missing_cost_items_count || 0) > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sem Custo</p>
              {loading ? (
                <div className="h-6 w-12 bg-muted animate-pulse rounded mt-0.5" />
              ) : (
                <p className={`text-lg font-display font-bold ${(summary?.missing_cost_items_count || 0) > 0 ? 'text-warning' : 'text-foreground'}`}>
                  {summary?.missing_cost_items_count || 0}
                </p>
              )}
              <p className="text-[9px] text-muted-foreground">Itens excluídos do total</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
