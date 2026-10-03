import { cn } from '@/lib/utils';
import type { CmvDecisao } from '@/domain/financeiro/cmv';

interface Props {
  value: CmvDecisao;
  onChange: (value: boolean) => void;
  /** Nome acessível do grupo, ex.: "Aparecer no CMV financeiro? — Peixes". */
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Decisão explícita Sim/Não. Sem valor, nenhuma opção fica marcada: a pendência
 * aparece como pendência, nunca como "Não" disfarçado (por isso não é um Switch).
 */
export default function CmvDecisaoToggle({ value, onChange, label, disabled, size = 'md', className }: Props) {
  const opcoes: { valor: boolean; texto: string }[] = [
    { valor: true, texto: 'Sim' },
    { valor: false, texto: 'Não' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex rounded-lg border bg-card p-0.5',
        value === null ? 'border-warning-border' : 'border-border',
        className,
      )}
    >
      {opcoes.map(opcao => {
        const marcado = value === opcao.valor;
        return (
          <button
            key={opcao.texto}
            type="button"
            role="radio"
            aria-checked={marcado}
            disabled={disabled}
            onClick={() => onChange(opcao.valor)}
            className={cn(
              'rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60',
              size === 'sm' ? 'min-w-[2.75rem] px-2 py-1 text-xs' : 'min-w-[3.25rem] px-3 py-1.5 text-sm',
              marcado && opcao.valor && 'bg-primary-strong text-primary-strong-foreground',
              marcado && !opcao.valor && 'bg-neutral text-background',
              !marcado && 'text-muted-foreground hover:bg-muted',
            )}
          >
            {opcao.texto}
          </button>
        );
      })}
    </div>
  );
}
