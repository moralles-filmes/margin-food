import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import CmvDecisaoToggle from '@/components/financeiro/cmv/CmvDecisaoToggle';
import { formatarData, type CmvAvisoDecisao, type CmvDecisao } from '@/domain/financeiro/cmv';

interface Props {
  /** Pergunta visível: despesa, banco com o recurso e classificação ativa (ou linha já respondida). */
  mostrarCmv: boolean;
  decisao: CmvDecisao;
  aviso?: CmvAvisoDecisao;
  onDecisao: (incluir: boolean) => void;
  /** Rateio com mais de uma linha: a resposta é por linha, dada no "Ratear". */
  rateio: { total: number; respondidas: number } | null;
  onAbrirRateio: () => void;
  /** Competência própria disponível (despesa e banco com o recurso). */
  permiteCompetencia: boolean;
  /** Data do banco (yyyy-MM-dd): é a competência quando nada é informado. */
  dataBanco: string;
  competencia: string | undefined;
  onCompetencia: (competencia: string | undefined) => void;
  /** Descrição da linha, para os rótulos acessíveis. */
  rotulo: string;
}

/**
 * Decisão do CMV financeiro e competência de uma linha do extrato que vira despesa
 * nova. A data do banco nunca muda: a competência só muda o período (DRE e CMV).
 */
export default function ConciliacaoLinhaCmv({
  mostrarCmv, decisao, aviso, onDecisao, rateio, onAbrirRateio,
  permiteCompetencia, dataBanco, competencia, onCompetencia, rotulo,
}: Props) {
  const id = useId();
  const [editando, setEditando] = useState(false);
  if (!mostrarCmv && !permiteCompetencia) return null;
  // A data só aparece quando difere da data do banco: sem ajuste, o botão é só "Competência".
  const propria = competencia && competencia !== dataBanco ? competencia : null;
  const link = 'rounded text-left text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      {mostrarCmv && (rateio ? (
        <button type="button" onClick={onAbrirRateio} className={link}>
          CMV: {rateio.respondidas} de {rateio.total} linhas do rateio respondidas
        </button>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Aparecer no CMV?</span>
          <CmvDecisaoToggle size="sm" value={decisao} onChange={onDecisao} label={`Aparecer no CMV financeiro? — ${rotulo}`} />
          {aviso === 'redefinido' && <span className="text-warning">Categoria trocada: confira.</span>}
        </span>
      ))}
      {permiteCompetencia && (editando ? (
        <span className="inline-flex items-center gap-1.5">
          <Label htmlFor={`${id}-competencia`} className="text-xs text-muted-foreground">Competência</Label>
          <DateInput
            id={`${id}-competencia`}
            value={competencia ?? dataBanco}
            onValueChange={v => onCompetencia(v && v !== dataBanco ? v : undefined)}
            className="h-7 w-[9.5rem] text-xs"
          />
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditando(false)}>OK</Button>
        </span>
      ) : (
        <button type="button" onClick={() => setEditando(true)} className={link} aria-label={`Alterar a competência de ${rotulo}`}>
          Competência{propria ? `: ${formatarData(propria)} (ajustada)` : ''}
        </button>
      ))}
    </div>
  );
}
