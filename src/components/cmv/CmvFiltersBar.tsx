import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';
import { useCanAny } from '@/permissions/hooks';

interface CmvFiltersBarProps {
  dataInicio: string;
  dataFim: string;
  metodo: 'ledger' | 'inventario';
  escopo: 'geral' | 'salmao' | 'tudo';
  filterSetor: string;
  loading: boolean;
  onDataInicioChange: (v: string) => void;
  onDataFimChange: (v: string) => void;
  onMetodoChange: (v: 'ledger' | 'inventario') => void;
  onEscopoChange: (v: 'geral' | 'salmao' | 'tudo') => void;
  onSetorChange: (v: string) => void;
  onCalcular: () => void;
}

export default function CmvFiltersBar({
  dataInicio, dataFim, metodo, escopo, filterSetor, loading,
  onDataInicioChange, onDataFimChange, onMetodoChange, onEscopoChange, onSetorChange, onCalcular,
}: CmvFiltersBarProps) {
  const supabase = useSupabase();
  const canViewCmv = useCanAny('cmv:categoria:view', 'cmv:setor:view', 'cmv:top-itens:view', 'cmv:semanal:view');
  const [setores, setSetores] = useState<string[]>([]);
  useEffect(() => {
    if (!canViewCmv) return;
    supabase.from('stock_sectors').select('name').eq('is_active', true).order('name')
      .then(({ data }) => setSetores((data || []).map((s: { name: string }) => s.name)));
  }, [canViewCmv, supabase]);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Data Início</Label>
            <DateInput value={dataInicio} onValueChange={onDataInicioChange} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Data Fim</Label>
            <DateInput value={dataFim} onValueChange={onDataFimChange} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Método</Label>
            <Select value={metodo} onValueChange={(v: any) => onMetodoChange(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ledger">Saídas (Ledger)</SelectItem>
                <SelectItem value="inventario">Inventário</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Escopo</Label>
            <Select value={escopo} onValueChange={(v: any) => onEscopoChange(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tudo">Tudo</SelectItem>
                <SelectItem value="geral">Geral (sem salmão)</SelectItem>
                <SelectItem value="salmao">Somente Salmão</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Setor</Label>
            <Select value={filterSetor} onValueChange={onSetorChange}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {setores.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={onCalcular} disabled={loading} className="w-full gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Calcular
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          {metodo === 'inventario' ? '⚠ Método Inventário é recomendado para períodos fechados e validação contábil.' : '✅ Método Ledger é recomendado para acompanhamento operacional contínuo.'}
        </p>
      </CardContent>
    </Card>
  );
}
