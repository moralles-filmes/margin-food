import { useSupabase, useCompanyScope } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';
import { Clock, AlertTriangle, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { parseUTCToBR } from '@/lib/datetime';

import { useCan } from '@/permissions/hooks';
interface InactiveItem {
  item_id: string;
  item_name: string;
  category: string;
  location: string;
  unidade_medida: string;
  inactivity_days_threshold: number;
  last_movement_at: string;
  days_inactive: number;
  stock_qty: number;
}

export default function StockInactivityAlert({
 categorias }: { categorias: string[] }) {
  const supabase = useSupabase();
  const companyId = useCompanyScope()?.companyId;
  const canViewRbac = useCan('estoque:preditivo:view');
  const [items, setItems] = useState<InactiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [filterCat, setFilterCat] = useState('');
  const [onlyWithStock, setOnlyWithStock] = useState(false);

  const fetchInactive = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_inactive_stock_items');
      if (!error && data) setItems(data as unknown as InactiveItem[]);
    } catch (e) {
      console.error('Erro ao buscar itens inativos:', e);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchInactive(); }, [fetchInactive, companyId, supabase]);

  // Auto-refresh on movement changes
  useEffect(() => {
    const channel = supabase
      .channel('inactivity-alert-refresh:' + companyId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movimentacoes_estoque', filter: `company_id=eq.${companyId}` }, () => fetchInactive())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchInactive, companyId, supabase]);

  const filtered = items.filter(i => {
    if (filterCat && i.category !== filterCat) return false;
    if (onlyWithStock && i.stock_qty <= 0) return false;
    return true;
  });

  const count = items.length;

  if (loading) {
    return (
      <Card className="border-border">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            <div className="h-3 w-20 bg-muted animate-pulse rounded mt-1" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!canViewRbac) return null;

  return (
    <Card className={`border-border transition-all ${count > 0 ? 'border-warning-border' : ''}`}>
      <CardContent className="p-0">
        {/* Summary header */}
        <button
          onClick={() => count > 0 && setExpanded(!expanded)}
          className="w-full p-3 flex items-center gap-3 text-left"
          disabled={count === 0}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${count > 0 ? 'bg-warning-soft' : 'bg-secondary'}`}>
            {count > 0 ? <AlertTriangle className="w-5 h-5 text-warning" /> : <Clock className="w-5 h-5 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Itens Sem Movimentação</p>
            <p className={`text-lg font-display font-bold ${count > 0 ? 'text-warning' : 'text-foreground'}`}>
              {count} {count === 1 ? 'item parado' : 'itens parados'}
            </p>
          </div>
          {count > 0 && (
            expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {/* Expanded detail */}
        {expanded && count > 0 && (
          <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <SearchableSelect
                value={filterCat || 'all'}
                onValueChange={v => setFilterCat(v === 'all' ? '' : v)}
                options={[{ value: 'all', label: 'Todas' }, ...categorias.map(c => ({ value: c, label: c }))]}
                placeholder="Categoria"
                searchPlaceholder="Buscar categoria..."
                className="w-32 h-7 text-[10px] bg-secondary border-border"
              />
              <div className="flex items-center gap-1.5">
                <Switch id="only-stock" checked={onlyWithStock} onCheckedChange={setOnlyWithStock} className="scale-75" />
                <Label htmlFor="only-stock" className="text-[10px] text-muted-foreground cursor-pointer">Apenas com estoque</Label>
              </div>
              <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} de {count}</span>
            </div>

            {/* Items table */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {filtered.map(item => (
                <div key={item.item_id} className="bg-background-subtle border border-border rounded-lg p-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{item.item_name}</p>
                    <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5 flex-wrap">
                      {item.category && <span>{item.category}</span>}
                      {item.location && <><span>•</span><span>{item.location}</span></>}
                      <span>•</span>
                      <span>Saldo: {item.stock_qty > 0 ? `${Number(item.stock_qty).toFixed(1)} ${item.unidade_medida}` : '0'}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 font-bold ${item.days_inactive >= item.inactivity_days_threshold * 2 ? 'border-destructive text-destructive' : 'border-warning text-warning'}`}>
                      {item.days_inactive}d parado
                    </Badge>
                    <p className="text-[8px] text-muted-foreground mt-0.5">
                      Limite: {item.inactivity_days_threshold}d
                    </p>
                    <p className="text-[8px] text-muted-foreground">
                      Último: {parseUTCToBR(item.last_movement_at)}
                    </p>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-4">
                  <Package className="w-8 h-8 mx-auto text-muted-foreground/30 mb-1" />
                  <p className="text-[10px] text-muted-foreground">Nenhum item com os filtros aplicados</p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
