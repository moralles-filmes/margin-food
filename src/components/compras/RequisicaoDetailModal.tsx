import { useState, useEffect, useCallback } from 'react';
import { X, Edit2, FileDown, Check, Eye, EyeOff, Clock, User, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { PurchaseRequisition, PurchaseRequisitionItem, AuditEntry, usePurchaseRequisitions } from '@/hooks/usePurchaseRequisitions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { APP_NAME } from '@/lib/brand';
import { fmtBRL, formatFixedBR, formatDateTimeBR } from '@/lib/formatters';

interface Props {
  requisitionId: string | null;
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  onRefresh: () => void;
}

export default function RequisicaoDetailModal({ requisitionId, open, onClose, canEdit, onRefresh }: Props) {
  const { loadDetail, edit, ignoreItem } = usePurchaseRequisitions();
  const [req, setReq] = useState<PurchaseRequisition | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editObs, setEditObs] = useState('');
  const [editItems, setEditItems] = useState<(PurchaseRequisitionItem & { quantidade_edit: number; preco_edit: number })[]>([]);
  const [ignoreReason, setIgnoreReason] = useState('');
  const [ignoringId, setIgnoringId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'included' | 'ignored'>('all');

  const load = useCallback(async () => {
    if (!requisitionId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadDetail(requisitionId);
      setReq(result.requisition);
      setAudit(result.audit);
      setEditObs(result.requisition.observacao || '');
      setEditItems((result.requisition.purchase_requisition_items || []).map((i: PurchaseRequisitionItem) => ({
        ...i,
        quantidade_edit: i.quantidade_escolhida,
        preco_edit: i.preco_referencia,
      })));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [requisitionId, loadDetail]);

  useEffect(() => {
    if (open && requisitionId) load();
  }, [open, requisitionId, load]);

  const handleSaveEdit = async () => {
    if (!req) return;
    try {
      setLoading(true);
      await edit(req.id, {
        observacao: editObs,
        itens: editItems.map(i => ({
          id: i.id,
          quantidade_escolhida: i.quantidade_edit,
          preco_referencia: i.preco_edit,
        })),
      });
      setEditing(false);
      await load();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleIgnore = async (itemId: string, shouldIgnore: boolean) => {
    try {
      await ignoreItem(itemId, shouldIgnore, shouldIgnore ? ignoreReason : undefined);
      setIgnoringId(null);
      setIgnoreReason('');
      await load();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExportPDF = () => {
    if (!req) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(APP_NAME, 14, 15);
    doc.setFontSize(10);
    doc.text(`Requisição: ${req.codigo}`, 14, 25);
    doc.text(`Data: ${req.data} | Tipo: ${req.tipo} | Status: ${req.status}`, 14, 32);
    doc.text(`Responsável: ${req.responsavel}`, 14, 39);
    if (req.observacao) doc.text(`Obs: ${req.observacao}`, 14, 46);

    const items = (req.purchase_requisition_items || []).filter((i) => !i.is_ignored);
    const tableData = items.map((i) => [
      i.produto_nome || i.produtos?.nome_produto || '—',
      i.quantidade_escolhida,
      i.unidade,
      fmtBRL(i.preco_referencia || 0),
      fmtBRL(i.subtotal || 0),
      i.prioridade,
    ]);

    autoTable(doc, {
      startY: req.observacao ? 52 : 46,
      head: [['Produto', 'Qtd', 'Un', 'Preço Ref', 'Subtotal', 'Prioridade']],
      body: tableData,
      styles: { fontSize: 8 },
    });

    const finalY = (doc as any).lastAutoTable?.finalY as number || 80;
    const total = items.reduce((s, i) => s + (i.subtotal || 0), 0);
    doc.setFontSize(10);
    doc.text(`Total estimado: ${fmtBRL(total)}`, 14, finalY + 10);
    doc.save(`requisicao-${req.codigo}.pdf`);
    toast.success('PDF exportado!');
  };

  const handleExportCSV = () => {
    if (!req) return;
    const items = (req.purchase_requisition_items || []).filter((i) => !i.is_ignored);
    const headers = 'Produto;Quantidade;Unidade;Preco Referencia;Subtotal;Prioridade\n';
    const rows = items.map((i) =>
      `${i.produto_nome || i.produtos?.nome_produto || '—'};${i.quantidade_escolhida};${i.unidade};${formatFixedBR(i.preco_referencia || 0, 2)};${formatFixedBR(i.subtotal || 0, 2)};${i.prioridade}`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `requisicao-${req.codigo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado!');
  };

  const filteredItems = (req?.purchase_requisition_items || []).filter((i) => {
    if (filter === 'included') return !i.is_ignored;
    if (filter === 'ignored') return i.is_ignored;
    return true;
  });

  const statusColor = (s: string) => {
    switch (s) {
      case 'RASCUNHO': return 'bg-secondary text-muted-foreground';
      case 'APROVADA': return 'bg-success/15 text-success';
      case 'EM_COTACAO': return 'bg-primary/15 text-primary';
      case 'CONVERTIDA': return 'bg-accent/15 text-accent-foreground';
      case 'CANCELADA': return 'bg-destructive/15 text-destructive';
      default: return 'bg-secondary text-muted-foreground';
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {req ? `${req.codigo} — Requisição` : 'Carregando...'}
          </DialogTitle>
        </DialogHeader>

        {loading && !req && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
            <AlertTriangle className="w-5 h-5 mx-auto text-destructive mb-2" />
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={load}>
              <RefreshCw className="w-3 h-3" /> Tentar novamente
            </Button>
          </div>
        )}

        {req && !error && (
          <Tabs defaultValue="itens" className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="itens">Itens</TabsTrigger>
              <TabsTrigger value="info">Informações</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            {/* HEADER */}
            <div className="flex items-center justify-between mt-3 mb-2">
              <div className="flex items-center gap-2">
                <Badge className={statusColor(req.status)}>{req.status}</Badge>
                <span className="text-xs text-muted-foreground">{req.tipo}</span>
              </div>
              <div className="flex items-center gap-1">
                {canEdit && req.status !== 'CONVERTIDA' && (
                  <Button size="sm" variant={editing ? 'default' : 'outline'} className="gap-1 text-xs h-7" onClick={() => editing ? handleSaveEdit() : setEditing(true)}>
                    {editing ? <><Check className="w-3 h-3" /> Salvar</> : <><Edit2 className="w-3 h-3" /> Editar</>}
                  </Button>
                )}
                <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={handleExportPDF}>
                  <FileDown className="w-3 h-3" /> PDF
                </Button>
                <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={handleExportCSV}>
                  <FileDown className="w-3 h-3" /> CSV
                </Button>
              </div>
            </div>

            <TabsContent value="itens">
              <div className="flex items-center gap-1 mb-3">
                {(['all', 'included', 'ignored'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${filter === f ? 'gradient-salmon text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                    {f === 'all' ? 'Todos' : f === 'included' ? 'Incluídos' : 'Ignorados'}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                {filteredItems.map((item, idx: number) => {
                  const editItem = editItems.find(e => e.id === item.id);
                  const nome = item.produto_nome || item.produtos?.nome_produto || '—';
                  return (
                    <div key={item.id} className={`rounded-lg border p-2.5 transition-all ${item.is_ignored ? 'opacity-50 bg-muted/30 border-muted' : 'bg-card border-border'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {!editing && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                              item.prioridade === 'alta' ? 'bg-destructive/15 text-destructive' :
                              item.prioridade === 'media' ? 'bg-warning/15 text-warning' :
                              'bg-success/15 text-success'
                            }`}>{item.prioridade}</span>
                          )}
                          <span className="text-xs font-medium text-foreground truncate">{nome}</span>
                          {item.is_ignored && <Badge variant="outline" className="text-[9px] h-4">Ignorado</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          {editing && editItem ? (
                            <>
                              <Input type="number" value={editItem.quantidade_edit || ''} onChange={e => setEditItems(prev => prev.map(ei => ei.id === item.id ? { ...ei, quantidade_edit: parseFloat(e.target.value) || 0 } : ei))}
                                className="w-16 h-7 text-xs" />
                              <Input type="number" step="0.01" value={editItem.preco_edit || ''} onChange={e => setEditItems(prev => prev.map(ei => ei.id === item.id ? { ...ei, preco_edit: parseFloat(e.target.value) || 0 } : ei))}
                                className="w-20 h-7 text-xs" placeholder="R$" />
                            </>
                          ) : (
                            <>
                              <span className="text-xs text-muted-foreground">{item.quantidade_escolhida} {item.unidade}</span>
                              {item.preco_referencia > 0 && <span className="text-xs font-medium text-foreground">{fmtBRL(item.subtotal || 0)}</span>}
                            </>
                          )}
                          {!editing && (
                            <>
                              {ignoringId === item.id ? (
                                <div className="flex items-center gap-1">
                                  <Input placeholder="Motivo (opcional)" value={ignoreReason} onChange={e => setIgnoreReason(e.target.value)} className="w-32 h-7 text-xs" />
                                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => handleIgnore(item.id, !item.is_ignored)}>
                                    Confirmar
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => { setIgnoringId(null); setIgnoreReason(''); }}>
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              ) : (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => item.is_ignored ? handleIgnore(item.id, false) : setIgnoringId(item.id)}
                                  title={item.is_ignored ? 'Restaurar item' : 'Ignorar item'}>
                                  {item.is_ignored ? <Eye className="w-3.5 h-3.5 text-success" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {item.is_ignored && item.ignored_reason && (
                        <p className="text-[10px] text-muted-foreground mt-1 italic">Motivo: {item.ignored_reason}</p>
                      )}
                    </div>
                  );
                })}
                {filteredItems.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-4">Nenhum item {filter === 'ignored' ? 'ignorado' : 'encontrado'}</p>
                )}
              </div>

              {/* Total */}
              <div className="flex justify-end mt-3 pt-2 border-t border-border">
                <p className="text-sm font-bold text-foreground">
                  Total: {fmtBRL((req.purchase_requisition_items || []).filter((i) => !i.is_ignored).reduce((s, i) => s + (i.subtotal || 0), 0))}
                </p>
              </div>
            </TabsContent>

            <TabsContent value="info">
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Código</p>
                    <p className="text-sm font-medium text-foreground">{req.codigo}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Data</p>
                    <p className="text-sm font-medium text-foreground">{req.data}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Tipo</p>
                    <p className="text-sm font-medium text-foreground capitalize">{req.tipo}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Responsável</p>
                    <p className="text-sm font-medium text-foreground">{req.responsavel}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Observação</p>
                  {editing ? (
                    <Textarea value={editObs} onChange={e => setEditObs(e.target.value)} className="text-xs" rows={3} />
                  ) : (
                    <p className="text-sm text-foreground">{req.observacao || '—'}</p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="historico">
              <div className="space-y-2 py-2">
                {audit.length > 0 ? audit.map(a => (
                  <div key={a.id} className="flex items-start gap-2 bg-secondary/50 rounded-lg p-2.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-foreground">{a.acao}</p>
                        <span className="text-[10px] text-muted-foreground">{formatDateTimeBR(new Date(a.created_at))}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <User className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{a.user_nome}</span>
                      </div>
                      {a.campo && <p className="text-[10px] text-muted-foreground mt-0.5">Campo: {a.campo}</p>}
                    </div>
                  </div>
                )) : (
                  <p className="text-center text-xs text-muted-foreground py-4">Nenhum registro de auditoria</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
