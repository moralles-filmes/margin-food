import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DemonstrativoTree from './DemonstrativoTree';

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
