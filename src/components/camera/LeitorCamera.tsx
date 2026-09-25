import { Flashlight, FlashlightOff, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLeitorCamera } from '@/hooks/useLeitorCamera';
import { MENSAGEM_ERRO_CAMERA, MIRA_CAMERA } from '@/domain/estoque/leituraCamera';

interface Props {
  /** Não analisa a imagem (produto sendo buscado, ou a tela fora do passo de leitura). */
  pausado: boolean;
  /** Tela fora do passo de leitura (ex.: quantidade): esconde a câmera, que segue ligada para voltar rápido. */
  oculto: boolean;
  onCodigo: (codigo: string) => void;
  onFechar: () => void;
}

/**
 * Imagem da câmera traseira com moldura de mira, lanterna, zoom e fechar.
 * Compartilhado pela Contagem via Código (Inventário) e pela Movimentação Operacional.
 */
export default function LeitorCamera({ pausado, oculto, onCodigo, onFechar }: Props) {
  const { estado, videoRef, lanterna, zoom, aviso } = useLeitorCamera({ pausado, onCodigo, onEncerrada: onFechar });

  if (estado.fase === 'erro') {
    return (
      <div role="alert" className="space-y-3 rounded-2xl border border-destructive-border bg-destructive-soft p-4">
        <p className="text-sm font-medium text-foreground">{MENSAGEM_ERRO_CAMERA[estado.erro]}</p>
        <Button type="button" variant="outline" className="h-12 w-full gap-1.5" onClick={onFechar}>
          <X className="h-4 w-4" /> Fechar câmera
        </Button>
      </div>
    );
  }

  return (
    <div className={oculto ? 'hidden' : 'space-y-2'}>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Imagem da câmera"
          className="aspect-[4/3] max-h-[45vh] w-full object-cover"
        />
        {/* Só vale o código com o centro dentro desta moldura (dentroDaMira). */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-primary"
          style={{ width: `${MIRA_CAMERA.largura * 100}%`, height: `${MIRA_CAMERA.altura * 100}%` }}
        />
        {estado.fase === 'iniciando' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Abrindo câmera…</p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {lanterna.disponivel && (
          <Button
            type="button"
            variant="outline"
            className="h-12 w-12 shrink-0"
            onClick={lanterna.alternar}
            aria-pressed={lanterna.ligada}
            aria-label="Lanterna"
          >
            {lanterna.ligada ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
          </Button>
        )}
        {zoom.disponivel && (
          <Button
            type="button"
            variant="outline"
            className="h-12 w-12 shrink-0 font-semibold"
            onClick={zoom.alternar}
            aria-pressed={zoom.ativo}
            aria-label="Zoom 2x"
          >
            2x
          </Button>
        )}
        <Button type="button" variant="outline" className="h-12 flex-1 gap-1.5" onClick={onFechar}>
          <X className="h-4 w-4" /> Fechar câmera
        </Button>
      </div>
      {aviso && (
        <p role="status" className="rounded-lg border border-warning-border bg-warning-soft p-2 text-sm font-medium text-foreground">
          {aviso}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Centralize o código de barras na moldura. Se não focar, afaste um pouco o aparelho.
      </p>
    </div>
  );
}
