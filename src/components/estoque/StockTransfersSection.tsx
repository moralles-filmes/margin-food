import { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEstoqueGeralStoreContext } from '@/contexts/EstoqueGeralStoreContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowRight, ArrowLeftRight, Loader2, Package, MapPin, RefreshCw, Search } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { fmtBRL, formatFixedBR } from '@/lib/formatters';

interface Transfer {
  transfer_group_id: string;
  produto_id: string;
  nome_produto: string;
  unidade_medida: string;
  categoria: string;
  quantidade: number;
  custo_unitario: number;
  custo_total: number;
  from_location: string;
  to_location: string;
  observacao: string | null;
  created_by: string | null;
  created_at: string;
  data: string;
  actor_email: string | null;
}

interface Props {
  categorias: string[];
  locais: string[];
}

export default function StockTransfersSection({ categorias, locais }: Props) {
  const store = useEstoqueGeralStoreContext();
  const { produtos, saldos } = store;
  const activeProdutos = useMemo(() => produtos.filter(p => p.ativo), [produtos]);

  // Transfer form state
  const [showForm, setShowForm] = useState(false);
  const [formProduct, setFormProduct] = useState('');
  const [formFrom, setFormFrom] = useState('');
  const [formTo, setFormTo] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formReason, setFormReason] = useState('');
  const [saving, setSaving] = useState(false);

  // History state
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('30');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Selected product info
  const selectedProd = useMemo(() => produtos.find(p => p.id === formProduct), [formProduct, produtos]);
  const selectedSaldo = useMemo(() => {
    if (!formProduct) return 0;
    return saldos[formProduct]?.saldo || 0;
  }, [formProduct, saldos]);

  // Fetch transfer history
  const fetchTransfers = useCallback(async (pg = 0) => {
    setLoading(true);
    const endDate = format(new Date(), 'yyyy-MM-dd');
    const startDate = format(subDays(new Date(), Number(period)), 'yyyy-MM-dd');

    const params: Record<string, any> = {
      p_start_date: startDate,
      p_end_date: endDate,
      p_limit: PAGE_SIZE,
      p_offset: pg * PAGE_SIZE,
    };
    if (filterProduct) params.p_product_id = filterProduct;
    if (filterLocation) params.p_location = filterLocation;

    const { data, error } = await supabase.rpc('list_stock_transfers', params);
    if (error) {
      console.error('Error fetching transfers:', error);
      toast.error('Erro ao carregar transferências');
    } else if (data) {
      const result = data as { transfers?: Transfer[]; total?: number };
      setTransfers(result.transfers || []);
      setTotalCount(result.total || 0);
    }
    setLoading(false);
  }, [period, filterProduct, filterLocation]);

  useEffect(() => {
    fetchTransfers(0);
    setPage(0);
  }, [fetchTransfers]);

  // Submit transfer
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!formProduct) { toast.error('Selecione um produto'); return; }
    if (!formFrom) { toast.error('Selecione local de origem'); return; }
    if (!formTo) { toast.error('Selecione local de destino'); return; }
    if (formFrom === formTo) { toast.error('Locais de origem e destino devem ser diferentes'); return; }
    const qty = Number(formQty);
    if (!qty || qty <= 0) { toast.error('Quantidade deve ser maior que zero'); return; }
    if (qty > selectedSaldo) {
      toast.error(`Saldo insuficiente! Disponível: ${formatFixedBR(selectedSaldo, 2)} ${selectedProd?.unidadeMedida || ''}`);
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('stock_transfer_between_locations', {
        p_product_id: formProduct,
        p_from_location: formFrom,
        p_to_location: formTo,
        p_quantity: qty,
        p_reason: formReason || null,
      });
      if (error) throw error;
      toast.success(`Transferência realizada! ${qty} ${selectedProd?.unidadeMedida || ''} de ${formFrom} → ${formTo}`);
      setFormProduct('');
      setFormFrom('');
      setFormTo('');
      setFormQty('');
      setFormReason('');
      setShowForm(false);
      store.refreshSaldos();
      fetchTransfers(0);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao realizar transferência');
    }
    setSaving(false);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-primary" />
            Transferências entre Locais
          </h3>
          <p className="text-[10px] text-muted-foreground">Mova saldo entre locais de armazenamento de forma controlada</p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : 'Nova Transferência'}
        </Button>
      </div>

      {/* Transfer Form */}
      {showForm && (
        <form onSubmit={handleTransfer} className="bg-card border border-border rounded-xl p-4 space-y-3 animate-fade-up">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Produto</Label>
              <SearchableSelect
                value={formProduct}
                onValueChange={setFormProduct}
                options={activeProdutos.map(p => ({ value: p.id, label: `${p.nomeProduto} (${p.unidadeMedida})` }))}
                placeholder="Selecione o produto"
                searchPlaceholder="Buscar produto..."
                className="h-9 text-xs bg-secondary border-border"
                allowClear={false}
              />
              {formProduct && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Saldo disponível: <span className="font-bold text-foreground">{formatFixedBR(selectedSaldo, 2)} {selectedProd?.unidadeMedida}</span>
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">Local de Origem</Label>
              <SearchableSelect
                value={formFrom}
                onValueChange={setFormFrom}
                options={locais.filter(l => l !== formTo).map(l => ({ value: l, label: l }))}
                placeholder="De onde sai"
                searchPlaceholder="Buscar local..."
                className="h-9 text-xs bg-secondary border-border"
                allowClear={false}
              />
            </div>

            <div>
              <Label className="text-xs">Local de Destino</Label>
              <SearchableSelect
                value={formTo}
                onValueChange={setFormTo}
                options={locais.filter(l => l !== formFrom).map(l => ({ value: l, label: l }))}
                placeholder="Para onde vai"
                searchPlaceholder="Buscar local..."
                className="h-9 text-xs bg-secondary border-border"
                allowClear={false}
              />
            </div>

            <div>
              <Label className="text-xs">Quantidade ({selectedProd?.unidadeMedida || 'UN'})</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={formQty}
                onChange={e => setFormQty(e.target.value)}
                placeholder="0,00"
                className="h-9 text-xs bg-secondary border-border"
              />
              {formProduct && Number(formQty) > selectedSaldo && (
                <p className="text-[10px] text-destructive mt-0.5">Saldo insuficiente!</p>
              )}
            </div>

            <div>
              <Label className="text-xs">Motivo / Observação</Label>
              <Input
                value={formReason}
                onChange={e => setFormReason(e.target.value)}
                maxLength={500}
                placeholder="Ex: preparação para operação"
                className="h-9 text-xs bg-secondary border-border"
              />
            </div>
          </div>

          {/* Preview */}
          {formProduct && formFrom && formTo && Number(formQty) > 0 && (
            <div className="bg-secondary/50 border border-border rounded-lg p-3 flex items-center justify-center gap-3 text-xs">
              <div className="text-center">
                <MapPin className="w-3.5 h-3.5 mx-auto text-destructive mb-0.5" />
                <p className="font-medium text-foreground">{formFrom}</p>
                <p className="text-[10px] text-destructive">-{formatFixedBR(Number(formQty), 2)} {selectedProd?.unidadeMedida}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-primary" />
              <div className="text-center">
                <MapPin className="w-3.5 h-3.5 mx-auto text-success mb-0.5" />
                <p className="font-medium text-foreground">{formTo}</p>
                <p className="text-[10px] text-success">+{formatFixedBR(Number(formQty), 2)} {selectedProd?.unidadeMedida}</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" className="h-8 text-xs" disabled={saving}>
              {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Confirmar Transferência
            </Button>
          </div>
        </form>
      )}

      {/* Filters for history */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={period} onValueChange={v => setPeriod(v)}>
          <SelectTrigger className="w-28 h-8 text-xs bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
            <SelectItem value="365">1 ano</SelectItem>
          </SelectContent>
        </Select>

        <SearchableSelect
          value={filterProduct || 'all'}
          onValueChange={v => setFilterProduct(v === 'all' ? '' : v)}
          options={[{ value: 'all', label: 'Todos produtos' }, ...activeProdutos.map(p => ({ value: p.id, label: p.nomeProduto }))]}
          placeholder="Produto"
          searchPlaceholder="Buscar produto..."
          className="w-36 h-8 text-xs bg-secondary border-border"
        />

        <SearchableSelect
          value={filterLocation || 'all'}
          onValueChange={v => setFilterLocation(v === 'all' ? '' : v)}
          options={[{ value: 'all', label: 'Todos locais' }, ...locais.map(l => ({ value: l, label: l }))]}
          placeholder="Local"
          searchPlaceholder="Buscar local..."
          className="w-28 h-8 text-xs bg-secondary border-border"
        />

        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => fetchTransfers(0)}>
          <RefreshCw className="w-3 h-3 mr-1" />
          Atualizar
        </Button>

        <span className="text-[10px] text-muted-foreground ml-auto">{totalCount} transferência(s)</span>
      </div>

      {/* History Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : transfers.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <ArrowLeftRight className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">Nenhuma transferência no período</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left p-2 font-medium text-muted-foreground">Data</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Produto</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Origem → Destino</th>
                  <th className="text-right p-2 font-medium text-muted-foreground">Qtd</th>
                  <th className="text-right p-2 font-medium text-muted-foreground">Custo</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Motivo</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Usuário</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t, i) => (
                  <tr key={t.transfer_group_id || i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="p-2 whitespace-nowrap">
                      {t.data ? format(new Date(t.data + 'T12:00:00'), 'dd/MM/yy') : '-'}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1.5">
                        <Package className="w-3 h-3 text-muted-foreground" />
                        <span className="font-medium text-foreground">{t.nome_produto}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{t.categoria}</p>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-5 border-destructive/30 text-destructive">
                          {t.from_location}
                        </Badge>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-5 border-success/30 text-success">
                          {t.to_location}
                        </Badge>
                      </div>
                    </td>
                    <td className="p-2 text-right font-mono font-medium text-foreground whitespace-nowrap">
                      {formatFixedBR(t.quantidade, 2)} {t.unidade_medida}
                    </td>
                    <td className="p-2 text-right font-mono text-muted-foreground whitespace-nowrap">
                      {fmtBRL(t.custo_total)}
                    </td>
                    <td className="p-2 max-w-[150px]">
                      <p className="text-muted-foreground truncate">
                        {t.observacao?.replace(/^Transferência:.*?\.\s*/, '') || '-'}
                      </p>
                    </td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap">
                      {t.actor_email?.split('@')[0] || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-2 border-t border-border bg-secondary/30">
              <Button variant="ghost" size="sm" className="h-7 text-[10px]" disabled={page === 0}
                onClick={() => { setPage(p => p - 1); fetchTransfers(page - 1); }}>
                Anterior
              </Button>
              <span className="text-[10px] text-muted-foreground">
                Página {page + 1} de {totalPages}
              </span>
              <Button variant="ghost" size="sm" className="h-7 text-[10px]" disabled={page >= totalPages - 1}
                onClick={() => { setPage(p => p + 1); fetchTransfers(page + 1); }}>
                Próxima
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
