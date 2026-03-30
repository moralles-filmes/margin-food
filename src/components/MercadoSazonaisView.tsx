import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fmtBRL, formatDateBR } from '@/lib/formatters';
import { useMercadoStore, SolicMercado, SolicMercadoItem, Aprovacao } from '@/hooks/useMercadoStore';
import { useRecebimentoStore } from '@/hooks/useRecebimentoStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import UserMentionSelect from '@/components/UserMentionSelect';
import ProductSearchCombobox, { type ProductOption } from '@/components/ui/ProductSearchCombobox';
import {
  Plus, ShoppingBag, X, Check, ChevronRight, ChevronDown, AlertTriangle,
  Clock, CheckCircle2, XCircle, Shield, Inbox, Package, Search
} from 'lucide-react';

const PRIORIDADE_COLORS: Record<string, string> = {
  urgente: 'bg-destructive/15 text-destructive',
  alta: 'bg-destructive/10 text-destructive',
  media: 'bg-warning/10 text-warning',
  baixa: 'bg-success/10 text-success',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  ENVIADA: { label: 'Enviada', color: 'bg-primary/15 text-primary', icon: Clock },
  EM_COMPRA: { label: 'Em Compra', color: 'bg-warning/15 text-warning', icon: ShoppingBag },
  AGUARDANDO_APROVACAO: { label: 'Aguardando Aprovação', color: 'bg-accent/15 text-accent-foreground', icon: Shield },
  APROVADA: { label: 'Aprovada', color: 'bg-success/15 text-success', icon: CheckCircle2 },
  REPROVADA: { label: 'Reprovada', color: 'bg-destructive/15 text-destructive', icon: XCircle },
  PARCIAL: { label: 'Parcial', color: 'bg-warning/15 text-warning', icon: Package },
  AGUARDANDO_RECEBIMENTO: { label: 'Aguard. Recebimento', color: 'bg-accent/15 text-accent-foreground', icon: Package },
  RECEBIDO_CONFIRMADO: { label: 'Recebido', color: 'bg-success/15 text-success', icon: CheckCircle2 },
  ESTOQUE_ATUALIZADO: { label: 'Estoque Atualizado', color: 'bg-primary/15 text-primary', icon: CheckCircle2 },
  CONCLUIDA: { label: 'Concluída', color: 'bg-success/15 text-success', icon: CheckCircle2 },
  CANCELADA: { label: 'Cancelada', color: 'bg-muted text-muted-foreground', icon: XCircle },
};

const CATEGORIAS = ['Peixe', 'Oriental', 'Bebidas', 'Limpeza', 'Embalagens', 'Cozinha', 'Descartáveis', 'Proteínas', 'Hortifruti', 'Outros'];

export default function MercadoSazonaisView() {
  const { user, canCreateSolicMercado, canApproveSolicMercado, isComprasAssistente } = useAuth();
  const store = useMercadoStore();
  const recStore = useRecebimentoStore();

  const mercadoProductOptions: ProductOption[] = useMemo(() =>
    store.produtos.map(p => ({
      id: p.id,
      label: p.nome_produto,
      sublabel: `${p.unidade_medida} — ${fmtBRL(p.custo_padrao || 0)}`,
      keywords: p.sku || '',
    })),
    [store.produtos]
  );

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterTipo, setFilterTipo] = useState<string>('');
  const [filterPrioridade, setFilterPrioridade] = useState<string>('');
  const [searchText, setSearchText] = useState('');

  // Form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titulo: '', tipo: 'MERCADO' as 'MERCADO' | 'SAZONAL', prioridade: 'media', data_necessidade: '', observacoes: '', responsavel_user_id: '' });
  const [formItems, setFormItems] = useState<{ produto_id?: string; produto_texto?: string; categoria?: string; quantidade_solicitada: number; unidade_medida: string; detalhes?: string; preco_unitario?: number }[]>([]);
  const [itemMode, setItemMode] = useState<'produto' | 'manual'>('produto');
  const [itemProdId, setItemProdId] = useState('');
  const [itemTexto, setItemTexto] = useState('');
  const [itemCat, setItemCat] = useState('');
  const [itemQtd, setItemQtd] = useState('');
  const [itemUnidade, setItemUnidade] = useState('UN');
  const [itemDetalhes, setItemDetalhes] = useState('');
  const [itemPreco, setItemPreco] = useState('');

  // Detail view
  const [selectedSolic, setSelectedSolic] = useState<SolicMercado | null>(null);
  const [solicItems, setSolicItems] = useState<SolicMercadoItem[]>([]);
  const [solicAprovacoes, setSolicAprovacoes] = useState<Aprovacao[]>([]);
  const [aprovComment, setAprovComment] = useState('');

  // Checklist state for item being marked
  const [markingItemId, setMarkingItemId] = useState<string | null>(null);
  const [markQtd, setMarkQtd] = useState('');
  const [markPreco, setMarkPreco] = useState('');
  const [markProdutoId, setMarkProdutoId] = useState('');
  const [showCreateProduto, setShowCreateProduto] = useState(false);
  const [newProdNome, setNewProdNome] = useState('');
  const [newProdCat, setNewProdCat] = useState('');
  const [newProdUnidade, setNewProdUnidade] = useState('UN');

  // Compras assistentes
  const [assistentes, setAssistentes] = useState<{ id: string; nome: string; email: string }[]>([]);

  useEffect(() => {
    store.fetchComprasAssistentes().then(setAssistentes);
  }, [store.fetchComprasAssistentes]);

  const filteredSolicitacoes = useMemo(() => {
    return store.solicitacoes.filter(s => {
      if (filterStatus && s.status !== filterStatus) return false;
      if (filterTipo && s.tipo !== filterTipo) return false;
      if (filterPrioridade && s.prioridade !== filterPrioridade) return false;
      if (searchText && !s.titulo.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });
  }, [store.solicitacoes, filterStatus, filterTipo, filterPrioridade, searchText]);

  const handleAddItem = () => {
    if (!itemQtd) { toast.error('Informe a quantidade'); return; }
    const item: any = {
      quantidade_solicitada: parseFloat(itemQtd),
      unidade_medida: itemUnidade,
      detalhes: itemDetalhes,
      preco_unitario: itemPreco ? parseFloat(itemPreco) : undefined,
    };
    if (itemMode === 'produto') {
      if (!itemProdId) { toast.error('Selecione um produto'); return; }
      item.produto_id = itemProdId;
    } else {
      if (!itemTexto) { toast.error('Informe o nome do item'); return; }
      item.produto_texto = itemTexto;
      item.categoria = itemCat;
    }
    setFormItems(prev => [...prev, item]);
    setItemProdId(''); setItemTexto(''); setItemCat(''); setItemQtd(''); setItemDetalhes(''); setItemPreco('');
  };

  const handleSubmit = async () => {
    if (!form.titulo.trim()) { toast.error('Informe o título'); return; }
    if (formItems.length === 0) { toast.error('Adicione pelo menos um item'); return; }

    const result = await store.createSolicitacao(form, formItems);
    if (result) {
      toast.success('Solicitação criada e enviada!');
      setShowForm(false);
      setForm({ titulo: '', tipo: 'MERCADO', prioridade: 'media', data_necessidade: '', observacoes: '', responsavel_user_id: '' });
      setFormItems([]);
    }
  };

  const openDetail = async (s: SolicMercado) => {
    setSelectedSolic(s);
    const [items, aprovs] = await Promise.all([store.fetchItems(s.id), store.fetchAprovacoes(s.id)]);
    setSolicItems(items);
    setSolicAprovacoes(aprovs);
  };

  const handleIniciarCompra = async () => {
    if (!selectedSolic) return;
    await store.updateStatus(selectedSolic.id, 'EM_COMPRA');
    toast.success('Compra iniciada!');
    await openDetail({ ...selectedSolic, status: 'EM_COMPRA' });
  };

  const handleMarkComprado = async (item: SolicMercadoItem) => {
    const qtd = parseFloat(markQtd) || item.quantidade_solicitada;
    const preco = markPreco ? parseFloat(markPreco) : null;
    const prodId = markProdutoId || item.produto_id || undefined;

    // If manual item and no product mapped, require mapping
    if (!item.produto_id && item.produto_texto && !prodId) {
      toast.error('Mapeie este item a um produto antes de marcar como comprado.');
      return;
    }

    await store.markItemComprado(item, qtd, preco, prodId || undefined);
    toast.success('Item marcado como comprado!');
    setMarkingItemId(null);
    setMarkQtd(''); setMarkPreco(''); setMarkProdutoId('');
    if (selectedSolic) await openDetail(selectedSolic);
  };

  const handleCreateProdAndMap = async () => {
    if (!newProdNome) return;
    const prod = await store.createProduto(newProdNome, newProdCat, newProdUnidade);
    if (prod) {
      setMarkProdutoId(prod.id);
      setShowCreateProduto(false);
      toast.success(`Produto "${newProdNome}" criado e mapeado!`);
    }
  };

  const handleAprovacao = async (decisao: 'APROVADO' | 'REPROVADO') => {
    if (!selectedSolic) return;
    await store.submitAprovacao(selectedSolic.id, decisao, aprovComment);
    toast.success(decisao === 'APROVADO' ? 'Aprovado!' : 'Reprovado.');
    setAprovComment('');
    await openDetail(selectedSolic);
  };

  const handleConcluir = async () => {
    if (!selectedSolic) return;
    const solic = store.solicitacoes.find(s => s.id === selectedSolic.id);
    const totalCheck = solic?.total_real || solic?.total_estimado || 0;
    if (totalCheck >= 2500 && solic?.status !== 'APROVADA') {
      toast.error('Aprovação dupla necessária (>= R$ 2.500).');
      return;
    }
    await store.concluirSolicitacao(selectedSolic.id);

    // Create recebimento record with items
    const items = await store.fetchItems(selectedSolic.id);
    const comprados = items.filter(i => i.comprado);
    if (comprados.length > 0) {
      await recStore.createRecebimento(
        selectedSolic.id,
        comprados.map(i => ({
          item_id: i.id,
          produto_id: i.produto_id || null,
          qtd_solicitada: i.quantidade_solicitada,
          qtd_comprada: i.quantidade_comprada,
        }))
      );
    }

    toast.success('Compra finalizada! Aguardando recebimento no restaurante.');
    setSelectedSolic(null);
  };

  const handleCancelar = async () => {
    if (!selectedSolic) return;
    await store.updateStatus(selectedSolic.id, 'CANCELADA');
    toast.success('Solicitação cancelada.');
    setSelectedSolic(null);
  };

  const getAprovacaoCount = () => {
    const aprovados = solicAprovacoes.filter(a => a.decisao === 'APROVADO');
    const unique = new Set(aprovados.map(a => a.aprovado_por_user_id));
    return unique.size;
  };

  const needsApproval = (s: SolicMercado) => {
    const total = s.total_real || s.total_estimado;
    return total >= 2500;
  };

  // Detail view
  if (selectedSolic) {
    const sc = STATUS_CONFIG[selectedSolic.status] || STATUS_CONFIG.ENVIADA;
    const Icon = sc.icon;
    const aprovCount = getAprovacaoCount();
    const hasReprovado = solicAprovacoes.some(a => a.decisao === 'REPROVADO');
    const alreadyApproved = solicAprovacoes.some(a => a.aprovado_por_user_id === user?.id && a.decisao === 'APROVADO');
    const totalCheck = selectedSolic.total_real || selectedSolic.total_estimado;
    const requiresApproval = totalCheck >= 2500;

    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedSolic(null)} className="flex items-center gap-1 text-sm text-primary hover:underline">
          ← Voltar à lista
        </button>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-foreground">{selectedSolic.titulo}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${sc.color}`}>
                  <Icon className="w-3 h-3 inline mr-1" />{sc.label}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${PRIORIDADE_COLORS[selectedSolic.prioridade]}`}>
                  {selectedSolic.prioridade.toUpperCase()}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                  {selectedSolic.tipo}
                </span>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Criado: {formatDateBR(new Date(selectedSolic.created_at))}</p>
              {selectedSolic.data_necessidade && <p>Necessidade: {selectedSolic.data_necessidade}</p>}
            </div>
          </div>

          {selectedSolic.observacoes && (
            <p className="text-xs text-muted-foreground italic mb-4">{selectedSolic.observacoes}</p>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground">Total Estimado</p>
              <p className="text-lg font-bold text-foreground">{fmtBRL(selectedSolic.total_estimado)}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground">Total Real</p>
              <p className="text-lg font-bold text-foreground">{fmtBRL(selectedSolic.total_real)}</p>
            </div>
          </div>

          {/* Approval banner */}
          {requiresApproval && (
            <div className={`rounded-lg p-3 mb-4 border ${aprovCount >= 2 ? 'bg-success/10 border-success/30' : hasReprovado ? 'bg-destructive/10 border-destructive/30' : 'bg-warning/10 border-warning/30'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4" />
                <span className="text-sm font-semibold text-foreground">
                  Aprovação Dupla Necessária (≥ R$ 2.500)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold">{aprovCount}/2 aprovações</span>
                {solicAprovacoes.map(a => (
                  <span key={a.id} className={`text-[10px] px-2 py-0.5 rounded-full ${a.decisao === 'APROVADO' ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
                    {a.decisao} — {formatDateBR(new Date(a.aprovado_em))}
                  </span>
                ))}
              </div>

              {/* Approval buttons for Admin/Compras */}
              {canApproveSolicMercado && !alreadyApproved && selectedSolic.status === 'AGUARDANDO_APROVACAO' && (
                <div className="mt-3 space-y-2">
                  <Input placeholder="Comentário (opcional)" value={aprovComment} onChange={e => setAprovComment(e.target.value)} className="text-xs" />
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-success text-success-foreground hover:bg-success/90 gap-1" onClick={() => handleAprovacao('APROVADO')}>
                      <Check className="w-3 h-3" /> Aprovar
                    </Button>
                    <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleAprovacao('REPROVADO')}>
                      <X className="w-3 h-3" /> Reprovar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mb-4">
            {selectedSolic.status === 'ENVIADA' && isComprasAssistente && (
              <Button size="sm" className="gap-1" onClick={handleIniciarCompra}>
                <ShoppingBag className="w-3.5 h-3.5" /> Iniciar Compra
              </Button>
            )}
            {(selectedSolic.status === 'EM_COMPRA' || selectedSolic.status === 'APROVADA') && isComprasAssistente && (
              <Button size="sm" className="gap-1 bg-success text-success-foreground hover:bg-success/90" onClick={handleConcluir}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
              </Button>
            )}
            {!['CONCLUIDA', 'CANCELADA', 'REPROVADA'].includes(selectedSolic.status) && canCreateSolicMercado && (
              <Button size="sm" variant="destructive" className="gap-1" onClick={handleCancelar}>
                <XCircle className="w-3.5 h-3.5" /> Cancelar
              </Button>
            )}
          </div>
        </div>

        {/* Items checklist */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3">
            Itens ({solicItems.filter(i => i.comprado).length}/{solicItems.length} comprados)
          </h4>
          <div className="space-y-2">
            {solicItems.map(item => (
              <div key={item.id} className={`border rounded-lg p-3 transition-all ${item.comprado ? 'bg-success/5 border-success/30' : 'border-border'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {item.comprado ? (
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      ) : (
                        <div className="w-5 h-5 rounded border-2 border-muted-foreground/30" />
                      )}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${item.comprado ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {item.produto_texto || store.produtos.find(p => p.id === item.produto_id)?.nome_produto || 'Produto'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.quantidade_solicitada} {item.unidade_medida}
                        {item.detalhes && ` — ${item.detalhes}`}
                        {item.categoria && ` [${item.categoria}]`}
                      </p>
                      {item.comprado && (
                        <p className="text-[10px] text-success mt-0.5">
                          ✓ Comprado: {item.quantidade_comprada} {item.unidade_medida}
                          {item.preco_unitario ? ` × ${fmtBRL(item.preco_unitario)} = ${fmtBRL(item.quantidade_comprada * item.preco_unitario)}` : ''}
                          {item.custo_nao_informado && ' ⚠️ Custo não informado'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Mark as purchased button */}
                  {!item.comprado && (selectedSolic.status === 'EM_COMPRA' || selectedSolic.status === 'APROVADA') && isComprasAssistente && (
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => {
                      setMarkingItemId(item.id);
                      setMarkQtd(String(item.quantidade_solicitada));
                      setMarkPreco(item.preco_unitario ? String(item.preco_unitario) : '');
                      setMarkProdutoId(item.produto_id || '');
                    }}>
                      <Check className="w-3 h-3" /> Marcar
                    </Button>
                  )}
                </div>

                {/* Mark comprado form */}
                {markingItemId === item.id && (
                  <div className="mt-3 bg-secondary/50 rounded-lg p-3 space-y-2 animate-scale-in">
                    {/* Manual item needs product mapping */}
                    {!item.produto_id && item.produto_texto && (
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Mapear para produto cadastrado *</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1">
                            <ProductSearchCombobox
                              options={mercadoProductOptions}
                              value={markProdutoId}
                              onSelect={setMarkProdutoId}
                              placeholder="Buscar produto…"
                              allowClear={false}
                            />
                          </div>
                          <Button size="sm" variant="outline" className="text-[10px]" onClick={() => {
                            setShowCreateProduto(true);
                            setNewProdNome(item.produto_texto);
                            setNewProdCat(item.categoria);
                          }}>
                            + Criar
                          </Button>
                        </div>
                      </div>
                    )}

                    {showCreateProduto && (
                      <div className="border border-primary/20 rounded-lg p-2 space-y-2">
                        <p className="text-[10px] font-semibold text-primary">Criar novo produto</p>
                        <Input value={newProdNome} onChange={e => setNewProdNome(e.target.value)} placeholder="Nome" className="text-xs" />
                        <div className="flex gap-2">
                          <Select value={newProdCat} onValueChange={setNewProdCat}>
                            <SelectTrigger className="flex-1 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                            <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                          <Select value={newProdUnidade} onValueChange={setNewProdUnidade}>
                            <SelectTrigger className="w-20 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {['UN', 'KG', 'L', 'CX', 'PCT'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="text-xs" onClick={handleCreateProdAndMap}>Criar e Mapear</Button>
                          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowCreateProduto(false)}>Cancelar</Button>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-[10px] text-muted-foreground">Qtd comprada</Label>
                        <Input type="number" value={markQtd} onChange={e => setMarkQtd(e.target.value)} className="text-xs" />
                      </div>
                      <div className="flex-1">
                        <Label className="text-[10px] text-muted-foreground">Preço unit. (R$)</Label>
                        <Input type="number" step="0.01" value={markPreco} onChange={e => setMarkPreco(e.target.value)} className="text-xs" placeholder="Opcional" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="gap-1 text-xs" onClick={() => handleMarkComprado(item)}>
                        <Check className="w-3 h-3" /> Confirmar
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setMarkingItemId(null); setShowCreateProduto(false); }}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Mercado & Sazonais</h3>
          <p className="text-[10px] text-muted-foreground">Fluxo de compras avulsas com checklist e aprovação</p>
        </div>
        {canCreateSolicMercado && (
          <Button size="sm" className="gradient-salmon text-primary-foreground border-0 gap-1.5 text-xs" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-3.5 h-3.5" /> Nova Solicitação
          </Button>
        )}
        {!canCreateSolicMercado && (
          <span className="text-[10px] text-muted-foreground italic">Sem permissão para criar solicitações</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[150px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Buscar..." className="pl-8 text-xs h-8" />
        </div>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-36 text-xs h-8"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTipo} onValueChange={v => setFilterTipo(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-28 text-xs h-8"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="MERCADO">Mercado</SelectItem>
            <SelectItem value="SAZONAL">Sazonal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPrioridade} onValueChange={v => setFilterPrioridade(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-28 text-xs h-8"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-scale-in">
          <h4 className="text-sm font-semibold text-foreground">Nova Solicitação Mercado/Sazonal</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-[10px] text-muted-foreground">Título *</Label>
              <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} className="text-xs mt-1" placeholder="Ex: Compra semanal feira" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as any }))}>
                <SelectTrigger className="text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MERCADO">Mercado</SelectItem>
                  <SelectItem value="SAZONAL">Sazonal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Prioridade</Label>
              <Select value={form.prioridade} onValueChange={v => setForm(f => ({ ...f, prioridade: v }))}>
                <SelectTrigger className="text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Data necessidade</Label>
              <Input type="date" value={form.data_necessidade} onChange={e => setForm(f => ({ ...f, data_necessidade: e.target.value }))} className="text-xs mt-1" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Responsável (@mencionar)</Label>
              <div className="mt-1">
                <UserMentionSelect
                  value={form.responsavel_user_id}
                  onChange={(userId) => setForm(f => ({ ...f, responsavel_user_id: userId }))}
                  placeholder="Buscar e mencionar responsável..."
                />
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-[10px] text-muted-foreground">Observações</Label>
              <Input value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} className="text-xs mt-1" />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-[10px] text-muted-foreground">Itens</Label>
              <div className="flex gap-1">
                <button onClick={() => setItemMode('produto')} className={`text-[9px] px-2 py-0.5 rounded-full ${itemMode === 'produto' ? 'bg-primary/15 text-primary font-semibold' : 'bg-secondary text-muted-foreground'}`}>
                  Produto cadastrado
                </button>
                <button onClick={() => setItemMode('manual')} className={`text-[9px] px-2 py-0.5 rounded-full ${itemMode === 'manual' ? 'bg-primary/15 text-primary font-semibold' : 'bg-secondary text-muted-foreground'}`}>
                  Texto livre
                </button>
              </div>
            </div>

            <div className="flex items-end gap-2">
              {itemMode === 'produto' ? (
                <div className="flex-1">
                  <ProductSearchCombobox
                    options={mercadoProductOptions}
                    value={itemProdId}
                    onSelect={setItemProdId}
                    placeholder="Buscar produto…"
                    allowClear={false}
                  />
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <Input value={itemTexto} onChange={e => setItemTexto(e.target.value)} placeholder="Nome do item" className="text-xs" />
                  </div>
                  <div className="w-24">
                    <Select value={itemCat} onValueChange={setItemCat}>
                      <SelectTrigger className="text-xs"><SelectValue placeholder="Cat." /></SelectTrigger>
                      <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <Input type="number" value={itemQtd} onChange={e => setItemQtd(e.target.value)} placeholder="Qtd" className="w-16 text-xs" />
              <Select value={itemUnidade} onValueChange={setItemUnidade}>
                <SelectTrigger className="w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{['UN', 'KG', 'L', 'CX', 'PCT'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" step="0.01" value={itemPreco} onChange={e => setItemPreco(e.target.value)} placeholder="R$ est." className="w-20 text-xs" />
              <Button size="sm" variant="outline" onClick={handleAddItem}><Plus className="w-3.5 h-3.5" /></Button>
            </div>
          </div>

          {formItems.length > 0 && (
            <div className="space-y-1">
              {formItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-1.5 text-xs">
                  <span className="text-foreground">
                    {item.produto_id ? store.produtos.find(p => p.id === item.produto_id)?.nome_produto : item.produto_texto}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{item.quantidade_solicitada} {item.unidade_medida}</span>
                    {item.preco_unitario && <span className="text-muted-foreground">{fmtBRL(item.preco_unitario)}</span>}
                    <button onClick={() => setFormItems(prev => prev.filter((_, j) => j !== i))} className="text-destructive"><X className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
              <p className="text-right text-[10px] text-muted-foreground">
                Estimado: {fmtBRL(formItems.reduce((s, i) => s + (i.quantidade_solicitada * (i.preco_unitario || 0)), 0))}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" className="gradient-salmon text-primary-foreground border-0" onClick={handleSubmit}>Enviar Solicitação</Button>
          </div>
        </div>
      )}

      {/* List */}
      {store.loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-secondary rounded w-1/3 mb-2" />
              <div className="h-3 bg-secondary rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredSolicitacoes.length > 0 ? (
        <div className="space-y-2">
          {filteredSolicitacoes.map((s, i) => {
            const sc = STATUS_CONFIG[s.status] || STATUS_CONFIG.ENVIADA;
            const IconStatus = sc.icon;
            return (
              <button key={s.id} onClick={() => openDetail(s)}
                className="w-full bg-card border border-border rounded-xl p-3 text-left hover:border-primary/30 transition-all animate-fade-up"
                style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{s.titulo}</p>
                      {needsApproval(s) && <Shield className="w-3.5 h-3.5 text-warning flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${sc.color}`}>{sc.label}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${PRIORIDADE_COLORS[s.prioridade]}`}>{s.prioridade}</span>
                      <span className="text-[9px] text-muted-foreground">{s.tipo}</span>
                      <span className="text-[9px] text-muted-foreground">
                        {fmtBRL(s.total_real || s.total_estimado)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Inbox className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nenhuma solicitação</p>
          <p className="text-xs text-muted-foreground">
            {canCreateSolicMercado ? 'Crie uma nova solicitação de compra de mercado ou sazonal.' : 'Aguardando solicitações.'}
          </p>
        </div>
      )}
    </div>
  );
}
