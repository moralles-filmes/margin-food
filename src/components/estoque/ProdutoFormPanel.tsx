/**
 * ─── Product Form Panel (Enterprise Safe) ───
 * Extracted from EstoqueGeralView for cleaner separation of concerns.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BRLInput } from '@/components/ui/brl-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { fmtBRL, formatFixedBR } from '@/lib/formatters';
import { toast } from 'sonner';
import { TenantError } from '@/lib/tenant';
import type { Produto } from '@/types/salmon';
import type { ProdutoExtended, ProdutoFormData } from '@/types/estoque';
import type { ProdutoCreateInput, ProdutoUpdateInput } from '@/hooks/useEstoqueGeralStore';
import {
  calcPackageConversionFactor as calcAutoFactor,
  formatConversionLabel,
  BASE_UNITS,
  PACKAGE_MEASURE_UNITS,
  PURCHASE_UNITS,
} from '@/lib/unitConversions';

const UNIDADES_BASE: Produto['unidadeMedida'][] = ['KG', 'L', 'UN'];
const UNIDADES_COMPRA = [...PURCHASE_UNITS];

export const emptyProdForm: ProdutoFormData = {
  nomeProduto: '', sku: '', categoria: '', unidadeMedida: 'KG',
  conversoes: '', custoPadrao: 0, fornecedoresPreferenciais: [],
  leadTimeDias: 0, estoqueMinimo: 0, estoqueIdeal: 0, localEstoque: '',
  ativo: true, observacoes: '', unidadeCompra: 'Pacote', fatorConversaoPadrao: 1,
  defaultCostPurchaseUnit: 0, minIdealMode: 'purchase', minPurchaseQty: 0,
  idealPurchaseQty: 0, inactivityDaysThreshold: '', contaNoCmv: true,
  packageQuantity: null, packageMeasureUnit: null, conversionMode: 'manual',
};

function isTenantErrorMessage(msg?: string): boolean {
  if (!msg) return false;
  return /tenant\s*inv[aá]lido|placeholder|empresa\s*n[ãa]o\s*(est[aá]|config)|n[ãa]o\s*vinculad/i.test(msg);
}

interface ProdutoFormPanelProps {
  editProdId: string | null;
  prodForm: ProdutoFormData;
  setProdForm: React.Dispatch<React.SetStateAction<ProdutoFormData>>;
  categorias: string[];
  locais: string[];
  batchMode: boolean;
  setBatchMode: (v: boolean) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onClose: () => void;
  onSave: (created: ProdutoExtended, shouldClose: boolean) => void;
  onUpdate: (shouldClose: boolean) => void;
  addProduto: (p: ProdutoCreateInput) => Promise<ProdutoExtended>;
  updateProduto: (id: string, u: ProdutoUpdateInput) => Promise<void>;
}

export default function ProdutoFormPanel({
  editProdId, prodForm, setProdForm, categorias, locais,
  batchMode, setBatchMode, saving, setSaving,
  onClose, onSave, onUpdate, addProduto, updateProduto,
}: ProdutoFormPanelProps) {
  const prodNameInputRef = useRef<HTMLInputElement>(null);
  const didFocusRef = useRef(false);

  const { isDirty, showConfirm, guardedClose, confirmClose, cancelClose, markClean } =
    useFormDirtyGuard({ current: prodForm, onClose });

  // Focus on mount only
  useEffect(() => {
    if (!didFocusRef.current && prodNameInputRef.current) {
      prodNameInputRef.current.focus();
      didFocusRef.current = true;
    }
  }, []);

  const precoBaseProduto = useMemo(() => {
    const fator = prodForm.fatorConversaoPadrao || 1;
    const costPurchase = prodForm.defaultCostPurchaseUnit || prodForm.custoPadrao || 0;
    return fator > 0 ? costPurchase / fator : 0;
  }, [prodForm.defaultCostPurchaseUnit, prodForm.custoPadrao, prodForm.fatorConversaoPadrao]);

  const handleSaveProduto = async (e: React.FormEvent, closeAfterSave?: boolean) => {
    e.preventDefault();
    const shouldClose = closeAfterSave !== undefined ? closeAfterSave : !(batchMode && !editProdId);
    const trimmedName = prodForm.nomeProduto.trim();
    if (!trimmedName) { toast.error('Nome é obrigatório'); return; }
    if (trimmedName.length > 200) { toast.error('Nome muito longo (máx. 200 caracteres)'); return; }
    if (prodForm.fatorConversaoPadrao <= 0) { toast.error('Fator de conversão deve ser > 0'); return; }

    let minBase = prodForm.estoqueMinimo;
    let idealBase = prodForm.estoqueIdeal;
    const fator = prodForm.fatorConversaoPadrao || 1;
    const purchaseModeEffective = prodForm.minIdealMode === 'purchase'
      && prodForm.unidadeCompra !== prodForm.unidadeMedida
      && fator > 0;
    if (purchaseModeEffective) {
      minBase = prodForm.minPurchaseQty * fator;
      idealBase = prodForm.idealPurchaseQty * fator;
    }
    if (minBase <= 0) { toast.error('Estoque mínimo obrigatório'); return; }
    if (idealBase > 0 && idealBase < minBase) { toast.error('Ideal deve ser maior ou igual ao mínimo.'); return; }
    setSaving(true);
    try {
      const thresholdVal = prodForm.inactivityDaysThreshold === '' ? null : Number(prodForm.inactivityDaysThreshold);
      const savePayload: ProdutoCreateInput = {
        nomeProduto: prodForm.nomeProduto,
        sku: prodForm.sku,
        categoria: prodForm.categoria,
        unidadeMedida: prodForm.unidadeMedida,
        conversoes: prodForm.conversoes,
        custoPadrao: prodForm.custoPadrao,
        fornecedoresPreferenciais: prodForm.fornecedoresPreferenciais,
        leadTimeDias: prodForm.leadTimeDias,
        estoqueMinimo: minBase,
        estoqueIdeal: idealBase,
        localEstoque: prodForm.localEstoque,
        ativo: prodForm.ativo,
        observacoes: prodForm.observacoes,
        unidadeCompra: prodForm.unidadeCompra,
        fatorConversaoPadrao: prodForm.fatorConversaoPadrao,
        defaultCostPurchaseUnit: prodForm.defaultCostPurchaseUnit,
        inactivityDaysThreshold: thresholdVal,
        contaNoCmv: prodForm.contaNoCmv,
        packageQuantity: prodForm.packageQuantity,
        packageMeasureUnit: prodForm.packageMeasureUnit,
        conversionMode: prodForm.conversionMode,
      };

      if (editProdId) {
        await updateProduto(editProdId, savePayload);
        onUpdate(shouldClose);
      } else {
        const created = await addProduto(savePayload);
        onSave(created, shouldClose);
        if (!shouldClose) {
          setProdForm({
            ...emptyProdForm,
            categoria: prodForm.categoria,
            unidadeMedida: prodForm.unidadeMedida,
            unidadeCompra: prodForm.unidadeCompra,
            fatorConversaoPadrao: prodForm.fatorConversaoPadrao,
            localEstoque: prodForm.localEstoque,
            minIdealMode: prodForm.minIdealMode,
            packageQuantity: prodForm.packageQuantity,
            packageMeasureUnit: prodForm.packageMeasureUnit,
            conversionMode: prodForm.conversionMode,
          });
          didFocusRef.current = false;
          setTimeout(() => prodNameInputRef.current?.focus(), 50);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (err instanceof TenantError || isTenantErrorMessage(msg)) {
        toast.error(msg || 'Seu usuário não está vinculado a uma empresa válida.');
      } else {
        toast.error(msg || 'Erro ao salvar produto');
      }
    }
    setSaving(false);
  };

  // Wire up ref for keyboard shortcuts
  const handleSaveRef = useRef<(e: React.FormEvent, close: boolean) => void>(() => {});
  handleSaveRef.current = (e, close) => handleSaveProduto(e, close);

  const handleFormKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); guardedClose(); return; }
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey && !editProdId) {
        handleSaveRef.current(e, false);
      } else {
        handleSaveRef.current(e, true);
      }
    }
  }, [editProdId, guardedClose]);

  return (
    <>
    <form onSubmit={handleSaveProduto} onKeyDown={handleFormKeyDown} className="bg-card border border-border rounded-xl space-y-3 animate-scale-in">
      {/* Sticky header with title + X */}
      <div className="sticky top-0 z-10 bg-card rounded-t-xl border-b border-border px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{editProdId ? 'Editar Produto' : 'Novo Produto'}</h3>
        <button type="button" onClick={guardedClose} aria-label="Fechar" className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-4 pb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-[11px] text-muted-foreground">Nome do Produto *</Label>
          <Input ref={prodNameInputRef} value={prodForm.nomeProduto} onChange={e => setProdForm(f => ({ ...f, nomeProduto: e.target.value }))} className="bg-secondary border-border text-foreground" />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Categoria</Label>
          <SearchableSelect
            value={prodForm.categoria}
            onValueChange={v => setProdForm(f => ({ ...f, categoria: v }))}
            options={categorias.map(c => ({ value: c, label: c }))}
            placeholder="Selecione"
            searchPlaceholder="Buscar categoria..."
            className="bg-secondary border-border text-foreground"
            allowClear={false}
          />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Unidade Base (contábil)</Label>
          <Select value={prodForm.unidadeMedida} onValueChange={v => {
            const newBase = v as Produto['unidadeMedida'];
            const auto = calcAutoFactor(prodForm.packageQuantity, prodForm.packageMeasureUnit, newBase);
            setProdForm(f => ({
              ...f,
              unidadeMedida: newBase,
              ...(auto.isAuto ? { conversionMode: 'auto' as const, fatorConversaoPadrao: auto.factor! } : {}),
            }));
          }}>
            <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>{UNIDADES_BASE.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Unidade de Compra</Label>
          <Select value={prodForm.unidadeCompra} onValueChange={v => setProdForm(f => ({ ...f, unidadeCompra: v }))}>
            <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>{UNIDADES_COMPRA.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Smart Conversion Section */}
        <div className="col-span-2 border border-border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-semibold text-foreground">Fator de Conversão</Label>
            <div className="flex items-center gap-1.5 text-[10px]">
              <button type="button" onClick={() => setProdForm(f => ({ ...f, conversionMode: 'auto' as const }))}
                className={`px-2 py-0.5 rounded font-medium transition-all ${prodForm.conversionMode === 'auto' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                Automático
              </button>
              <button type="button" onClick={() => setProdForm(f => ({ ...f, conversionMode: 'manual' as const }))}
                className={`px-2 py-0.5 rounded font-medium transition-all ${prodForm.conversionMode === 'manual' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                Manual
              </button>
            </div>
          </div>

          {prodForm.conversionMode === 'auto' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Qtd por embalagem</Label>
                  <Input type="number" step="0.01" min="0" value={prodForm.packageQuantity ?? ''} onChange={e => {
                    const qty = parseFloat(e.target.value) || null;
                    const auto = calcAutoFactor(qty, prodForm.packageMeasureUnit, prodForm.unidadeMedida);
                    setProdForm(f => ({
                      ...f,
                      packageQuantity: qty,
                      ...(auto.isAuto && auto.factor ? { fatorConversaoPadrao: auto.factor } : {}),
                    }));
                  }} className="bg-secondary border-border text-foreground" placeholder="Ex: 900" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Medida da embalagem</Label>
                  <Select value={prodForm.packageMeasureUnit || ''} onValueChange={v => {
                    const auto = calcAutoFactor(prodForm.packageQuantity, v, prodForm.unidadeMedida);
                    setProdForm(f => ({
                      ...f,
                      packageMeasureUnit: v,
                      ...(auto.isAuto && auto.factor ? { fatorConversaoPadrao: auto.factor } : {}),
                    }));
                  }}>
                    <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{PACKAGE_MEASURE_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {(() => {
                const auto = calcAutoFactor(prodForm.packageQuantity, prodForm.packageMeasureUnit, prodForm.unidadeMedida);
                if (auto.isAuto && auto.factor !== null) {
                  return (
                    <div className="flex items-center gap-2 text-[11px] text-primary bg-primary/5 border border-primary/20 rounded-md px-3 py-1.5">
                      <span>✓ Fator calculado: <strong>{auto.factor}</strong></span>
                      <span className="text-muted-foreground">
                        ({formatConversionLabel(prodForm.unidadeCompra, prodForm.packageQuantity, prodForm.packageMeasureUnit, auto.factor!, prodForm.unidadeMedida)})
                      </span>
                    </div>
                  );
                }
                if (prodForm.packageQuantity && prodForm.packageMeasureUnit) {
                  return (
                    <div className="text-[11px] text-warning bg-warning/5 border border-warning/20 rounded-md px-3 py-1.5">
                      ⚠ Conversão automática não disponível para {prodForm.packageMeasureUnit} → {prodForm.unidadeMedida}. Use modo manual ou ajuste as unidades.
                    </div>
                  );
                }
                return <p className="text-[10px] text-muted-foreground">Informe a quantidade e medida da embalagem para calcular automaticamente.</p>;
              })()}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div>
                <Label className="text-[10px] text-muted-foreground">Fator de conversão manual (qtd base/embalagem)</Label>
                <Input type="number" step="0.01" min="0.01" value={prodForm.fatorConversaoPadrao || ''} onChange={e => setProdForm(f => ({ ...f, fatorConversaoPadrao: parseFloat(e.target.value) || 0 }))} className="bg-secondary border-border text-foreground" placeholder="Ex: 12 (1 caixa = 12 un)" />
              </div>
              {prodForm.fatorConversaoPadrao > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  1 {prodForm.unidadeCompra} = {prodForm.fatorConversaoPadrao} {prodForm.unidadeMedida}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="col-span-2">
          <Label className="text-[11px] text-muted-foreground">SKU / Código <span className="text-muted-foreground">(auto se vazio)</span></Label>
          <Input value={prodForm.sku} onChange={e => setProdForm(f => ({ ...f, sku: e.target.value }))} className="bg-secondary border-border text-foreground" placeholder="Gerado automaticamente" />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Local</Label>
          <SearchableSelect
            value={prodForm.localEstoque}
            onValueChange={v => setProdForm(f => ({ ...f, localEstoque: v }))}
            options={locais.map(l => ({ value: l, label: l }))}
            placeholder="Selecione"
            searchPlaceholder="Buscar local..."
            className="bg-secondary border-border text-foreground"
            allowClear={false}
          />
        </div>
        {/* Min/Ideal section */}
        <div className="col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-muted-foreground font-semibold">Estoque Mínimo e Ideal</Label>
            {prodForm.unidadeCompra !== prodForm.unidadeMedida && (
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground">Definir em:</span>
                <button type="button"
                  disabled={prodForm.fatorConversaoPadrao <= 0}
                  onClick={() => setProdForm(f => ({ ...f, minIdealMode: 'purchase' }))}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${prodForm.minIdealMode === 'purchase' && prodForm.fatorConversaoPadrao > 0 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'} ${prodForm.fatorConversaoPadrao <= 0 ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  {prodForm.unidadeCompra}
                </button>
                <button type="button" onClick={() => setProdForm(f => ({ ...f, minIdealMode: 'base' }))}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${prodForm.minIdealMode === 'base' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                  {prodForm.unidadeMedida}
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {prodForm.minIdealMode === 'purchase' && prodForm.fatorConversaoPadrao > 0 && prodForm.unidadeCompra !== prodForm.unidadeMedida ? (
              <>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Mínimo ({prodForm.unidadeCompra}) *</Label>
                  <BRLInput numericValue={prodForm.minPurchaseQty} onNumericChange={v => setProdForm(f => ({ ...f, minPurchaseQty: v }))} className="bg-secondary border-border text-foreground" />
                  {prodForm.minPurchaseQty > 0 && (
                    <p className="text-[9px] text-muted-foreground mt-0.5">= {formatFixedBR(prodForm.minPurchaseQty * prodForm.fatorConversaoPadrao, 1)} {prodForm.unidadeMedida}</p>
                  )}
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Ideal ({prodForm.unidadeCompra})</Label>
                  <BRLInput numericValue={prodForm.idealPurchaseQty} onNumericChange={v => setProdForm(f => ({ ...f, idealPurchaseQty: v }))} className="bg-secondary border-border text-foreground" />
                  {prodForm.idealPurchaseQty > 0 && (
                    <p className="text-[9px] text-muted-foreground mt-0.5">= {formatFixedBR(prodForm.idealPurchaseQty * prodForm.fatorConversaoPadrao, 1)} {prodForm.unidadeMedida}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Mínimo ({prodForm.unidadeMedida}) *</Label>
                  <BRLInput numericValue={prodForm.estoqueMinimo} onNumericChange={v => setProdForm(f => ({ ...f, estoqueMinimo: v }))} className="bg-secondary border-border text-foreground" />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Ideal ({prodForm.unidadeMedida})</Label>
                  <BRLInput numericValue={prodForm.estoqueIdeal} onNumericChange={v => setProdForm(f => ({ ...f, estoqueIdeal: v }))} className="bg-secondary border-border text-foreground" />
                </div>
              </>
            )}
          </div>
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Custo por {prodForm.unidadeCompra} (R$)</Label>
          <BRLInput numericValue={prodForm.defaultCostPurchaseUnit} onNumericChange={v => setProdForm(f => ({ ...f, defaultCostPurchaseUnit: v, custoPadrao: v }))} showPrefix className="bg-secondary border-border text-foreground" placeholder={`R$ por ${prodForm.unidadeCompra}`} />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Lead Time (dias)</Label>
          <Input type="number" value={prodForm.leadTimeDias || ''} onChange={e => setProdForm(f => ({ ...f, leadTimeDias: parseInt(e.target.value) || 0 }))} className="bg-secondary border-border text-foreground" />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">⏳ Alerta: sem mov. após (dias)</Label>
          <Input type="number" min="1" step="1" value={prodForm.inactivityDaysThreshold} onChange={e => setProdForm(f => ({ ...f, inactivityDaysThreshold: e.target.value === '' ? '' : parseInt(e.target.value) || '' }))} className="bg-secondary border-border text-foreground" placeholder="Ex: 20 (vazio = desligado)" />
          <p className="text-[9px] text-muted-foreground mt-0.5">Deixe vazio para não alertar</p>
        </div>
        <div className="col-span-2 flex items-center gap-3 py-1">
          <Switch checked={prodForm.contaNoCmv} onCheckedChange={v => setProdForm(f => ({ ...f, contaNoCmv: v }))} id="conta-cmv" />
          <Label htmlFor="conta-cmv" className="text-[11px] text-muted-foreground cursor-pointer">Contar nos relatórios de CMV?</Label>
        </div>
        <div className="col-span-2">
          <Label className="text-[11px] text-muted-foreground">Observações</Label>
          <Input value={prodForm.observacoes} onChange={e => setProdForm(f => ({ ...f, observacoes: e.target.value }))} maxLength={500} className="bg-secondary border-border text-foreground" />
        </div>
        {(prodForm.defaultCostPurchaseUnit > 0 || prodForm.custoPadrao > 0) && prodForm.fatorConversaoPadrao > 0 && (
          <div className="col-span-2 bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1.5">
            <p className="text-[10px] font-semibold text-primary">📌 Custo Atual — Origem: Padrão Inicial</p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">R$ / {prodForm.unidadeCompra}</span>
              <span className="text-xs font-bold text-foreground">{fmtBRL(prodForm.defaultCostPurchaseUnit || prodForm.custoPadrao)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">R$ / {prodForm.unidadeMedida}</span>
              <span className="text-xs font-bold text-primary">{fmtBRL(precoBaseProduto)}</span>
            </div>
            {prodForm.fatorConversaoPadrao >= 1 && prodForm.unidadeCompra !== prodForm.unidadeMedida && (
              <p className="text-[9px] text-muted-foreground">📦 1 {prodForm.unidadeCompra} = {prodForm.fatorConversaoPadrao} {prodForm.unidadeMedida}</p>
            )}
            <p className="text-[8px] text-muted-foreground italic">Usado apenas quando não há histórico de compras.</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {!editProdId && (
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
              <Switch checked={batchMode} onCheckedChange={setBatchMode} className="scale-75" />
              Modo lote
            </label>
          )}
          <span className="text-[9px] text-muted-foreground hidden sm:inline">Ctrl+Enter salvar • Ctrl+Shift+Enter salvar e novo • Esc fechar</span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={guardedClose}>Cancelar</Button>
          {!editProdId && (
            <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={(e) => handleSaveProduto(e, false)}>
              {saving ? 'Salvando...' : 'Salvar e novo'}
            </Button>
          )}
          <Button type="submit" size="sm" className="gradient-salmon text-primary-foreground border-0" disabled={saving}>
            {saving ? 'Salvando...' : editProdId ? 'Atualizar' : batchMode ? 'Salvar e novo' : 'Salvar'}
          </Button>
        </div>
      </div>
      </div>
    </form>
    <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </>
  );
}
