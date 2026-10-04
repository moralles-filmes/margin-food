import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Wallet } from 'lucide-react';
import KpiCard, { type KpiVariant } from './KpiCard';

// Classes que o card compacto tinha antes do Redesign V2. Os 30 arquivos consumidores não passam
// `appearance`, então qualquer diferença aqui muda telas que não foram revisadas.
const LEGACY: Record<KpiVariant, { border: string; iconBg: string; iconColor: string }> = {
  default: { border: 'border-border', iconBg: 'bg-secondary', iconColor: 'text-muted-foreground' },
  primary: { border: 'border-primary-border', iconBg: 'bg-primary-soft', iconColor: 'text-primary-ink' },
  success: { border: 'border-success-border', iconBg: 'bg-success-soft', iconColor: 'text-success' },
  warning: { border: 'border-warning-border', iconBg: 'bg-warning-soft', iconColor: 'text-warning' },
  danger: { border: 'border-destructive-border', iconBg: 'bg-destructive-soft', iconColor: 'text-destructive' },
  gold: { border: 'border-warning-border', iconBg: 'bg-warning-soft', iconColor: 'text-warning' },
};
const VARIANTS = Object.keys(LEGACY) as KpiVariant[];
const delta = { label: 'vs. período anterior', formatted: '+12,4%', direction: 'up', tone: 'positive' } as const;

const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).sort();

describe('KpiCard sem appearance (consumidores existentes)', () => {
  it.each(VARIANTS)('variant %s mantém exatamente as classes de antes', (variant) => {
    const { container } = render(
      <KpiCard label="Rótulo" value="R$1.234,56" sub="Apoio" icon={Wallet} variant={variant} delta={delta} />,
    );
    const card = container.firstElementChild!;
    const legacy = LEGACY[variant];

    expect(classes(card)).toEqual(
      ['bg-card', 'rounded-xl', 'p-4', 'border', 'transition-colors', 'animate-fade-up', legacy.border].sort(),
    );
    expect(classes(screen.getByText('Rótulo'))).toEqual(
      ['text-[11px]', 'text-muted-foreground', 'font-medium', 'uppercase', 'tracking-wider', 'leading-tight'].sort(),
    );
    expect(classes(screen.getByText('R$1.234,56'))).toEqual(
      ['text-xl', 'font-display', 'font-bold', 'text-foreground', 'leading-tight'].sort(),
    );
    expect(classes(screen.getByText('Apoio'))).toEqual(
      ['text-[11px]', 'text-muted-foreground', 'mt-1', 'leading-tight'].sort(),
    );
    const iconBox = card.querySelector('svg')!.parentElement!;
    expect(classes(iconBox)).toEqual(
      ['w-8', 'h-8', 'rounded-lg', 'flex', 'items-center', 'justify-center', 'shrink-0', legacy.iconBg].sort(),
    );
    expect(card.querySelector('svg')).toHaveClass('w-4', 'h-4', legacy.iconColor);
    expect(classes(screen.getByText('+12,4%'))).toEqual(
      ['inline-flex', 'items-center', 'gap-0.5', 'text-[11px]', 'font-semibold', 'leading-tight', 'text-success'].sort(),
    );
    expect(classes(screen.getByText('vs. período anterior').parentElement)).toEqual(
      ['mt-2', 'pt-2', 'border-t', 'border-border', 'flex', 'items-center', 'justify-between', 'gap-2'].sort(),
    );
    expect(card.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('appearance="default" explícito é igual a omitir a prop', () => {
    const a = render(<KpiCard label="A" value="1" sub="s" icon={Wallet} variant="primary" delta={delta} />);
    const b = render(<KpiCard label="A" value="1" sub="s" icon={Wallet} variant="primary" delta={delta} appearance="default" />);
    expect(b.container.innerHTML).toBe(a.container.innerHTML);
  });

  it('valueTone não altera o card compacto', () => {
    render(<KpiCard label="A" value="-R$10,00" valueTone="negative" />);
    expect(screen.getByText('-R$10,00')).toHaveClass('text-foreground');
  });
});

describe('KpiCard appearance="highlight"', () => {
  it.each(VARIANTS)('variant %s não muda o card azul', (variant) => {
    const { container } = render(
      <KpiCard appearance="highlight" label="Saldo" value="R$87.519,20" sub="Apoio" icon={Wallet} variant={variant} delta={delta} />,
    );
    const card = container.firstElementChild!;

    expect(card).toHaveClass('bg-gradient-highlight', 'text-highlight-foreground', 'rounded-summary', 'shadow-highlight', 'overflow-hidden');
    expect(card).not.toHaveClass('bg-card');
    expect(card).not.toHaveClass(LEGACY.primary.border);
    expect(screen.getByText('Saldo')).toHaveClass('text-highlight-muted');
    expect(screen.getByText('Apoio')).toHaveClass('text-highlight-muted');
    expect(screen.getByText('R$87.519,20')).toHaveClass('text-highlight-foreground', 'tabular-nums');
    expect(card.querySelector('svg')!.parentElement).toHaveClass('bg-highlight-icon');
    // Verde/vermelho não têm contraste sobre o azul: o delta fica branco, com seta e texto.
    expect(screen.getByText('+12,4%')).toHaveClass('text-highlight-foreground');
    expect(screen.getByText('+12,4%')).not.toHaveClass('text-success');
  });

  it('decoração fica atrás do conteúdo, sem evento e fora do leitor de tela', () => {
    const { container } = render(<KpiCard appearance="highlight" label="Saldo" value="R$1,00" />);
    const deco = container.querySelector('[aria-hidden="true"]')!;
    expect(deco).toHaveClass('pointer-events-none', 'absolute', '-z-10');
    expect(deco.textContent).toBe('');
  });

  it('valor negativo e valor longo aparecem inteiros', () => {
    render(
      <>
        <KpiCard appearance="highlight" label="Negativo" value="-R$1.108,08" valueTone="negative" />
        <KpiCard appearance="highlight" label="Longo" value="R$123.456.789,12" />
      </>,
    );
    expect(screen.getByText('-R$1.108,08')).toHaveClass('text-highlight-foreground');
    expect(screen.getByText('R$123.456.789,12')).not.toHaveClass('truncate');
  });
});

describe('KpiCard appearance="summary"', () => {
  it('usa o raio da família de resumo e mantém a borda da variant', () => {
    const { container } = render(<KpiCard appearance="summary" variant="danger" label="Resultado" value="-R$35.812,74" valueTone="negative" icon={Wallet} />);
    const card = container.firstElementChild!;
    expect(card).toHaveClass('bg-card', 'rounded-summary', 'shadow-card', 'border-destructive-border');
    expect(screen.getByText('Resultado')).not.toHaveClass('uppercase');
    expect(screen.getByText('-R$35.812,74')).toHaveClass('text-destructive', 'tabular-nums');
    expect(card.querySelector('svg')!.parentElement).toHaveClass('bg-destructive-soft');
  });

  it('sem valueTone o valor fica na cor do texto e o delta mantém o tom', () => {
    render(<KpiCard appearance="summary" label="Receita" value="R$0,00" delta={{ ...delta, tone: 'negative' }} />);
    expect(screen.getByText('R$0,00')).toHaveClass('text-foreground');
    expect(screen.getByText('+12,4%')).toHaveClass('text-destructive');
  });
});

describe('KpiCard clicável', () => {
  it.each(['default', 'summary', 'highlight'] as const)('appearance %s: botão acessível por Enter e Espaço', (appearance) => {
    const onClick = vi.fn();
    render(<KpiCard appearance={appearance} label="Contas" value="3" onClick={onClick} ariaLabel="Abrir contas" />);
    const card = screen.getByRole('button', { name: 'Abrir contas' });

    expect(card).toHaveAttribute('tabindex', '0');
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    fireEvent.keyDown(card, { key: 'a' });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('sem onClick não vira botão nem entra na ordem de tabulação', () => {
    const { container } = render(<KpiCard appearance="highlight" label="Saldo" value="R$1,00" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.firstElementChild).not.toHaveAttribute('tabindex');
  });
});
