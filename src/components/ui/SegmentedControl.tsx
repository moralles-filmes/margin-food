import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedControlOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** nome do grupo para o leitor de tela quando não há rótulo visível associado */
  ariaLabel?: string;
  /**
   * Setas só movem o foco; Enter/Espaço escolhem. Para quando trocar de opção desmonta uma tela com
   * trabalho em andamento (ex.: Livro Razão ⇄ Conciliação Bancária) — uma seta acidental não pode
   * descartar o extrato importado.
   */
  manualActivation?: boolean;
}

export function SegmentedControl({ options, value, onChange, className, ariaLabel, manualActivation = false }: SegmentedControlProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Sem opção escolhida (ex.: forma de venda de uma marca nova), a primeira entra no Tab — senão
  // o grupo inteiro ficava fora do teclado.
  const temAtivo = options.some(option => option.value === value);

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % options.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + options.length) % options.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = options.length - 1;

    if (nextIndex !== null) {
      e.preventDefault();
      if (!manualActivation) onChange(options[nextIndex].value);
      buttonRefs.current[nextIndex]?.focus();
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-0.5 rounded-lg bg-muted p-1', className)}
    >
      {options.map((option, index) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            ref={el => { buttonRefs.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive || (!temAtivo && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={e => handleKeyDown(e, index)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-center transition-colors',
              // Pílula clara com texto azul (prancha 07): o azul cheio fica para a sidebar e a ação principal.
              isActive
                ? 'bg-segmented-active text-primary-ink shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {/* O peso maior marca o ativo sem depender só da cor; a cópia invisível em negrito
                reserva a largura para o controle não mudar de tamanho ao trocar de opção. */}
            <span className="inline-grid">
              <span aria-hidden="true" className="invisible col-start-1 row-start-1 font-semibold">{option.label}</span>
              <span className={cn('col-start-1 row-start-1', isActive && 'font-semibold')}>{option.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
