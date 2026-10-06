import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DemonstrativoTree from './DemonstrativoTree';

const largura = (px: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });
afterEach(() => { cleanup(); largura(1024); });

function categoria(overrides: Partial<{
  id: string;
  nome: string;
  codigo: string;
  tipo: 'receita' | 'despesa';
  parent_id: string | null;
  excluir_dos_totais: boolean;
}> & { id: string }) {
  return {
    nome: 'Categoria',
    codigo: '',
    tipo: 'receita' as const,
    parent_id: null,
    ordem: 0,
    centro_custo_padrao_id: null,
    grupo: null,
    linha_dre: null,
    system_key: null,
    excluir_dos_totais: false,
    ativo: true,
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const categorias = [
  categoria({ id: 'receita-1', nome: 'Vendas', tipo: 'receita' }),
  categoria({ id: 'despesa-1', nome: 'Aluguel', tipo: 'despesa' }),
];

const lancamentos = [
  { id: 'l1', categoria_id: 'receita-1', valor: 1_000 },
  { id: 'l2', categoria_id: 'despesa-1', valor: 250 },
];

describe('DemonstrativoTree — coluna de percentual', () => {
  it('no DRE, rotula a coluna "% Receita Líq." e calcula sobre a receita total do próprio demonstrativo', () => {
    render(
      <DemonstrativoTree
        categorias={categorias}
        lancamentos={lancamentos}
        rateios={[]}
        loading={false}
        showPctReceita
      />,
    );
    expect(screen.getByText('% Receita Líq.')).toBeInTheDocument();
    // TOTAL DE DESPESAS e Aluguel = 250 sobre receita total 1.000 => 25,00% (as duas linhas)
    expect(screen.getAllByText('25,00%')).toHaveLength(2);
    // RESULTADO DO PERÍODO = 750 sobre receita total 1.000 => 75,00%
    expect(screen.getByText('75,00%')).toBeInTheDocument();
  });

  it('no DFC, rotula a coluna "% Recebimentos" em vez de "% Receita Líq."', () => {
    render(
      <DemonstrativoTree
        categorias={categorias}
        lancamentos={lancamentos}
        rateios={[]}
        loading={false}
        isDFC
        showPctReceita
      />,
    );
    expect(screen.getByText('% Recebimentos')).toBeInTheDocument();
    expect(screen.queryByText('% Receita Líq.')).not.toBeInTheDocument();
  });

  it('abre e fecha nós por botão nomeado com aria-expanded, sem mudar os valores', () => {
    const arvore = [
      categoria({ id: 'r', nome: 'Receitas operacionais', tipo: 'receita' }),
      categoria({ id: 'r1', nome: 'Vendas', tipo: 'receita', parent_id: 'r' }),
      categoria({ id: 'd', nome: 'Custos', tipo: 'despesa' }),
      categoria({ id: 'd1', nome: 'Pescados', tipo: 'despesa', parent_id: 'd' }),
      categoria({ id: 'd2', nome: 'Manutenção', tipo: 'despesa', parent_id: 'd' }),
    ];
    render(
      <DemonstrativoTree
        categorias={arvore}
        lancamentos={[{ id: 'a', categoria_id: 'r1', valor: 1_000 }, { id: 'b', categoria_id: 'd1', valor: 400 }]}
        rateios={[]}
        loading={false}
        showPctReceita
      />,
    );
    const botao = screen.getByRole('button', { name: 'Recolher Custos' });
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    // Categoria zerada na seção de despesas não aparece como "R$-0,00".
    const manutencao = screen.getByText('Manutenção').closest('tr') as HTMLElement;
    expect(within(manutencao).getByText('R$0,00')).toBeInTheDocument();
    fireEvent.click(botao);
    expect(screen.getByRole('button', { name: 'Expandir Custos' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Pescados')).not.toBeInTheDocument();
    expect(screen.getByText('RESULTADO DO PERÍODO').closest('tr')).toHaveTextContent('R$600,00');
  });

  it('bloco não operacional fica fora do resultado e sem percentual', () => {
    render(
      <DemonstrativoTree
        categorias={[...categorias, categoria({ id: 'no', nome: 'DESPESAS NÃO OPERACIONAIS', tipo: 'despesa', excluir_dos_totais: true })]}
        lancamentos={[...lancamentos, { id: 'l3', categoria_id: 'no', valor: 5_000 }]}
        rateios={[]}
        loading={false}
        showPctReceita
      />,
    );
    expect(screen.getByText('VALORES NÃO OPERACIONAIS — NÃO COMPÕEM OS TOTAIS')).toBeInTheDocument();
    const linha = screen.getByText('DESPESAS NÃO OPERACIONAIS').closest('tr') as HTMLElement;
    expect(within(linha).getByText('R$-5.000,00')).toBeInTheDocument();
    expect(within(linha).getByText('—')).toBeInTheDocument();
    expect(screen.getByText('RESULTADO DO PERÍODO').closest('tr')).toHaveTextContent('R$750,00');
  });

  it('no celular vira lista com a mesma hierarquia, valores e percentuais (sem tabela)', () => {
    largura(390);
    render(
      <DemonstrativoTree categorias={categorias} lancamentos={lancamentos} rateios={[]} loading={false} isDFC saldoInicial={2_000} showPctReceita />,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const lista = screen.getByRole('list', { name: 'Demonstração de fluxo de caixa' });
    expect(within(lista).getByText('SALDO INICIAL')).toBeInTheDocument();
    expect(within(lista).getByText('SALDO ACUMULADO').closest('li')).toHaveTextContent('R$2.750,00');
    expect(within(lista).getAllByText('25,00%')).toHaveLength(2);
  });

  it('sem receita no período avisa por que a coluna de percentual fica em "—"', () => {
    render(
      <DemonstrativoTree categorias={categorias} lancamentos={[{ id: 'l2', categoria_id: 'despesa-1', valor: 250 }]} rateios={[]} loading={false} showPctReceita />,
    );
    expect(screen.getByText(/Sem receita no período: a coluna “% Receita Líq.” não se aplica/)).toBeInTheDocument();
  });

  it('sem showPctReceita, não renderiza a coluna de percentual em nenhum regime', () => {
    render(
      <DemonstrativoTree
        categorias={categorias}
        lancamentos={lancamentos}
        rateios={[]}
        loading={false}
      />,
    );
    expect(screen.queryByText('% Receita Líq.')).not.toBeInTheDocument();
    expect(screen.queryByText('% Recebimentos')).not.toBeInTheDocument();
  });
});
