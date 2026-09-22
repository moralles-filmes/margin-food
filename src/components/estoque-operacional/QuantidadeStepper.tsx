import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ajustarQuantidade, formatarQuantidade } from '@/domain/estoque/operacional';

interface Props {
  /** Texto cru do campo — o operador pode estar no meio da digitação. */
  valorTexto: string;
  onValorTextoChange: (texto: string) => void;
  /** Número já parseado, ou null enquanto o texto não for utilizável. */
  valor: number | null;
  unidade: string;
  erro?: string;
  disabled?: boolean;
}

/**
 * Campo de quantidade otimizado para quem está em pé, de luva, perto do estoque:
 * alvos de toque grandes ([-] e [+] com 56px) e o número em fonte grande no meio,
 * ainda assim editável por digitação direta para lançamento em volume.
 */
export default function QuantidadeStepper({
  valorTexto, onValorTextoChange, valor, unidade, erro, disabled,
}: Props) {
  const aplicarDelta = (delta: number) => {
    const proximo = ajustarQuantidade(valor, delta);
    onValorTextoChange(formatarQuantidade(proximo));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-14 w-14 shrink-0 rounded-xl"
          onClick={() => aplicarDelta(-1)}
          disabled={disabled}
          aria-label="Diminuir quantidade"
        >
          <Minus className="h-6 w-6" />
        </Button>

        <div className="relative flex-1">
          <Input
            type="text"
            inputMode="decimal"
            value={valorTexto}
            onChange={e => onValorTextoChange(e.target.value)}
            onFocus={e => e.target.select()}
            disabled={disabled}
            aria-label="Quantidade"
            aria-invalid={!!erro}
            className="h-14 text-center text-2xl font-bold tabular-nums"
          />
          {unidade && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
              {unidade}
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-14 w-14 shrink-0 rounded-xl"
          onClick={() => aplicarDelta(1)}
          disabled={disabled}
          aria-label="Aumentar quantidade"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>

      {erro && <p className="text-sm font-medium text-destructive">{erro}</p>}
    </div>
  );
}
