import { SalmonEntry, MetaCompraMensal } from '@/types/salmon';
import { useMetaMensal } from './MetaCompraCard';
import { TrendingUp } from 'lucide-react';
import { fmtBRL } from '@/lib/money';

const fmtR = fmtBRL;

interface Props {
  entries: SalmonEntry[];
  metasCompra: MetaCompraMensal[];
  targetMonth: string;
  categoria?: string;
  /** Server-side gasto — overrides client-side if provided */
  serverGasto?: number;
}

export default function PlanningProjecaoCard({ entries, metasCompra, targetMonth, categoria = 'salmao', serverGasto }: Props) {
  const { meta, projecao } = useMetaMensal(entries, metasCompra, targetMonth, categoria);
  // Override gastoMes with server value if available
  const effectiveGasto = serverGasto !== undefined ? serverGasto : projecao.gastoMes;
  if (!meta) return (
    <div className="bg-card border border-border rounded-xl p-4 text-center">
      <p className="text-xs text-muted-foreground">Configure a meta do mês para ver a projeção.</p>
    </div>
  );

  const statusCfg = {
    boa: { color: 'text-success', label: '✅ OK' },
    perto: { color: 'text-warning', label: '⚠️ Atenção' },
    estourado: { color: 'text-destructive', label: '❌ Estourado' },
  };
  const st = statusCfg[projecao.statusProjecao];

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-fade-up">
      <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
        <TrendingUp className="w-3.5 h-3.5 text-primary" /> Projeção Mensal (Base Semanal)
      </p>
      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <div>
          <p className="text-[10px] text-muted-foreground">Gasto até agora</p>
          <p className="text-base font-display font-bold text-foreground">{fmtR(effectiveGasto)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Média semanal</p>
          <p className="text-base font-display font-bold text-foreground">{fmtR(projecao.mediaSemanal)}/sem</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Projeção fim do mês</p>
          <p className={`text-base font-display font-bold ${st.color}`}>{fmtR(projecao.projecaoFimMes)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Meta</p>
          <p className="text-base font-display font-bold text-foreground">{fmtR(meta.metaValorCompra)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <span className={`text-xs font-bold ${st.color}`}>{st.label}</span>
        <span className={`text-xs font-bold ${projecao.difMeta >= 0 ? 'text-success' : 'text-destructive'}`}>
          {projecao.difMeta >= 0 ? `Tende a sobrar ${fmtR(projecao.difMeta)}` : `Tende a estourar ${fmtR(Math.abs(projecao.difMeta))}`}
        </span>
      </div>
      {/* Ritmo Ideal Semanal */}
      {!projecao.mesEncerrado && (
        <div className="pt-1 border-t border-border/50 space-y-1">
          {projecao.metaEstourada ? (
            <p className="text-[11px] text-destructive font-medium">❌ Meta já estourada. Ajuste a meta ou pause compras.</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Ritmo ideal semanal</span>
                <span className="text-success font-bold">{fmtR(projecao.ritmoIdealSemanal)}/sem</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Ritmo atual</span>
                <span className={`font-bold ${projecao.mediaSemanal <= projecao.ritmoIdealSemanal ? 'text-success' : 'text-warning'}`}>
                  {fmtR(projecao.mediaSemanal)}/sem {projecao.mediaSemanal <= projecao.ritmoIdealSemanal ? '✅' : '⚠️'}
                </span>
              </div>
              <p className="text-[9px] text-success italic">
                Gaste até {fmtR(projecao.ritmoIdealSemanal)} por semana nas próximas {projecao.semanasRestantes} semana(s) para fechar dentro da meta.
              </p>
            </>
          )}
        </div>
      )}
      <p className="text-[9px] text-muted-foreground italic">
        Projeção baseada no ritmo semanal atual ({projecao.semanasDecorridas} de {projecao.semanasNoMes} semanas).
      </p>
    </div>
  );
}
