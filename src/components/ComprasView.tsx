import { useState, useMemo, useEffect } from 'react';
import { usePersistedTab } from '@/hooks/usePersistedTab';
import { ShoppingCart, Calendar, BarChart3, ClipboardList, FileDown, Plus, Search, Inbox, X, Check, Trash2, Crown, Award, Medal, Zap, AlertTriangle, ShoppingBag, Building2, ShieldAlert, PackageX } from 'lucide-react';
import SubTabBadge from '@/components/ui/SubTabBadge';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useComprasStore } from '@/hooks/useComprasStore';
import { useEstoqueGeralStoreContext } from '@/contexts/EstoqueGeralStoreContext';
import { useSalmonStoreContext } from '@/contexts/SalmonStoreContext';
import { CalendarioCompras, Produto } from '@/types/salmon';
import { toast } from 'sonner';
import { gerarPDFListaCompras, gerarPDFPedido } from '@/lib/pdfGenerator';
import { formatFixedBR } from '@/lib/formatters';
import PedidosComprasMercadoView from '@/components/PedidosComprasMercadoView';
import AlertasFaltaEstoqueView from '@/components/compras/AlertasFaltaEstoqueView';
import SuppliersView from '@/components/SuppliersView';
import { usePurchaseOrdersStore } from '@/hooks/usePurchaseOrdersStore';
import ShoppingChecklistView from '@/components/compras/ShoppingChecklistView';
import CalendarioLembretesView from '@/components/compras/CalendarioLembretesView';
import RankingFornecedoresView from '@/components/compras/RankingFornecedoresView';
import { supabase } from '@/integrations/supabase/client';
import { todayBR } from '@/lib/datetime';
import { useModuleAccess, useCan } from '@/permissions/hooks';

// Map internal subtab keys to registry keys
const SUBTAB_REGISTRY_MAP: Record<string, string> = {
  'lista-dia': 'lista',
  'pedidos-compras': 'pedidos',
  'requisicoes': 'checklist',
  'calendario': 'calendario',
  'ranking': 'ranking',
  'fornecedores': 'fornecedores',
  'alertas-falta': 'alertas_falta',
};

type SubView = 'lista-dia' | 'requisicoes' | 'pedidos-compras' | 'calendario' | 'ranking' | 'fornecedores' | 'alertas-falta';

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const CATEGORIAS = ['Peixe', 'Oriental', 'Bebidas', 'Limpeza', 'Embalagens', 'Cozinha', 'Descartáveis', 'Proteínas', 'Hortifruti', 'Outros'];

export default function ComprasView() {
  const { user } = useAuth();
  const { visibleSubtabs, canView } = useModuleAccess('compras');
  
  // Action-level permissions
  const canCreateLista = useCan('compras:lista:create');
  const canExportLista = useCan('compras:lista:export');
  const canCreatePedido = useCan('compras:pedidos:create');
  const canEditPedido = useCan('compras:pedidos:edit');
  const canDeletePedido = useCan('compras:pedidos:delete');
  const canApproveChecklist = useCan('compras:checklist:approve');
  const canEditCalendario = useCan('compras:calendario:edit');
  const canCreateFornecedor = useCan('compras:fornecedores:create');
  const canEditFornecedor = useCan('compras:fornecedores:edit');
  const canDeleteFornecedor = useCan('compras:fornecedores:delete');

  const [activeView, setActiveView] = usePersistedTab<SubView>('app:tab:compras', 'lista-dia');
  const comprasStore = useComprasStore();
  const estoqueStore = useEstoqueGeralStoreContext();
  const salmonStore = useSalmonStoreContext();
  const purchaseOrdersStore = usePurchaseOrdersStore();
  const { produtos, saldos } = estoqueStore;
  const shoppingCount = purchaseOrdersStore.shoppingCount;

  // Calendário form
  const [showCalForm, setShowCalForm] = useState(false);
  const [calForm, setCalForm] = useState({ diaSemana: 'Segunda', categorias: [] as string[], regra: '' });
  const [editCalId, setEditCalId] = useState<string | null>(null);

  // Requisição form
  const [showReqForm, setShowReqForm] = useState(false);
  const [reqItens, setReqItens] = useState<{ produtoId: string; quantidade: number; motivo: string; prioridade: 'alta' | 'media' | 'baixa' }[]>([]);
  const [reqItemProd, setReqItemProd] = useState('');
  const [reqItemQtd, setReqItemQtd] = useState('');
  const [reqObs, setReqObs] = useState('');

  const today = new Date();
  const todayStr = todayBR();
  const todayDia = DIAS[today.getDay() === 0 ? 6 : today.getDay() - 1];

  // Map visible subtabs from registry to internal SubView IDs
  const availableViews = useMemo(() => {
    const reverseMap: Record<string, SubView> = {
      'lista': 'lista-dia',
      'pedidos': 'pedidos-compras',
      'checklist': 'requisicoes',
      'calendario': 'calendario',
      'ranking': 'ranking',
      'fornecedores': 'fornecedores',
      'alertas_falta': 'alertas-falta',
    };
    return visibleSubtabs
      .map(k => reverseMap[k])
      .filter(Boolean) as SubView[];
  }, [visibleSubtabs]);

  // Lista inteligente do dia
  const listaInteligente = useMemo(() => {
    const calHoje = comprasStore.calendario.filter(c => c.diaSemana === todayDia && c.ativo);
    const catsHoje = calHoje.flatMap(c => c.categorias);
    const sugestoes = produtos.filter(p => p.ativo).map(p => {
      const saldo = saldos[p.id]?.saldo || 0;
      const consumo = 0;
      const abaixoMinimo = saldo < p.estoqueMinimo;
      const abaixoIdeal = saldo < (p.estoqueIdeal || p.estoqueMinimo);
      const sugestaoQtd = Math.max(0, (p.estoqueIdeal || p.estoqueMinimo * 1.5) - saldo);
      const prioridade = abaixoMinimo ? 'alta' : abaixoIdeal ? 'media' : 'baixa';
      const doCalendario = catsHoje.length === 0 || catsHoje.includes(p.categoria);
      return { ...p, saldo, consumo, abaixoMinimo, abaixoIdeal, sugestaoQtd, prioridade, doCalendario };
    }).filter(p => (p.abaixoMinimo || p.abaixoIdeal) && p.doCalendario)
      .sort((a, b) => (a.prioridade === 'alta' ? 0 : 1) - (b.prioridade === 'alta' ? 0 : 1));
    return { categorias: catsHoje, sugestoes };
  }, [produtos, saldos, comprasStore.calendario, todayDia]);

  const handleGerarPDFLista = () => {
    gerarPDFListaCompras({
      titulo: `Categorias: ${listaInteligente.categorias.join(', ') || 'Todas'}`,
      data: todayStr,
      itens: listaInteligente.sugestoes.map(s => ({
        produto: s.nomeProduto,
        quantidade: Math.ceil(s.sugestaoQtd),
        unidade: s.unidadeMedida,
        categoria: s.categoria,
        prioridade: s.prioridade === 'alta' ? '🔴 Alta' : s.prioridade === 'media' ? '🟡 Média' : '🟢 Baixa',
      })),
    });
    toast.success('PDF gerado!');
  };

  const toggleCatForm = (cat: string) => {
    setCalForm(f => ({
      ...f,
      categorias: f.categorias.includes(cat) ? f.categorias.filter(c => c !== cat) : [...f.categorias, cat],
    }));
  };

  // Alertas falta count
  const [alertasFaltaCount, setAlertasFaltaCount] = useState(0);
  useEffect(() => {
    supabase
      .from('alertas_falta_estoque')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDENTE')
      .then(({ count }) => setAlertasFaltaCount(count ?? 0));
  }, [activeView]);

  // Deep-link from notification
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.linkPath) {
        const url = new URL(detail.linkPath, 'https://placeholder');
        const subtab = url.searchParams.get('subtab');
        if (subtab && availableViews.includes(subtab as SubView)) {
          setActiveView(subtab as SubView);
        }
      }
    };
    window.addEventListener('notification-navigate', handler);
    return () => window.removeEventListener('notification-navigate', handler);
  }, [availableViews]);

  const allSubViews: { id: SubView; label: string; icon: typeof ShoppingCart; badge?: number }[] = [
    { id: 'lista-dia', label: 'Lista', icon: ShoppingCart, badge: listaInteligente.sugestoes.length || undefined },
    { id: 'pedidos-compras', label: 'Pedidos & Compras Mercado', icon: ShoppingBag, badge: (purchaseOrdersStore.openCount + purchaseOrdersStore.receivingCount + purchaseOrdersStore.unackedPartialCount) || undefined },
    { id: 'requisicoes', label: 'Checklist Compra', icon: ClipboardList, badge: shoppingCount || undefined },
    { id: 'alertas-falta', label: 'Itens em Falta', icon: PackageX, badge: alertasFaltaCount || undefined },
    { id: 'calendario', label: 'Calendário', icon: Calendar },
    { id: 'ranking', label: 'Ranking', icon: BarChart3 },
    { id: 'fornecedores', label: 'Fornecedores', icon: Building2 },
  ];

  const subViews = allSubViews.filter(v => availableViews.includes(v.id));

  // Ensure activeView is valid for current permissions
  useEffect(() => {
    if (subViews.length > 0 && !subViews.some(v => v.id === activeView)) {
      setActiveView(subViews[0].id);
    }
  }, [subViews, activeView]);

  // No access at all
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="w-12 h-12 text-muted-foreground/40 mb-3" />
        <h3 className="text-lg font-semibold text-foreground">Acesso Negado</h3>
        <p className="text-sm text-muted-foreground mt-1">Sem permissão (compras:*:view)</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">Compras</h2>
        <p className="text-xs text-muted-foreground">Requisições, pedidos e inteligência de reposição</p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap pb-1 pt-1">
        {subViews.map(view => {
          const Icon = view.icon;
          const active = activeView === view.id;
          return (
            <button key={view.id} onClick={() => setActiveView(view.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all relative ${active ? 'gradient-salmon text-primary-foreground shadow-md' : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'}`}>
              <Icon className="w-3.5 h-3.5" /> {view.label}
              <SubTabBadge count={view.badge} />
            </button>
          );
        })}
      </div>

      {/* ====== LISTA DO DIA ====== */}
      {activeView === 'lista-dia' && (
        <div className="space-y-3">
          <div className="bg-card border border-primary/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Lista Inteligente — {todayDia}</p>
                <p className="text-[10px] text-muted-foreground">
                  {listaInteligente.categorias.length > 0 ? `Categorias: ${listaInteligente.categorias.join(', ')}` : 'Todas as categorias (sem calendário configurado)'}
                </p>
              </div>
              <div className="flex gap-1.5">
                {listaInteligente.sugestoes.length > 0 && canExportLista && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={handleGerarPDFLista}>
                    <FileDown className="w-3.5 h-3.5" /> PDF
                  </Button>
                )}
              </div>
            </div>

            {listaInteligente.sugestoes.length > 0 ? (
              <div className="space-y-2">
                {listaInteligente.sugestoes.map((s, i) => (
                  <div key={s.id} className={`flex items-center justify-between p-2.5 rounded-lg border animate-fade-up ${s.prioridade === 'alta' ? 'border-destructive/30 bg-destructive/5' : s.prioridade === 'media' ? 'border-warning/30 bg-warning/5' : 'border-border bg-secondary/30'}`} style={{ animationDelay: `${i * 30}ms` }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${s.prioridade === 'alta' ? 'bg-destructive/15 text-destructive' : s.prioridade === 'media' ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'}`}>
                          {s.prioridade === 'alta' ? '❌' : s.prioridade === 'media' ? '⚠️' : '✅'}
                        </span>
                        <p className="text-xs font-medium text-foreground truncate">{s.nomeProduto}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Saldo: {formatFixedBR(s.saldo, 1)} {s.unidadeMedida} • Mín: {s.estoqueMinimo}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">+{Math.ceil(s.sugestaoQtd)}</p>
                      <p className="text-[9px] text-muted-foreground">{s.unidadeMedida}</p>
                    </div>
                  </div>
                ))}
                {canCreateLista && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={async () => {
                      try {
                        const itens = listaInteligente.sugestoes.map(s => ({
                          produto_id: s.id,
                          produto_nome: s.nomeProduto,
                          quantidade_sugerida: Math.ceil(s.sugestaoQtd),
                          unidade: s.unidadeMedida,
                          preco_referencia: s.custoPadrao || 0,
                          prioridade: s.prioridade === 'alta' ? 'alta' : 'media',
                          motivo: s.prioridade === 'alta' ? 'abaixo mínimo' : 'reposição',
                        }));
                        const { data, error } = await supabase.functions.invoke('purchase-requisitions', {
                          body: { action: 'criar', tipo: 'inteligente', observacao: `Lista do dia ${todayDia}`, itens },
                        });
                        if (error || data?.error) throw new Error(data?.error || error?.message);
                        toast.success(`Requisição ${data.codigo} criada a partir da lista!`);
                        setActiveView('requisicoes');
                      } catch (err: any) {
                        toast.error('Erro ao criar requisição: ' + err.message);
                      }
                    }}>
                      <ClipboardList className="w-3.5 h-3.5 mr-1" /> Criar Requisição
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-secondary/50 rounded-lg p-6 text-center">
                <ShoppingCart className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {produtos.length === 0 ? 'Cadastre produtos no Estoque Geral para gerar sugestões.' : 'Todos os produtos estão com estoque adequado! 🎉'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== CHECKLIST DE COMPRA ====== */}
      {activeView === 'requisicoes' && (
        <ShoppingChecklistView onNavigateToOrder={(orderId) => {
          setActiveView('pedidos-compras');
        }} />
      )}

      {/* ====== PEDIDOS & COMPRAS MERCADO ====== */}
      {activeView === 'pedidos-compras' && <PedidosComprasMercadoView />}

      {/* ====== ITENS EM FALTA ====== */}
      {activeView === 'alertas-falta' && <AlertasFaltaEstoqueView />}

      {/* ====== CALENDÁRIO (LEMBRETES) ====== */}
      {activeView === 'calendario' && <CalendarioLembretesView />}

      {/* ====== RANKING FORNECEDORES ====== */}
      {activeView === 'ranking' && <RankingFornecedoresView />}

      {/* ====== FORNECEDORES ====== */}
      {activeView === 'fornecedores' && <SuppliersView store={salmonStore} />}
    </div>
  );
}
