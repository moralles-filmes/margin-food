import {
  TrendingDown, TrendingUp, DollarSign, Calculator, Percent, PieChart, BarChart3,
} from 'lucide-react';
import type { CmvResult } from './types';
import { fmtBRL } from '@/lib/money';
import { formatPercentBR } from '@/lib/formatters';
import KpiCard from '@/components/ui/KpiCard';
import type { KpiVariant } from '@/components/ui/KpiCard';

const fmtPct = (v: number) => formatPercentBR(v);

const STATUS_TO_VARIANT: Record<string, KpiVariant> = {
  ok: 'primary', warning: 'warning', danger: 'danger', neutral: 'default',
};

interface CmvKpisProps {
  cmvData: CmvResult;
  getMetaStatus: (valor: number, metaVal: number) => string;
  metaGeralVal?: number;
  metaSalmaoVal?: number;
  metaTotalVal?: number;
}

export default function CmvKpis({ cmvData, getMetaStatus, metaGeralVal, metaSalmaoVal, metaTotalVal }: CmvKpisProps) {
  const s1 = metaGeralVal !== undefined ? getMetaStatus(cmvData.cmvGeralPct, metaGeralVal) : 'neutral';
  const s2 = metaSalmaoVal !== undefined ? getMetaStatus(cmvData.cmvSalmaoPct, metaSalmaoVal) : 'neutral';
  const s3 = metaTotalVal !== undefined ? getMetaStatus(cmvData.cmvTotalPct, metaTotalVal) : 'neutral';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard label="CMV Geral" value={fmtPct(cmvData.cmvGeralPct)} icon={Percent} variant={STATUS_TO_VARIANT[s1] ?? 'default'} />
      <KpiCard label="CMV Salmão" value={fmtPct(cmvData.cmvSalmaoPct)} icon={TrendingDown} variant={STATUS_TO_VARIANT[s2] ?? 'default'} />
      <KpiCard label="CMV Total" value={fmtPct(cmvData.cmvTotalPct)} icon={Calculator} variant={STATUS_TO_VARIANT[s3] ?? 'default'} />
      <KpiCard label="Margem Bruta" value={fmtPct(cmvData.margemBruta)} icon={TrendingUp} />
      <KpiCard label="Custo Consumido" value={fmtBRL(cmvData.custoTotal)} icon={DollarSign} />
      <KpiCard label="Faturamento" value={fmtBRL(cmvData.faturamento)} icon={DollarSign} variant="primary" />
      <KpiCard label="Impacto Salmão" value={fmtPct(cmvData.impactoSalmao)} icon={PieChart} />
      <KpiCard label={`Método: ${cmvData.metodoUsado === 'ledger' ? 'Ledger' : 'Inventário'}`} value={cmvData.metodoUsado === 'inventario' ? `EI: ${fmtBRL(cmvData.eiValor)}` : '—'} icon={BarChart3} />
    </div>
  );
}
