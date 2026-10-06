import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContaDetailDialog, { type ContaDetailData } from './ContaDetailDialog';
import ContaFormDialog, { type ContaFormData } from './ContaFormDialog';

vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/components/compras/QuickSupplierDialog', () => ({ default: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const base: ContaDetailData = {
  id: 'cp-1', descricao: 'Boleto de insumos', valor: 1800, status: 'PAGO',
  data_competencia: '2026-09-30', data_vencimento: '2026-10-01', data_pagamento: '2026-10-01',
  forma_pagamento: 'boleto', fornecedor: 'Fornecedor Teste', conta_nome: 'Conta Teste',
  categoria_nome: null, centro_custo_nome: null, observacoes: null,
  rateios: [
    { categoria_nome: 'Insumos', centro_custo_nome: 'Cozinha', valor: 1200, percentual: 66.7, cmv_incluir: true },
    { categoria_nome: 'Limpeza', centro_custo_nome: '', valor: 450, percentual: 25, cmv_incluir: false },
    { categoria_nome: '-', centro_custo_nome: '', valor: 150, percentual: 8.3, cmv_incluir: null },
  ],
  updated_at: '2026-10-01T00:00:00Z',
};

describe('ContaDetailDialog (V2)', () => {
  it('título acessível, textos acentuados, rateio com a decisão do CMV por linha', () => {
    render(<ContaDetailDialog open onOpenChange={() => {}} data={base} variant="pagar" canEdit onEstornar={vi.fn()} />);
    const dialogo = screen.getByRole('dialog', { name: 'Detalhes da despesa' });
    for (const texto of ['Informações do lançamento', 'Data de competência', 'Informações detalhadas do pagamento', 'Situação', 'Observações', 'Informações de categoria e centro de custo', 'Boleto bancário']) {
      expect(within(dialogo).getByText(texto)).toBeInTheDocument();
    }
    // Sem observação o acordeão começa recolhido, como antes.
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Observações' }));
    expect(within(dialogo).getByText('Nenhuma observação encontrada')).toBeInTheDocument();
    expect(within(dialogo).getByText('3 informadas')).toBeInTheDocument();
    expect(within(dialogo).getByText('Sim (entra no CMV)')).toBeInTheDocument();
    expect(within(dialogo).getByText('Não (fora do CMV)')).toBeInTheDocument();
    expect(within(dialogo).getByText('Pendente de classificação')).toBeInTheDocument();
    // PF-011 continua: juros/desconto fixos.
    expect(within(dialogo).getAllByText('0,00').length).toBeGreaterThanOrEqual(2);
    // Pago: estorno sim, editar não.
    expect(within(dialogo).getByRole('button', { name: /Estornar/ })).toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: /Editar lançamento/ })).not.toBeInTheDocument();
  });

  it('ações por status como antes e foco inicial no diálogo, não no botão de ação', async () => {
    const onPay = vi.fn();
    render(<ContaDetailDialog open onOpenChange={() => {}} data={{ ...base, status: 'APROVADO', rateios: [] }} variant="pagar" canEdit onPay={onPay} onEdit={vi.fn()} />);
    const dialogo = screen.getByRole('dialog', { name: 'Detalhes da despesa' });
    await waitFor(() => expect(document.activeElement).toBe(dialogo));
    expect(within(dialogo).getByRole('button', { name: /^Pagar$/ })).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: /Informar pagamento/ })).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: /Editar lançamento/ })).toBeInTheDocument();
    expect(onPay).not.toHaveBeenCalled();
  });

  it('lançamento do Livro Razão: "Detalhes do lançamento" e selo Previsto legível', () => {
    render(<ContaDetailDialog open onOpenChange={() => {}} data={{ ...base, status: 'PREVISTO', tipo: 'RECEITA', origem: 'manual', rateios: [] }} variant="lancamento" />);
    const dialogo = screen.getByRole('dialog', { name: 'Detalhes do lançamento' });
    expect(within(dialogo).getByText('Lançamento Financeiro')).toBeInTheDocument();
    expect(within(dialogo).getByText('Previsto')).toBeInTheDocument();
  });

  it('editar a partir do detalhe: ao fechar o formulário, o foco volta para quem abriu o detalhe', async () => {
    const form: ContaFormData = { descricao: 'Boleto', valor: 10, data_competencia: '', data_vencimento: '2026-10-10', categoria_id: '', centro_custo_id: '', conta_id: '', forma_pagamento: 'boleto', observacoes: '', recorrente: false, frequencia: 'mensal', parcelas: 0 };
    function Tela() {
      const [detalhe, setDetalhe] = useState(false);
      const [formulario, setFormulario] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setDetalhe(true)}>Linha</button>
          <ContaDetailDialog open={detalhe} onOpenChange={setDetalhe} data={{ ...base, status: 'APROVADO', rateios: [] }} variant="pagar" canEdit onEdit={() => { setDetalhe(false); setFormulario(true); }} />
          <ContaFormDialog open={formulario} onOpenChange={() => {}} variant="pagar" form={form} onFormChange={() => {}} rateioLines={[]} onRateioLinesChange={() => {}} categorias={[]} centros={[]} contas={[]} isEditing saving={false} onSave={() => {}} onClose={() => setFormulario(false)} />
        </>
      );
    }
    render(<Tela />);
    const linha = screen.getByRole('button', { name: 'Linha' });
    linha.focus();
    fireEvent.click(linha);
    const editar = await screen.findByRole('button', { name: /Editar lançamento/ });
    await act(async () => { fireEvent.click(editar); });
    const formulario = await screen.findByRole('dialog', { name: 'Editar Conta a Pagar' });
    await act(async () => { fireEvent.click(within(formulario).getByRole('button', { name: 'Voltar' })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(linha));
  });
});
