import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';

const SETORES = ['Cozinha', 'Salão', 'Limpeza', 'Sushi', 'Peixaria', 'Copa', 'Administrativo', 'Delivery'];

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
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Data Início</Label>
            <Input type="date" value={dataInicio} onChange={e => onDataInicioChange(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Data Fim</Label>
            <Input type="date" value={dataFim} onChange={e => onDataFimChange(e.target.value)} />
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
                {SETORES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
