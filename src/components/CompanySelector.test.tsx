import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { COMPANY_SEARCH_THRESHOLD, CompanySelector } from './CompanySelector';

// cmdk rola o item ativo para a vista; jsdom não implementa scrollIntoView.
beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });

const companies = [{ id: 'A', nome: 'Loja Centro' }, { id: 'B', nome: 'Loja Shopping' }, { id: 'D', nome: 'Loja Norte' }];
const renderWithTooltip = (ui: ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /Trocar unidade: Loja Centro/ }));
  return screen.getByRole('listbox', { name: 'Unidades autorizadas' });
}

describe('CompanySelector na sidebar — uma loja', () => {
  it('cartão informativo, sem botão de troca', () => {
    renderWithTooltip(<CompanySelector appearance="card" companies={[companies[0]]} value="A" onChange={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Loja Centro')).toBeInTheDocument();
    expect(screen.getByText('Unidade ativa')).toBeInTheDocument();
  });

  it('recolhida continua identificando a unidade', () => {
    renderWithTooltip(<CompanySelector appearance="compact" companies={[companies[0]]} value="A" onChange={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: 'Unidade: Loja Centro' })).toBeInTheDocument();
  });
});

describe('CompanySelector na sidebar — várias lojas', () => {
  it('lista só as unidades recebidas, marca a atual e troca uma vez', () => {
    const onChange = vi.fn();
    renderWithTooltip(<CompanySelector appearance="card" companies={companies} value="A" onChange={onChange} />);
    const list = openMenu();
    expect(within(list).getAllByRole('option')).toHaveLength(3);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(within(list).getByRole('option', { name: /Loja Centro/ })).toHaveTextContent('Unidade ativa');
    fireEvent.click(within(list).getByRole('option', { name: /Loja Norte/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('D');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('escolher a unidade atual só fecha o menu', () => {
    const onChange = vi.fn();
    renderWithTooltip(<CompanySelector appearance="card" companies={companies} value="A" onChange={onChange} />);
    fireEvent.click(within(openMenu()).getByRole('option', { name: /Loja Centro/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ignora nova escolha enquanto a troca anterior não chegou', () => {
    const onChange = vi.fn();
    const { rerender } = renderWithTooltip(<CompanySelector appearance="card" companies={companies} value="A" onChange={onChange} />);
    fireEvent.click(within(openMenu()).getByRole('option', { name: /Loja Shopping/ }));
    fireEvent.click(within(openMenu()).getByRole('option', { name: /Loja Norte/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender(<TooltipProvider><CompanySelector appearance="card" companies={companies} value="B" onChange={onChange} /></TooltipProvider>);
    fireEvent.click(screen.getByRole('button', { name: /Trocar unidade: Loja Shopping/ }));
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Loja Norte/ }));
    expect(onChange).toHaveBeenLastCalledWith('D');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('troca recusada sem mudar a unidade não trava o seletor quando a lista é atualizada', () => {
    const onChange = vi.fn();
    const { rerender } = renderWithTooltip(<CompanySelector appearance="card" companies={companies} value="A" onChange={onChange} />);
    fireEvent.click(within(openMenu()).getByRole('option', { name: /Loja Shopping/ }));
    rerender(<TooltipProvider><CompanySelector appearance="card" companies={[...companies]} value="A" onChange={onChange} /></TooltipProvider>);
    fireEvent.click(within(openMenu()).getByRole('option', { name: /Loja Norte/ }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('D');
  });

  it('teclado: lista recebe o foco, setas movem e Enter escolhe', () => {
    const onChange = vi.fn();
    renderWithTooltip(<CompanySelector appearance="card" companies={companies} value="A" onChange={onChange} />);
    const list = openMenu();
    expect(list).toHaveFocus();
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('B');
  });

  it('modo recolhido abre o mesmo menu', () => {
    const onChange = vi.fn();
    renderWithTooltip(<CompanySelector appearance="compact" companies={companies} value="A" onChange={onChange} />);
    fireEvent.click(within(openMenu()).getByRole('option', { name: /Loja Shopping/ }));
    expect(onChange).toHaveBeenCalledWith('B');
  });
});

describe('CompanySelector — busca local em lista grande', () => {
  const many = [
    ...Array.from({ length: COMPANY_SEARCH_THRESHOLD - 1 }, (_, i) => ({ id: `u${i}`, nome: `Unidade ${i + 1}` })),
    { id: 'sp', nome: 'São Paulo — Unidade com um nome bem comprido para testar quebra de linha' },
  ];

  it('busca sem acento encontra o nome acentuado e mostra vazio sem resultado', async () => {
    renderWithTooltip(<CompanySelector appearance="card" companies={many} value="u0" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Trocar unidade: Unidade 1/ }));
    const search = screen.getByRole('combobox', { name: 'Buscar unidade' });
    fireEvent.change(search, { target: { value: 'sao paulo' } });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    expect(screen.getByRole('option')).toHaveTextContent('São Paulo');
    fireEvent.change(search, { target: { value: 'zzz' } });
    await waitFor(() => expect(screen.getByText('Nenhuma unidade encontrada.')).toBeInTheDocument());
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('abaixo do limiar não há busca', () => {
    renderWithTooltip(<CompanySelector appearance="card" companies={many.slice(0, COMPANY_SEARCH_THRESHOLD - 1)} value="u0" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Trocar unidade: Unidade 1/ }));
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
