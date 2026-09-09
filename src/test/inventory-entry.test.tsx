import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventarioItem } from '@/hooks/useInventarioStore';
import { useQuantityNavigation } from '@/hooks/useQuantityNavigation';
import InventoryItemRow from '@/components/inventario/InventoryItemRow';
import InventoryQuantityInput from '@/components/inventario/InventoryQuantityInput';
import QuickInventoryCountList from '@/components/inventario/QuickInventoryCountList';

afterEach(cleanup);

const inventoryItem = (id: string): InventarioItem => ({
  id, inventario_id: 'inventory', produto_id: id, tipo_item: 'geral', lote_id: '',
  saldo_teorico: 12, contagem_fisica: null, diferenca_qtd: 0, diferenca_percent: 0,
  custo_snapshot: 1, impacto_financeiro: 0, classificacao: 'NORMAL', contado_por: null,
  contagem_inicio: null, contagem_fim: null, justificativa: '',
  produtos: { nome_produto: id, categoria: 'Alimentos', local_estoque: null,
    unidade_medida: 'UN', unidade_compra: 'Caixa', fator_conversao_padrao: 6 },
});

function CountTable({ onSave, visibleIds = ['Arroz', 'Feijão'] }: {
  onSave: (quantity: number) => Promise<boolean>;
  visibleIds?: string[];
}) {
  const navigation = useQuantityNavigation();
  return <table><tbody>{visibleIds.map(id => (
    <InventoryItemRow key={id} item={inventoryItem(id)} canCount onSave={onSave}
      inputRef={input => navigation.register(id, input)}
      onNext={() => navigation.next(id, visibleIds)} classColor={() => ''} />
  ))}</tbody></table>;
}

function InputHarness({ onSave, onNext = () => {} }: {
  onSave?: (quantity: number) => Promise<boolean>;
  onNext?: () => void;
}) {
  const [value, setValue] = useState('');
  return <InventoryQuantityInput value={value} onValueChange={setValue}
    label="Quantidade" onSave={onSave} onNext={onNext} />;
}

describe('Contagem do inventário', () => {
  it('salva a quantidade com vírgula na unidade base e avança na ordem visível', async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<CountTable onSave={save} visibleIds={['Feijão', 'Arroz']} />);
    const first = screen.getByLabelText('Quantidade de Feijão');
    const next = screen.getByLabelText('Quantidade de Arroz');
    first.focus();
    fireEvent.change(first, { target: { value: '1,25' } });
    fireEvent.keyDown(first, { key: 'Enter' });
    await waitFor(() => expect(next).toHaveFocus());
    expect(save).toHaveBeenCalledExactlyOnceWith(7.5);

    fireEvent.change(next, { target: { value: '0' } });
    fireEvent.keyDown(next, { key: 'Enter' });
    await waitFor(() => expect(next).not.toHaveFocus());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(0);
  });

  it('aguarda o salvamento sem duplicar a chamada por Enter repetido e blur', async () => {
    let finish!: (value: boolean) => void;
    const save = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const next = vi.fn();
    render(<InputHarness onSave={save} onNext={next} />);
    const input = screen.getByLabelText('Quantidade');
    input.focus();
    fireEvent.change(input, { target: { value: '2,5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    await act(async () => {});
    expect(save).toHaveBeenCalledExactlyOnceWith(2.5);
    expect(next).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('readonly');
    await act(async () => finish(true));
    expect(next).toHaveBeenCalledOnce();
    fireEvent.blur(input);
    expect(save).toHaveBeenCalledOnce();
  });

  it('mantém a quantidade e o foco quando salvar falha e permite tentar novamente', async () => {
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<CountTable onSave={save} />);
    const input = screen.getByLabelText('Quantidade de Arroz');
    input.focus();
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Contagem não salva');
    expect(input).toHaveFocus();
    expect(input).toHaveValue('3');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByLabelText('Quantidade de Feijão')).toHaveFocus());
    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('permite pular quantidade vazia sem salvar zero e bloqueia valor incompleto', async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<CountTable onSave={save} />);
    const first = screen.getByLabelText('Quantidade de Arroz');
    const second = screen.getByLabelText('Quantidade de Feijão');
    first.focus();
    fireEvent.keyDown(first, { key: 'Enter' });
    await waitFor(() => expect(second).toHaveFocus());
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(second, { target: { value: ',' } });
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(await screen.findByRole('alert')).toHaveTextContent('quantidade válida');
    expect(second).toHaveFocus();
    expect(save).not.toHaveBeenCalled();
  });

  it('não mostra campos ou botões de contagem para inventário bloqueado', () => {
    render(<table><tbody><InventoryItemRow item={inventoryItem('Arroz')} canCount={false}
      onSave={vi.fn()} onNext={vi.fn()} inputRef={vi.fn()} classColor={() => ''} /></tbody></table>);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('restaura a contagem salva ao limpar o campo, sem gravar zero', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const next = vi.fn();
    const item = { ...inventoryItem('Arroz'), contagem_fisica: 12 };
    render(<table><tbody><InventoryItemRow item={item} canCount onSave={save}
      onNext={next} inputRef={vi.fn()} classColor={() => ''} /></tbody></table>);
    const input = screen.getByLabelText('Quantidade de Arroz');
    expect(input).toHaveValue('2');
    input.focus();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(next).toHaveBeenCalledOnce());
    expect(input).toHaveValue('2');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('Inventário rápido', () => {
  it('incrementa com +, aceita vírgula e avança entre os produtos sem enviar o formulário', async () => {
    const complete = vi.fn();
    const submit = vi.fn(event => event.preventDefault());
    function QuickCount() {
      const [items, setItems] = useState(['Arroz', 'Feijão', 'Sal'].map(name => ({
        productId: name, nomeProduto: name, categoria: 'Alimentos', unidadeMedida: 'KG',
        countedQty: '', saldoTeorico: 2,
      })));
      return <form onSubmit={submit}><QuickInventoryCountList items={items} onComplete={complete}
        onChange={(id, value) => setItems(current => current.map(item => item.productId === id ? { ...item, countedQty: value } : item))}
        onRemove={id => setItems(current => current.filter(item => item.productId !== id))} />
        <button type="submit">Salvar</button></form>;
    }
    render(<QuickCount />);
    const first = screen.getByLabelText('Quantidade de Arroz');
    fireEvent.click(screen.getByLabelText('Aumentar quantidade de arroz em 1'));
    expect(first).toHaveValue('1');
    expect(first).toHaveFocus();
    fireEvent.change(first, { target: { value: '1,5' } });
    fireEvent.click(screen.getByLabelText('Aumentar quantidade de arroz em 1'));
    expect(first).toHaveValue('2.5');
    fireEvent.click(screen.getByLabelText('Remover Feijão da contagem'));
    first.focus();
    fireEvent.keyDown(first, { key: 'Enter' });
    const last = screen.getByLabelText('Quantidade de Sal');
    await waitFor(() => expect(last).toHaveFocus());
    expect(last).toHaveAttribute('inputmode', 'decimal');
    expect(last).toHaveAttribute('enterkeyhint', 'next');
    fireEvent.keyDown(last, { key: 'Enter' });
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(last).toHaveValue('');
    expect(submit).not.toHaveBeenCalled();
  });

  it('bloqueia alterações durante o envio e foca o produto recém-adicionado', () => {
    const props = { items: [{ productId: 'Arroz', nomeProduto: 'Arroz', categoria: '', unidadeMedida: 'KG', countedQty: '', saldoTeorico: 0 }],
      onChange: vi.fn(), onRemove: vi.fn(), onComplete: vi.fn(), focusProductId: 'Arroz' };
    const { rerender } = render(<QuickInventoryCountList {...props} />);
    expect(screen.getByLabelText('Quantidade de Arroz')).toHaveFocus();
    rerender(<QuickInventoryCountList {...props} disabled />);
    expect(screen.getByLabelText('Quantidade de Arroz')).toBeDisabled();
    expect(screen.getByLabelText('Aumentar quantidade de arroz em 1')).toBeDisabled();
  });
});
