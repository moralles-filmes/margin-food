import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AccessDenied from './AccessDenied';
import ErrorState from './ErrorState';
import { ChartCard } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';
import { ChartLegend } from './ChartLegend';

describe('AccessDenied', () => {
  it('mostra o texto padrão como status', () => {
    render(<AccessDenied />);
    expect(screen.getByRole('status')).toHaveTextContent('Acesso restrito');
    expect(screen.getByText('Você não tem permissão para acessar esta área.')).toBeInTheDocument();
  });

  it('aceita título e descrição do módulo', () => {
    render(<AccessDenied title="Sem acesso ao Borderô" description="Peça ao administrador." />);
    expect(screen.getByText('Sem acesso ao Borderô')).toBeInTheDocument();
    expect(screen.getByText('Peça ao administrador.')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('anuncia o erro e chama a nova tentativa', () => {
    const onRetry = vi.fn();
    render(<ErrorState description="Falha de rede." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os dados');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('sem onRetry não mostra botão; em nova tentativa o botão fica desabilitado', () => {
    const { rerender } = render(<ErrorState />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<ErrorState onRetry={() => {}} retrying />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('ChartCard', () => {
  it('erro tem precedência sobre vazio e não renderiza o gráfico', () => {
    const onRetry = vi.fn();
    render(
      <ChartCard title="Receitas" error isEmpty onRetry={onRetry} legend={<span>legenda</span>} footer={<span>rodapé</span>}>
        <div>grafico</div>
      </ChartCard>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o gráfico');
    expect(screen.queryByText('grafico')).toBeNull();
    expect(screen.queryByText('legenda')).toBeNull();
    expect(screen.queryByText('rodapé')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('vazio mostra a mensagem e carregando não mostra o gráfico', () => {
    const { rerender } = render(<ChartCard title="Receitas" isEmpty><div>grafico</div></ChartCard>);
    expect(screen.getByText('Sem dados no período selecionado')).toBeInTheDocument();
    rerender(<ChartCard title="Receitas" loading><div>grafico</div></ChartCard>);
    expect(screen.queryByText('grafico')).toBeNull();
    expect(screen.getByRole('figure', { name: 'Receitas' })).toHaveAttribute('aria-busy', 'true');
  });

  it('com dados mostra gráfico, legenda e rodapé', () => {
    render(
      <ChartCard title="Receitas" subtitle="Últimos 6 meses" legend={<span>legenda</span>} footer={<span>rodapé</span>}>
        <div>grafico</div>
      </ChartCard>,
    );
    expect(screen.getByText('grafico')).toBeInTheDocument();
    expect(screen.getByText('legenda')).toBeInTheDocument();
    expect(screen.getByText('rodapé')).toBeInTheDocument();
    expect(screen.getByText('Últimos 6 meses')).toBeInTheDocument();
  });
});

describe('ChartTooltip e ChartLegend com muitas séries', () => {
  const payload = Array.from({ length: 12 }, (_, i) => ({ dataKey: `s${i}`, name: `Série ${i + 1}`, value: i * 10, color: 'red' }));

  it('sem maxItems mostra todas as séries', () => {
    render(<ChartTooltip active label="Mês 1" payload={payload} />);
    expect(screen.getByText('Série 12')).toBeInTheDocument();
    expect(screen.queryByText(/\+ \d+ séries?/)).toBeNull();
  });

  it('com maxItems resume o excedente', () => {
    render(<ChartTooltip active label="Mês 1" payload={payload} maxItems={8} />);
    expect(screen.getByText('Série 8')).toBeInTheDocument();
    expect(screen.queryByText('Série 9')).toBeNull();
    expect(screen.getByText('+ 4 séries')).toBeInTheDocument();
  });

  it('legenda é uma lista com um item por série', () => {
    render(<ChartLegend payload={payload.map(p => ({ value: p.name, dataKey: p.dataKey, color: p.color }))} scrollable justify="end" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(screen.getByRole('list')).toHaveClass('justify-end', 'overflow-y-auto');
  });
});
