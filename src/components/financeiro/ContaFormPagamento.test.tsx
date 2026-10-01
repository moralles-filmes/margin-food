import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContaFormDialog, { type ContaFormData } from './ContaFormDialog';
// Apenas o primitive de apresentação é simplificado. Não há transporte/banco simulado.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange?: (v: string) => void }) => <select aria-label="Seletor" value={value} onChange={e => onValueChange?.(e.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
vi.mock('@/components/compras/QuickSupplierDialog', () => ({ default: () => null }));
const base: ContaFormData = { descricao: 'Conta antiga', valor: 10, data_competencia: '2026-10-01', data_vencimento: '2026-10-10', categoria_id: '', centro_custo_id: '', conta_id: '', forma_pagamento: 'boleto', observacoes: '', recorrente: false, frequencia: 'mensal', parcelas: 0 };
function Form({ initial = base, variant = 'pagar' }: { initial?: ContaFormData; variant?: 'pagar' | 'receber' }) {
  const [form, setForm] = useState(initial);
  return <><ContaFormDialog open onOpenChange={() => {}} variant={variant} form={form} onFormChange={setForm} rateioLines={[]} onRateioLinesChange={() => {}} categorias={[]} centros={[]} contas={[]} isEditing saving={false} onSave={() => {}} onClose={() => {}} /><output data-testid="form">{JSON.stringify(form)}</output></>;
}
afterEach(cleanup);
describe('formulário existente de contas e dados de pagamento', () => {
  it('conta antiga abre sem exigir código; permite adicionar, alterar tipo e remover', () => {
    render(<Form />);
    expect(screen.getByText('Dados para pagamento')).toBeInTheDocument();
    expect(screen.queryByLabelText('Código / chave de pagamento')).not.toBeInTheDocument();
    const select = screen.getByRole('option', { name: 'Sem código' }).closest('select')!;
    fireEvent.change(select, { target: { value: 'boleto' } });
    fireEvent.change(screen.getByLabelText('Código / chave de pagamento'), { target: { value: '34191.79001 12345' } });
    expect(screen.getByTestId('form').textContent).toContain('34191.79001 12345');
    fireEvent.change(select, { target: { value: 'pix_chave' } });
    fireEvent.change(screen.getByLabelText('Código / chave de pagamento'), { target: { value: 'pix@example.com' } });
    expect(screen.getByTestId('form').textContent).toContain('pix_chave');
    fireEvent.change(select, { target: { value: 'sem_codigo' } });
    expect(screen.queryByLabelText('Código / chave de pagamento')).not.toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('form').textContent!).codigo_pagamento).toBe('');
  });
  it('edição mantém payload completo e avisa que recorrência não replica código', () => {
    const codigo = '000201' + 'PAYLOAD'.repeat(200);
    render(<Form initial={{ ...base, recorrente: true, parcelas: 3, tipo_codigo_pagamento: 'pix_copia_cola', codigo_pagamento: codigo }} />);
    expect(screen.getByLabelText('Código / chave de pagamento')).toHaveValue(codigo);
    expect(screen.getByText(/O código será salvo somente nesta parcela/)).toBeInTheDocument();
  });
  it('não adiciona campos ao formulário de contas a receber', () => {
    render(<Form variant="receber" />);
    expect(screen.queryByText('Dados para pagamento')).not.toBeInTheDocument();
  });
});
