import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/permissions/hooks';
import { useRecebimentoStore, Recebimento, RecebimentoItem } from '@/hooks/useRecebimentoStore';
import { useMercadoStore, SolicMercado } from '@/hooks/useMercadoStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Package, Check, ChevronRight, AlertTriangle, CheckCircle2,
  XCircle, Inbox, Search, Eye, Truck, ArrowRight,
} from 'lucide-react';
import { formatDateBR, formatDateTimeBR } from '@/lib/formatters';

const STATUS_RECEB: Record<string, { label: string; color: string }> = {
  AGUARDANDO_RECEBIMENTO: { label: 'Aguardando Recebimento', color: 'bg-warning/15 text-warning' },
  RECEBIDO_CONFIRMADO: { label: 'Recebido Confirmado', color: 'bg-success/15 text-success' },
  ESTOQUE_ATUALIZADO: { label: 'Estoque Atualizado', color: 'bg-primary/15 text-primary' },
};

const DIVERGENCIA_TIPOS = [
  { value: 'FALTOU', label: 'Faltou' },
  { value: 'VEIO_A_MAIS', label: 'Veio a mais' },
  { value: 'SUBSTITUIDO', label: 'Substituído' },
  { value: 'DANIFICADO', label: 'Danificado' },
];

export default function RecebimentoView() {
  const { user } = useAuth();
  const recStore = useRecebimentoStore();
  const mercStore = useMercadoStore();
  const canManage = useCan('compras:recebimentos:close');

  const [filterStatus, setFilterStatus] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedRec, setSelectedRec] = useState<Recebimento | null>(null);
  const [recItens, setRecItens] = useState<RecebimentoItem[]>([]);
  const [solicMap, setSolicMap] = useState<Record<string, SolicMercado>>({});
  const [showEstoqueModal, setShowEstoqueModal] = useState(false);
  const [recObs, setRecObs] = useState('');

  // Item editing
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQtd, setEditQtd] = useState('');
  const [editDivTipo, setEditDivTipo] = useState('');
  const [editDivNota, setEditDivNota] = useState('');

  // Build solic map
  useEffect(() => {
    const map: Record<string, SolicMercado> = {};
    mercStore.solicitacoes.forEach(s => { map[s.id] = s; });
    setSolicMap(map);
  }, [mercStore.solicitacoes]);

  const filteredRecebimentos = useMemo(() => {
    return recStore.recebimentos.filter(r => {
      if (filterStatus && r.status !== filterStatus) return false;
      if (searchText) {
        const solic = solicMap[r.solicitacao_id];
        if (!solic?.titulo.toLowerCase().includes(searchText.toLowerCase())) return false;
      }
      return true;
    });
  }, [recStore.recebimentos, filterStatus, searchText, solicMap]);

  const openDetail = async (rec: Recebimento) => {
    setSelectedRec(rec);
    const itens = await recStore.fetchRecebimentoItens(rec.id);
    setRecItens(itens);
    setRecObs(rec.observacoes || '');
  };

  const handleConfirmarItem = async (item: RecebimentoItem) => {
    const qtd = parseFloat(editQtd) || item.qtd_comprada;
    const divTipo = editDivTipo || null;
    await recStore.confirmarItem(item.id, qtd, divTipo, editDivNota);
    setEditingItemId(null);
    setEditQtd(''); setEditDivTipo(''); setEditDivNota('');
    toast.success('Item confirmado!');
    if (selectedRec) {
      const itens = await recStore.fetchRecebimentoItens(selectedRec.id);
      setRecItens(itens);
    }
  };

  const allItensRecebidos = recItens.length > 0 && recItens.every(i => i.recebido);

  const handleConfirmarRecebimento = () => {
    if (!allItensRecebidos) {
      toast.error('Confirme todos os itens antes de finalizar o recebimento.');
      return;
    }
    setShowEstoqueModal(true);
  };

  const handleFinalizar = async (enviarEstoque: boolean) => {
    if (!selectedRec) return;
    await recStore.confirmarRecebimento(selectedRec.id, enviarEstoque, recObs);
    toast.success(enviarEstoque ? 'Recebimento confirmado e estoque atualizado!' : 'Recebimento confirmado! Estoque será lançado manualmente.');
    setShowEstoqueModal(false);
    setSelectedRec(null);
  };

  const handleLancarEstoquePosterior = async (recId: string) => {
    await recStore.lancarEstoque(recId);
  };

  // Confirmações area
  const [showConfirmacoes, setShowConfirmacoes] = useState(false);

  // Detail view
  if (selectedRec) {
    const solic = solicMap[selectedRec.solicitacao_id];
    const sc = STATUS_RECEB[selectedRec.status] || STATUS_RECEB.AGUARDANDO_RECEBIMENTO;

    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedRec(null)} className="flex items-center gap-1 text-sm text-primary hover:underline">
          ← Voltar à lista
        </button>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-foreground">{solic?.titulo || 'Recebimento'}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${sc.color}`}>{sc.label}</span>
                {solic && <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{solic.tipo}</span>}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Criado: {formatDateBR(new Date(selectedRec.created_at))}</p>
              {selectedRec.recebido_em && <p>Recebido: {formatDateBR(new Date(selectedRec.recebido_em))}</p>}
            </div>
          </div>

          {/* Observações */}
          {selectedRec.status === 'AGUARDANDO_RECEBIMENTO' && canManage && (
            <div className="mb-4">
              <Label className="text-[10px] text-muted-foreground">Observações do recebimento</Label>
              <Input value={recObs} onChange={e => setRecObs(e.target.value)} placeholder="Observações..." className="text-xs mt-1" />
            </div>
          )}

          {/* Action buttons */}
          {selectedRec.status === 'AGUARDANDO_RECEBIMENTO' && canManage && (
            <div className="flex gap-2 mb-4">
              <Button size="sm" className="gap-1 bg-success text-success-foreground hover:bg-success/90" onClick={handleConfirmarRecebimento} disabled={!allItensRecebidos}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar Recebimento
              </Button>
            </div>
          )}

          {selectedRec.status === 'RECEBIDO_CONFIRMADO' && !selectedRec.estoque_atualizado_em && canManage && (
            <div className="flex gap-2 mb-4">
              <Button size="sm" className="gap-1" onClick={() => handleLancarEstoquePosterior(selectedRec.id)}>
                <ArrowRight className="w-3.5 h-3.5" /> Enviar ao Estoque
              </Button>
            </div>
          )}
        </div>

        {/* Items checklist */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3">
            Itens ({recItens.filter(i => i.recebido).length}/{recItens.length} conferidos)
          </h4>
          <div className="space-y-2">
            {recItens.map(item => {
              const prod = mercStore.produtos.find(p => p.id === item.produto_id);
              return (
                <div key={item.id} className={`border rounded-lg p-3 transition-all ${item.recebido ? (item.divergencia_tipo ? 'bg-warning/5 border-warning/30' : 'bg-success/5 border-success/30') : 'border-border'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {item.recebido ? (
                          item.divergencia_tipo ? <AlertTriangle className="w-5 h-5 text-warning" /> : <CheckCircle2 className="w-5 h-5 text-success" />
                        ) : (
                          <div className="w-5 h-5 rounded border-2 border-muted-foreground/30" />
                        )}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${item.recebido ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {prod?.nome_produto || 'Item'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Solicitado: {item.qtd_solicitada} • Comprado: {item.qtd_comprada}
                          {item.recebido && ` • Recebido: ${item.qtd_recebida}`}
                        </p>
                        {item.divergencia_tipo && (
                          <p className="text-[10px] text-warning mt-0.5">
                            ⚠️ {DIVERGENCIA_TIPOS.find(d => d.value === item.divergencia_tipo)?.label || item.divergencia_tipo}
                            {item.divergencia_nota && ` — ${item.divergencia_nota}`}
                          </p>
                        )}
                      </div>
                    </div>

                    {!item.recebido && selectedRec.status === 'AGUARDANDO_RECEBIMENTO' && canManage && (
                      <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => {
                        setEditingItemId(item.id);
                        setEditQtd(String(item.qtd_comprada));
                        setEditDivTipo('');
                        setEditDivNota('');
                      }}>
                        <Check className="w-3 h-3" /> Conferir
                      </Button>
                    )}
                  </div>

                  {editingItemId === item.id && (
                    <div className="mt-3 bg-secondary/50 rounded-lg p-3 space-y-2 animate-scale-in">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-[10px] text-muted-foreground">Qtd recebida</Label>
                          <Input type="number" value={editQtd} onChange={e => setEditQtd(e.target.value)} className="text-xs" />
                        </div>
                        <div className="flex-1">
                          <Label className="text-[10px] text-muted-foreground">Divergência?</Label>
                          <Select value={editDivTipo} onValueChange={setEditDivTipo}>
                            <SelectTrigger className="text-xs"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhuma</SelectItem>
                              {DIVERGENCIA_TIPOS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {editDivTipo && editDivTipo !== 'none' && (
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Nota da divergência</Label>
                          <Input value={editDivNota} onChange={e => setEditDivNota(e.target.value)} placeholder="Descreva..." className="text-xs" />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" className="gap-1 text-xs" onClick={() => handleConfirmarItem(item)}>
                          <Check className="w-3 h-3" /> Confirmar
                        </Button>
                        <Button size="sm" variant="ghost" className="text-xs" onClick={() => setEditingItemId(null)}>Cancelar</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Estoque modal */}
        {showEstoqueModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full space-y-4 animate-scale-in">
              <h3 className="text-base font-bold text-foreground">Deseja dar entrada no estoque automaticamente?</h3>
              <p className="text-xs text-muted-foreground">
                Os itens recebidos serão registrados como entrada no estoque geral com custo snapshot e auditoria completa.
              </p>
              {recItens.some(i => i.divergencia_tipo) && (
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                  <p className="text-xs text-warning font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Divergências registradas
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    As quantidades recebidas (com divergências) serão usadas para a entrada no estoque.
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Button className="w-full gap-2 bg-success text-success-foreground hover:bg-success/90" onClick={() => handleFinalizar(true)}>
                  <CheckCircle2 className="w-4 h-4" /> Sim, lançar no estoque agora
                </Button>
                <Button variant="outline" className="w-full gap-2" onClick={() => handleFinalizar(false)}>
                  <XCircle className="w-4 h-4" /> Não, vou lançar depois manualmente
                </Button>
                <Button variant="ghost" className="w-full text-xs" onClick={() => setShowEstoqueModal(false)}>Cancelar</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Package className="w-4 h-4" /> Recebimento de Mercadorias
          </h3>
          <p className="text-[10px] text-muted-foreground">Conferência e entrada no estoque</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowConfirmacoes(!showConfirmacoes)}>
          <Eye className="w-3.5 h-3.5" /> Confirmações
          {recStore.confirmacoes.filter(c => !c.visto_por?.includes(user?.id || '')).length > 0 && (
            <span className="w-4 h-4 rounded-full bg-destructive text-[9px] text-destructive-foreground flex items-center justify-center font-bold">
              {recStore.confirmacoes.filter(c => !c.visto_por?.includes(user?.id || '')).length}
            </span>
          )}
        </Button>
      </div>

      {/* Confirmações panel */}
      {showConfirmacoes && (
        <div className="bg-card border border-primary/20 rounded-xl p-4 space-y-2 animate-scale-in">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success" /> Confirmações de Recebimento no Restaurante
          </h4>
          {recStore.confirmacoes.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {recStore.confirmacoes.map(c => {
                const isVisto = c.visto_por?.includes(user?.id || '');
                return (
                  <div key={c.id} className={`border rounded-lg p-3 transition-all ${isVisto ? 'border-border bg-secondary/30' : 'border-success/30 bg-success/5'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-medium text-foreground">{c.mensagem}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDateTimeBR(new Date(c.criado_em))}
                        </p>
                      </div>
                      {!isVisto && (
                        <Button size="sm" variant="ghost" className="text-[10px] gap-1" onClick={() => recStore.marcarVisto(c.id)}>
                          <Eye className="w-3 h-3" /> Marcar visto
                        </Button>
                      )}
                      {isVisto && <span className="text-[10px] text-success">✓ Visto</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhuma confirmação ainda.</p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[150px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Buscar..." className="pl-8 text-xs h-8" />
        </div>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-44 text-xs h-8"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(STATUS_RECEB).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {recStore.loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-secondary rounded w-1/3 mb-2" />
              <div className="h-3 bg-secondary rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredRecebimentos.length > 0 ? (
        <div className="space-y-2">
          {filteredRecebimentos.map((r, i) => {
            const solic = solicMap[r.solicitacao_id];
            const sc = STATUS_RECEB[r.status] || STATUS_RECEB.AGUARDANDO_RECEBIMENTO;
            return (
              <button key={r.id} onClick={() => openDetail(r)}
                className="w-full bg-card border border-border rounded-xl p-3 text-left hover:border-primary/30 transition-all animate-fade-up"
                style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{solic?.titulo || 'Recebimento'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${sc.color}`}>{sc.label}</span>
                      {solic && <span className="text-[9px] text-muted-foreground">{solic.tipo}</span>}
                      <span className="text-[9px] text-muted-foreground">
                        {formatDateBR(new Date(r.created_at))}
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
          <p className="text-sm font-medium text-foreground mb-1">Nenhum recebimento pendente</p>
          <p className="text-xs text-muted-foreground">Quando compras forem finalizadas, aparecerão aqui para conferência.</p>
        </div>
      )}
    </div>
  );
}
