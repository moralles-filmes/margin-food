import { describe, expect, it } from 'vitest';
import { mapSupplierRow, mensagemErroFornecedor, supplierContactInfo } from './fornecedores';

describe('mapSupplierRow', () => {
  it('lê os campos de contact_info e as colunas da Cotação', () => {
    const fornecedor = mapSupplierRow({
      id: 's1',
      name: 'Ambev',
      is_active: false,
      created_at: '2026-10-01T10:00:00Z',
      contact_info: { cnpj: '07.526.557/0001-00', contact: '11 9999', notes: 'nota', categoriasAtendidas: ['Bebidas'], prazoEntregaPadrao: 2, formaPagamentoPadrao: 'boleto' },
      minimum_order_value: '150.5',
      minimum_order_quantity: 3,
      whatsapp_number: '5511999990000',
    });
    expect(fornecedor).toEqual({
      id: 's1', name: 'Ambev', cnpj: '07.526.557/0001-00', contact: '11 9999', notes: 'nota', active: false,
      categoriasAtendidas: ['Bebidas'], prazoEntregaPadrao: 2, formaPagamentoPadrao: 'boleto', createdAt: '2026-10-01T10:00:00Z',
      pedidoMinimoValor: 150.5, pedidoMinimoQtd: 3, whatsappNumber: '5511999990000',
    });
  });

  it('contact_info nulo vira campos vazios', () => {
    const fornecedor = mapSupplierRow({ id: 's2', name: 'X', is_active: true, created_at: '', contact_info: null, minimum_order_value: null, minimum_order_quantity: null, whatsapp_number: null });
    expect(fornecedor).toMatchObject({ cnpj: '', contact: '', notes: '', categoriasAtendidas: [], prazoEntregaPadrao: 0, formaPagamentoPadrao: '', pedidoMinimoValor: 0, pedidoMinimoQtd: 0, whatsappNumber: '' });
  });
});

describe('supplierContactInfo', () => {
  it('monta o jsonb só com os campos de contato', () => {
    expect(supplierContactInfo({ cnpj: '1', contact: '2', notes: '3', categoriasAtendidas: ['a'], prazoEntregaPadrao: 5, formaPagamentoPadrao: 'pix', whatsappNumber: 'fora' }))
      .toEqual({ cnpj: '1', contact: '2', notes: '3', categoriasAtendidas: ['a'], prazoEntregaPadrao: 5, formaPagamentoPadrao: 'pix' });
  });
});

describe('mensagemErroFornecedor', () => {
  it('exclusão barrada por vínculo orienta desativar', () => {
    const msg = mensagemErroFornecedor('excluir', {
      code: '23503',
      message: 'update or delete on table "suppliers" violates foreign key constraint "fin_contas_pagar_supplier_id_fkey"',
    });
    expect(msg).toBe('Este fornecedor já foi usado em contas, pedidos ou cotações e não pode ser excluído. Desative-o para tirá-lo das listas.');
  });

  it('nome repetido na unidade vira mensagem legível', () => {
    const msg = mensagemErroFornecedor('cadastrar', {
      code: '23505',
      message: 'duplicate key value violates unique constraint "suppliers_name_company_key"',
    });
    expect(msg).toBe('Já existe um fornecedor com este nome nesta unidade. Confira a lista.');
  });

  it('recusa da RLS vira falta de permissão', () => {
    const msg = mensagemErroFornecedor('atualizar', { code: '42501', message: 'new row violates row-level security policy for table "suppliers"' });
    expect(msg).toBe('Sem permissão para atualizar fornecedores nesta unidade.');
  });

  it('outros erros mantêm a mensagem do banco', () => {
    expect(mensagemErroFornecedor('cadastrar', { message: 'timeout' })).toBe('Erro ao cadastrar fornecedor: timeout');
  });
});
