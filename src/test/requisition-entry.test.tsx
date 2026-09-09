import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RequisicaoProductPicker, { type RequisitionPickerProduct } from '@/components/estoque/RequisicaoProductPicker';
import RequisicaoQuantityList from '@/components/estoque/RequisicaoQuantityList';

afterEach(cleanup);

const products: RequisitionPickerProduct[] = [
  { id: '1', nomeProduto: 'Açúcar cristal', sku: 'AC-01', unidadeCompra: 'Pacote', unidadeMedida: 'KG', ativo: true },
  { id: '2', nomeProduto: 'Açúcar sem unidade', sku: 'AC-02', unidadeCompra: '', unidadeMedida: 'KG', ativo: true },
  { id: '3', nomeProduto: 'Açúcar refinado', sku: 'AC-03', unidadeCompra: 'Fardo', unidadeMedida: 'KG', ativo: true },
  { id: '4', nomeProduto: 'Açúcar inativo', sku: 'AC-04', unidadeCompra: 'Pacote', unidadeMedida: 'KG', ativo: false },
];

function searchAndSelect() {
  fireEvent.change(screen.getByLabelText('Adicionar produto'), { target: { value: 'acucar' } });
  fireEvent.click(screen.getByRole('button', { name: /Açúcar cristal/ }));
}

describe('Entrada manual de requisição', () => {
  it('mostra a pesquisa sem abrir Produtos, normaliza acentos e busca SKU', () => {
    render(<RequisicaoProductPicker produtos={products} onAdd={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Produtos' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Adicionar produto'), { target: { value: 'acucar' } });
    expect(screen.getByRole('button', { name: /Açúcar cristal/ })).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('Açúcar inativo')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Adicionar produto'), { target: { value: 'ac-03' } });
    expect(screen.getByRole('button', { name: /Açúcar refinado/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Açúcar cristal/ })).not.toBeInTheDocument();
  });

  it('habilita + com quantidade decimal e mantém a unidade de compra', () => {
    const onAdd = vi.fn();
    render(<RequisicaoProductPicker produtos={products} onAdd={onAdd} />);
    searchAndSelect();
    const quantity = screen.getByLabelText('Quantidade desejada');
    expect(quantity).toHaveFocus();
    fireEvent.change(quantity, { target: { value: '0,5' } });
    const add = screen.getByRole('button', { name: 'Adicionar produto à requisição' });
    expect(add).toBeEnabled();
    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledWith({ produtoId: '1', quantidade: 0.5, unidade: 'Pacote' });
    expect(quantity).toHaveValue('');
    expect(screen.getByRole('button', { name: /Açúcar refinado/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Enter adiciona, pula produtos inválidos e não envia o formulário', () => {
    const onAdd = vi.fn();
    const onSubmit = vi.fn(event => event.preventDefault());
    render(<form onSubmit={onSubmit}><RequisicaoProductPicker produtos={products} onAdd={onAdd} /></form>);
    searchAndSelect();
    const quantity = screen.getByLabelText('Quantidade desejada');
    fireEvent.change(quantity, { target: { value: '2' } });
    fireEvent.keyDown(quantity, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(quantity).toHaveFocus();
    fireEvent.change(quantity, { target: { value: '3' } });
    fireEvent.keyDown(quantity, { key: 'Enter' });
    expect(onAdd).toHaveBeenLastCalledWith({ produtoId: '3', quantidade: 3, unidade: 'Fardo' });
    expect(screen.getByLabelText('Adicionar produto')).toHaveFocus();
  });

  it('recusa zero, vazio e produto sem unidade; mudar a busca limpa a seleção', () => {
    const onAdd = vi.fn();
    render(<RequisicaoProductPicker produtos={products} onAdd={onAdd} />);
    searchAndSelect();
    const add = screen.getByRole('button', { name: 'Adicionar produto à requisição' });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Quantidade desejada'), { target: { value: '0' } });
    expect(add).toBeDisabled();
    expect(screen.getByRole('button', { name: /Açúcar sem unidade/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Adicionar produto'), { target: { value: 'inexistente' } });
    expect(screen.getByText('Nenhum produto encontrado.')).toBeVisible();
    expect(screen.getByLabelText('Quantidade desejada')).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe('Quantidades da lista fixa', () => {
  it('Enter/OK avança para a próxima quantidade válida e termina na revisão', () => {
    const onComplete = vi.fn();
    function List() {
      const [quantities, setQuantities] = useState<Record<string, string>>({});
      return <RequisicaoQuantityList
        rows={products.slice(0, 3).map(product => ({ id: product.id, name: product.nomeProduto, unit: product.unidadeCompra || null, issue: product.unidadeCompra ? null : 'Configure a unidade' }))}
        quantities={quantities} onChange={(id, value) => setQuantities(prev => ({ ...prev, [id]: value }))} onComplete={onComplete}
      />;
    }
    render(<List />);
    const first = screen.getByLabelText('Quantidade de Açúcar cristal');
    const last = screen.getByLabelText('Quantidade de Açúcar refinado');
    fireEvent.change(first, { target: { value: '1,25' } });
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(first).toHaveValue('1.25');
    expect(last).toHaveFocus();
    expect(screen.getByLabelText('Quantidade de Açúcar sem unidade')).toBeDisabled();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.change(last, { target: { value: '4' } });
    fireEvent.keyDown(last, { key: 'Enter' });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(first).toHaveValue('1.25');
  });
});
