import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import DateRangePresets from './DateRangePresets';
import MonthNavigator from './MonthNavigator';
import CategoryCombobox from './CategoryCombobox';
import SupplierCombobox from './SupplierCombobox';
import ContaFormDialog, { type ContaFormData, type RateioLine } from './ContaFormDialog';
import { todayBR } from '@/lib/datetime';

vi.mock('@/components/compras/QuickSupplierDialog', () => ({ default: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('compartilhados do Financeiro — nome acessível sem mudar o comportamento', () => {
  it('DateRangePresets: grupo nomeado e atalho ativo com aria-pressed', () => {
    const onChange = vi.fn();
    const hoje = todayBR();
    render(<DateRangePresets from={hoje} to={hoje} onChange={onChange} />);
    const grupo = screen.getByRole('group', { name: 'Atalhos de período' });
    expect(within(grupo).getByRole('button', { name: 'Dia' })).toHaveAttribute('aria-pressed', 'true');
    // "Limpar" é ação, não alternância: sem aria-pressed.
    expect(within(grupo).getByRole('button', { name: 'Limpar' })).not.toHaveAttribute('aria-pressed');
    fireEvent.click(within(grupo).getByRole('button', { name: 'Limpar' }));
    expect(onChange).toHaveBeenCalledWith('', '');
  });

  it('MonthNavigator: setas e seletor com nome', () => {
    const onChange = vi.fn();
    render(<MonthNavigator value="2026-10" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(onChange).toHaveBeenCalledWith('2026-09');
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(onChange).toHaveBeenCalledWith('2026-11');
    expect(screen.getByRole('combobox', { name: 'Mês' })).toBeInTheDocument();
  });

  it('combos aceitam id (rótulo externo) e aria-label', () => {
    render(
      <>
        <label htmlFor="cat-teste">Categoria do teste</label>
        <CategoryCombobox id="cat-teste" value="" onValueChange={() => {}} options={[{ id: 'c1', nome: 'Insumos' }]} />
        <SupplierCombobox aria-label="Fornecedor do teste" value="" onValueChange={() => {}} options={[{ id: 's1', name: 'Fornecedor A' }]} />
      </>,
    );
    expect(screen.getByRole('combobox', { name: 'Categoria do teste' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Fornecedor do teste' })).toBeInTheDocument();
  });
});

describe('SupplierCombobox — atalho de cadastro', () => {
  const opcoes = [{ id: 's1', name: 'Fornecedor A' }];
  // cmdk rola o item ativo para a vista; jsdom não implementa scrollIntoView.
  beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });

  it('sem permissão informada pelo pai não oferece cadastrar', async () => {
    render(<SupplierCombobox aria-label="Fornecedor" value="" onValueChange={() => {}} options={opcoes} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Fornecedor' }));
    expect(await screen.findByText('Fornecedor A')).toBeInTheDocument();
    expect(screen.queryByText('Novo Fornecedor')).not.toBeInTheDocument();
  });

  it('com permissão oferece cadastrar', async () => {
    render(<SupplierCombobox aria-label="Fornecedor" value="" onValueChange={() => {}} options={opcoes} enableQuickAdd />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Fornecedor' }));
    expect(await screen.findByText('Novo Fornecedor')).toBeInTheDocument();
  });
});

describe('ContaFormDialog — rateio estreito', () => {
  const form: ContaFormData = {
    descricao: 'Boleto', valor: 300, data_competencia: '2026-09-08', data_vencimento: '2026-09-18',
    categoria_id: '', centro_custo_id: '', conta_id: '', forma_pagamento: 'boleto', observacoes: '',
    recorrente: false, frequencia: 'mensal', parcelas: 0,
  };
  const categorias = [
    { id: 'peixes', nome: 'Peixes', tipo: 'despesa', centro_custo_padrao_id: null },
    { id: 'limpeza', nome: 'Limpeza', tipo: 'despesa', centro_custo_padrao_id: null },
  ];
  function Form() {
    const [rateio, setRateio] = useState<RateioLine[]>([
      { key: 'a', id: 'a', categoria_id: 'peixes', centro_custo_id: '', valor: 200, percentual: 66.7, cmv_incluir: true },
      { key: 'b', id: 'b', categoria_id: 'limpeza', centro_custo_id: '', valor: 100, percentual: 33.3, cmv_incluir: null },
    ]);
    return (
      <>
        <ContaFormDialog
          open onOpenChange={() => {}} variant="pagar" form={form} onFormChange={() => {}}
          rateioLines={rateio} onRateioLinesChange={setRateio} categorias={categorias} centros={[]} contas={[]}
          isEditing={false} saving={false} onSave={() => {}} onClose={() => {}} cmv={{ ativo: true, padroes: new Map() }}
        />
        <output data-testid="rateio">{JSON.stringify(rateio)}</output>
      </>
    );
  }

  it('vira cartões sem perder a decisão do CMV por linha nem o bloqueio do Salvar', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    render(<Form />);
    const dialogo = screen.getByRole('dialog', { name: 'Nova despesa' });
    expect(within(dialogo).queryByRole('table')).not.toBeInTheDocument();
    expect(within(dialogo).getByRole('list', { name: 'Linhas do rateio' })).toBeInTheDocument();

    const limpeza = within(dialogo).getByRole('radiogroup', { name: 'Aparecer no CMV financeiro? — Limpeza' });
    expect(within(dialogo).getByRole('button', { name: 'Salvar' })).toBeDisabled();
    fireEvent.click(within(limpeza).getByRole('radio', { name: 'Não' }));
    expect(JSON.parse(screen.getByTestId('rateio').textContent!).map((l: RateioLine) => l.cmv_incluir)).toEqual([true, false]);
    expect(within(dialogo).getByRole('button', { name: 'Salvar' })).toBeEnabled();
    expect(within(dialogo).getByRole('button', { name: 'Remover linha 1 do rateio' })).toBeInTheDocument();
    expect(within(dialogo).getByText('Rateio fechado')).toBeInTheDocument();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  });
});
