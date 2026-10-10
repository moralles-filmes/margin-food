import { describe, expect, it } from 'vitest';
import { mapPagamentoError } from './financeiroErrorMap';

describe('mapPagamentoError', () => {
  it('linha de rateio sem categoria diz o que corrigir, sem o código cru', () => {
    const msg = mapPagamentoError({ message: 'RATEIO_SEM_CATEGORIA: selecione a categoria em todas as linhas do rateio' });
    expect(msg).not.toContain('RATEIO_SEM_CATEGORIA');
    expect(msg).toContain('Escolha a categoria em todas as linhas');
  });
});
