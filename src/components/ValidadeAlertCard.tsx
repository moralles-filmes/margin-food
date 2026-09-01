import { Clock, ShieldAlert } from 'lucide-react';
import { LoteSalmaoLimpo } from '@/types/salmon';
import { fmtBRL, formatDateValueBR, formatFixedBR } from '@/lib/formatters';

interface Props {
  lotesLimpos: LoteSalmaoLimpo[];
  onPrioritize?: (manipulacaoId: string) => void;
}

export default function ValidadeAlertCard({ lotesLimpos, onPrioritize }: Props) {
  const vencidos = lotesLimpos.filter(l => l.status === 'VENCIDO');
  const venceHoje = lotesLimpos.filter(l => l.status === 'VENCE_HOJE');
  const emRisco = [...vencidos, ...venceHoje];

  if (emRisco.length === 0) return null;

  const kgRisco = emRisco.reduce((s, l) => s + l.kgRestante, 0);
  const valorRisco = emRisco.reduce((s, l) => s + l.kgRestante * l.custoKg, 0);
  const totalClean = lotesLimpos.reduce((s, l) => s + l.kgRestante, 0);
  const pctRisco = totalClean > 0 ? (kgRisco / totalClean) * 100 : 0;

  return (
    <div className="bg-destructive/5 border border-destructive/30 rounded-xl p-4 space-y-3 animate-scale-in">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-destructive/15 flex items-center justify-center">
          <ShieldAlert className="w-4 h-4 text-destructive" />
        </div>
        <div>
          <p className="text-sm font-semibold text-destructive">⚠️ Alertas de Validade</p>
          <p className="text-[10px] text-muted-foreground">{emRisco.length} lote(s) em risco</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-lg p-2.5">
          <p className="text-[10px] text-muted-foreground">Kg em risco</p>
          <p className="text-lg font-display font-bold text-destructive">{formatFixedBR(kgRisco, 1)} kg</p>
          <p className="text-[10px] text-muted-foreground">{formatFixedBR(pctRisco, 0)}% do estoque limpo</p>
        </div>
        <div className="bg-card rounded-lg p-2.5">
          <p className="text-[10px] text-muted-foreground">R$ em risco</p>
          <p className="text-lg font-display font-bold text-destructive">{fmtBRL(valorRisco)}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {vencidos.length > 0 && (
          <div>
            <p className="text-[10px] text-destructive font-medium mb-1">❌ Vencidos ({vencidos.length})</p>
            {vencidos.map(l => (
              <div key={l.manipulacaoId} className="flex items-center justify-between bg-card rounded-lg p-2 mb-1">
                <div className="text-[11px]">
                  <span className="font-medium text-foreground">{l.lote || '—'}</span>
                  <span className="text-muted-foreground ml-2">{formatFixedBR(l.kgRestante, 1)} kg</span>
                  <span className="text-destructive ml-2">Val: {formatDateValueBR(l.dataValidade)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {venceHoje.length > 0 && (
          <div>
            <p className="text-[10px] text-warning font-medium mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Vence hoje/amanhã ({venceHoje.length})
            </p>
            {venceHoje.map(l => (
              <div key={l.manipulacaoId} className="flex items-center justify-between bg-card rounded-lg p-2 mb-1">
                <div className="text-[11px]">
                  <span className="font-medium text-foreground">{l.lote || '—'}</span>
                  <span className="text-muted-foreground ml-2">{formatFixedBR(l.kgRestante, 1)} kg</span>
                  <span className="text-warning ml-2">Val: {formatDateValueBR(l.dataValidade)}</span>
                </div>
                {onPrioritize && (
                  <button
                    onClick={() => onPrioritize(l.manipulacaoId)}
                    className="text-[9px] px-2 py-0.5 rounded bg-warning/10 text-warning hover:bg-warning/20"
                  >
                    Priorizar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
