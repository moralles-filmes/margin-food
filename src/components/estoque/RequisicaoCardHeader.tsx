import { ChevronDown, ChevronUp } from 'lucide-react';
import { parseUTCToBR } from '@/lib/datetime';
import { requisicaoStatusLabel, requisicaoStatusStyle } from '@/domain/estoque/requisitionStatus';

interface Props {
  req: {
    setor: string;
    created_at: string;
    status: string;
    confirmado_pelo_solicitante_em: string | null;
    requisicao_estoque_itens: { status: string }[];
  };
  expanded: boolean;
  onToggle: () => void;
}

export default function RequisicaoCardHeader({ req, expanded, onToggle }: Props) {
  const items = req.requisicao_estoque_itens || [];
  const attended = items.filter(item => item.status === 'ATENDIDO').length;
  const rejected = items.filter(item => item.status === 'RECUSADO').length;
  return (
    <button type="button" aria-expanded={expanded} onClick={onToggle} className="flex w-full min-w-0 items-start gap-3 p-4 text-left">
      <div className="min-w-0 flex-1 space-y-2 break-words">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="min-w-0 text-base font-semibold text-foreground">{req.setor}</span>
          <span className="text-sm text-muted-foreground">{parseUTCToBR(req.created_at)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>{items.length} itens</span>
          {attended > 0 && <span className="text-success">• {attended} atendido{attended > 1 ? 's' : ''}</span>}
          {rejected > 0 && <span className="text-destructive">• {rejected} recusado{rejected > 1 ? 's' : ''}</span>}
          <span className={`rounded-full px-2 py-1 text-sm font-medium ${requisicaoStatusStyle(req.status)}`}>{requisicaoStatusLabel(req.status)}</span>
          {['ATENDIDA', 'PARCIALMENTE_ATENDIDA', 'NEGADA'].includes(req.status) && (
            <span className={`rounded-full border px-2 py-1 text-sm ${req.confirmado_pelo_solicitante_em ? 'border-success-border text-success' : 'border-warning-border text-warning'}`}>
              {req.confirmado_pelo_solicitante_em ? '✓ Visto' : '⏱ Aguardando'}
            </span>
          )}
        </div>
      </div>
      {expanded ? <ChevronUp className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" /> : <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />}
    </button>
  );
}
