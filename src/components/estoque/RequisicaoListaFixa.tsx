/**
 * Operator flow for creating requisitions from a fixed sector list.
 * Steps: 1) Select sector → 2) Fill quantities → 3) Preview → 4) Confirm & submit
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardList, Eye, Send, ArrowLeft, Inbox, AlertTriangle, ShoppingCart, Loader2 } from 'lucide-react';
import type { ProdutoExtended } from '@/types/estoque';
import { toRequisitionDisplayProduct } from '@/domain/estoque/requisition';

interface ListaFixaItem {
  id: string;
  produto_id: string;
  ordem: number;
  observacao: string;
}

type Step = 'fill' | 'preview';

interface Props {
  produtos: ProdutoExtended[];
  saldos: Record<string, { saldo: number }>;
  onSuccess: () => void;
  onCancel: () => void;
}

function getRequisitionProductDisplay(prod: ProdutoExtended) {
  return toRequisitionDisplayProduct(prod);
}

export default function RequisicaoListaFixa({ produtos, saldos, onSuccess, onCancel }: Props) {
  const { profile } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [setor, setSetor] = useState(profile?.sector || '');
  const [setores, setSetores] = useState<string[]>([]);
  useEffect(() => {
    supabase.from('stock_sectors').select('name').eq('is_active', true).order('sort_order').order('name')
      .then(({ data }) => {
        const nomes = (data || []).map((s: { name: string }) => s.name);
        setSetores(nomes);
        setSetor(current => current || nomes[0] || '');
      });
  }, []);
  const [observacao, setObservacao] = useState('');
  const [items, setItems] = useState<ListaFixaItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>('fill');
  const [listaExists, setListaExists] = useState<boolean | null>(null);

  const loadListaFixa = useCallback(async (sectorName: string) => {
    setLoading(true);
    setItems([]);
    setQuantities({});
    setListaExists(null);
    try {
      const { data: lista, error: listaErr } = await supabase
        .from('listas_fixas_setor')
        .select('id, setor, ativo')
        .eq('setor', sectorName)
        .eq('ativo', true)
        .maybeSingle();

      if (listaErr) throw listaErr;
      if (!lista) {
        setListaExists(false);
        return;
      }

      setListaExists(true);

      const { data: itens, error: itensErr } = await supabase
        .from('listas_fixas_setor_itens')
        .select('id, produto_id, ordem, observacao')
        .eq('lista_fixa_id', lista.id)
        .order('ordem');

      if (itensErr) throw itensErr;
      setItems((itens || []) as ListaFixaItem[]);
    } catch (err) {
      console.error('Erro ao carregar lista fixa:', err);
      toast.error('Erro ao carregar lista do setor');
      setListaExists(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadListaFixa(setor);
  }, [setor, loadListaFixa]);

  const getProd = (id: string) => produtos.find(prod => prod.id === id);
  const getSaldo = (id: string) => saldos[id]?.saldo || 0;

  const activeItems = useMemo(() => {
    return items.filter(item => {
      const prod = getProd(item.produto_id);
      return prod && prod.ativo;
    });
  }, [items, produtos]);

  const invalidUnitItemsCount = useMemo(() => {
    return activeItems.filter(item => {
      const prod = getProd(item.produto_id);
      if (!prod) return false;
      return !getRequisitionProductDisplay(prod).hasValidPurchaseUnit;
    }).length;
  }, [activeItems, produtos]);

  const filledItems = useMemo(() => {
    return activeItems
      .map(item => {
        const quantidade = parseFloat(quantities[item.produto_id] || '0');
        const prod = getProd(item.produto_id);
        const display = prod ? getRequisitionProductDisplay(prod) : null;
        return { ...item, quantidade, prod, display };
      })
      .filter(item => item.quantidade > 0 && item.prod && item.display?.hasValidPurchaseUnit && item.display.displayUnitForRequisition);
  }, [activeItems, quantities, produtos]);

  const handleSetorChange = (newSetor: string) => {
    const hasData = Object.values(quantities).some(value => parseFloat(value) > 0);
    if (hasData) {
      toast.info('Setor alterado. Quantidades anteriores foram limpas.');
    }
    setSetor(newSetor);
    setStep('fill');
  };

  const handleQtyChange = (produtoId: string, value: string) => {
    if (value && !/^\d*[.,]?\d*$/.test(value)) return;
    setQuantities(prev => ({ ...prev, [produtoId]: value.replace(',', '.') }));
  };

  const handleGoToPreview = () => {
    if (filledItems.length === 0) {
      toast.error('Preencha a quantidade de pelo menos 1 item válido');
      return;
    }
    setStep('preview');
  };

  const handleSubmit = async () => {
    if (submitting) return;

    const ok = await confirm({
      title: 'Confirmar requisição',
      description: `Enviar requisição com ${filledItems.length} item(ns) para o setor ${setor}?`,
      confirmLabel: 'Enviar Requisição',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const payload = {
        action: 'criar',
        setor,
        observacao,
        itens: filledItems.map(item => ({
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          unidade: item.display!.displayUnitForRequisition!,
        })),
      };

      const { data, error } = await supabase.functions.invoke('requisicao-estoque', {
        body: payload,
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(data.mensagem || 'Requisição enviada com sucesso!', { duration: 5000 });

        const semEstoque = data.resultados?.filter((result: Record<string, unknown>) => !result.tem_estoque) || [];
        if (semEstoque.length > 0) {
          semEstoque.forEach((result: Record<string, unknown>) => {
            const nome = getProd(result.produto_id as string)?.nomeProduto || '';
            toast.info(
              `${nome}: sem estoque (disponível: ${result.saldo}). Pedido de compra criado automaticamente.`,
              { duration: 6000 },
            );
          });
        }

        onSuccess();
      } else {
        toast.error(data?.error || 'Erro ao criar requisição');
      }
    } catch (err) {
      console.error('Erro ao enviar requisição:', err);
      toast.error('Erro ao processar requisição');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="bg-card border border-border rounded-xl p-4 space-y-4 animate-scale-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">
              {step === 'fill' ? 'Requisição por Lista Fixa' : 'Prévia da Requisição'}
            </p>
          </div>
          {step === 'preview' && (
            <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => setStep('fill')}>
              <ArrowLeft className="w-3 h-3" /> Voltar
            </Button>
          )}
        </div>

        {step === 'fill' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">Setor</Label>
                <Select value={setor} onValueChange={handleSetorChange}>
                  <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {setores.map(sector => <SelectItem key={sector} value={sector}>{sector}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Observação</Label>
                <Input value={observacao} onChange={event => setObservacao(event.target.value)} className="bg-secondary border-border text-foreground" placeholder="Opcional" />
              </div>
            </div>

            {loading && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}

            {!loading && listaExists === false && (
              <div className="bg-secondary/50 border border-border rounded-lg p-6 text-center">
                <Inbox className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium text-foreground mb-1">Nenhuma lista fixa para {setor}</p>
                <p className="text-xs text-muted-foreground">
                  Solicite ao administrador que crie uma lista fixa para este setor, ou use a requisição manual.
                </p>
              </div>
            )}

            {!loading && listaExists && activeItems.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground font-medium">{activeItems.length} itens • Preencha as quantidades desejadas</p>
                <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
                  {activeItems.map(item => {
                    const prod = getProd(item.produto_id);
                    if (!prod) return null;

                    const saldo = getSaldo(item.produto_id);
                    const qty = parseFloat(quantities[item.produto_id] || '0');
                    const exceedsSaldo = qty > 0 && qty > saldo;
                    const display = getRequisitionProductDisplay(prod);
                    const purchaseUnitMissing = !display.hasValidPurchaseUnit || !display.displayUnitForRequisition;

                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${purchaseUnitMissing ? 'bg-warning/10 border border-warning/20' : exceedsSaldo ? 'bg-destructive/5 border border-destructive/20' : 'bg-secondary/40'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground font-medium truncate">{prod.nomeProduto}</p>
                          {purchaseUnitMissing ? (
                            <p className="text-[10px] text-warning">{display.issueMessage}</p>
                          ) : (
                            <p className="text-[10px] text-muted-foreground">
                              Disp: {saldo.toFixed(1)} {display.displayUnitForRequisition}
                              {exceedsSaldo && (
                                <span className="ml-1 text-destructive">
                                  <AlertTriangle className="w-2.5 h-2.5 inline" /> Excede saldo
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={quantities[item.produto_id] || ''}
                            onChange={event => handleQtyChange(item.produto_id, event.target.value)}
                            placeholder="0"
                            className="w-20 h-8 text-xs text-center bg-background border-border text-foreground"
                            disabled={purchaseUnitMissing}
                          />
                          <span className={`text-[10px] w-16 text-right ${purchaseUnitMissing ? 'text-warning' : 'text-muted-foreground'}`}>
                            {display.displayUnitForRequisition || 'Configurar'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {invalidUnitItemsCount > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-warning/10 border border-warning/20 rounded-lg text-[10px] text-warning">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{invalidUnitItemsCount} item(ns) bloqueado(s) por falta de unidade de compra no cadastro.</span>
                  </div>
                )}

                {filledItems.some(item => item.quantidade > getSaldo(item.produto_id)) && (
                  <div className="flex items-center gap-2 p-2 bg-warning/10 border border-warning/20 rounded-lg text-[10px] text-warning">
                    <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                    <span>Itens sem estoque serão enviados como Solicitação de Compra.</span>
                  </div>
                )}
              </div>
            )}

            {!loading && listaExists && activeItems.length === 0 && (
              <div className="bg-secondary/50 border border-border rounded-lg p-6 text-center">
                <p className="text-sm text-muted-foreground">A lista está vazia. Solicite ao administrador que adicione produtos.</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
              <Button
                size="sm"
                className="gradient-salmon text-primary-foreground border-0 gap-1.5 text-xs"
                onClick={handleGoToPreview}
                disabled={filledItems.length === 0}
              >
                <Eye className="w-3.5 h-3.5" /> Pré-visualizar ({filledItems.length})
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-xs font-medium text-foreground mb-1">📋 Resumo da Requisição</p>
              <div className="flex gap-4 text-[11px] text-muted-foreground">
                <span>Setor: <strong className="text-foreground">{setor}</strong></span>
                <span>Itens: <strong className="text-foreground">{filledItems.length}</strong></span>
                {observacao && <span>Obs: <strong className="text-foreground">{observacao}</strong></span>}
              </div>
            </div>

            <div className="space-y-1">
              {filledItems.map(item => {
                const saldo = getSaldo(item.produto_id);
                const exceedsSaldo = item.quantidade > saldo;
                return (
                  <div key={item.id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${exceedsSaldo ? 'bg-destructive/10 border border-destructive/20' : 'bg-secondary/50'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground font-medium">{item.prod?.nomeProduto}</span>
                      {exceedsSaldo && (
                        <span className="flex items-center gap-0.5 text-[9px] text-destructive">
                          <AlertTriangle className="w-2.5 h-2.5" /> Sem estoque suficiente
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{item.quantidade}</span>
                      <span className="text-muted-foreground">{item.display!.displayUnitForRequisition}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {filledItems.some(item => item.quantidade > getSaldo(item.produto_id)) && (
              <div className="flex items-center gap-2 p-2 bg-warning/10 border border-warning/20 rounded-lg text-[10px] text-warning">
                <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                <span>Itens sem estoque serão encaminhados como solicitação de compra.</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep('fill')}>
                <ArrowLeft className="w-3 h-3 mr-1" /> Voltar e Editar
              </Button>
              <Button
                size="sm"
                className="gradient-salmon text-primary-foreground border-0 gap-1.5 text-xs"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</>
                ) : (
                  <><Send className="w-3.5 h-3.5" /> Confirmar e Enviar</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog />
    </>
  );
}
