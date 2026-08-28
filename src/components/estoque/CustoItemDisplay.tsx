import { useState } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { TrendingUp, TrendingDown, Calendar, Truck, Info } from 'lucide-react';
import { fmtBRL, formatDecimalBR, formatDateBR } from '@/lib/formatters';
import type { ProdutoExtended } from '@/types/estoque';

const fmt = (v: number) => fmtBRL(v);

type CostOrigin = 'padrao' | 'ultima' | 'media30';

export function getCostOrigin(p: ProdutoExtended): CostOrigin {
  if ((p.avg30CostBaseUnit ?? 0) > 0) return 'media30';
  if ((p.lastCostBaseUnit ?? 0) > 0) return 'ultima';
  return 'padrao';
}

export function getCostLabel(origin: CostOrigin): string {
  switch (origin) {
    case 'media30': return 'Média 30 dias';
    case 'ultima': return 'Última Compra';
    default: return 'Padrão Inicial';
  }
}

export function getActiveCostBase(p: ProdutoExtended, mode?: CostOrigin): number {
  const origin = mode || getCostOrigin(p);
  switch (origin) {
    case 'media30': return p.avg30CostBaseUnit ?? 0;
    case 'ultima': return p.lastCostBaseUnit ?? 0;
    default: {
      const def = p.defaultCostBaseUnit ?? 0;
      if (def > 0) return def;
      const fator = p.fatorConversaoPadrao ?? 1;
      return p.custoPadrao > 0 && fator > 0 ? p.custoPadrao / fator : 0;
    }
  }
}

export function getActiveCostPurchase(p: ProdutoExtended, mode?: CostOrigin): number {
  const origin = mode || getCostOrigin(p);
  switch (origin) {
    case 'media30': return p.avg30CostPurchaseUnit ?? 0;
    case 'ultima': return p.lastCostPurchaseUnit ?? 0;
    default: {
      const def = p.defaultCostPurchaseUnit ?? 0;
      if (def > 0) return def;
      return p.custoPadrao ?? 0;
    }
  }
}

interface CustoItemDisplayProps {
  produto: ProdutoExtended;
  saldoBase: number;
  showSelector?: boolean;
  compact?: boolean;
}

export default function CustoItemDisplay({ produto: p, saldoBase, showSelector = false, compact = false }: CustoItemDisplayProps) {
  const [viewMode, setViewMode] = useState<CostOrigin>(() => getCostOrigin(p));
  const fator = p.fatorConversaoPadrao ?? 1;
  const unCompra = p.unidadeCompra ?? p.unidadeMedida;
  const showDual = unCompra !== p.unidadeMedida;

  const hasLastCost = (p.lastCostBaseUnit ?? 0) > 0;
  const hasAvg30 = (p.avg30CostBaseUnit ?? 0) > 0;
  const hasDefault = (p.defaultCostBaseUnit ?? 0) > 0 || (p.defaultCostPurchaseUnit ?? 0) > 0;

  const origin = getCostOrigin(p);
  const activeCostBase = getActiveCostBase(p, viewMode);
  const activeCostPurchase = getActiveCostPurchase(p, viewMode);

  const saldoPurchase = fator > 0 ? saldoBase / fator : saldoBase;
  const stockValue = saldoBase * activeCostBase;

  const variation = p.avg30VariationPercent ?? 0;

  if (compact) {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary-soft text-primary-soft-foreground font-medium">
            {getCostLabel(origin)}
          </span>
        </div>
        <p className="text-xs font-semibold text-foreground">
          {fmt(activeCostBase)}/{p.unidadeMedida}
          {showDual && <span className="text-muted-foreground font-normal"> | {fmt(activeCostPurchase)}/{unCompra}</span>}
        </p>
        {showDual && (
          <p className="text-[9px] text-muted-foreground">
            {formatDecimalBR(saldoPurchase, 1)} {unCompra} ({formatDecimalBR(saldoBase, 1)} {p.unidadeMedida})
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header with origin */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-foreground">📌 Custo Atual</span>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary-soft text-primary-soft-foreground font-medium">
            Origem: {getCostLabel(origin)}
          </span>
        </div>
        {p.needsCostReview && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-warning-soft text-warning font-medium">⚠️ Revisar</span>
        )}
      </div>

      {/* Conversion block */}
      {showDual && (
        <div className="bg-background-subtle rounded-lg px-3 py-2 flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">📦 Conversão</span>
          <span className="font-semibold text-foreground">1 {unCompra} = {fator} {p.unidadeMedida}</span>
        </div>
      )}

      {/* Cost blocks */}
      <div className="grid gap-2">
        {/* A) Last Purchase */}
        {hasLastCost && (
          <div className={`rounded-lg border p-2.5 space-y-1 ${viewMode === 'ultima' ? 'border-primary-border bg-primary-soft' : 'border-border bg-card'}`}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-foreground">🛒 Última Compra</p>
              {p.lastPurchaseDate && (
                <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {formatDateBR(new Date(p.lastPurchaseDate))}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[9px] text-muted-foreground">R$ / {p.unidadeMedida}</p>
                <p className="text-sm font-bold text-foreground">{fmt(p.lastCostBaseUnit!)}</p>
              </div>
              {showDual && (
                <div>
                  <p className="text-[9px] text-muted-foreground">R$ / {unCompra}</p>
                  <p className="text-sm font-bold text-foreground">{fmt(p.lastCostPurchaseUnit!)}</p>
                </div>
              )}
            </div>
            {p.lastSupplier && (
              <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                <Truck className="w-3 h-3" /> {p.lastSupplier}
              </p>
            )}
          </div>
        )}

        {/* B) Average 30 days */}
        {hasAvg30 && (
          <div className={`rounded-lg border p-2.5 space-y-1 ${viewMode === 'media30' ? 'border-primary-border bg-primary-soft' : 'border-border bg-card'}`}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-foreground">📊 Média 30 dias</p>
              {variation !== 0 && (
                <span className={`text-[9px] font-medium flex items-center gap-0.5 ${variation > 0 ? 'text-destructive' : 'text-success'}`}>
                  {variation > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {variation > 0 ? '+' : ''}{formatDecimalBR(variation, 1)}% vs última
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[9px] text-muted-foreground">R$ / {p.unidadeMedida}</p>
                <p className="text-sm font-bold text-foreground">{fmt(p.avg30CostBaseUnit!)}</p>
              </div>
              {showDual && (
                <div>
                  <p className="text-[9px] text-muted-foreground">R$ / {unCompra}</p>
                  <p className="text-sm font-bold text-foreground">{fmt(p.avg30CostPurchaseUnit!)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* C) Default cost */}
        {hasDefault && (
          <div className={`rounded-lg border p-2.5 space-y-1 ${viewMode === 'padrao' ? 'border-primary-border bg-primary-soft' : 'border-border bg-card'}`}>
            <p className="text-[10px] font-semibold text-foreground">📋 Custo Padrão Inicial</p>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[9px] text-muted-foreground">R$ / {p.unidadeMedida}</p>
                <p className="text-sm font-bold text-foreground">
                  {fmt(p.defaultCostBaseUnit ?? (p.custoPadrao > 0 && fator > 0 ? p.custoPadrao / fator : 0))}
                </p>
              </div>
              {showDual && (
                <div>
                  <p className="text-[9px] text-muted-foreground">R$ / {unCompra}</p>
                  <p className="text-sm font-bold text-foreground">{fmt(p.defaultCostPurchaseUnit ?? p.custoPadrao ?? 0)}</p>
                </div>
              )}
            </div>
            {!hasLastCost && !hasAvg30 && (
              <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" /> Usado apenas quando não há histórico de compras.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Stock value */}
      <div className="bg-background-subtle rounded-lg px-3 py-2 space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Estoque atual</span>
          <span className="font-semibold text-foreground">
            {showDual ? `${formatDecimalBR(saldoPurchase, 1)} ${unCompra} (${formatDecimalBR(saldoBase, 1)} ${p.unidadeMedida})` : `${formatDecimalBR(saldoBase, Number.isInteger(saldoBase) ? 0 : 1)} ${p.unidadeMedida}`}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Valor em estoque</span>
          <span className="font-bold text-foreground">{fmt(stockValue)}</span>
        </div>
        <p className="text-[8px] text-muted-foreground">📌 Avaliado por: {getCostLabel(viewMode)}</p>
      </div>

      {/* Rules */}
      <div className="text-[8px] text-muted-foreground space-y-0.5 pl-1">
        <p>📌 Estoque avaliado por: Média 30 dias</p>
        <p>📌 Ficha técnica por: Última compra</p>
      </div>

      {/* Audit selector */}
      {showSelector && (
        <div className="border border-border rounded-lg p-2.5 space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground">🔁 Exibir estoque avaliado por:</p>
          <RadioGroup value={viewMode} onValueChange={v => setViewMode(v as CostOrigin)} className="flex items-center gap-3">
            {hasAvg30 && (
              <div className="flex items-center gap-1">
                <RadioGroupItem value="media30" id="mode-avg" />
                <Label htmlFor="mode-avg" className="text-[10px] cursor-pointer">Média 30d</Label>
              </div>
            )}
            {hasLastCost && (
              <div className="flex items-center gap-1">
                <RadioGroupItem value="ultima" id="mode-last" />
                <Label htmlFor="mode-last" className="text-[10px] cursor-pointer">Última compra</Label>
              </div>
            )}
            <div className="flex items-center gap-1">
              <RadioGroupItem value="padrao" id="mode-default" />
              <Label htmlFor="mode-default" className="text-[10px] cursor-pointer">Padrão inicial</Label>
            </div>
          </RadioGroup>
        </div>
      )}
    </div>
  );
}
