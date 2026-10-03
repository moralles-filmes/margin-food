import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContaFormDialog, { type ContaFormCmv, type ContaFormData, type RateioLine } from './ContaFormDialog';

// Só os primitives de apresentação são simplificados; não há transporte/banco simulado.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange?: (v: string) => void }) => <select aria-label="Seletor" value={value} onChange={e => onValueChange?.(e.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
vi.mock('@/components/compras/QuickSupplierDialog', () => ({ default: () => null }));
vi.mock('./CategoryCombobox', () => ({
  default: ({ value, onValueChange, options }: { value: string; onValueChange: (v: string) => void; options: { id: string; nome: string }[] }) => (
    <select aria-label="Categoria" value={value} onChange={e => onValueChange(e.target.value)}>
      <option value="">—</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
    </select>
  ),
}));

const categorias = [
  { id: 'peixes', nome: 'Peixes', tipo: 'despesa', centro_custo_padrao_id: null },
  { id: 'escritorio', nome: 'Material de escritório', tipo: 'despesa', centro_custo_padrao_id: null },
  { id: 'bebidas', nome: 'Bebidas', tipo: 'despesa', centro_custo_padrao_id: null },
  { id: 'novo', nome: 'Sem padrão', tipo: 'despesa', centro_custo_padrao_id: null },
];
const cmvAtivo: ContaFormCmv = { ativo: true, padroes: new Map([['peixes', true], ['escritorio', false], ['bebidas', true], ['novo', null]]) };

const base: ContaFormData = {
  descricao: 'Boleto teste', valor: 2150, data_competencia: '2026-09-08', data_vencimento: '2026-09-18',
  categoria_id: '', centro_custo_id: '', conta_id: '', forma_pagamento: 'boleto', observacoes: '',
  recorrente: false, frequencia: 'mensal', parcelas: 0,
};

function Form({ initial = base, linhas = [], cmv = cmvAtivo, isEditing = false, variant = 'pagar' }: {
  initial?: ContaFormData; linhas?: RateioLine[]; cmv?: ContaFormCmv | null; isEditing?: boolean; variant?: 'pagar' | 'receber';
}) {
  const [form, setForm] = useState(initial);
  const [rateio, setRateio] = useState(linhas);
  return (
    <>
      <ContaFormDialog
        open onOpenChange={() => {}} variant={variant} form={form} onFormChange={setForm}
        rateioLines={rateio} onRateioLinesChange={setRateio} categorias={categorias} centros={[]} contas={[]}
        isEditing={isEditing} saving={false} onSave={() => {}} onClose={() => {}} cmv={cmv}
      />
      <output data-testid="form">{JSON.stringify(form)}</output>
      <output data-testid="rateio">{JSON.stringify(rateio)}</output>
    </>
  );
}

const linha = (key: string, categoria_id: string, valor: number, cmv_incluir: boolean | null): RateioLine =>
  ({ key, id: key, categoria_id, centro_custo_id: '', valor, percentual: 0, cmv_incluir });
const exemplo = () => [linha('a', 'peixes', 1200, true), linha('b', 'escritorio', 350, false), linha('c', 'bebidas', 600, true)];
const salvar = () => screen.getByRole('button', { name: 'Salvar' });
const resumo = (rotulo: string) => screen.getByText(rotulo).closest('div')!.querySelector('dd')!.textContent;

afterEach(cleanup);

describe('Contas a Pagar — "Aparecer no CMV financeiro?"', () => {
  it('sem o recurso disponível o formulário fica exatamente como antes', () => {
    render(<Form cmv={null} />);
    expect(screen.queryByText('Aparecer no CMV financeiro?')).not.toBeInTheDocument();
    expect(salvar()).toBeEnabled();
  });

  it('empresa sem a classificação ativada não pede a decisão em boleto novo', () => {
    render(<Form cmv={{ ...cmvAtivo, ativo: false }} />);
    expect(screen.queryByText('Aparecer no CMV financeiro?')).not.toBeInTheDocument();
    expect(salvar()).toBeEnabled();
  });

  it('não aparece em contas a receber', () => {
    render(<Form variant="receber" />);
    expect(screen.queryByText('Aparecer no CMV financeiro?')).not.toBeInTheDocument();
  });

  it('boleto novo de uma categoria exige Sim ou Não e mostra competência e valor que entra', () => {
    render(<Form />);
    const grupo = screen.getByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' });
    expect(within(grupo).getByRole('radio', { name: 'Sim' })).toHaveAttribute('aria-checked', 'false');
    expect(within(grupo).getByRole('radio', { name: 'Não' })).toHaveAttribute('aria-checked', 'false');
    expect(salvar()).toBeDisabled();
    expect(resumo('Pendente de classificação')).toBe('R$ 2.150,00');
    expect(screen.getByText('08/09/2026')).toBeInTheDocument();

    fireEvent.click(within(grupo).getByRole('radio', { name: 'Sim' }));
    expect(salvar()).toBeEnabled();
    expect(resumo('Incluído no CMV')).toBe('R$ 2.150,00');
    expect(resumo('Fora do CMV')).toBe('R$ 0,00');
    expect(JSON.parse(screen.getByTestId('form').textContent!).cmv_incluir).toBe(true);

    fireEvent.click(within(grupo).getByRole('radio', { name: 'Não' }));
    expect(resumo('Incluído no CMV')).toBe('R$ 0,00');
    expect(resumo('Fora do CMV')).toBe('R$ 2.150,00');
  });

  it('competência em branco usa o vencimento e avisa', () => {
    render(<Form initial={{ ...base, data_competencia: '' }} />);
    expect(screen.getByText('18/09/2026')).toBeInTheDocument();
    expect(screen.getByText(/vencimento, pois a competência não foi informada/)).toBeInTheDocument();
  });

  it('escolher a categoria sugere o padrão dela; sem padrão fica em branco, nunca Sim', () => {
    render(<Form />);
    const categoria = screen.getByLabelText('Categoria');
    fireEvent.change(categoria, { target: { value: 'peixes' } });
    expect(JSON.parse(screen.getByTestId('form').textContent!).cmv_incluir).toBe(true);
    expect(screen.getByText('Sugestão do padrão da categoria.')).toBeInTheDocument();

    fireEvent.change(categoria, { target: { value: 'novo' } });
    expect(JSON.parse(screen.getByTestId('form').textContent!).cmv_incluir).toBeNull();
    expect(screen.getByText('Categoria trocada: decisão redefinida. Confira.')).toBeInTheDocument();
    expect(salvar()).toBeDisabled();
  });

  it('exemplo de R$ 2.150,00: cada linha decide e o resumo dá R$ 1.800,00 dentro e R$ 350,00 fora', () => {
    render(<Form linhas={exemplo()} />);
    expect(screen.getByRole('columnheader', { name: 'Aparecer no CMV financeiro?' })).toBeInTheDocument();
    expect(resumo('Total do boleto')).toBe('R$ 2.150,00');
    expect(resumo('Incluído no CMV')).toBe('R$ 1.800,00');
    expect(resumo('Fora do CMV')).toBe('R$ 350,00');
    expect(screen.queryByText('Pendente de classificação')).not.toBeInTheDocument();
    expect(salvar()).toBeEnabled();

    const escritorio = screen.getByRole('radiogroup', { name: 'Aparecer no CMV financeiro? — Material de escritório' });
    fireEvent.click(within(escritorio).getByRole('radio', { name: 'Sim' }));
    expect(resumo('Incluído no CMV')).toBe('R$ 2.150,00');
    // as outras linhas não mudam
    const linhas = JSON.parse(screen.getByTestId('rateio').textContent!);
    expect(linhas.map((l: RateioLine) => l.cmv_incluir)).toEqual([true, true, true]);
    expect(linhas.map((l: RateioLine) => l.valor)).toEqual([1200, 350, 600]);
  });

  it('"Marcar todas" e "Desmarcar todas" só alteram as linhas', () => {
    render(<Form linhas={[linha('a', 'peixes', 1200, null), linha('b', 'escritorio', 350, null), linha('c', 'bebidas', 600, true)]} />);
    expect(salvar()).toBeDisabled();
    expect(resumo('Pendente de classificação')).toBe('R$ 1.550,00');
    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar todas' }));
    expect(JSON.parse(screen.getByTestId('rateio').textContent!).map((l: RateioLine) => l.cmv_incluir)).toEqual([false, false, false]);
    expect(resumo('Fora do CMV')).toBe('R$ 2.150,00');
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas' }));
    expect(resumo('Incluído no CMV')).toBe('R$ 2.150,00');
    expect(salvar()).toBeEnabled();
    // o valor do boleto no formulário segue o mesmo
    expect(JSON.parse(screen.getByTestId('form').textContent!).valor).toBe(2150);
  });

  it('trocar a categoria de uma linha redefine a decisão e avisa', () => {
    render(<Form linhas={exemplo()} />);
    const [primeira] = screen.getAllByLabelText('Categoria');
    fireEvent.change(primeira, { target: { value: 'escritorio' } });
    const linhas = JSON.parse(screen.getByTestId('rateio').textContent!);
    expect(linhas[0]).toMatchObject({ categoria_id: 'escritorio', cmv_incluir: false, cmv_aviso: 'redefinido' });
    expect(screen.getByText('Categoria trocada: decisão redefinida. Confira.')).toBeInTheDocument();
    expect(linhas[0].id).toBe('a');
  });

  it('desfazer um rateio com respostas diferentes não aplica a da primeira linha ao boleto inteiro', () => {
    render(<Form isEditing linhas={exemplo()} />);
    fireEvent.click(screen.getByText('Habilitar rateio').parentElement!.querySelector('[role="switch"]')!);
    expect(JSON.parse(screen.getByTestId('rateio').textContent!)).toEqual([]);
    expect(JSON.parse(screen.getByTestId('form').textContent!)).toMatchObject({ categoria_id: 'peixes', cmv_incluir: null, cmv_aviso: 'unificar' });
    expect(screen.getByText('O rateio tinha respostas diferentes: informe a do boleto inteiro.')).toBeInTheDocument();
    expect(resumo('Pendente de classificação')).toBe('R$ 2.150,00');
    expect(salvar()).toBeDisabled();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' })).getByRole('radio', { name: 'Não' }));
    expect(salvar()).toBeEnabled();
  });

  it('desfazer um rateio com a mesma resposta em todas as linhas mantém a decisão', () => {
    render(<Form isEditing linhas={[linha('a', 'peixes', 1550, true), linha('c', 'bebidas', 600, true)]} />);
    fireEvent.click(screen.getByText('Habilitar rateio').parentElement!.querySelector('[role="switch"]')!);
    expect(JSON.parse(screen.getByTestId('form').textContent!)).toMatchObject({ cmv_incluir: true });
    expect(salvar()).toBeEnabled();
  });

  it('boleto legado em edição não é bloqueado pela pendência, que fica visível', () => {
    render(<Form isEditing initial={{ ...base, categoria_id: 'peixes', cmv_incluir: null }} />);
    expect(screen.getByText('Aparecer no CMV financeiro?')).toBeInTheDocument();
    expect(resumo('Pendente de classificação')).toBe('R$ 2.150,00');
    expect(salvar()).toBeEnabled();
  });

  it('boleto já classificado continua mostrando a decisão mesmo com a classificação desativada', () => {
    render(<Form isEditing cmv={{ ...cmvAtivo, ativo: false }} initial={{ ...base, categoria_id: 'peixes', cmv_incluir: true }} />);
    const grupo = screen.getByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' });
    expect(within(grupo).getByRole('radio', { name: 'Sim' })).toHaveAttribute('aria-checked', 'true');
  });
});
