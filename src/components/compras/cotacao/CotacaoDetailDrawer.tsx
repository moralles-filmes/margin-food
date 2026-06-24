import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Package, Building2, Info, Table2, BarChart3, Wand2, ShoppingCart, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/permissions/hooks';
import { formatMoneyBR } from '@/lib/formatters';
import { mapCotacaoError } from '@/lib/cotacaoErrors';
import type { useCotacoesStore } from '@/hooks/useCotacoesStore';
import type { Cotacao, CotacaoItem, CotacaoFornecedor, CotacaoResposta } from '@/types/cotacao';
import CotacaoRespostasMatrix from './CotacaoRespostasMatrix';
import CotacaoComparativoTable from './CotacaoComparativoTable';
import CotacaoSugestaoInteligente from './CotacaoSugestaoInteligente';

type CotacaoDetail = { itens: CotacaoItem[]; fornecedores: CotacaoFornecedor[]; respostas: CotacaoResposta[] };

const FORN_STATUS_LABEL: Record<string, string> = {
  AGUARDANDO: 'Aguardando', ENVIADO: 'Enviado', RESPONDIDO: 'Respondido',
  RECUSADO: 'Recusado', NEGOCIANDO: 'Negociando', FECHADO: 'Fechado',
};

interface CotacaoDetailDrawerProps {
  cotacao: Cotacao | null;
  store: ReturnType<typeof useCotacoesStore>;
  onClose: () => void;
  onEdit: (cotacao: Cotacao, detail: { itens: CotacaoItem[]; fornecedores: CotacaoFornecedor[] }) => void;
  onDeleted: () => void;
}



export default function CotacaoDetailDrawer({ cotacao, store, onClose, onEdit, onDeleted }: CotacaoDetailDrawerProps) {
  const canEdit = useCan('compras:cotacao:edit');
  const canDelete = useCan('compras:cotacao:delete');
  const canConvert = useCan('compras:cotacao:close'); // "converter em pedido" mapeia para close
  const [detail, setDetail] = useState<CotacaoDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [converting, setConverting] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      setDetail(await store.fetchCotacaoDetail(id));
    } catch (err) {
      console.error('[CotacaoDetailDrawer.load]', err);
      toast.error('Erro ao carregar detalhes da cotação');
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    if (cotacao) { setDetail(null); load(cotacao.id); }
  }, [cotacao, load]);

  const editable = !!cotacao && ['RASCUNHO', 'EM_COTACAO'].includes(cotacao.status);
  // Conversão só após salvar a sugestão (status EM_ANALISE) e enquanto não convertida/encerrada.
  const convertible = !!cotacao && cotacao.status === 'EM_ANALISE';
  const isConverted = !!cotacao && cotacao.status === 'CONVERTIDA';

  const handleDelete = async () => {
    if (!cotacao) return;
    if (!confirm(`Excluir a cotação ${cotacao.codigo}? Esta ação pode ser desfeita apenas no banco.`)) return;
    setDeleting(true);
    try {
      await store.deleteCotacao(cotacao.id, cotacao.updated_at);
      toast.success('Cotação excluída');
      onDeleted();
    } catch (err) {
      console.error('[CotacaoDetailDrawer.handleDelete]', err);
      toast.error(mapCotacaoError(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleConvert = async () => {
    if (!cotacao) return;
    if (!confirm(
      `Converter a cotação ${cotacao.codigo} em pedido(s) de compra?\n\n` +
      `Será criado 1 pedido por fornecedor vencedor com os itens selecionados na sugestão. ` +
      `A cotação será encerrada (CONVERTIDA).`
    )) return;
    setConverting(true);
    try {
      const res = await store.convertToPurchaseOrders(cotacao.id, cotacao.updated_at);
      toast.success(`${res.orders} pedido(s) de compra criado(s) com ${res.items} item(ns). Cotação convertida.`);
      onClose(); // a lista atualiza via refetch/realtime do store
    } catch (err) {
      console.error('[CotacaoDetailDrawer.handleConvert]', err);
      toast.error(mapCotacaoError(err));
    } finally {
      setConverting(false);
    }
  };

  return (
    <Sheet open={!!cotacao} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        {cotacao && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{cotacao.codigo}</span>
                {cotacao.titulo}
              </SheetTitle>
              <SheetDescription>
                Status: {cotacao.status}
                {cotacao.data_validade ? ` • validade ${cotacao.data_validade.slice(8, 10)}/${cotacao.data_validade.slice(5, 7)}/${cotacao.data_validade.slice(0, 4)}` : ''}
              </SheetDescription>
            </SheetHeader>

            <div className="flex gap-2 mt-3">
              {canEdit && editable && (
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 flex-1"
                  onClick={() => detail && onEdit(cotacao, detail)} disabled={!detail || loading}>
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </Button>
              )}
              {canConvert && convertible && (
                <Button size="sm" className="h-8 text-xs gap-1.5 flex-1 gradient-salmon text-primary-foreground border-0"
                  onClick={handleConvert} disabled={converting}>
                  <ShoppingCart className="w-3.5 h-3.5" /> {converting ? 'Convertendo…' : 'Converter em pedido(s)'}
                </Button>
              )}
              {isConverted && (
                <span className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs bg-success/15 text-success flex-1 justify-center">
                  <PackageCheck className="w-3.5 h-3.5" /> Convertida em pedido(s)
                </span>
              )}
              {canDelete && (
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive"
                  onClick={handleDelete} disabled={deleting}>
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </Button>
              )}
            </div>

            <Tabs defaultValue="itens" className="w-full mt-4">
              <TabsList className="w-full grid grid-cols-5 h-8 bg-secondary/50">
                <TabsTrigger value="itens" className="text-[10px] gap-1"><Package className="w-3 h-3" /> Itens</TabsTrigger>
                <TabsTrigger value="fornecedores" className="text-[10px] gap-1"><Building2 className="w-3 h-3" /> Forn.</TabsTrigger>
                <TabsTrigger value="respostas" className="text-[10px] gap-1"><Table2 className="w-3 h-3" /> Respostas</TabsTrigger>
                <TabsTrigger value="comparativo" className="text-[10px] gap-1"><BarChart3 className="w-3 h-3" /> Comparar</TabsTrigger>
                <TabsTrigger value="sugestao" className="text-[10px] gap-1"><Wand2 className="w-3 h-3" /> Sugestão</TabsTrigger>
              </TabsList>

              <TabsContent value="itens" className="space-y-1.5 mt-3">
                {loading ? [0, 1, 2].map(i => <div key={i} className="h-9 bg-secondary/40 rounded-lg animate-pulse" />)
                  : (detail?.itens ?? []).length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">Sem itens.</p>
                  : detail!.itens.map(it => (
                    <div key={it.id} className="flex items-center justify-between gap-2 bg-secondary/40 rounded-lg px-2.5 py-1.5">
                      <span className="text-xs text-foreground truncate">
                        {it.produto_nome_snapshot}{!it.produto_id && <span className="ml-1 text-[9px] text-muted-foreground">(avulso)</span>}
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {Number(it.quantidade) || 0} {it.purchase_unit_snapshot || it.unidade_snapshot || 'UN'}
                      </span>
                    </div>
                  ))}
              </TabsContent>

              <TabsContent value="fornecedores" className="space-y-1.5 mt-3">
                {loading ? [0, 1].map(i => <div key={i} className="h-9 bg-secondary/40 rounded-lg animate-pulse" />)
                  : (detail?.fornecedores ?? []).length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">Sem fornecedores.</p>
                  : detail!.fornecedores.map(f => (
                    <div key={f.id} className="flex items-center justify-between gap-2 bg-secondary/40 rounded-lg px-2.5 py-1.5">
                      <span className="text-xs text-foreground truncate">{f.supplier_nome_snapshot}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {FORN_STATUS_LABEL[f.status] ?? f.status} • mín. {formatMoneyBR(f.pedido_minimo_snapshot || 0)}
                      </span>
                    </div>
                  ))}
              </TabsContent>

              <TabsContent value="respostas" className="mt-3">
                {loading || !detail ? <div className="h-24 bg-secondary/40 rounded-lg animate-pulse" />
                  : <CotacaoRespostasMatrix
                      cotacaoId={cotacao.id}
                      itens={detail.itens}
                      fornecedores={detail.fornecedores}
                      respostas={detail.respostas}
                      store={store}
                      canEdit={canEdit && cotacao.status !== 'CONVERTIDA' && cotacao.status !== 'CANCELADA'}
                      onSaved={() => load(cotacao.id)}
                    />}
              </TabsContent>

              <TabsContent value="comparativo" className="mt-3">
                {loading || !detail ? <div className="h-24 bg-secondary/40 rounded-lg animate-pulse" />
                  : <CotacaoComparativoTable itens={detail.itens} fornecedores={detail.fornecedores} respostas={detail.respostas} />}
              </TabsContent>

              <TabsContent value="sugestao" className="mt-3">
                {loading || !detail ? <div className="h-24 bg-secondary/40 rounded-lg animate-pulse" />
                  : <CotacaoSugestaoInteligente
                      cotacaoId={cotacao.id}
                      itens={detail.itens}
                      fornecedores={detail.fornecedores}
                      respostas={detail.respostas}
                      store={store}
                      canEdit={canEdit && cotacao.status !== 'CONVERTIDA' && cotacao.status !== 'CANCELADA'}
                      onSaved={() => load(cotacao.id)}
                    />}
              </TabsContent>
            </Tabs>

            <div className="mt-4 flex items-start gap-2 text-[11px] text-muted-foreground bg-secondary/30 rounded-lg p-2.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {convertible
                  ? 'Sugestão salva — clique em "Converter em pedido(s)" para gerar 1 pedido por fornecedor vencedor com os itens selecionados.'
                  : isConverted
                    ? 'Cotação convertida. Os pedidos gerados aparecem em Compras → Pedidos & Mercado.'
                    : 'Salve uma sugestão na aba Sugestão para habilitar a conversão em pedido(s). Envio por WhatsApp e IA chegam nas próximas fases.'}
              </span>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
