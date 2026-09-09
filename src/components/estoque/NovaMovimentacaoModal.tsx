import { useSupabase } from '@/contexts/CompanyScopeContext';
/**
 * ─── NovaMovimentacaoModal ───
 * Modal dedicado para criação de movimentações de estoque.
 * Substitui o antigo formulário inline, abrindo sobre a tela atual.
 *
 * Pré-seleciona o tipo de movimentação com base no botão acionado:
 *   - "Nova Entrada" → ENTRADA
 *   - "Nova Saída"   → SAIDA
 *   - "Ajuste / Transferência" → AJUSTE | BAIXA_PERDA
 *
 * Reusa 100% da lógica de validação, custo, conversão e submit já existente.
 *
 * @enterprise-safe  Mantém RBAC, tenant, dirty-guard e audit.
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, Settings2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CurrencyInput } from '@/components/ui/brl-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ProductSearchCombobox, { type ProductOption } from '@/components/ui/ProductSearchCombobox';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { formatFixedBR, todayBR, fmtBRL, normalizeBRLMoneyToNumber } from '@/lib/formatters';
import { toast } from 'sonner';
import { TenantError } from '@/lib/tenant';
import { getCostOrigin, getCostLabel, getActiveCostBase, getActiveCostPurchase } from '@/components/estoque/CustoItemDisplay';
import { Badge } from '@/components/ui/badge';
import type { MovimentacaoEstoque } from '@/types/salmon';
import type { ProdutoExtended } from '@/types/estoque';

// ─── Public Types ───

export type MovModalPreset = 'entrada' | 'saida' | 'ajuste';

type MovTipo = MovimentacaoEstoque['tipo'];

interface MovFormState {
  produtoId: string;
  tipo: MovTipo;
  quantidade: string;
  custoUnitario: string;
  observacao: string;
  setor: string;
  usePurchaseUnit: boolean;
}

const PRESET_DEFAULTS: Record<MovModalPreset, MovTipo> = {
  entrada: 'ENTRADA',
  saida: 'SAIDA',
  ajuste: 'AJUSTE',
};

const PRESET_TITLES: Record<MovModalPreset, string> = {
  entrada: 'Nova Entrada',
  saida: 'Nova Saída',
  ajuste: 'Ajuste / Transferência',
};

const PRESET_ICONS: Record<MovModalPreset, typeof ArrowDown> = {
  entrada: ArrowDown,
  saida: ArrowUp,
  ajuste: Settings2,
};

function isTenantErrorMessage(msg?: string): boolean {
  if (!msg) return false;
  return /tenant\s*inv[aá]lido|placeholder|empresa\s*n[ãa]o\s*(est[aá]|config)|n[ãa]o\s*vinculad/i.test(msg);
}

// ─── Props ───

interface Props {
  open: boolean;
  preset: MovModalPreset;
  onClose: () => void;
  produtos: ProdutoExtended[];
  saldos: Record<string, { saldo: number }>;
  userId: string;
  hasPermission: (p: string) => boolean;
  canEditPricing: boolean;
  addMovimentacao: (mov: any) => Promise<any>;
  recalcularPrecos: (produtoId?: string) => void;
}

export default function NovaMovimentacaoModal({
  open, preset, onClose, produtos, saldos,
  userId, hasPermission, canEditPricing,
  addMovimentacao, recalcularPrecos,
}: Props) {
  const supabase = useSupabase();
  const emptyForm: MovFormState = {
    produtoId: '',
    tipo: PRESET_DEFAULTS[preset],
    quantidade: '',
    custoUnitario: '',
    observacao: '',
    setor: '',
    usePurchaseUnit: false,
  };

  const [form, setForm] = useState<MovFormState>(emptyForm);
  const [movPrecoTotal, setMovPrecoTotal] = useState('');
  const [movQtdEmbalagem, setMovQtdEmbalagem] = useState('1');
  const [costLocked, setCostLocked] = useState(true);
  const [saving, setSaving] = useState(false);
  const initializedRef = useRef(false);

  // Setores (Controle de Estoque -> Cadastros -> Setores)
  const [setores, setSetores] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    supabase.from('stock_sectors').select('name').eq('is_active', true).order('sort_order').order('name')
      .then(({ data }) => setSetores((data || []).map((s: { name: string }) => s.name)));
  }, [open, supabase]);

  // Product options
  const productOptions: ProductOption[] = useMemo(() =>
    produtos.filter(p => p.ativo).map(p => ({
      id: p.id,
      label: p.nomeProduto,
      sublabel: `(${p.unidadeMedida})`,
      keywords: p.sku || '',
    })),
    [produtos]
  );
  
  const selectedProd = useMemo(() => produtos.find(p => p.id === form.produtoId), [form.produtoId, produtos]);
  const hasPurchaseUnit = useMemo(() => {
    if (!selectedProd) return false;
    const unCompra = selectedProd.unidadeCompra || selectedProd.unidadeMedida;
    return unCompra !== selectedProd.unidadeMedida;
  }, [selectedProd]);

  // Reset form when modal opens with a new preset
  useEffect(() => {
    if (open) {
      const newForm = {
        ...emptyForm,
        tipo: PRESET_DEFAULTS[preset],
        usePurchaseUnit: false,
      };
      setForm(newForm);
      setMovPrecoTotal('');
      setMovQtdEmbalagem('1');
      setCostLocked(true);
      setSaving(false);
      initializedRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset]);

  // Auto-toggle usePurchaseUnit when a product with a different purchase unit is selected
  useEffect(() => {
    if (!open || !initializedRef.current) return;
    if (preset === 'entrada' && hasPurchaseUnit) {
      setForm(f => ({ ...f, usePurchaseUnit: true }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.produtoId]);

  // Dirty guard
  const { isDirty, showConfirm, guardedClose, confirmClose, cancelClose, markClean } = useFormDirtyGuard({
    current: form,
    onClose,
  });

  const selectedFator = useMemo(() => selectedProd?.fatorConversaoPadrao || 1, [selectedProd]);
  const selectedUnCompra = useMemo(() => selectedProd?.unidadeCompra || selectedProd?.unidadeMedida || '', [selectedProd]);

  const isEntrada = form.tipo === 'ENTRADA';
  const isSaida = !isEntrada;

  // Cost info for saídas
  const saidaCostInfo = useMemo(() => {
    if (!selectedProd) return null;
    const origin = getCostOrigin(selectedProd);
    const costBase = getActiveCostBase(selectedProd);
    const costPurchase = getActiveCostPurchase(selectedProd);
    const label = getCostLabel(origin);
    const hasCost = costBase > 0;
    return { origin, costBase, costPurchase, label, hasCost };
  }, [selectedProd]);

  // Auto-fill cost for saídas
  const prevProdRef = useMemo(() => form.produtoId + form.tipo, [form.produtoId, form.tipo]);
  useEffect(() => {
    if (isEntrada || !selectedProd) return;
    if (saidaCostInfo?.hasCost) {
      setForm(f => ({ ...f, custoUnitario: String(Math.round(saidaCostInfo.costBase * 100) / 100) }));
      setCostLocked(true);
    } else {
      setForm(f => ({ ...f, custoUnitario: '' }));
      setCostLocked(false);
    }
  }, [prevProdRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calcs
  const precoBaseCalc = useMemo(() => {
    const pt = normalizeBRLMoneyToNumber(movPrecoTotal) || 0;
    const qe = normalizeBRLMoneyToNumber(movQtdEmbalagem) || 1;
    return qe > 0 ? pt / qe : 0;
  }, [movPrecoTotal, movQtdEmbalagem]);

  const quantidadeBaseCalc = useMemo(() => {
    const qty = normalizeBRLMoneyToNumber(form.quantidade) || 0;
    const qe = normalizeBRLMoneyToNumber(movQtdEmbalagem) || 1;
    return qty * qe;
  }, [form.quantidade, movQtdEmbalagem]);

  const saidaBaseCalc = useMemo(() => {
    const qty = normalizeBRLMoneyToNumber(form.quantidade) || 0;
    return form.usePurchaseUnit ? qty * selectedFator : qty;
  }, [form.quantidade, form.usePurchaseUnit, selectedFator]);

  const saidaTotalEstimate = useMemo(() => {
    const costUnit = normalizeBRLMoneyToNumber(form.custoUnitario) || 0;
    return saidaBaseCalc * costUnit;
  }, [saidaBaseCalc, form.custoUnitario]);

  const selectedSaldo = useMemo(() => {
    if (!selectedProd) return { base: 0, purchase: 0 };
    const s = saldos[selectedProd.id]?.saldo || 0;
    return { base: s, purchase: selectedFator > 0 ? s / selectedFator : s };
  }, [selectedProd, saldos, selectedFator]);

  // ─── Submit ───
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.produtoId || !form.quantidade) { toast.error('Preencha todos os campos'); return; }
    if (isSaida && !form.setor) { toast.error('Setor é obrigatório para saídas.'); return; }

    const qty = normalizeBRLMoneyToNumber(form.quantidade) || 0;
    const qe = normalizeBRLMoneyToNumber(movQtdEmbalagem) || 1;
    let quantidadeBase: number;
    if (isEntrada) {
      if (qe <= 0) { toast.error('Fator de conversão deve ser > 0'); return; }
      quantidadeBase = form.usePurchaseUnit ? qty * qe : qty;
    } else {
      quantidadeBase = form.usePurchaseUnit ? qty * selectedFator : qty;
    }

    if (isSaida) {
      const saldoAtual = saldos[form.produtoId]?.saldo || 0;
      if (quantidadeBase > saldoAtual) {
        toast.error(`Estoque insuficiente! Disponível: ${formatFixedBR(saldoAtual, 2)} ${selectedProd?.unidadeMedida || ''}`);
        return;
      }
    }

    const custoUnit = isEntrada ? precoBaseCalc : (normalizeBRLMoneyToNumber(form.custoUnitario) || 0);
    if (isSaida && custoUnit <= 0) {
      toast.error('Item sem custo cadastrado. Registre uma entrada inicial ou custo padrão.');
      return;
    }

    setSaving(true);
    try {
      await addMovimentacao({
        produtoId: form.produtoId,
        data: todayBR(),
        tipo: form.tipo,
        quantidade: quantidadeBase,
        custoUnitario: Math.round(custoUnit * 100) / 100,
        custoTotal: Math.round(quantidadeBase * custoUnit * 100) / 100,
        origem: 'Manual',
        referenciaId: '',
        observacao: form.observacao,
        createdBy: userId,
        setor: isSaida ? form.setor : undefined,
      });
      toast.success(`Movimentação ${form.tipo} registrada!`);
      if (isEntrada) recalcularPrecos(form.produtoId);
      markClean();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (err instanceof TenantError || isTenantErrorMessage(msg)) {
        toast.error(msg || 'Usuário não vinculado a empresa válida.');
      } else {
        toast.error(msg || 'Erro ao registrar movimentação');
      }
    }
    setSaving(false);
  };

  const Icon = PRESET_ICONS[preset];

  // Available tipos based on preset
  const tipoOptions: { value: MovTipo; label: string }[] = useMemo(() => {
    switch (preset) {
      case 'entrada': return [{ value: 'ENTRADA', label: 'Entrada' }];
      case 'saida': return [
        { value: 'SAIDA', label: 'Saída' },
        { value: 'BAIXA_PERDA', label: 'Baixa/Perda' },
      ];
      case 'ajuste': return [
        { value: 'AJUSTE', label: 'Ajuste (+)' },
        { value: 'BAIXA_PERDA', label: 'Baixa/Perda (−)' },
      ];
    }
  }, [preset]);

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) guardedClose(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="pb-3 border-b border-border flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                preset === 'entrada' ? 'bg-success-soft' : preset === 'saida' ? 'bg-destructive-soft' : 'bg-primary-soft'
              }`}>
                <Icon className={`w-4 h-4 ${
                  preset === 'entrada' ? 'text-success' : preset === 'saida' ? 'text-destructive' : 'text-primary'
                }`} />
              </div>
              {PRESET_TITLES[preset]}
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto flex-1">
          <form onSubmit={handleSubmit} className="space-y-3 pt-2">
            {/* Produto */}
            <div>
              <Label className="text-[11px] text-muted-foreground">Produto *</Label>
              <ProductSearchCombobox
                options={productOptions}
                value={form.produtoId}
                onSelect={v => {
                  setForm(f => ({ ...f, produtoId: v }));
                  const prod = produtos.find(p => p.id === v);
                  if (prod) setMovQtdEmbalagem(String(prod.fatorConversaoPadrao || 1));
                }}
                placeholder="Buscar produto…"
                allowClear={false}
              />
            </div>

            {/* Tipo (only show selector when preset has multiple options) */}
            {tipoOptions.length > 1 && (
              <div>
                <Label className="text-[11px] text-muted-foreground">Tipo *</Label>
                <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as MovTipo }))}>
                  <SelectTrigger className="bg-secondary border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tipoOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Quantidade */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Quantidade *</Label>

              {hasPurchaseUnit && selectedProd && (
                <ToggleGroup
                  type="single"
                  value={form.usePurchaseUnit ? 'purchase' : 'base'}
                  onValueChange={(v) => {
                    if (!v) return;
                    setForm(f => ({ ...f, usePurchaseUnit: v === 'purchase' }));
                  }}
                  className="grid grid-cols-2 gap-1 bg-background-subtle p-1 rounded-md border border-border w-full"
                >
                  <ToggleGroupItem
                    value="base"
                    aria-label={`Lançar em ${selectedProd.unidadeMedida}`}
                    className="h-11 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm rounded-md flex flex-col items-center justify-center"
                  >
                    <span className="text-xs font-semibold leading-tight">{selectedProd.unidadeMedida}</span>
                    <span className="text-[10px] opacity-80 leading-tight">Unidade base</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="purchase"
                    aria-label={`Lançar em ${selectedUnCompra}`}
                    className="h-11 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm rounded-md flex flex-col items-center justify-center"
                  >
                    <span className="text-xs font-semibold leading-tight">{selectedUnCompra}</span>
                    <span className="text-[10px] opacity-80 leading-tight">Un. de compra</span>
                  </ToggleGroupItem>
                </ToggleGroup>
              )}

              <Input
                type="text" inputMode="decimal"
                value={form.quantidade}
                onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))}
                className="bg-secondary border-border text-foreground h-9"
                placeholder={`Ex: 3 ${form.usePurchaseUnit ? selectedUnCompra : (selectedProd?.unidadeMedida || '')}`}
              />
            </div>

            {/* Purchase unit info for saídas */}
            {isSaida && hasPurchaseUnit && selectedProd && (
              <div className="bg-primary-soft border border-primary-border rounded-lg p-2.5 grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Conversão</p>
                  <p className="text-xs font-medium text-foreground">1 {selectedUnCompra} = {selectedFator} {selectedProd.unidadeMedida}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Qtd Base</p>
                  <p className="text-sm font-bold text-foreground">{formatFixedBR(saidaBaseCalc, 2)} {selectedProd.unidadeMedida}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Estoque</p>
                  <p className="text-xs font-medium text-foreground">{formatFixedBR(selectedSaldo.purchase, 1)} {selectedUnCompra} ({formatFixedBR(selectedSaldo.base, 1)} {selectedProd.unidadeMedida})</p>
                </div>
              </div>
            )}

            {/* Cost info for saídas */}
            {isSaida && selectedProd && saidaCostInfo && (
              <div className="bg-background-subtle border border-border rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-foreground">📌 Custo utilizado nesta saída</p>
                  <Badge variant="secondary" className="text-[8px] px-1.5 py-0 h-4">{saidaCostInfo.label}</Badge>
                </div>
                {saidaCostInfo.hasCost ? (
                  <div className="flex items-center gap-4 text-xs flex-wrap">
                      <div>
                        <span className="text-muted-foreground">R$/{selectedProd.unidadeMedida}: </span>
                        <span className="font-bold text-foreground">{fmtBRL(saidaCostInfo.costBase)}</span>
                      </div>
                      {hasPurchaseUnit && (
                        <div>
                          <span className="text-muted-foreground">R$/{selectedUnCompra}: </span>
                          <span className="font-bold text-foreground">{fmtBRL(saidaCostInfo.costPurchase)}</span>
                        </div>
                      )}
                      {saidaBaseCalc > 0 && (
                        <div>
                          <span className="text-muted-foreground">Total: </span>
                          <span className="font-bold text-primary-ink">{fmtBRL(saidaTotalEstimate)}</span>
                        </div>
                      )}
                  </div>
                ) : (
                  <p className="text-[10px] text-destructive font-medium">⚠️ Item sem custo cadastrado. Registre uma entrada ou custo padrão.</p>
                )}
              </div>
            )}

            {/* Entrada-specific fields */}
            {isEntrada && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      Fator conversão ({selectedProd ? `${selectedProd.unidadeMedida} por ${selectedUnCompra}` : 'un. base/emb.'})
                    </Label>
                    <Input type="text" inputMode="decimal" value={movQtdEmbalagem} onChange={e => setMovQtdEmbalagem(e.target.value)} className="bg-secondary border-border text-foreground" placeholder="Ex: 5" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Preço por {selectedUnCompra || 'emb.'} (R$) *</Label>
                    <CurrencyInput value={movPrecoTotal} onValueChange={setMovPrecoTotal} showPrefix maxDecimals={2} className="bg-secondary border-border text-foreground" placeholder="0,00" />
                  </div>
                </div>
                <div className="bg-primary-soft border border-primary-border rounded-lg p-2.5 grid grid-cols-4 gap-2">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Qtd Base</p>
                    <p className="text-sm font-bold text-foreground">{formatFixedBR(quantidadeBaseCalc, 2)} {selectedProd?.unidadeMedida || ''}</p>
                  </div>
                   <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">R$/{selectedProd?.unidadeMedida || 'base'}</p>
                    <p className="text-sm font-bold text-primary-ink">{precoBaseCalc > 0 ? fmtBRL(precoBaseCalc) : '—'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">R$/{selectedUnCompra || 'emb.'}</p>
                    <p className="text-sm font-bold text-foreground">{movPrecoTotal ? fmtBRL(normalizeBRLMoneyToNumber(movPrecoTotal) || 0) : '—'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Total</p>
                    <p className="text-sm font-bold text-foreground">{movPrecoTotal ? fmtBRL((normalizeBRLMoneyToNumber(movPrecoTotal) || 0) * (normalizeBRLMoneyToNumber(form.quantidade) || 1)) : '—'}</p>
                  </div>
                </div>
              </>
            )}

            {/* Custo unitário for saídas */}
            {isSaida && (
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">Custo unitário ({hasPurchaseUnit ? `R$/${selectedProd?.unidadeMedida}` : 'R$'})</Label>
                  {costLocked && saidaCostInfo?.hasCost && (canEditPricing || hasPermission('finance:manage')) && (
                    <button type="button" onClick={() => setCostLocked(false)} className="text-[9px] text-primary-ink underline">Editar custo</button>
                  )}
                </div>
                <CurrencyInput value={form.custoUnitario} onValueChange={raw => setForm(f => ({ ...f, custoUnitario: raw }))} showPrefix maxDecimals={2} className={`bg-secondary border-border text-foreground ${costLocked ? 'opacity-70' : ''}`} disabled={costLocked} />
              </div>
            )}

            {/* Setor for saídas */}
            {isSaida && (
              <div>
                <Label className="text-[11px] text-muted-foreground">🏷️ Setor *</Label>
                <Select value={form.setor} onValueChange={v => setForm(f => ({ ...f, setor: v }))}>
                  <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
                  <SelectContent>
                    {setores.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Observação */}
            <div>
              <Label className="text-[11px] text-muted-foreground">Observação</Label>
              <Input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} maxLength={500} className="bg-secondary border-border text-foreground" />
            </div>

            {/* Footer */}
            <DialogFooter className="pt-2 border-t border-border">
              <Button type="button" variant="ghost" size="sm" onClick={guardedClose} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="bg-primary-strong text-primary-foreground border-0" disabled={saving}>
                {saving ? 'Registrando...' : 'Registrar'}
              </Button>
            </DialogFooter>
          </form>
          </div>
        </DialogContent>
      </Dialog>

      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </>
  );
}
