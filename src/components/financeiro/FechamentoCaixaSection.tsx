import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useEmitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/DateInput';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/brl-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { SubmoduleSwitcher, type SubmoduleItem } from '@/components/ui/SubmoduleSwitcher';
import { cacheInvalidate } from '@/components/cmv/cmvCache';
import { useScopedToast } from '@/hooks/useScopedToast';
import { Plus, Edit, Trash2, RefreshCw, DollarSign, Calendar, FileDown, FileSpreadsheet, AlertTriangle, Store } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { startOfMonth, endOfMonth } from 'date-fns';
import { formatDateISO, todayBR } from '@/lib/datetime';
import { fmtBRL, formatDateBR, normalizeBRLMoneyToNumber, parseLocalDate } from '@/lib/formatters';
import { useCan } from '@/permissions/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import * as XLSX from '@/lib/safeXlsx';
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';
import DateRangePresets from './DateRangePresets';
import FechamentoMarcasTab, { type FechamentoMarca } from './FechamentoMarcasTab';
import {
  buildFechamentoDias,
  buildFechamentoMarcaPayload,
  formatQuantidadeForma,
  resolveFormaVendaDoDia,
  type FormaVenda,
} from '@/domain/financeiro/fechamentoMarcas';
import {
  buildFechamentoExcelSheets,
  buildFechamentoPdf,
  fechamentoExportFilename,
  summarizeFechamentoPeriodo,
} from '@/lib/fechamentoCaixaExport';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
} from 'recharts';
import { axisProps, gridProps, tooltipProps, chartValueFormatters, makeActiveDot } from '@/lib/chartTheme';
import { ChartTooltip } from '@/components/ui/ChartTooltip';

// ── Types ──

interface FechamentoRow {
  id: string;
  data: string;
  faturamento_bruto: number;
  taxas: number;
  descontos: number;
  faturamento_liquido: number;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}

interface FechamentoMarcaValor {
  fechamento_id: string;
  marca_id: string;
  valor_bruto: number;
  quantidade: number | null;
  forma_venda: FormaVenda | null;
}

type FechamentoTab = 'diario' | 'marcas';

const FECHAMENTO_TABS: SubmoduleItem<FechamentoTab>[] = [
  { id: 'diario', label: 'Fechamentos diários', icon: DollarSign },
  { id: 'marcas', label: 'Marcas e dark kitchens', icon: Store },
];

// Fechamentos por requisição ao ler o detalhamento por marca.
const BRAND_VALUES_CHUNK = 40;

function parseMoney(value: string) {
  return normalizeBRLMoneyToNumber(value) ?? 0;
}

// ── NoAccess fallback ──

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <AlertTriangle className="w-8 h-8" />
      <p className="text-sm">Você não tem permissão para acessar esta seção.</p>
    </div>
  );
}

// ── Component ──

export default function FechamentoCaixaSection() {
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canView = useCan('financeiro:fechamento:view');
  const canCreate = useCan('financeiro:fechamento:create');
  const canEdit = useCan('financeiro:fechamento:edit');
  const canDelete = useCan('financeiro:fechamento:delete');
  const canExport = useCan('financeiro:fechamento:export');
  const { accessibleCompanies } = useAuth();
  const { companyId } = useCompanyId();
  const companyName = accessibleCompanies.find(company => company.id === companyId)?.nome || '';

  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [items, setItems] = useState<FechamentoRow[]>([]);
  const [brands, setBrands] = useState<FechamentoMarca[]>([]);
  const [brandValues, setBrandValues] = useState<FechamentoMarcaValor[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editUpdatedAt, setEditUpdatedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FechamentoTab>('diario');

  // Filters
  const [startDate, setStartDate] = useState(() => formatDateISO(startOfMonth(new Date())));
  const [endDate, setEndDate] = useState(() => formatDateISO(endOfMonth(new Date())));

  // Form (string-based for CurrencyInput)
  const [formData, setFormData] = useState('');
  const [formBruto, setFormBruto] = useState('');
  const [formTaxas, setFormTaxas] = useState('');
  const [formDescontos, setFormDescontos] = useState('');
  const [formObs, setFormObs] = useState('');
  const [formBrandValues, setFormBrandValues] = useState<Record<string, string>>({});
  const [formBrandQuantities, setFormBrandQuantities] = useState<Record<string, string>>({});
  // Do fechamento em edição: forma de venda já gravada no dia e marcas lançadas sem quantidade.
  const [formBrandFormas, setFormBrandFormas] = useState<Record<string, FormaVenda | null>>({});
  const [formLegacyQtyBrands, setFormLegacyQtyBrands] = useState<ReadonlySet<string>>(() => new Set());
  const [formUsesBrands, setFormUsesBrands] = useState(false);

  // ── Load ──

  const loadBrands = useCallback(async () => {
    setBrandsLoading(true);
    const { data, error } = await supabase
      .from('financeiro_fechamento_marcas')
      .select('id, nome, ativo, ordem, categoria_id, forma_venda')
      .order('ativo', { ascending: false })
      .order('ordem')
      .order('nome');

    if (error) {
      console.error('[FechamentoCaixaSection.loadBrands]', error);
      toast.error('Erro ao carregar marcas do fechamento');
    } else {
      setBrands((data || []) as FechamentoMarca[]);
    }
    setBrandsLoading(false);
  }, [supabase, toast]);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('financeiro_fechamento_caixa')
      .select('id, data, faturamento_bruto, taxas, descontos, faturamento_liquido, observacao, created_at, updated_at');
    if (startDate) query = query.gte('data', startDate);
    if (endDate) query = query.lte('data', endDate);
    query = query.order('data', { ascending: false });
    const { data, error } = await query;

    if (error) {
      toast.error('Erro ao carregar fechamentos');
      console.error(error);
    } else {
      const loadedItems = (data || []) as FechamentoRow[];
      setItems(loadedItems);

      if (loadedItems.length === 0) {
        setBrandValues([]);
      } else {
        // Em lotes: período longo com várias marcas passa do limite de linhas
        // do PostgREST e o detalhamento dos últimos dias sumiria em silêncio.
        const ids = loadedItems.map(item => item.id);
        const valuesData: FechamentoMarcaValor[] = [];
        let valuesError: unknown = null;
        for (let start = 0; start < ids.length && !valuesError; start += BRAND_VALUES_CHUNK) {
          const { data: chunk, error: chunkError } = await supabase
            .from('financeiro_fechamento_marca_valores')
            .select('fechamento_id, marca_id, valor_bruto, quantidade, forma_venda')
            .in('fechamento_id', ids.slice(start, start + BRAND_VALUES_CHUNK));
          if (chunkError) valuesError = chunkError;
          else valuesData.push(...((chunk || []) as FechamentoMarcaValor[]));
        }

        if (valuesError) {
          console.error('[FechamentoCaixaSection.loadBrandValues]', valuesError);
          setBrandValues([]);
          toast.error('Erro ao carregar a divisão por marcas');
        } else {
          setBrandValues(valuesData);
        }
      }
    }
    setLoading(false);
  }, [supabase, startDate, endDate, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadBrands(); }, [loadBrands]);

  // Auto-refresh
  useDataEvent('financeiro:fechamento', load);
  useDataEvent('financeiro:fechamento-marcas', loadBrands);

  // ── Form helpers ──

  const resetForm = () => {
    setEditId(null);
    setEditUpdatedAt(null);
    setFormData(todayBR());
    setFormBruto('');
    setFormTaxas('');
    setFormDescontos('');
    setFormObs('');
    setFormBrandValues({});
    setFormBrandQuantities({});
    setFormBrandFormas({});
    setFormLegacyQtyBrands(new Set());
    setFormUsesBrands(false);
    setShowForm(false);
  };
  const fechFormSnapshot = { formData, formBruto, formTaxas, formDescontos, formObs, formBrandValues, formBrandQuantities };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: fechFormSnapshot, onClose: resetForm });

  const openNew = () => {
    resetForm();
    setFormData(todayBR());
    setFormBrandValues(Object.fromEntries(brands.filter(brand => brand.ativo).map(brand => [brand.id, ''])));
    setFormUsesBrands(brands.some(brand => brand.ativo));
    setShowForm(true);
  };

  const openEdit = (row: FechamentoRow) => {
    setEditId(row.id);
    setEditUpdatedAt(row.updated_at);
    setFormData(row.data);
    setFormBruto(String(row.faturamento_bruto));
    setFormTaxas(String(row.taxas || 0));
    setFormDescontos(String(row.descontos || 0));
    setFormObs(row.observacao || '');
    const existingValues = brandValues.filter(value => value.fechamento_id === row.id);
    setFormBrandValues(Object.fromEntries(existingValues.map(value => [value.marca_id, String(value.valor_bruto)])));
    setFormBrandQuantities(Object.fromEntries(
      existingValues
        .filter(value => value.quantidade != null)
        .map(value => [value.marca_id, String(value.quantidade)])
    ));
    setFormBrandFormas(Object.fromEntries(existingValues.map(value => [value.marca_id, value.forma_venda])));
    setFormLegacyQtyBrands(new Set(
      existingValues.filter(value => value.quantidade == null).map(value => value.marca_id)
    ));
    setFormUsesBrands(existingValues.length > 0);
    setShowForm(true);
  };

  const brandsForForm = useMemo(() => resolveFormaVendaDoDia(
    brands.filter(brand => brand.ativo || Object.prototype.hasOwnProperty.call(formBrandValues, brand.id)),
    formBrandFormas
  ), [brands, formBrandValues, formBrandFormas]);

  const brandsForFormSemCategoria = useMemo(
    () => brandsForForm.filter(brand => !brand.categoria_id),
    [brandsForForm],
  );

  const brandBreakdownPayload = useMemo(
    () => buildFechamentoMarcaPayload(brandsForForm, formBrandValues, formBrandQuantities, formLegacyQtyBrands),
    [brandsForForm, formBrandValues, formBrandQuantities, formLegacyQtyBrands]
  );
  const brandGrossTotal = brandBreakdownPayload.total;

  // ── Save ──

  const save = async () => {
    if (saving) return;
    if (formUsesBrands && brandsForForm.length === 0) {
      toast.error('Não foi possível carregar as marcas deste fechamento. Atualize a tela e tente novamente.');
      return;
    }
    const bruto = formUsesBrands ? brandGrossTotal : parseMoney(formBruto);
    const taxas = parseMoney(formTaxas);
    const descontos = parseMoney(formDescontos);

    if (!formData) { toast.error('Data obrigatória'); return; }
    if (bruto < 0) { toast.error('Faturamento bruto não pode ser negativo'); return; }
    if (taxas < 0) { toast.error('Taxas não podem ser negativas'); return; }
    if (descontos < 0) { toast.error('Descontos não podem ser negativos'); return; }
    if (descontos > bruto) { toast.error('Descontos não podem ser maiores que o faturamento bruto'); return; }
    if (formUsesBrands && brandBreakdownPayload.missingQuantidade.length > 0) {
      const nomes = brandsForForm
        .filter(brand => brandBreakdownPayload.missingQuantidade.includes(brand.id))
        .map(brand => brand.nome)
        .join(', ');
      toast.error(`Informe a quantidade de pedidos/pessoas de: ${nomes}`);
      return;
    }

    // Future date warning
    if (formData > todayBR()) {
      const ok = await confirm({
        title: 'Data futura',
        description: 'Você está registrando um fechamento em data futura. Deseja continuar?',
      });
      if (!ok) return;
    }

    setSaving(true);
    const { error } = await supabase.rpc('rpc_upsert_fechamento_caixa_com_marcas', {
      p_data: formData,
      p_faturamento_bruto: bruto,
      p_taxas: taxas,
      p_descontos: descontos,
      p_observacao: formObs || null,
      p_marcas: formUsesBrands
        ? brandBreakdownPayload.items.map(item => ({ ...item }))
        : [],
      p_expected_updated_at: editUpdatedAt,
    });

    if (error) {
      if (error.message?.includes('OPTIMISTIC_LOCK_CONFLICT')) {
        toast.error('Este fechamento foi alterado por outro usuário. Atualize a tela e tente novamente.');
      } else if (error.message?.includes('TOTAL_MARCAS_DIVERGENTE')) {
        toast.error('A soma das marcas precisa ser igual ao faturamento bruto.');
      } else if (error.message?.includes('QUANTIDADE_INVALIDA')) {
        toast.error('A quantidade de pedidos/pessoas precisa ser um número inteiro.');
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success(editId ? 'Fechamento atualizado' : 'Fechamento registrado');
      cacheInvalidate(supabase, 'calcular_cmv');
      cacheInvalidate(supabase, 'get_ranking');
      resetForm();
      emitDataEvent('financeiro:fechamento');
    }
    setSaving(false);
  };

  // ── Delete ──

  const remove = async (id: string) => {
    const ok = await confirm({
      title: 'Excluir fechamento de caixa',
      description: 'Esta ação removerá o fechamento do dia e pode impactar CMV, dashboards e relatórios. Deseja continuar?',
      variant: 'destructive',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;

    try {
      const { error } = await supabase.rpc('rpc_delete_fechamento_caixa', { p_id: id });
      if (error) throw error;
      toast.success('Fechamento excluído');
      cacheInvalidate(supabase, 'calcular_cmv');
      cacheInvalidate(supabase, 'get_ranking');
      emitDataEvent('financeiro:fechamento');
    } catch (err: unknown) {
      console.error('[FechamentoCaixaSection.remove]', err);
      toast.error(mapFinanceiroDeleteError(err));
    }
  };

  // ── Aggregates ──

  const totalBruto = items.reduce((s, r) => s + Number(r.faturamento_bruto), 0);
  const totalLiquido = items.reduce((s, r) => s + Number(r.faturamento_liquido), 0);

  const liquidoEstimado = useMemo(() => {
    const b = formUsesBrands ? brandGrossTotal : parseMoney(formBruto);
    const t = parseMoney(formTaxas);
    const d = parseMoney(formDescontos);
    return b - t - d;
  }, [formUsesBrands, brandGrossTotal, formBruto, formTaxas, formDescontos]);

  const dias = useMemo(
    () => buildFechamentoDias(items, brandValues, brands),
    [items, brandValues, brands]
  );
  const diaById = useMemo(() => new Map(dias.map(dia => [dia.id, dia])), [dias]);
  const totaisPeriodo = useMemo(() => summarizeFechamentoPeriodo(dias), [dias]);

  const tableColumnCount = canEdit || canDelete ? 8 : 7;

  // ── Trend chart data ──

  const chartData = useMemo(() =>
    [...items]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map(r => ({
        data: formatDateBR(parseLocalDate(r.data)),
        liquido: Number(r.faturamento_liquido),
      })),
    [items]
  );

  // ── Export PDF ──

  const exportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const exportInput = { companyName, startDate, endDate, dias };
      buildFechamentoPdf(exportInput).save(fechamentoExportFilename(exportInput, 'pdf'));
      toast.success('PDF exportado');
    } catch (error) {
      console.error('[FechamentoCaixaSection.exportPdf]', error);
      toast.error('Erro ao exportar PDF');
    }
    setExportingPdf(false);
  };

  // ── Export Excel ──

  const exportExcel = async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const exportInput = { companyName, startDate, endDate, dias };
      const sheets = buildFechamentoExcelSheets(exportInput);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheets.fechamento), 'Fechamento');
      if (sheets.porMarca.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheets.porMarca), 'Por marca');
      }
      XLSX.writeFile(wb, fechamentoExportFilename(exportInput, 'xlsx'));
      toast.success('Excel exportado');
    } catch (error) {
      console.error('[FechamentoCaixaSection.exportExcel]', error);
      toast.error('Erro ao exportar Excel');
    }
    setExportingExcel(false);
  };

  // ── Guard ──

  if (!canView) return <NoAccess />;

  return (
    <div className="space-y-4">
      <ConfirmDialog />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" /> Fechamento de Caixa
          </h2>
          <p className="text-sm text-muted-foreground">Faturamento diário — fonte canônica para CMV e relatórios</p>
        </div>
        {activeTab === 'diario' && <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <DateInput value={startDate} onValueChange={setStartDate} className="w-36 h-9 text-xs" />
            <span className="text-muted-foreground text-xs">—</span>
            <DateInput value={endDate} onValueChange={setEndDate} className="w-36 h-9 text-xs" />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>

          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf || loading || items.length === 0}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportingExcel || loading || items.length === 0}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
              </Button>
            </>
          )}

          {(canCreate || canEdit) && (
            <Dialog open={showForm} onOpenChange={open => { if (!open) guardedClose(); else openNew(); }}>
              {canCreate && (
                <DialogTrigger asChild>
                  <Button size="sm" disabled={brandsLoading}>
                    <Plus className="w-4 h-4 mr-1" /> Novo Dia
                  </Button>
                </DialogTrigger>
              )}
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editId ? 'Editar Fechamento' : 'Novo Fechamento'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Data</Label>
                    <DateInput value={formData} onValueChange={setFormData} />
                  </div>
                  {brandsForForm.length > 0 ? (
                    <div className="space-y-3">
                      <div>
                        <Label>Faturamento por marca</Label>
                        <p className="text-xs text-muted-foreground">
                          Informe quanto cada operação vendeu no dia. A soma será o faturamento bruto.
                        </p>
                      </div>
                      {!formUsesBrands && editId && (
                        <div className="rounded-lg border border-warning-border bg-warning-soft p-3 text-xs text-warning">
                          Este fechamento antigo ainda não foi dividido. O total atual é {fmtBRL(parseMoney(formBruto))};
                          ao preencher uma marca, a nova soma substituirá esse total.
                        </div>
                      )}
                      {brandsForFormSemCategoria.length > 0 && (
                        <div className="rounded-lg border border-warning-border bg-warning-soft p-3 text-xs text-warning">
                          Sem categoria vinculada: {brandsForFormSemCategoria.map(b => b.nome).join(', ')}. O faturamento
                          líquido dessa(s) loja(s) não aparece na Apresentação Sócios até vincular em “Marcas e dark
                          kitchens”.
                        </div>
                      )}
                      <div className="space-y-2">
                        {brandsForForm.map(brand => {
                          const semQuantidade = brandBreakdownPayload.missingQuantidade.includes(brand.id);
                          return (
                            <div key={brand.id} className="rounded-lg border p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-foreground">{brand.nome}</p>
                                {!brand.ativo && <span className="text-[10px] text-muted-foreground">Inativa</span>}
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                  <Label htmlFor={`marca-${brand.id}`} className="text-xs text-muted-foreground">
                                    Faturamento
                                  </Label>
                                  <CurrencyInput
                                    id={`marca-${brand.id}`}
                                    value={formBrandValues[brand.id] || ''}
                                    onValueChange={raw => {
                                      setFormBrandValues(current => ({ ...current, [brand.id]: raw }));
                                      setFormUsesBrands(true);
                                    }}
                                    showPrefix
                                    placeholder="0,00"
                                  />
                                </div>
                                {brand.forma_venda ? (
                                  <div className="space-y-1.5">
                                    <Label htmlFor={`marca-qtd-${brand.id}`} className="text-xs text-muted-foreground">
                                      {brand.forma_venda === 'PEDIDOS' ? 'Qtd. de pedidos' : 'Qtd. de pessoas'}
                                    </Label>
                                    <Input
                                      id={`marca-qtd-${brand.id}`}
                                      inputMode="numeric"
                                      value={formBrandQuantities[brand.id] || ''}
                                      onChange={event => {
                                        const digits = event.target.value.replace(/\D/g, '').slice(0, 9);
                                        setFormBrandQuantities(current => ({ ...current, [brand.id]: digits }));
                                        setFormUsesBrands(true);
                                      }}
                                      placeholder="0"
                                      aria-invalid={semQuantidade}
                                      className={semQuantidade ? 'border-warning' : undefined}
                                    />
                                  </div>
                                ) : (
                                  <p className="self-end pb-2 text-xs text-muted-foreground">
                                    Defina a forma de venda desta marca em “Marcas e dark kitchens” para informar
                                    a quantidade.
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Faturamento bruto — soma das marcas</p>
                          <p className="text-lg font-bold text-success">
                            {fmtBRL(formUsesBrands ? brandGrossTotal : parseMoney(formBruto))}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total de pedidos</p>
                          <p className="text-lg font-bold text-foreground">
                            {brandBreakdownPayload.totalPedidos.toLocaleString('pt-BR')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total de pessoas</p>
                          <p className="text-lg font-bold text-foreground">
                            {brandBreakdownPayload.totalPessoas.toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label>Faturamento Bruto (R$)</Label>
                      <CurrencyInput
                        value={formBruto}
                        onValueChange={(raw) => setFormBruto(raw)}
                        showPrefix
                        placeholder="0,00"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Cadastre marcas na aba “Marcas e dark kitchens” para dividir este valor.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Taxas (R$)</Label>
                      <CurrencyInput
                        value={formTaxas}
                        onValueChange={(raw) => setFormTaxas(raw)}
                        showPrefix
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <Label>Descontos (R$)</Label>
                      <CurrencyInput
                        value={formDescontos}
                        onValueChange={(raw) => setFormDescontos(raw)}
                        showPrefix
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Observação</Label>
                    <Textarea value={formObs} onChange={e => setFormObs(e.target.value)} placeholder="Opcional" rows={2} />
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Líquido estimado:</p>
                    <p className="text-lg font-bold text-foreground">{fmtBRL(liquidoEstimado)}</p>
                  </div>
                  <Button onClick={save} className="w-full" disabled={saving}>
                    {saving ? 'Salvando...' : editId ? 'Atualizar' : 'Registrar'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>}
      </div>

      <SubmoduleSwitcher
        items={FECHAMENTO_TABS}
        value={activeTab}
        onChange={value => setActiveTab(value as FechamentoTab)}
      />

      {activeTab === 'diario' ? (
        <div className="space-y-4">
      <DateRangePresets
        from={startDate}
        to={endDate}
        onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Card key={i}><CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Dias registrados</p>
              <p className="text-2xl font-bold text-foreground">{items.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Bruto</p>
              <p className="text-2xl font-bold text-success">{fmtBRL(totalBruto)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Líquido</p>
              <p className="text-2xl font-bold text-primary">{fmtBRL(totalLiquido)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total de pedidos</p>
              <p className="text-2xl font-bold text-foreground">{totaisPeriodo.pedidos.toLocaleString('pt-BR')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total de pessoas</p>
              <p className="text-2xl font-bold text-foreground">{totaisPeriodo.pessoas.toLocaleString('pt-BR')}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trend chart */}
      {!loading && chartData.length >= 2 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">Tendência — Faturamento Líquido Diário</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="data" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} />
                <RTooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => fmtBRL(Number(v))} />} />
                <Area type="monotone" dataKey="liquido" name="Líquido" className="fill-primary/20 stroke-primary" strokeWidth={2} activeDot={makeActiveDot('hsl(var(--primary))')} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Bruto</TableHead>
            <TableHead>Por marca</TableHead>
            <TableHead className="text-right">Taxas</TableHead>
            <TableHead className="text-right">Descontos</TableHead>
            <TableHead className="text-right">Líquido</TableHead>
            <TableHead>Obs</TableHead>
            {(canEdit || canDelete) && <TableHead className="w-20">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: tableColumnCount }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : items.length === 0 ? (
            <TableRow><TableCell colSpan={tableColumnCount} className="text-center text-muted-foreground py-8">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Nenhum fechamento no período
            </TableCell></TableRow>
          ) : items.map(row => (
            <TableRow key={row.id} className="align-top">
              <TableCell className="font-mono text-sm">{formatDateBR(parseLocalDate(row.data))}</TableCell>
              <TableCell className="text-right font-medium text-success">{fmtBRL(Number(row.faturamento_bruto))}</TableCell>
              <TableCell className="min-w-[260px] text-xs">
                {(diaById.get(row.id)?.marcas.length ?? 0) === 0 ? (
                  <span className="text-muted-foreground">Não detalhado</span>
                ) : (
                  <ul className="space-y-1">
                    {diaById.get(row.id)!.marcas.map(linha => (
                      <li key={linha.marcaId} className="flex items-baseline justify-between gap-3">
                        <span className="text-foreground">{linha.nome}</span>
                        <span className="whitespace-nowrap text-muted-foreground">
                          <span className="font-medium text-foreground">{fmtBRL(linha.valor)}</span>
                          {linha.quantidade != null && linha.formaVenda && (
                            <> · {formatQuantidadeForma(linha.quantidade, linha.formaVenda)}</>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">{fmtBRL(Number(row.taxas))}</TableCell>
              <TableCell className="text-right text-muted-foreground">{fmtBRL(Number(row.descontos))}</TableCell>
              <TableCell className="text-right font-bold">{fmtBRL(Number(row.faturamento_liquido))}</TableCell>
              <TableCell className="text-muted-foreground text-xs max-w-[150px] truncate">{row.observacao || '—'}</TableCell>
              {(canEdit || canDelete) && (
                <TableCell>
                  <div className="flex gap-1">
                    {canEdit && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(row.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
        </div>
      ) : (
        <div className="pt-2">
          <FechamentoMarcasTab
            items={brands}
            loading={brandsLoading}
            canCreate={canCreate}
            canEdit={canEdit}
          />
        </div>
      )}
      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </div>
  );
}
