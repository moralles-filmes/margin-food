import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { includesNormalized } from '@/lib/utils';
import { sortByName } from '@/lib/sortByName';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

import { useCan, useModuleAccess } from '@/permissions/hooks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Slider } from '@/components/ui/slider';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useTravaEnvio } from '@/hooks/useTravaEnvio';
import { novaSemente } from '@/lib/chaveOperacao';
import { chaveCriacaoComponente } from '@/domain/fichaTecnica/idempotencia';
import ProductSearchCombobox, { type ProductOption } from '@/components/ui/ProductSearchCombobox';
import { LoteSalmaoLimpo } from '@/types/salmon';
import { DecimalInput, parseDecimal } from '@/components/ui/decimal-input';
import { CurrencyInput } from '@/components/ui/brl-input';
import { Plus, Trash2, Save, RefreshCw, Search, ChefHat, Layers, ShoppingBag, DollarSign, TrendingUp, Calculator, BarChart3, Settings2, ArrowRight, X, Fish } from 'lucide-react';
import { SubmoduleSwitcher } from '@/components/ui/SubmoduleSwitcher';

import { fmtBRL, formatDateValueBR, formatPercentBR, formatFixedBR, normalizeBRLMoneyToNumber } from '@/lib/formatters';
import { padronizarTexto } from '@/lib/padronizarTexto';
const R$ = (v: number) => fmtBRL(v);
const pct = (v: number) => formatPercentBR(v);
const qty = (v: number, d = 1) => formatFixedBR(v, d);

type ComponenteTipo = 'PRE_PREPARO' | 'ITEM_PRONTO' | 'PRODUTO_FINAL';

interface Componente {
  id: string;
  tipo: ComponenteTipo;
  nome: string;
  categoria: string;
  rendimento: number;
  unidade_rendimento: string;
  perda_estimada_percent: number;
  custo_indireto: number;
  peso_por_unidade: number | null;
  tempo_preparo_min: number | null;
  modo_preparo: string;
  checklist: any[];
  observacoes: string;
  ativo: boolean;
  custo_total_calculado: number;
  custo_unitario_calculado: number;
  created_at: string;
}

interface Canal {
  id: string;
  nome: string;
  taxa_percentual: number;
  taxa_fixa: number;
  imposto_percent: number;
  custo_embalagem_adicional: number;
  ativo: boolean;
}

interface BomItem {
  produto_id?: string;
  componente_filho_id?: string;
  quantidade: number;
  unidade: string;
  custo_snapshot: number;
  nome?: string;
  custoBase?: number;
  origem?: string;
  unidade_original?: string;
  quantidade_original?: number;
  isSalmao?: boolean;
}

// Salmon cost helper: sync from localStorage to backend
function calcSalmonCostPerKg(lotesLimpos: LoteSalmaoLimpo[]): number {
  const activeLots = lotesLimpos.filter(l => l.kgRestante > 0 && l.status !== 'VENCIDO');
  if (activeLots.length === 0) return 0;
  const totalKg = activeLots.reduce((s, l) => s + l.kgRestante, 0);
  const totalValor = activeLots.reduce((s, l) => s + (l.kgRestante * l.custoKg), 0);
  return totalKg > 0 ? totalValor / totalKg : 0;
}

interface SalmonRef {
  preco: number;
  origem: string;
  info: string;
  preco_manual: number;
  preco_auto: number;
}

async function invokeApi(supabase: typeof import("@/integrations/supabase/client").supabase, action: string, payload: any = {}) {
  const { data, error } = await supabase.functions.invoke('ficha-tecnica', {
    body: { action, ...payload },
  });
  if (error) {
    const msg = error.message || 'Erro na API';
    const parsed = typeof data === 'object' && data?.error ? data.error : null;
    if (parsed?.code === 'FORBIDDEN_TENANT') throw new Error('Sem acesso — este recurso não pertence ao seu tenant.');
    if (parsed?.code === 'NOT_FOUND') throw new Error('Recurso não encontrado.');
    if (parsed?.message) throw new Error(parsed.message);
    throw new Error(msg);
  }
  return data;
}

// ============================================================
// LEVEL TABLE - Reusable component for each level's list
// ============================================================
function NivelTable({ tipo, tipoLabel, tipoIcon, componentes, canCreate, canEdit, canDelete, canPrecificar, canSimular, onNew, onEdit, onDelete, onDetalhe, onPrecificacao, onSimulador, search, onSearchChange }: {
  tipo: ComponenteTipo; tipoLabel: string; tipoIcon: React.ReactNode;
  componentes: Componente[]; canCreate: boolean; canEdit: boolean; canDelete: boolean;
  canPrecificar: boolean; canSimular: boolean;
  onNew: () => void; onEdit: (c: Componente) => void; onDelete: (c: Componente) => void;
  onDetalhe: (id: string) => void;
  onPrecificacao: (c: Componente) => void; onSimulador: (c: Componente) => void;
  search: string; onSearchChange: (v: string) => void;
}) {
  const filtered = useMemo(() => {
    const list = componentes.filter(c => c.tipo === tipo);
    if (search) return list.filter(c => includesNormalized(c.nome, search));
    return list;
  }, [componentes, tipo, search]);

  const descriptions: Record<ComponenteTipo, string> = {
    PRE_PREPARO: 'Base produtiva com rendimento em peso/volume. Composto por insumos e/ou outros pré-preparos.',
    ITEM_PRONTO: 'Peça ou unidade operacional. Composto por insumos, pré-preparos e/ou salmão.',
    PRODUTO_FINAL: 'Produto vendido ao cliente. Composto apenas por itens prontos + embalagem/complementos.',
  };

  const allowedComponents: Record<ComponenteTipo, string> = {
    PRE_PREPARO: '✔ Insumos  ✔ Pré-preparos  ❌ Itens prontos  ❌ Produtos finais',
    ITEM_PRONTO: '✔ Insumos  ✔ Pré-preparos  ✔ Salmão  ❌ Produtos finais',
    PRODUTO_FINAL: '✔ Itens prontos  ✔ Embalagem (insumo)  ❌ Pré-preparos  ❌ Produtos finais',
  };

  return (
    <div className="space-y-4">
      {/* Header info */}
      <Card className="border-primary-border bg-primary-soft">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-soft flex items-center justify-center text-primary-ink flex-shrink-0">{tipoIcon}</div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-sm">{tipoLabel}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{descriptions[tipo]}</p>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">{allowedComponents[tipo]}</p>
            </div>
            <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={`Buscar ${tipoLabel.toLowerCase()}...`} value={search} onChange={e => onSearchChange(e.target.value)} className="pl-9" />
        </div>
        {canCreate && (
          <Button size="sm" onClick={onNew}><Plus className="w-4 h-4 mr-1" />Novo {tipoLabel}</Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Rendimento</TableHead>
                <TableHead className="text-right">Custo Unit.</TableHead>
                <TableHead className="text-right">Custo Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum {tipoLabel.toLowerCase()} encontrado</TableCell></TableRow>
              ) : filtered.map(c => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-surface-hover" onClick={() => onDetalhe(c.id)}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{c.categoria}</TableCell>
                  <TableCell className="text-right">{c.rendimento} {c.unidade_rendimento}</TableCell>
                  <TableCell className="text-right font-medium">{R$(c.custo_unitario_calculado)}</TableCell>
                  <TableCell className="text-right">{R$(c.custo_total_calculado)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      {canPrecificar && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onPrecificacao(c)}><DollarSign className="w-3.5 h-3.5" /></Button>
                      )}
                      {canSimular && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onSimulador(c)}><TrendingUp className="w-3.5 h-3.5" /></Button>
                      )}
                      {canEdit && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(c)}><Settings2 className="w-3.5 h-3.5" /></Button>
                      )}
                      {canDelete && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// MAIN VIEW
// ============================================================
export default function FichaTecnicaView({ lotesLimpos = [] }: { lotesLimpos?: LoteSalmaoLimpo[] }) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { visibleSubtabs, canView } = useModuleAccess('ficha');

  // Granular permission checks
  const canCreatePP = useCan('ficha:pre-preparos:create');
  const canEditPP = useCan('ficha:pre-preparos:edit');
  const canDeletePP = useCan('ficha:pre-preparos:delete');
  const canCreateIP = useCan('ficha:itens-prontos:create');
  const canEditIP = useCan('ficha:itens-prontos:edit');
  const canDeleteIP = useCan('ficha:itens-prontos:delete');
  const canCreatePF = useCan('ficha:produtos-finais:create');
  const canEditPF = useCan('ficha:produtos-finais:edit');
  const canDeletePF = useCan('ficha:produtos-finais:delete');
  const canManageCanais = useCan('ficha:canais:manage');
  const canManageMarkup = useCan('ficha:markup:manage');
  const canSimulate = useCan('ficha:analise:simulate');

  const isEditor = canEditPP || canEditIP || canEditPF;
  const isAdmin = canManageMarkup; // For salmon config, use markup:manage permission
  const localSalmonCost = useMemo(() => calcSalmonCostPerKg(lotesLimpos), [lotesLimpos]);

  const [subTab, setSubTab] = useState<string>('pre_preparo');
  const [componentes, setComponentes] = useState<Componente[]>([]);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [searchPP, setSearchPP] = useState('');
  const [searchIP, setSearchIP] = useState('');
  const [searchPF, setSearchPF] = useState('');
  const [salmonRef, setSalmonRef] = useState<SalmonRef>({ preco: 0, origem: 'nenhum', info: '', preco_manual: 0, preco_auto: 0 });
  const [showSalmonConfig, setShowSalmonConfig] = useState(false);


  // Dialogs
  const [showCompForm, setShowCompForm] = useState(false);
  const [formTipoForced, setFormTipoForced] = useState<ComponenteTipo | null>(null);
  const [editingComp, setEditingComp] = useState<Componente | null>(null);
  const [showCanalForm, setShowCanalForm] = useState(false);
  const [editingCanal, setEditingCanal] = useState<Canal | null>(null);
  const [showDetalhe, setShowDetalhe] = useState(false);
  const [detalheComp, setDetalheComp] = useState<any>(null);
  const [detalheItens, setDetalheItens] = useState<any[]>([]);
  const [detalheCusto, setDetalheCusto] = useState<any>(null);
  const [showSimulador, setShowSimulador] = useState(false);
  const [simuladorComp, setSimuladorComp] = useState<Componente | null>(null);
  const [showPrecificacao, setShowPrecificacao] = useState(false);
  const [precifComp, setPrecifComp] = useState<Componente | null>(null);

  // `listar_componentes` pagina no servidor (máx. 500 por chamada): segue o cursor
  // até o fim, senão fichas além da 1ª página simplesmente não aparecem.
  const listarTodosComponentes = useCallback(async (): Promise<Componente[]> => {
    const all: Componente[] = [];
    let cursor: { nome: string; id: string } | null = null;
    do {
      const res = await invokeApi(supabase, 'listar_componentes', { ativo: true, limit: 500, cursor });
      all.push(...(res.componentes || []));
      cursor = res.has_more ? res.next_cursor : null;
    } while (cursor);
    return all;
  }, [supabase]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [componentesAll, canaisRes, prodsRes, salmonRefRes] = await Promise.all([
        listarTodosComponentes(),
        invokeApi(supabase, 'listar_canais'),
        supabase.from('produtos').select('id, nome_produto, custo_ultima_compra, custo_padrao, unidade_medida, categoria').eq('ativo', true).order('nome_produto'),
        invokeApi(supabase, 'get_preco_referencia_salmao'),
      ]);
      setComponentes(sortByName<Componente>(componentesAll, c => c.nome));
      setCanais(sortByName<any>(canaisRes.canais || [], c => c.nome));
      setProdutos(sortByName<any>(prodsRes.data || [], p => p.nome_produto));
      setSalmonRef(salmonRefRes);
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  }, [supabase, listarTodosComponentes, toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-sync salmon price from local lots to backend when lots change
  useEffect(() => {
    if (localSalmonCost > 0) {
      const latestLot = lotesLimpos
        .filter(l => l.kgRestante > 0 && l.status !== 'VENCIDO')
        .sort((a, b) => b.dataManipulacao.localeCompare(a.dataManipulacao))[0];
      const info = latestLot ? `Lote de ${formatDateValueBR(latestLot.dataManipulacao)} — ${R$(localSalmonCost)}/kg limpo` : '';
      invokeApi(supabase, 'sync_preco_salmao_auto', { preco_kg_limpo: localSalmonCost, lote_info: info })
        .then(() => setSalmonRef(prev => ({ ...prev, preco: localSalmonCost, preco_auto: localSalmonCost, origem: 'lote_recente', info })))
        .catch((e) => console.warn('[salmon-price-sync] falha ao sincronizar preço do salmão com o backend:', e));
    }
  }, [localSalmonCost, lotesLimpos, supabase]);

  const openNew = (tipo: ComponenteTipo) => {
    setEditingComp(null);
    setFormTipoForced(tipo);
    setShowCompForm(true);
  };

  const openEdit = (c: Componente) => {
    setEditingComp(c);
    setFormTipoForced(null);
    setShowCompForm(true);
  };

  async function openDetalhe(id: string) {
    try {
      const res = await invokeApi(supabase, 'get_componente_detalhe', { id });
      setDetalheComp(res.componente);
      setDetalheItens(res.itens);
      setDetalheCusto(res.custo);
      setShowDetalhe(true);
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleDeleteComp(c: Componente) {
    const ok = await confirm({ title: 'Excluir componente', description: `Tem certeza que deseja excluir "${c.nome}"? Esta ação não pode ser desfeita.`, confirmLabel: 'Excluir', variant: 'destructive' });
    if (!ok) return;
    if (deleting) return; // prevent double-click
    setDeleting(c.id);
    try { await invokeApi(supabase, 'deletar_componente', { id: c.id }); toast.success('Componente excluído'); loadAll(); }
    catch (e: any) { toast.error(e.message); }
    finally { setDeleting(null); }
  }

  function openSimulador(c: Componente) { setSimuladorComp(c); setShowSimulador(true); }
  function openPrecificacao(c: Componente) { setPrecifComp(c); setShowPrecificacao(true); }

  // Counts
  const countPP = componentes.filter(c => c.tipo === 'PRE_PREPARO').length;
  const countIP = componentes.filter(c => c.tipo === 'ITEM_PRONTO').length;
  const countPF = componentes.filter(c => c.tipo === 'PRODUTO_FINAL').length;

  // Map subtab keys to tab values
  const SUBTAB_MAP: Record<string, string> = {
    'pre-preparos': 'pre_preparo',
    'itens-prontos': 'item_pronto',
    'produtos-finais': 'produto_final',
    'canais': 'canais',
    'analise': 'analise',
    'markup': 'markup',
  };
  const visibleTabValues = visibleSubtabs.map(k => SUBTAB_MAP[k]).filter(Boolean);
  const defaultTab = visibleTabValues[0] || 'pre_preparo';

  // If current subtab isn't visible, switch to first visible
  const effectiveSubTab = visibleTabValues.includes(subTab) ? subTab : defaultTab;

  const fichaSubViews = [
    { id: 'pre_preparo', label: 'Pré-Preparos', icon: ChefHat, badge: countPP || undefined },
    { id: 'item_pronto', label: 'Itens Prontos', icon: Layers, badge: countIP || undefined },
    { id: 'produto_final', label: 'Produtos Finais', icon: ShoppingBag, badge: countPF || undefined },
    { id: 'canais', label: 'Canais', icon: Settings2 },
    { id: 'analise', label: 'Análise', icon: BarChart3 },
    { id: 'markup', label: 'Markup', icon: Calculator },
  ].filter(t => visibleTabValues.includes(t.id));

  if (!canView) {
    return <div className="text-center py-12 text-muted-foreground">Sem permissão para acessar Ficha Técnica.</div>;
  }

  return (
    <div className="space-y-4">
      <Tabs value={effectiveSubTab} onValueChange={setSubTab}>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <SubmoduleSwitcher
            items={fichaSubViews}
            value={effectiveSubTab}
            onChange={setSubTab}
          />
          {canManageMarkup && (
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={recalculating} onClick={async () => {
              if (recalculating) return;
              setRecalculating(true);
              try { await invokeApi(supabase, 'recalcular_todos_custos'); toast.success('Custos recalculados'); loadAll(); }
              catch (e: any) { toast.error(e.message); }
              finally { setRecalculating(false); }
            }}><RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${recalculating ? 'animate-spin' : ''}`} />{recalculating ? 'Recalculando...' : 'Recalcular Todos'}</Button>
          )}
        </div>

        {/* Salmon Reference Price Banner */}
        <Card className={`border-l-4 ${salmonRef.preco > 0 ? 'border-l-primary' : 'border-l-destructive'}`}>
          <CardContent className="p-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Fish className="w-5 h-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Salmão — Preço de Referência: {salmonRef.preco > 0 ? R$(salmonRef.preco) + '/kg limpo' : 'Não configurado'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {salmonRef.origem === 'lote_recente' ? `📦 ${salmonRef.info}` : salmonRef.origem === 'manual' ? '✏️ Preço manual definido pelo admin' : '⚠️ Sem preço. Defina manualmente ou lance um lote.'}
                </p>
              </div>
            </div>
            {canManageMarkup && (
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setShowSalmonConfig(true)}>
                <Settings2 className="w-3.5 h-3.5 mr-1" />Configurar
              </Button>
            )}
          </CardContent>
        </Card>

        {/* === PRÉ-PREPAROS === */}
        <TabsContent value="pre_preparo">
          {loading ? <p className="text-center py-8 text-muted-foreground">Carregando...</p> : (
            <NivelTable tipo="PRE_PREPARO" tipoLabel="Pré-Preparo" tipoIcon={<ChefHat className="w-5 h-5" />}
              componentes={componentes} canCreate={canCreatePP} canEdit={canEditPP} canDelete={canDeletePP}
              canPrecificar={canManageMarkup} canSimular={canSimulate}
              onNew={() => openNew('PRE_PREPARO')} onEdit={openEdit} onDelete={handleDeleteComp} onDetalhe={openDetalhe}
              onPrecificacao={openPrecificacao} onSimulador={openSimulador}
              search={searchPP} onSearchChange={setSearchPP} />
          )}
        </TabsContent>

        {/* === ITENS PRONTOS === */}
        <TabsContent value="item_pronto">
          {loading ? <p className="text-center py-8 text-muted-foreground">Carregando...</p> : (
            <NivelTable tipo="ITEM_PRONTO" tipoLabel="Item Pronto" tipoIcon={<Layers className="w-5 h-5" />}
              componentes={componentes} canCreate={canCreateIP} canEdit={canEditIP} canDelete={canDeleteIP}
              canPrecificar={canManageMarkup} canSimular={canSimulate}
              onNew={() => openNew('ITEM_PRONTO')} onEdit={openEdit} onDelete={handleDeleteComp} onDetalhe={openDetalhe}
              onPrecificacao={openPrecificacao} onSimulador={openSimulador}
              search={searchIP} onSearchChange={setSearchIP} />
          )}
        </TabsContent>

        {/* === PRODUTOS FINAIS === */}
        <TabsContent value="produto_final">
          {loading ? <p className="text-center py-8 text-muted-foreground">Carregando...</p> : (
            <NivelTable tipo="PRODUTO_FINAL" tipoLabel="Produto Final" tipoIcon={<ShoppingBag className="w-5 h-5" />}
              componentes={componentes} canCreate={canCreatePF} canEdit={canEditPF} canDelete={canDeletePF}
              canPrecificar={canManageMarkup} canSimular={canSimulate}
              onNew={() => openNew('PRODUTO_FINAL')} onEdit={openEdit} onDelete={handleDeleteComp} onDetalhe={openDetalhe}
              onPrecificacao={openPrecificacao} onSimulador={openSimulador}
              search={searchPF} onSearchChange={setSearchPF} />
          )}
        </TabsContent>

        {/* === CANAIS TAB === */}
        <TabsContent value="canais" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-foreground">Canais de Venda</h3>
            {canManageCanais && <Button size="sm" onClick={() => { setEditingCanal(null); setShowCanalForm(true); }}><Plus className="w-4 h-4 mr-1" />Novo Canal</Button>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {canais.map(canal => (
              <Card key={canal.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base">{canal.nome}</CardTitle>
                    {canManageCanais && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingCanal(canal); setShowCanalForm(true); }}><Settings2 className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={async () => {
                          try { await invokeApi(supabase, 'deletar_canal', { id: canal.id }); toast.success('Canal removido'); loadAll(); }
                          catch (e: any) { toast.error(e.message); }
                        }}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Taxa %</span><span className="font-medium">{pct(canal.taxa_percentual)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Taxa fixa</span><span className="font-medium">{R$(canal.taxa_fixa)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Imposto</span><span className="font-medium">{pct(canal.imposto_percent)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Embalagem</span><span className="font-medium">{R$(canal.custo_embalagem_adicional)}</span></div>
                </CardContent>
              </Card>
            ))}
            {canais.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-8">Nenhum canal cadastrado</p>}
          </div>
        </TabsContent>

        {/* === ANÁLISE TAB === */}
        <TabsContent value="analise" className="space-y-4">
          <AnaliseTab componentes={componentes} />
        </TabsContent>

        {/* === MARKUP TAB === */}
        <TabsContent value="markup" className="space-y-4">
          <MarkupExplicacao />
        </TabsContent>
      </Tabs>

      {/* === DIALOGS === */}
      <ComponenteFormDialog
        open={showCompForm}
        onClose={() => setShowCompForm(false)}
        componente={editingComp}
        forcedTipo={formTipoForced}
        componentes={componentes}
        produtos={produtos}
        salmonRef={salmonRef}
        onSaved={() => { setShowCompForm(false); loadAll(); }}
      />

      <CanalFormDialog
        open={showCanalForm}
        onClose={() => setShowCanalForm(false)}
        canal={editingCanal}
        onSaved={() => { setShowCanalForm(false); loadAll(); }}
      />

      {showDetalhe && detalheComp && (
        <DetalheDialog open={showDetalhe} onClose={() => setShowDetalhe(false)}
          componente={detalheComp} itens={detalheItens} custo={detalheCusto} />
      )}

      {showSimulador && simuladorComp && (
        <SimuladorDialog open={showSimulador} onClose={() => setShowSimulador(false)}
          componente={simuladorComp} canais={canais} />
      )}

      {showPrecificacao && precifComp && (
        <PrecificacaoDialog open={showPrecificacao} onClose={() => setShowPrecificacao(false)}
          componente={precifComp} canais={canais} onSaved={loadAll} />
      )}

      {/* Salmon Config Dialog */}
      <SalmonConfigDialog
        open={showSalmonConfig}
        onClose={() => setShowSalmonConfig(false)}
        salmonRef={salmonRef}
        isAdmin={isAdmin}
        onSaved={() => { setShowSalmonConfig(false); loadAll(); }}
      />
      <ConfirmDialog />
    </div>
  );
}

// ============================================================
// COMPONENTE FORM DIALOG - with hierarchy-aware BOM
// ============================================================
function ComponenteFormDialog({ open, onClose, componente, forcedTipo, componentes, produtos, salmonRef, onSaved }: {
  open: boolean; onClose: () => void; componente: Componente | null; forcedTipo: ComponenteTipo | null;
  componentes: Componente[]; produtos: any[]; salmonRef: SalmonRef; onSaved: () => void;
}) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const [form, setForm] = useState({
    tipo: 'PRE_PREPARO' as ComponenteTipo,
    nome: '', categoria: 'Geral', rendimento: '1', unidade_rendimento: 'un',
    perda_estimada_percent: '0', custo_indireto: '0', peso_por_unidade: '',
    tempo_preparo_min: '', modo_preparo: '', observacoes: '',
  });
  const [bomItens, setBomItens] = useState<BomItem[]>([]);
  const { enviando: saving, executar } = useTravaEnvio();
  // Semente da criação: só troca depois do sucesso. A chave enviada combina a
  // semente com o formulário — o retry do mesmo componente recebe o já criado.
  const [sementeCriacao, setSementeCriacao] = useState(novaSemente);

  const fichaProductOptions: ProductOption[] = useMemo(() =>
    produtos.map((p: { id: string; nome_produto: string; sku?: string; unidade_medida?: string }) => ({
      id: p.id,
      label: p.nome_produto,
      sublabel: p.unidade_medida || '',
      keywords: p.sku || '',
    })),
    [produtos]
  );

  useEffect(() => {
    if (componente) {
      setForm({
        tipo: componente.tipo,
        nome: componente.nome, categoria: componente.categoria,
        rendimento: String(componente.rendimento), unidade_rendimento: componente.unidade_rendimento,
        perda_estimada_percent: String(componente.perda_estimada_percent),
        custo_indireto: String(componente.custo_indireto),
        peso_por_unidade: componente.peso_por_unidade ? String(componente.peso_por_unidade) : '',
        tempo_preparo_min: componente.tempo_preparo_min ? String(componente.tempo_preparo_min) : '',
        modo_preparo: componente.modo_preparo || '', observacoes: componente.observacoes || '',
      });
      invokeApi(supabase, 'get_componente_detalhe', { id: componente.id }).then(res => {
        setBomItens((res.itens || []).map((i: any) => ({
          produto_id: i.produto_id || undefined,
          componente_filho_id: i.componente_filho_id || undefined,
          quantidade: Number(i.quantidade), unidade: i.unidade,
          custo_snapshot: Number(i.custo_snapshot), nome: i.nome, custoBase: i.custoBase,
          origem: i.origem || 'ESTOQUE_GERAL',
          isSalmao: i.isSalmao || i.origem === 'MODULO_SALMAO',
          unidade_original: i.unidade_original || '',
          quantidade_original: Number(i.quantidade_original) || 0,
        })));
      });
    } else {
      const tipo = forcedTipo || 'PRE_PREPARO';
      const defaultUnit = tipo === 'ITEM_PRONTO' ? 'un' : tipo === 'PRODUTO_FINAL' ? 'un' : 'g';
      setForm({
        tipo, nome: '', categoria: 'Geral', rendimento: '1', unidade_rendimento: defaultUnit,
        perda_estimada_percent: '0', custo_indireto: '0', peso_por_unidade: '',
        tempo_preparo_min: '', modo_preparo: '', observacoes: '',
      });
      setBomItens([]);
    }
  }, [componente, forcedTipo, open, supabase]);

  const handleSave = () => executar(async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return; }
    try {
      const campos = {
        tipo: form.tipo, nome: form.nome, categoria: form.categoria,
        rendimento: parseDecimal(form.rendimento) || 1, unidade_rendimento: form.unidade_rendimento,
        perda_estimada_percent: parseDecimal(form.perda_estimada_percent) || 0,
        custo_indireto: normalizeBRLMoneyToNumber(form.custo_indireto) || 0,
        peso_por_unidade: form.peso_por_unidade ? parseDecimal(form.peso_por_unidade) : null,
        tempo_preparo_min: form.tempo_preparo_min ? parseDecimal(form.tempo_preparo_min) : null,
        modo_preparo: form.modo_preparo, observacoes: form.observacoes,
      };
      const itens = bomItens.map(i => ({
        produto_id: i.produto_id || null, componente_filho_id: i.componente_filho_id || null,
        quantidade: i.quantidade, unidade: i.unidade, custo_snapshot: i.custoBase || 0,
        origem: i.origem || 'ESTOQUE_GERAL',
        unidade_original: i.unidade_original || '', quantidade_original: i.quantidade_original || 0,
      }));

      // A chave da criação fica com o texto digitado; o banco recebe nome e categoria padronizados.
      const camposEnviados = { ...campos, nome: padronizarTexto(campos.nome), categoria: padronizarTexto(campos.categoria) };

      if (componente) {
        // Edição: regravar cabeçalho e itens de novo dá o mesmo resultado.
        await invokeApi(supabase, 'salvar_componente', { id: componente.id, ...camposEnviados });
        if (itens.length > 0) {
          await invokeApi(supabase, 'salvar_componente_itens', { componente_pai_id: componente.id, itens });
        }
        toast.success('Salvo com sucesso');
      } else {
        // Criação: cabeçalho e itens numa transação — falhou um item, não
        // sobra componente órfão; o retry recebe o componente já criado.
        const res = await invokeApi(supabase, 'criar_componente', {
          ...camposEnviados,
          itens,
          client_request_id: await chaveCriacaoComponente(sementeCriacao, { campos, itens }),
        });
        setSementeCriacao(novaSemente());
        toast.success(res?.idempotente ? 'Componente já estava salvo' : 'Salvo com sucesso');
      }
      onSaved();
    } catch (e: any) {
      console.error('Erro ao salvar componente:', e);
      toast.error(e.message);
    }
  });

  const addBomInsumo = (prodId: string) => {
    const prod = produtos.find(p => p.id === prodId);
    if (!prod) return;
    setBomItens(prev => [...prev, {
      produto_id: prodId, quantidade: 0,
      unidade: prod.unidade_medida || 'g',
      custo_snapshot: Number(prod.custo_ultima_compra) || Number(prod.custo_padrao) || 0,
      nome: prod.nome_produto,
      custoBase: Number(prod.custo_ultima_compra) || Number(prod.custo_padrao) || 0,
    }]);
  };

  const addBomComponente = (compId: string) => {
    const comp = componentes.find(c => c.id === compId);
    if (!comp) return;
    setBomItens(prev => [...prev, {
      componente_filho_id: compId, quantidade: 0,
      unidade: comp.unidade_rendimento || 'un',
      custo_snapshot: comp.custo_unitario_calculado,
      nome: comp.nome, custoBase: comp.custo_unitario_calculado,
    }]);
  };

  const addBomSalmao = () => {
    const salmonPrice = salmonRef.preco;
    if (salmonPrice <= 0) {
      toast.error('Sem preço de referência do salmão. Configure o preço manual ou lance um lote.');
      return;
    }
    setBomItens(prev => [...prev, {
      quantidade: 0, unidade: 'kg', custo_snapshot: salmonPrice,
      nome: '🐟 Salmão (módulo exclusivo)', custoBase: salmonPrice,
      origem: 'MODULO_SALMAO', isSalmao: true,
      unidade_original: 'g', quantidade_original: 0,
    }]);
  };

  // Hierarchy rules for allowed child components
  const allowedChildTypes: ComponenteTipo[] = form.tipo === 'PRODUTO_FINAL'
    ? ['ITEM_PRONTO']
    : form.tipo === 'ITEM_PRONTO'
    ? ['PRE_PREPARO']
    : ['PRE_PREPARO'];

  const allowsSalmon = form.tipo === 'PRE_PREPARO' || form.tipo === 'ITEM_PRONTO';
  const allowsInsumos = true; // All types can use insumos

  const childComponents = componentes.filter(c => allowedChildTypes.includes(c.tipo) && c.id !== componente?.id);

  const custoEstimado = bomItens.reduce((s, i) => s + (i.quantidade * (i.custoBase || 0)), 0);
  const custoSalmaoEstimado = bomItens.filter(i => i.isSalmao).reduce((s, i) => s + (i.quantidade * (i.custoBase || 0)), 0);
  const salmaoPctCusto = custoEstimado > 0 ? (custoSalmaoEstimado / custoEstimado) * 100 : 0;
  const rendLiq = (parseDecimal(form.rendimento) || 1) * (1 - (parseDecimal(form.perda_estimada_percent) || 0) / 100);
  const custoUnit = rendLiq > 0 ? (custoEstimado + (normalizeBRLMoneyToNumber(form.custo_indireto) || 0)) / rendLiq : 0;

  // Labels by tipo
  const tipoLabels: Record<ComponenteTipo, { title: string; rendLabel: string; unitDefault: string }> = {
    PRE_PREPARO: { title: 'Pré-Preparo', rendLabel: 'Rendimento total', unitDefault: 'g' },
    ITEM_PRONTO: { title: 'Item Pronto', rendLabel: 'Rendimento (unidades)', unitDefault: 'un' },
    PRODUTO_FINAL: { title: 'Produto Final', rendLabel: 'Rendimento (vendas)', unitDefault: 'un' },
  };
  const labels = tipoLabels[form.tipo];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{componente ? `Editar ${labels.title}` : `Novo ${labels.title}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Hierarchy info banner */}
          <div className="bg-background-subtle rounded-lg p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">📐 Regras de composição — {labels.title}</p>
            {form.tipo === 'PRE_PREPARO' && <p className="text-muted-foreground">✔ Insumos e outros pré-preparos. ❌ Itens prontos e produtos finais.</p>}
            {form.tipo === 'ITEM_PRONTO' && <p className="text-muted-foreground">✔ Insumos, pré-preparos e salmão. ❌ Produtos finais.</p>}
            {form.tipo === 'PRODUTO_FINAL' && <p className="text-muted-foreground">✔ Itens prontos e insumos (embalagem/complementos). ❌ Pré-preparos e outros produtos finais.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as ComponenteTipo }))} disabled={!!forcedTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRE_PREPARO">Pré-Preparo</SelectItem>
                  <SelectItem value="ITEM_PRONTO">Item Pronto</SelectItem>
                  <SelectItem value="PRODUTO_FINAL">Produto Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Categoria</Label><Input value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} /></div>
          </div>

          <div><Label>Nome</Label><Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder={form.tipo === 'PRE_PREPARO' ? 'Ex: Gohan pronto, Molho tarê...' : form.tipo === 'ITEM_PRONTO' ? 'Ex: Nigiri salmão, Jyo...' : 'Ex: Combinado 20 peças, Combo casal...'} /></div>

          <div className="grid grid-cols-3 gap-3">
            <div><Label>{labels.rendLabel}</Label><DecimalInput value={form.rendimento} onValueChange={raw => setForm(f => ({ ...f, rendimento: raw }))} maxDecimals={3} /></div>
            <div>
              <Label>Unidade</Label>
              <Select value={form.unidade_rendimento} onValueChange={v => setForm(f => ({ ...f, unidade_rendimento: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="un">un</SelectItem>
                  <SelectItem value="g">g</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="ml">ml</SelectItem>
                  <SelectItem value="L">L</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Perda %</Label><DecimalInput value={form.perda_estimada_percent} onValueChange={raw => setForm(f => ({ ...f, perda_estimada_percent: raw }))} maxDecimals={2} suffix="%" /></div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div><Label>Custo indireto (R$)</Label><CurrencyInput value={form.custo_indireto} onValueChange={(raw) => setForm(f => ({ ...f, custo_indireto: raw }))} showPrefix maxDecimals={2} /></div>
            <div><Label>Peso/un (g)</Label><DecimalInput value={form.peso_por_unidade} onValueChange={raw => setForm(f => ({ ...f, peso_por_unidade: raw }))} maxDecimals={2} placeholder="Opcional" /></div>
            <div><Label>Tempo (min)</Label><DecimalInput value={form.tempo_preparo_min} onValueChange={raw => setForm(f => ({ ...f, tempo_preparo_min: raw }))} maxDecimals={2} placeholder="Opcional" /></div>
          </div>

          {/* BOM */}
          <div className="border rounded-lg p-3 space-y-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <Label className="text-sm font-semibold">
                {form.tipo === 'PRODUTO_FINAL' ? 'Itens Prontos + Embalagem' : 'Ingredientes / Componentes'}
              </Label>
              <div className="flex gap-1 flex-wrap">
                {allowsInsumos && (
                  <div className="w-52">
                    <ProductSearchCombobox
                      options={fichaProductOptions}
                      value=""
                      onSelect={id => { if (id) addBomInsumo(id); }}
                      placeholder={form.tipo === 'PRODUTO_FINAL' ? '+ Embalagem/Compl.' : '+ Insumo'}
                      allowClear={false}
                    />
                  </div>
                )}
                {childComponents.length > 0 && (
                  <Select onValueChange={addBomComponente}>
                    <SelectTrigger className="w-40 h-8 text-xs">
                      <SelectValue placeholder={form.tipo === 'PRODUTO_FINAL' ? '+ Item Pronto' : '+ Pré-Preparo'} />
                    </SelectTrigger>
                    <SelectContent>
                      {childComponents.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {allowsSalmon && (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={addBomSalmao}>
                    <Fish className="w-3.5 h-3.5" />🐟 Salmão
                  </Button>
                )}
              </div>
            </div>

            {bomItens.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                {form.tipo === 'PRODUTO_FINAL' ? 'Adicione itens prontos acima' : 'Adicione insumos ou componentes acima'}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs text-right">Qtd</TableHead>
                    <TableHead className="text-xs">Un</TableHead>
                    <TableHead className="text-xs text-right">Custo/un</TableHead>
                    <TableHead className="text-xs text-right">Subtotal</TableHead>
                    <TableHead className="text-xs w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bomItens.map((item, idx) => (
                    <TableRow key={idx} className={item.isSalmao ? 'bg-primary-soft' : ''}>
                      <TableCell className="text-xs font-medium">
                        {item.nome}
                        {item.isSalmao && <Badge variant="outline" className="ml-1 text-[9px] px-1">SALMÃO</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.isSalmao ? (
                          <div className="flex items-center gap-1 justify-end">
                        <DecimalInput className="w-16 h-7 text-xs text-right"
                              value={String(item.quantidade_original || 0)} placeholder="g"
                              maxDecimals={1} suffix="g"
                              onValueChange={(raw) => {
                                const grams = Number(raw.replace(',', '.')) || 0;
                                const kg = grams / 1000;
                                setBomItens(prev => prev.map((it, i) => i === idx ? { ...it, quantidade: kg, quantidade_original: grams, unidade_original: 'g' } : it));
                              }} />
                            <span className="text-[10px] text-muted-foreground">g = {qty(item.quantidade || 0, 3)}kg</span>
                          </div>
                        ) : (
                          <DecimalInput className="w-20 h-7 text-xs text-right" value={String(item.quantidade)}
                            maxDecimals={3}
                            onValueChange={(raw) => {
                              const val = Number(raw.replace(',', '.')) || 0;
                              setBomItens(prev => prev.map((it, i) => i === idx ? { ...it, quantidade: val } : it));
                            }} />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.isSalmao ? 'kg' : item.unidade}</TableCell>
                      <TableCell className="text-xs text-right">{R$(item.custoBase || 0)}{item.isSalmao && <span className="text-[9px] text-muted-foreground">/kg</span>}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{R$(item.quantidade * (item.custoBase || 0))}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setBomItens(prev => prev.filter((_, i) => i !== idx))}>
                          <X className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="flex flex-wrap justify-end gap-4 text-sm pt-2 border-t">
              <span className="text-muted-foreground">Total: <strong className="text-foreground">{R$(custoEstimado)}</strong></span>
              <span className="text-muted-foreground">Unit: <strong className="text-foreground">{R$(custoUnit)}</strong></span>
              {custoSalmaoEstimado > 0 && (
                <span className="text-muted-foreground">🐟 Salmão: <strong className="text-primary">{R$(custoSalmaoEstimado)}</strong> ({pct(salmaoPctCusto)})</span>
              )}
            </div>
          </div>

          {/* Modo de Preparo */}
          <div>
            <Label>Modo de Preparo</Label>
            <Textarea value={form.modo_preparo} onChange={e => setForm(f => ({ ...f, modo_preparo: e.target.value }))} placeholder="Passo a passo..." rows={3} />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}><Save className="w-4 h-4 mr-1" />{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// CANAL FORM DIALOG
// ============================================================
function CanalFormDialog({ open, onClose, canal, onSaved }: {
  open: boolean; onClose: () => void; canal: Canal | null; onSaved: () => void;
}) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const [form, setForm] = useState({ nome: '', taxa_percentual: '0', taxa_fixa: '0', imposto_percent: '0', custo_embalagem_adicional: '0' });
  const { enviando: saving, executar } = useTravaEnvio();

  useEffect(() => {
    if (canal) {
      setForm({ nome: canal.nome, taxa_percentual: String(canal.taxa_percentual), taxa_fixa: String(canal.taxa_fixa), imposto_percent: String(canal.imposto_percent), custo_embalagem_adicional: String(canal.custo_embalagem_adicional) });
    } else {
      setForm({ nome: '', taxa_percentual: '0', taxa_fixa: '0', imposto_percent: '0', custo_embalagem_adicional: '0' });
    }
  }, [canal, open]);

  const handleSave = () => executar(async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return; }
    try {
      await invokeApi(supabase, 'salvar_canal', {
        id: canal?.id,
        nome: form.nome,
        taxa_percentual: parseDecimal(form.taxa_percentual) || 0,
        taxa_fixa: normalizeBRLMoneyToNumber(form.taxa_fixa) || 0,
        imposto_percent: parseDecimal(form.imposto_percent) || 0,
        custo_embalagem_adicional: normalizeBRLMoneyToNumber(form.custo_embalagem_adicional) || 0,
      });
      toast.success('Canal salvo');
      onSaved();
    } catch (e: any) { toast.error(e.message); }
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{canal ? 'Editar Canal' : 'Novo Canal'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: iFood, Rappi, Balcão..." /></div>
          <div className="grid grid-cols-2 gap-3">
             <div><Label>Taxa %</Label><DecimalInput value={form.taxa_percentual} onValueChange={(raw) => setForm(f => ({ ...f, taxa_percentual: raw }))} maxDecimals={2} suffix="%" /></div>
            <div><Label>Taxa fixa (R$)</Label><CurrencyInput value={form.taxa_fixa} onValueChange={(raw) => setForm(f => ({ ...f, taxa_fixa: raw }))} showPrefix maxDecimals={2} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Imposto %</Label><DecimalInput value={form.imposto_percent} onValueChange={(raw) => setForm(f => ({ ...f, imposto_percent: raw }))} maxDecimals={2} suffix="%" /></div>
            <div><Label>Embalagem (R$)</Label><CurrencyInput value={form.custo_embalagem_adicional} onValueChange={(raw) => setForm(f => ({ ...f, custo_embalagem_adicional: raw }))} showPrefix maxDecimals={2} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}><Save className="w-4 h-4 mr-1" />{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// MINI STAT - small stat block reused inside dialogs (Detalhe, Simulador)
// ============================================================
function MiniStat({ value, label, tone = 'neutral' }: { value: React.ReactNode; label: string; tone?: 'neutral' | 'success' | 'destructive' }) {
  const toneClasses: Record<string, string> = {
    neutral: 'bg-background-subtle text-foreground',
    success: 'bg-success-soft text-success',
    destructive: 'bg-destructive-soft text-destructive',
  };
  return (
    <div className={`rounded-lg p-3 text-center ${toneClasses[tone]}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

// ============================================================
// DETALHE DIALOG
// ============================================================
function DetalheDialog({ open, onClose, componente, itens, custo }: {
  open: boolean; onClose: () => void; componente: any; itens: any[]; custo: any;
}) {
  const rendLiq = (Number(componente.rendimento) || 1) * (1 - (Number(componente.perda_estimada_percent) || 0) / 100);
  const tipoLabel = componente.tipo === 'PRE_PREPARO' ? 'Pré-Preparo' : componente.tipo === 'ITEM_PRONTO' ? 'Item Pronto' : 'Produto Final';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{componente.nome}
            <Badge variant="secondary" className="text-[10px]">{tipoLabel}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MiniStat value={R$(custo?.custoUnitario || 0)} label="Custo unitário" />
            <MiniStat value={R$(custo?.custoTotal || 0)} label="Custo total" />
            <MiniStat value={`${qty(rendLiq, 1)} ${componente.unidade_rendimento}`} label="Rendimento líq." />
          </div>

          {(custo?.custoSalmao || 0) > 0 && (
            <div className="bg-primary-soft border border-primary-border rounded-lg p-3 flex items-center gap-4">
              <Fish className="w-5 h-5 text-primary flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-foreground">Impacto do Salmão</p>
                <div className="flex gap-4 mt-1 text-xs">
                  <span className="text-muted-foreground">Custo: <strong className="text-primary">{R$(custo.custoSalmao)}</strong></span>
                  <span className="text-muted-foreground">Participação: <strong className="text-primary">{pct(custo.salmaoPercent || 0)}</strong></span>
                </div>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold mb-2">Composição</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Item</TableHead>
                  <TableHead className="text-xs text-right">Qtd</TableHead>
                  <TableHead className="text-xs text-right">Custo</TableHead>
                  <TableHead className="text-xs text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(custo?.detalhes || []).map((d: any, idx: number) => (
                  <TableRow key={idx} className={d.isSalmao ? 'bg-primary-soft' : ''}>
                    <TableCell className="text-xs">
                      {d.nome}
                      {d.isSalmao && <Badge variant="outline" className="ml-1 text-[9px] px-1">SALMÃO</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-right">{d.quantidade} {d.unidade}</TableCell>
                    <TableCell className="text-xs text-right">{R$(d.custoTotal)}</TableCell>
                    <TableCell className="text-xs text-right">{pct(d.percentual)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {componente.modo_preparo && (
            <div><h4 className="text-sm font-semibold mb-1">Modo de Preparo</h4>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{componente.modo_preparo}</p></div>
          )}
          {componente.observacoes && (
            <div><h4 className="text-sm font-semibold mb-1">Observações</h4>
              <p className="text-xs text-muted-foreground">{componente.observacoes}</p></div>
          )}
          <div className="flex gap-4 text-xs text-muted-foreground">
            {componente.tempo_preparo_min && <span>⏱ {componente.tempo_preparo_min} min</span>}
            {componente.peso_por_unidade && <span>⚖ {componente.peso_por_unidade}g/un</span>}
            <span className="text-[10px]">Custo via custo_ultima_compra</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// PRECIFICACAO DIALOG
// ============================================================
function PrecificacaoDialog({ open, onClose, componente, canais, onSaved }: {
  open: boolean; onClose: () => void; componente: Componente; canais: Canal[]; onSaved: () => void;
}) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const [precos, setPrecos] = useState<Record<string, string>>({});
  const [analise, setAnalise] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invokeApi(supabase, 'get_precificacao', { componente_id: componente.id }).then(res => {
      const map: Record<string, string> = {};
      (res.precos || []).forEach((p: any) => { map[p.canal_id] = String(p.preco_venda); });
      canais.forEach(c => { if (!map[c.id]) map[c.id] = '0'; });
      setPrecos(map);
      setAnalise(sortByName<any>(res.analise || [], a => a.canalNome));
    }).catch(e => toast.error(e.message));
  }, [componente, canais, supabase, toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invokeApi(supabase, 'salvar_precificacao', {
        componente_id: componente.id,
        precos: Object.entries(precos).map(([canal_id, preco_venda]) => ({
          canal_id,
          preco_venda: normalizeBRLMoneyToNumber(preco_venda) || 0,
        })),
      });
      toast.success('Precificação salva');
      const res = await invokeApi(supabase, 'get_precificacao', { componente_id: componente.id });
      setAnalise(sortByName<any>(res.analise || [], a => a.canalNome));
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const metaMarkup = componente.custo_unitario_calculado > 0
    ? (v: number) => R$(componente.custo_unitario_calculado / (1 - v / 100))
    : () => '-';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Precificação: {componente.nome}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="bg-background-subtle rounded-lg p-3 flex gap-6 text-sm">
            <span>Custo: <strong>{R$(componente.custo_unitario_calculado)}</strong></span>
            <span>Meta margem 30%: <strong>{metaMarkup(30)}</strong></span>
            <span>Meta margem 40%: <strong>{metaMarkup(40)}</strong></span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {canais.map(c => (
                <div key={c.id}><Label className="text-xs">{c.nome}</Label>
                <CurrencyInput value={precos[c.id] || '0'} onValueChange={(raw) => setPrecos(prev => ({ ...prev, [c.id]: raw }))} showPrefix maxDecimals={2} />
              </div>
            ))}
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full"><Save className="w-4 h-4 mr-1" />{saving ? 'Salvando...' : 'Salvar Preços'}</Button>
          {analise.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Canal</TableHead>
                  <TableHead className="text-xs text-right">Preço</TableHead>
                  <TableHead className="text-xs text-right">Taxas</TableHead>
                  <TableHead className="text-xs text-right">Rec. Líq.</TableHead>
                  <TableHead className="text-xs text-right">Lucro</TableHead>
                  <TableHead className="text-xs text-right">Margem</TableHead>
                  <TableHead className="text-xs text-right">CMV</TableHead>
                  <TableHead className="text-xs text-right">Markup</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analise.map((a: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="text-xs font-medium">{a.canalNome}</TableCell>
                    <TableCell className="text-xs text-right">{R$(a.precoVenda)}</TableCell>
                    <TableCell className="text-xs text-right text-destructive">{R$(a.taxas)}</TableCell>
                    <TableCell className="text-xs text-right">{R$(a.receitaLiquida)}</TableCell>
                    <TableCell className={`text-xs text-right font-medium ${a.lucroBruto < 0 ? 'text-destructive' : ''}`}>{R$(a.lucroBruto)}</TableCell>
                    <TableCell className={`text-xs text-right ${a.margemLiquida < 0 ? 'text-destructive' : ''}`}>{pct(a.margemLiquida)}</TableCell>
                    <TableCell className="text-xs text-right">{pct(a.cmvPercent)}</TableCell>
                    <TableCell className="text-xs text-right">{qty(a.markup, 2)}x</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// SIMULADOR DIALOG
// ============================================================
function SimuladorDialog({ open, onClose, componente, canais }: {
  open: boolean; onClose: () => void; componente: Componente; canais: Canal[];
}) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const [ajusteCusto, setAjusteCusto] = useState(0);
  const [ajustePerda, setAjustePerda] = useState(Number(componente.perda_estimada_percent) || 0);
  const [ajustePorc, setAjustePorc] = useState(0);
  const [precoFinal, setPrecoFinal] = useState('');
  const [volumeMensal, setVolumeMensal] = useState('100');
  const [resultado, setResultado] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const simular = async () => {
    setLoading(true);
    try {
      const res = await invokeApi(supabase, 'simular_cenario', {
        componente_id: componente.id, ajuste_custo_percent: ajusteCusto,
        ajuste_perda_percent: ajustePerda, ajuste_porcionamento_g: ajustePorc,
        ajuste_preco_final: precoFinal ? normalizeBRLMoneyToNumber(precoFinal) ?? undefined : undefined,
        volume_vendas_mensal: parseDecimal(volumeMensal) || 0,
      });
      setResultado(res?.resultadoCanais ? { ...res, resultadoCanais: sortByName<any>(res.resultadoCanais, r => r.canal) } : res);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  useEffect(() => { simular(); }, []);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Simulador: {componente.nome}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs">Ajuste de custo (%)</Label>
              <Slider value={[ajusteCusto]} onValueChange={v => setAjusteCusto(v[0])} min={-30} max={30} step={1} />
              <p className="text-xs text-center text-muted-foreground mt-1">{ajusteCusto > 0 ? '+' : ''}{ajusteCusto}%</p></div>
            <div><Label className="text-xs">Perda / desperdício (%)</Label>
              <Slider value={[ajustePerda]} onValueChange={v => setAjustePerda(v[0])} min={0} max={50} step={1} />
              <p className="text-xs text-center text-muted-foreground mt-1">{ajustePerda}%</p></div>
            <div><Label className="text-xs">Ajuste porcionamento (g)</Label>
              <Slider value={[ajustePorc]} onValueChange={v => setAjustePorc(v[0])} min={-20} max={20} step={1} />
              <p className="text-xs text-center text-muted-foreground mt-1">{ajustePorc > 0 ? '+' : ''}{ajustePorc}g</p></div>
            <div><Label className="text-xs">Volume mensal (vendas)</Label>
              <DecimalInput value={volumeMensal} onValueChange={raw => setVolumeMensal(raw)} maxDecimals={0} /></div>
          </div>
          <div><Label className="text-xs">Preço final override (R$)</Label>
            <CurrencyInput value={precoFinal} onValueChange={(raw) => setPrecoFinal(raw)} showPrefix maxDecimals={2} placeholder="Deixe vazio para usar preço atual" /></div>
          <Button onClick={simular} disabled={loading} className="w-full">
            <Calculator className="w-4 h-4 mr-1" />{loading ? 'Calculando...' : 'Simular'}
          </Button>
          {resultado && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <MiniStat value={R$(resultado.custoOriginal)} label="Custo original" />
                <MiniStat value={R$(resultado.novoCusto)} label="Novo custo" />
                <MiniStat value={R$(resultado.economia)} label="Economia/un" tone={resultado.economia >= 0 ? 'success' : 'destructive'} />
              </div>
              {resultado.resultadoCanais?.length > 0 && (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Canal</TableHead>
                    <TableHead className="text-xs text-right">Preço</TableHead>
                    <TableHead className="text-xs text-right">Custo</TableHead>
                    <TableHead className="text-xs text-right">CMV</TableHead>
                    <TableHead className="text-xs text-right">Margem</TableHead>
                    <TableHead className="text-xs text-right">Lucro/venda</TableHead>
                    <TableHead className="text-xs text-right">Lucro/mês</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {resultado.resultadoCanais.map((r: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs font-medium">{r.canal}</TableCell>
                        <TableCell className="text-xs text-right">{R$(r.preco)}</TableCell>
                        <TableCell className="text-xs text-right">{R$(r.novoCusto)}</TableCell>
                        <TableCell className="text-xs text-right">{pct(r.cmv)}</TableCell>
                        <TableCell className={`text-xs text-right ${r.margem < 0 ? 'text-destructive' : ''}`}>{pct(r.margem)}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${r.lucroPorVenda < 0 ? 'text-destructive' : ''}`}>{R$(r.lucroPorVenda)}</TableCell>
                        <TableCell className={`text-xs text-right ${r.lucroMensal < 0 ? 'text-destructive' : ''}`}>{R$(r.lucroMensal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// ANÁLISE TAB
// ============================================================
function AnaliseTab({ componentes }: { componentes: Componente[] }) {
  const produtosFinais = componentes.filter(c => c.tipo === 'PRODUTO_FINAL');
  const itensProntos = componentes.filter(c => c.tipo === 'ITEM_PRONTO');
  const prePreparos = componentes.filter(c => c.tipo === 'PRE_PREPARO');
  const topCusto = [...componentes].sort((a, b) => b.custo_unitario_calculado - a.custo_unitario_calculado).slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Hierarchy overview */}
      <Card className="border-primary-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Hierarquia da Ficha Técnica</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1 bg-background-subtle rounded-lg px-3 py-2">
              <ChefHat className="w-4 h-4 text-primary" />
              <span className="font-medium">{prePreparos.length} Pré-Preparos</span>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-center gap-1 bg-background-subtle rounded-lg px-3 py-2">
              <Layers className="w-4 h-4 text-primary" />
              <span className="font-medium">{itensProntos.length} Itens Prontos</span>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-center gap-1 bg-background-subtle rounded-lg px-3 py-2">
              <ShoppingBag className="w-4 h-4 text-primary" />
              <span className="font-medium">{produtosFinais.length} Produtos Finais</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Produtos Finais</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {produtosFinais.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum</p> :
              produtosFinais.map(p => (
                <div key={p.id} className="flex justify-between text-xs">
                  <span>{p.nome}</span><span className="font-medium">{R$(p.custo_unitario_calculado)}</span>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top 10 por Custo</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {topCusto.map((c, idx) => (
              <div key={c.id} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{idx + 1}.</span>
                <span className="flex-1 ml-1 truncate">{c.nome}</span>
                <span className="font-medium">{R$(c.custo_unitario_calculado)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Resumo</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Pré-Preparos</span><span className="font-medium">{prePreparos.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Itens Prontos</span><span className="font-medium">{itensProntos.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Produtos Finais</span><span className="font-medium">{produtosFinais.length}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground font-semibold">Total</span><span className="font-bold">{componentes.length}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// MARKUP EXPLICAÇÃO TAB
// ============================================================
function MarkupExplicacao() {
  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader><CardTitle className="text-lg">📊 Como o Markup é Calculado</CardTitle>
          <CardDescription>Entenda os conceitos de CMV, margem e markup para precificar corretamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="bg-background-subtle rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-foreground">CMV (Custo da Mercadoria Vendida)</h4>
            <p className="text-muted-foreground">CMV% = (Custo ÷ Preço de Venda) × 100</p>
            <p className="text-xs text-muted-foreground">Ex: Custo R$15 / Preço R$50 = CMV 30%</p>
          </div>
          <div className="bg-background-subtle rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-foreground">Margem Bruta</h4>
            <p className="text-muted-foreground">Margem% = 100 - CMV%</p>
            <p className="text-xs text-muted-foreground">Ex: 100 - 30 = 70% de margem bruta</p>
          </div>
          <div className="bg-background-subtle rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-foreground">Markup</h4>
            <p className="text-muted-foreground">Markup = Preço de Venda ÷ Custo</p>
            <p className="text-xs text-muted-foreground">Ex: R$50 ÷ R$15 = 3.33x</p>
          </div>
          <div className="bg-primary-soft border border-primary-border rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-foreground">💡 Precificação por Meta de Margem</h4>
            <p className="text-muted-foreground">Preço Sugerido = Custo ÷ (1 - Margem Desejada)</p>
            <p className="text-xs text-muted-foreground">Ex: Para margem de 70%: R$15 ÷ (1 - 0.70) = R$50,00</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// SALMON CONFIG DIALOG
// ============================================================
function SalmonConfigDialog({ open, onClose, salmonRef, isAdmin, onSaved }: {
  open: boolean; onClose: () => void; salmonRef: SalmonRef; isAdmin: boolean; onSaved: () => void;
}) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const [manualPrice, setManualPrice] = useState(String(salmonRef.preco_manual || ''));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setManualPrice(String(salmonRef.preco_manual || ''));
  }, [salmonRef, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invokeApi(supabase, 'set_preco_referencia_salmao', { preco_manual: normalizeBRLMoneyToNumber(manualPrice) || 0 });
      toast.success('Preço de referência do salmão atualizado');
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fish className="w-5 h-5 text-primary" />
            Preço de Referência — Salmão
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current status */}
          <div className="bg-background-subtle rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Preço atual em uso:</span>
              <span className="font-bold text-foreground">{salmonRef.preco > 0 ? R$(salmonRef.preco) + '/kg' : 'Não definido'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Origem:</span>
              <Badge variant={salmonRef.origem === 'lote_recente' ? 'default' : salmonRef.origem === 'manual' ? 'secondary' : 'destructive'} className="text-[10px]">
                {salmonRef.origem === 'lote_recente' ? 'Lote mais recente' : salmonRef.origem === 'manual' ? 'Manual (admin)' : 'Sem preço'}
              </Badge>
            </div>
            {salmonRef.info && (
              <p className="text-xs text-muted-foreground border-t pt-2">{salmonRef.info}</p>
            )}
          </div>

          {/* Auto price info */}
          {salmonRef.preco_auto > 0 && (
            <div className="bg-primary-soft rounded-lg p-3 text-xs">
              <p className="font-semibold text-foreground">📦 Preço automático (lote mais recente)</p>
              <p className="text-muted-foreground mt-1">{R$(salmonRef.preco_auto)}/kg limpo</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Atualizado automaticamente quando há lotes no módulo de salmão</p>
            </div>
          )}

          {/* Manual fallback */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Preço manual de referência (fallback)</Label>
            <p className="text-xs text-muted-foreground">Usado quando não há lote de salmão lançado. Apenas admin pode definir.</p>
            <div className="flex gap-2">
              <CurrencyInput value={manualPrice} onValueChange={(raw) => setManualPrice(raw)} showPrefix maxDecimals={2}
                placeholder="R$/kg limpo" disabled={!isAdmin} />
              <Button onClick={handleSave} disabled={saving || !isAdmin} size="sm">
                <Save className="w-4 h-4 mr-1" />{saving ? '...' : 'Salvar'}
              </Button>
            </div>
            {!isAdmin && <p className="text-[10px] text-destructive">Apenas admin pode alterar o preço manual</p>}
          </div>

          {/* Explanation */}
          <div className="bg-background-subtle rounded-lg p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">ℹ️ Como funciona</p>
            <p className="text-muted-foreground">1. O sistema usa o preço do <strong>lote mais recente</strong> do módulo de salmão (preço/kg limpo)</p>
            <p className="text-muted-foreground">2. Se não houver lote, usa o <strong>preço manual</strong> definido aqui</p>
            <p className="text-muted-foreground">3. A ficha técnica <strong>não consome estoque</strong> — apenas usa o preço como referência</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
