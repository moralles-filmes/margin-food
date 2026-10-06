import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useMemo, useId, type ReactNode } from 'react';
import { useEmitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/DateInput';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/brl-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { SubmoduleSwitcher, type SubmoduleItem } from '@/components/ui/SubmoduleSwitcher';
import KpiCard from '@/components/ui/KpiCard';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import { ChartCard } from '@/components/ui/ChartCard';
import { kpiGridClassFor, longestValueLength } from '@/components/ui/kpiGrid';
import { cacheInvalidate } from '@/components/cmv/cmvCache';
import { useScopedToast } from '@/hooks/useScopedToast';
import {
  Plus, Edit, Trash2, RefreshCw, DollarSign, CalendarDays, FileDown, FileSpreadsheet, AlertTriangle, Store,
  Wallet, TrendingUp, ShoppingBag, Users,
} from 'lucide-react';
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
import { FinKpiGrid, FinNote, FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { ListaCarregando, ResumoCarregando } from './ContasParts';
import { useConteinerEstreito } from './useConteinerEstreito';
import { useRetornoFoco } from './useRetornoFoco';
import { devolverFoco, elementoComFoco } from './devolverFoco';
import { FECHAMENTO_LISTA_LIMITE_PX, diasFechamentoLabel, periodoFechamentoLabel } from './fechamentoView';
import {
  buildFechamentoDias,
  buildFechamentoMarcaPayload,
  formatQuantidadeForma,
  resolveFormaVendaDoDia,
  type FechamentoDia,
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
import { axisProps, chartMargin, gridProps, tooltipProps, chartValueFormatters, makeActiveDot } from '@/lib/chartTheme';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { cn } from '@/lib/utils';

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

/** Aviso dentro do formulário (token de atenção, texto legível, sem opacidade). */
function AvisoForm({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-soft p-3 text-xs text-foreground">
      <AlertTriangle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
      <p>{children}</p>
    </div>
  );
}

/** Lista "Por marca" de um dia — a mesma na tabela e nos cartões. */
function MarcasDoDia({ dia, indisponivel }: { dia: FechamentoDia | undefined; indisponivel: boolean }) {
  if (indisponivel) return <span className="text-muted-foreground">Indisponível</span>;
  if (!dia || dia.marcas.length === 0) return <span className="text-muted-foreground">Não detalhado</span>;
  return (
    <ul className="space-y-1">
      {dia.marcas.map(linha => (
        <li key={linha.marcaId} className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="min-w-0 break-words text-foreground">{linha.nome}</span>
          <span className="whitespace-nowrap text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{fmtBRL(linha.valor)}</span>
            {linha.quantidade != null && linha.formaVenda && (
              <> · {formatQuantidadeForma(linha.quantidade, linha.formaVenda)}</>
            )}
          </span>
        </li>
      ))}
    </ul>
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

  // Só apresentação: qual leitura falhou (o toast continua) e de qual período são os números na tela.
  const [cargaErro, setCargaErro] = useState<'fechamentos' | 'divisao' | null>(null);
  const [marcasErro, setMarcasErro] = useState(false);
  const [periodoCarregado, setPeriodoCarregado] = useState<{ inicio: string; fim: string } | null>(null);
  const [listaRef, listaEstreita] = useConteinerEstreito(FECHAMENTO_LISTA_LIMITE_PX);
  const retornoForm = useRetornoFoco();
  const filtroDeId = useId();
  const filtroAteId = useId();
  const formDataId = useId();
  const formBrutoId = useId();
  const formTaxasId = useId();
  const formDescontosId = useId();
  const formObsId = useId();

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
    setMarcasErro(false);
    const { data, error } = await supabase
      .from('financeiro_fechamento_marcas')
      .select('id, nome, ativo, ordem, categoria_id, forma_venda')
      .order('ativo', { ascending: false })
      .order('ordem')
      .order('nome');

    if (error) {
      console.error('[FechamentoCaixaSection.loadBrands]', error);
      toast.error('Erro ao carregar marcas do fechamento');
      setMarcasErro(true);
    } else {
      setBrands((data || []) as FechamentoMarca[]);
    }
    setBrandsLoading(false);
  }, [supabase, toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setCargaErro(null);
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
      setCargaErro('fechamentos');
    } else {
      const loadedItems = (data || []) as FechamentoRow[];
      setItems(loadedItems);
      setPeriodoCarregado({ inicio: startDate, fim: endDate });

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
          setCargaErro('divisao');
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
    // Só foco: a confirmação abre sem gatilho e, ao fechar, o foco cairia no corpo da página.
    const origemFoco = elementoComFoco();
    const ok = await confirm({
      title: 'Excluir fechamento de caixa',
      description: 'Esta ação removerá o fechamento do dia e pode impactar CMV, dashboards e relatórios. Deseja continuar?',
      variant: 'destructive',
      confirmLabel: 'Excluir',
    });
    if (!ok) { devolverFoco(origemFoco); return; }

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
    devolverFoco(origemFoco);
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

  if (!canView) return <AccessDenied title="Acesso negado" description="Você não tem permissão para ver o fechamento de caixa." />;

  // ── Apresentação ──

  const periodoLabel = periodoCarregado ? periodoFechamentoLabel(periodoCarregado.inicio, periodoCarregado.fim) : null;
  const divisaoIndisponivel = cargaErro === 'divisao';
  const erroSemDados = cargaErro === 'fechamentos' && items.length === 0;
  const temAcoes = canEdit || canDelete;
  const valoresResumo = [
    String(items.length),
    fmtBRL(totalBruto),
    fmtBRL(totalLiquido),
    divisaoIndisponivel ? '—' : totaisPeriodo.pedidos.toLocaleString('pt-BR'),
    divisaoIndisponivel ? '—' : totaisPeriodo.pessoas.toLocaleString('pt-BR'),
  ];
  const resumoGrid = kpiGridClassFor(longestValueLength(valoresResumo), 3);
  const subDivisao = 'Indisponível: a divisão por marca não carregou';
  const dataDoDia = (row: FechamentoRow) => formatDateBR(parseLocalDate(row.data));

  const acoesDoDia = (row: FechamentoRow, comTexto = false) => (
    <div className={cn('flex gap-1', comTexto ? 'flex-wrap' : 'justify-end')}>
      {canEdit && (
        <Button
          size={comTexto ? 'sm' : 'icon'}
          variant={comTexto ? 'outline' : 'ghost'}
          className={comTexto ? 'h-9' : 'h-8 w-8'}
          onClick={() => openEdit(row)}
          aria-label={`Editar fechamento de ${dataDoDia(row)}`}
          title={comTexto ? undefined : `Editar fechamento de ${dataDoDia(row)}`}
        >
          <Edit aria-hidden="true" className={cn('h-4 w-4', comTexto && 'mr-1')} />
          {comTexto && 'Editar'}
        </Button>
      )}
      {canDelete && (
        <Button
          size={comTexto ? 'sm' : 'icon'}
          variant={comTexto ? 'outline' : 'ghost'}
          className={cn(comTexto ? 'h-9' : 'h-8 w-8', 'text-destructive hover:text-destructive')}
          onClick={() => remove(row.id)}
          aria-label={`Excluir fechamento de ${dataDoDia(row)}`}
          title={comTexto ? undefined : `Excluir fechamento de ${dataDoDia(row)}`}
        >
          <Trash2 aria-hidden="true" className={cn('h-4 w-4', comTexto && 'mr-1')} />
          {comTexto && 'Excluir'}
        </Button>
      )}
    </div>
  );

  const observacao = (row: FechamentoRow) => row.observacao && (
    <p className="mt-2 break-words text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Obs.:</span> {row.observacao}
    </p>
  );

  return (
    <div className="space-y-6">
      <ConfirmDialog />

      <FinScreenHeader
        title="Fechamento de Caixa"
        description="Faturamento diário — fonte canônica para CMV e relatórios"
        actions={activeTab === 'diario' ? (
          <>
            {canExport && (
              <>
                {/* Com leitura em erro o arquivo sairia com o período do filtro sobre dados de outra carga, sem a
                    divisão por marca ou com "Marca removida" no lugar dos nomes: exportar só depois de uma carga completa (D43). */}
                <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf || loading || items.length === 0 || cargaErro !== null || marcasErro}>
                  <FileDown aria-hidden="true" className="w-4 h-4 mr-1" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportingExcel || loading || items.length === 0 || cargaErro !== null || marcasErro}>
                  <FileSpreadsheet aria-hidden="true" className="w-4 h-4 mr-1" /> Excel
                </Button>
              </>
            )}
            {canCreate && (
              <Button size="sm" onClick={openNew} disabled={brandsLoading}>
                <Plus aria-hidden="true" className="w-4 h-4 mr-1" /> Novo Dia
              </Button>
            )}
          </>
        ) : undefined}
      />

      <SubmoduleSwitcher
        items={FECHAMENTO_TABS}
        value={activeTab}
        onChange={value => setActiveTab(value as FechamentoTab)}
        ariaLabel="Seção do fechamento"
      />

      {activeTab === 'diario' ? (
        <div className="space-y-6">
          <div className="space-y-3 rounded-summary border bg-card p-4 shadow-card">
            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={filtroDeId} className="text-xs text-muted-foreground">De</Label>
                <DateInput id={filtroDeId} value={startDate} onValueChange={setStartDate} className="h-9 w-full text-xs sm:w-36" />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={filtroAteId} className="text-xs text-muted-foreground">Até</Label>
                <DateInput id={filtroAteId} value={endDate} onValueChange={setEndDate} className="h-9 w-full text-xs sm:w-36" />
              </div>
              <Button variant="outline" size="sm" className="col-span-2 h-9 sm:col-span-1" onClick={load} disabled={loading}>
                <RefreshCw aria-hidden="true" className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
              </Button>
            </div>
            <div className="border-t pt-3">
              <DateRangePresets
                from={startDate}
                to={endDate}
                onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
              />
            </div>
          </div>

          {marcasErro && (
            <ErrorState
              compact
              title="Não foi possível carregar as marcas"
              description="Os nomes do detalhamento por marca e o formulário do dia podem ficar incompletos."
              onRetry={() => { void loadBrands(); }}
              retrying={brandsLoading}
            />
          )}

          {loading ? (
            <>
              <FinSectionGroup id="fech-resumo" title="Resumo do período" caption="Carregando…">
                <ResumoCarregando cards={5} className={resumoGrid} />
              </FinSectionGroup>
              <FinSectionGroup id="fech-dias" title="Fechamentos por dia">
                <div ref={listaRef}>
                  <ListaCarregando estreito={listaEstreita} texto="Carregando fechamentos…" />
                </div>
              </FinSectionGroup>
            </>
          ) : erroSemDados ? (
            <ErrorState
              title="Não foi possível carregar os fechamentos"
              description="Nenhum valor foi carregado para o período. Tente novamente."
              onRetry={() => { void load(); }}
              retrying={loading}
            />
          ) : (
            <>
              {cargaErro === 'fechamentos' && (
                <ErrorState
                  compact
                  title="Não foi possível atualizar os fechamentos"
                  description={`Os valores abaixo são da última carga${periodoLabel ? ` (${periodoLabel})` : ''}.`}
                  onRetry={() => { void load(); }}
                />
              )}
              {divisaoIndisponivel && (
                <ErrorState
                  compact
                  title="Não foi possível carregar a divisão por marca"
                  description="Bruto, taxas, descontos e líquido estão completos; o detalhamento por marca, pedidos e pessoas ficam indisponíveis."
                  onRetry={() => { void load(); }}
                />
              )}

              <FinSectionGroup
                id="fech-resumo"
                title="Resumo do período"
                caption={periodoLabel ? `${periodoLabel} · somado na tela a partir dos fechamentos carregados` : undefined}
              >
                <FinKpiGrid className={resumoGrid}>
                  <KpiCard
                    appearance="highlight"
                    icon={Wallet}
                    label="Total bruto"
                    value={valoresResumo[1]}
                    sub="Soma do faturamento bruto dos dias"
                  />
                  <KpiCard
                    appearance="summary"
                    icon={TrendingUp}
                    label="Total líquido"
                    value={valoresResumo[2]}
                    sub="Bruto − taxas − descontos de cada dia"
                  />
                  <KpiCard
                    appearance="summary"
                    icon={CalendarDays}
                    label="Dias registrados"
                    value={valoresResumo[0]}
                    sub="Dias com fechamento no período"
                  />
                  <KpiCard
                    appearance="summary"
                    icon={ShoppingBag}
                    label="Total de pedidos"
                    value={valoresResumo[3]}
                    sub={divisaoIndisponivel ? subDivisao : 'Marcas vendidas por pedido, com quantidade informada'}
                  />
                  <KpiCard
                    appearance="summary"
                    icon={Users}
                    label="Total de pessoas"
                    value={valoresResumo[4]}
                    sub={divisaoIndisponivel ? subDivisao : 'Marcas vendidas por pessoa, com quantidade informada'}
                  />
                </FinKpiGrid>
                <FinNote>
                  Pedidos e pessoas são contagens separadas e nunca se somam. Marca sem quantidade informada no dia não entra nessas contagens.
                </FinNote>
              </FinSectionGroup>

              {items.length > 0 && (
                <ChartCard
                  title="Faturamento líquido por dia"
                  subtitle={periodoLabel ? `${periodoLabel} · R$` : 'R$'}
                  height="h-[220px]"
                  isEmpty={chartData.length < 2}
                  emptyIcon={TrendingUp}
                  emptyTitle="Tendência a partir de dois dias"
                  emptyDescription="Há só um dia com fechamento no período; o valor está na lista abaixo."
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={chartMargin}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="data" {...axisProps} tickFormatter={v => String(v).slice(0, 5)} />
                      <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} />
                      <RTooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => fmtBRL(Number(v))} />} />
                      <Area type="monotone" dataKey="liquido" name="Líquido" stroke="hsl(var(--primary))" fill="hsl(var(--primary-soft))" fillOpacity={1} strokeWidth={2} activeDot={makeActiveDot('hsl(var(--primary))')} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              <FinSectionGroup
                id="fech-dias"
                title="Fechamentos por dia"
                caption={items.length > 0 ? diasFechamentoLabel(items.length) : undefined}
              >
                <div ref={listaRef}>
                  {items.length === 0 ? (
                    <EmptyState
                      icon={CalendarDays}
                      title="Nenhum fechamento no período"
                      description={canCreate ? 'Use Novo Dia para registrar o faturamento de um dia.' : 'Escolha outro período nos filtros acima.'}
                    />
                  ) : listaEstreita ? (
                    <ul className="space-y-2">
                      {items.map(row => (
                        <li key={row.id} className="space-y-3 rounded-lg border bg-card p-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground">{dataDoDia(row)}</p>
                            <p className="text-right">
                              <span className="block text-xs text-muted-foreground">Líquido</span>
                              <span className="whitespace-nowrap text-sm font-bold tabular-nums text-foreground">{fmtBRL(Number(row.faturamento_liquido))}</span>
                            </p>
                          </div>
                          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                            <div>
                              <dt className="text-muted-foreground">Bruto</dt>
                              <dd className="whitespace-nowrap font-medium tabular-nums text-success">{fmtBRL(Number(row.faturamento_bruto))}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Taxas</dt>
                              <dd className="whitespace-nowrap tabular-nums text-foreground">{fmtBRL(Number(row.taxas))}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Descontos</dt>
                              <dd className="whitespace-nowrap tabular-nums text-foreground">{fmtBRL(Number(row.descontos))}</dd>
                            </div>
                          </dl>
                          <div className="text-xs">
                            <p className="mb-1 font-medium text-muted-foreground">Por marca</p>
                            <MarcasDoDia dia={diaById.get(row.id)} indisponivel={divisaoIndisponivel} />
                            {observacao(row)}
                          </div>
                          {temAcoes && <div className="border-t pt-2">{acoesDoDia(row, true)}</div>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead className="text-right">Bruto</TableHead>
                          <TableHead>Por marca</TableHead>
                          <TableHead className="text-right">Taxas</TableHead>
                          <TableHead className="text-right">Descontos</TableHead>
                          <TableHead className="text-right">Líquido</TableHead>
                          {temAcoes && <TableHead className="text-right">Ações</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map(row => (
                          <TableRow key={row.id} className="align-top">
                            <TableCell className="whitespace-nowrap text-sm font-medium tabular-nums">{dataDoDia(row)}</TableCell>
                            <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-success">{fmtBRL(Number(row.faturamento_bruto))}</TableCell>
                            <TableCell className="min-w-[240px] text-xs">
                              <MarcasDoDia dia={diaById.get(row.id)} indisponivel={divisaoIndisponivel} />
                              {observacao(row)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{fmtBRL(Number(row.taxas))}</TableCell>
                            <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{fmtBRL(Number(row.descontos))}</TableCell>
                            <TableCell className="whitespace-nowrap text-right font-bold tabular-nums">{fmtBRL(Number(row.faturamento_liquido))}</TableCell>
                            {temAcoes && <TableCell>{acoesDoDia(row)}</TableCell>}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </FinSectionGroup>
            </>
          )}
        </div>
      ) : (
        <FechamentoMarcasTab
          items={brands}
          loading={brandsLoading}
          canCreate={canCreate}
          canEdit={canEdit}
          erro={marcasErro}
          onRetry={() => { void loadBrands(); }}
        />
      )}

      {(canCreate || canEdit) && (
        <Dialog open={showForm} onOpenChange={open => { if (!open) guardedClose(); else openNew(); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" {...retornoForm}>
            <DialogHeader>
              <DialogTitle>{editId ? 'Editar Fechamento' : 'Novo Fechamento'}</DialogTitle>
              <DialogDescription>
                {editId
                  ? 'Altere o faturamento, as taxas e os descontos do dia.'
                  : 'Registre o faturamento de um dia, com taxas e descontos.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={formDataId}>Data</Label>
                <DateInput id={formDataId} value={formData} onValueChange={setFormData} />
              </div>
              {marcasErro && (
                <AvisoForm>
                  As marcas não carregaram: o faturamento por marca pode não aparecer. Feche, use “Tentar novamente”
                  no aviso das marcas e abra o dia de novo.
                </AvisoForm>
              )}
              {divisaoIndisponivel && editId && (
                <AvisoForm>
                  A divisão por marca deste período não carregou, então este dia pode aparecer sem marcas. Salvar assim
                  regrava o dia sem o detalhamento: feche e atualize antes de alterar.
                </AvisoForm>
              )}
              {brandsForForm.length > 0 ? (
                <section aria-labelledby={`${formDataId}-marcas`} className="space-y-3">
                  <div>
                    <h3 id={`${formDataId}-marcas`} className="text-sm font-medium text-foreground">Faturamento por marca</h3>
                    <p className="text-xs text-muted-foreground">
                      Informe quanto cada operação vendeu no dia. A soma será o faturamento bruto.
                    </p>
                  </div>
                  {/* Com a divisão indisponível não se sabe se o dia é antigo: o aviso acima já explica. */}
                  {!formUsesBrands && editId && !divisaoIndisponivel && (
                    <AvisoForm>
                      Este fechamento antigo ainda não foi dividido. O total atual é {fmtBRL(parseMoney(formBruto))};
                      ao preencher uma marca, a nova soma substituirá esse total.
                    </AvisoForm>
                  )}
                  {brandsForFormSemCategoria.length > 0 && (
                    <AvisoForm>
                      Sem categoria vinculada: {brandsForFormSemCategoria.map(b => b.nome).join(', ')}. O faturamento
                      líquido dessa(s) loja(s) não aparece na Apresentação Sócios até vincular em “Marcas e dark
                      kitchens”.
                    </AvisoForm>
                  )}
                  <div className="space-y-2">
                    {brandsForForm.map(brand => {
                      const semQuantidade = brandBreakdownPayload.missingQuantidade.includes(brand.id);
                      return (
                        <div key={brand.id} className="rounded-lg border p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="min-w-0 break-words text-sm font-medium text-foreground">{brand.nome}</p>
                            {!brand.ativo && <StatusBadge status="neutral" label="Inativa" />}
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
                                aria-label={`Faturamento — ${brand.nome}`}
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
                                  aria-label={`${brand.forma_venda === 'PEDIDOS' ? 'Qtd. de pedidos' : 'Qtd. de pessoas'} — ${brand.nome}`}
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
                  <dl className="grid gap-3 rounded-lg border bg-muted p-3 sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">Faturamento bruto — soma das marcas</dt>
                      <dd className="text-lg font-bold tabular-nums text-success">
                        {fmtBRL(formUsesBrands ? brandGrossTotal : parseMoney(formBruto))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Total de pedidos</dt>
                      <dd className="text-lg font-bold tabular-nums text-foreground">
                        {brandBreakdownPayload.totalPedidos.toLocaleString('pt-BR')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Total de pessoas</dt>
                      <dd className="text-lg font-bold tabular-nums text-foreground">
                        {brandBreakdownPayload.totalPessoas.toLocaleString('pt-BR')}
                      </dd>
                    </div>
                  </dl>
                </section>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor={formBrutoId}>Faturamento Bruto (R$)</Label>
                  <CurrencyInput
                    id={formBrutoId}
                    value={formBruto}
                    onValueChange={(raw) => setFormBruto(raw)}
                    showPrefix
                    placeholder="0,00"
                  />
                  <p className="text-xs text-muted-foreground">
                    {marcasErro
                      ? 'As marcas não carregaram: este valor seria gravado sem divisão por marca.'
                      : 'Cadastre marcas na aba “Marcas e dark kitchens” para dividir este valor.'}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={formTaxasId}>Taxas (R$)</Label>
                  <CurrencyInput
                    id={formTaxasId}
                    value={formTaxas}
                    onValueChange={(raw) => setFormTaxas(raw)}
                    showPrefix
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={formDescontosId}>Descontos (R$)</Label>
                  <CurrencyInput
                    id={formDescontosId}
                    value={formDescontos}
                    onValueChange={(raw) => setFormDescontos(raw)}
                    showPrefix
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={formObsId}>Observação</Label>
                <Textarea id={formObsId} value={formObs} onChange={e => setFormObs(e.target.value)} placeholder="Opcional" rows={2} />
              </div>
              <div className="rounded-lg border bg-muted p-3">
                <p className="text-xs text-muted-foreground">Líquido estimado:</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{fmtBRL(liquidoEstimado)}</p>
              </div>
              <Button onClick={save} className="w-full" disabled={saving}>
                {saving ? 'Salvando...' : editId ? 'Atualizar' : 'Registrar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </div>
  );
}
