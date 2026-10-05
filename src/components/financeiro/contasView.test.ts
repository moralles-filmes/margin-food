import { describe, expect, it } from 'vitest';
import { contaStatusBadge, contaVencida, contasCaption, detalheStatusBadge, totalFiltradoSub } from './contasView';

describe('contaVencida', () => {
  const hoje = '2026-10-04';
  it('vence só antes de hoje e só título em aberto', () => {
    expect(contaVencida('pagar', 'APROVADO', '2026-10-03', hoje)).toBe(true);
    expect(contaVencida('pagar', 'APROVADO', '2026-10-04', hoje)).toBe(false);
    expect(contaVencida('pagar', 'PAGO', '2026-09-01', hoje)).toBe(false);
    expect(contaVencida('pagar', 'CANCELADO', '2026-09-01', hoje)).toBe(false);
    expect(contaVencida('pagar', 'RASCUNHO', '2026-09-01', hoje)).toBe(true);
    expect(contaVencida('receber', 'A_RECEBER', '2026-09-30', hoje)).toBe(true);
    expect(contaVencida('receber', 'RECEBIDO', '2026-09-30', hoje)).toBe(false);
    // "PAGO" não encerra conta a receber (mesma regra de antes, por variante).
    expect(contaVencida('receber', 'PAGO', '2026-09-30', hoje)).toBe(true);
  });
});

describe('contaStatusBadge', () => {
  it('vencida vence o status gravado', () => {
    expect(contaStatusBadge('pagar', 'APROVADO', true)).toEqual({ label: 'Vencido', status: 'danger' });
    expect(contaStatusBadge('receber', 'A_RECEBER', true)).toEqual({ label: 'Vencido', status: 'danger' });
  });
  it('mantém os rótulos (com acento) e a cor semântica de cada status', () => {
    expect(contaStatusBadge('pagar', 'AGUARDANDO_APROVACAO', false)).toEqual({ label: 'Aguard. Aprovação', status: 'warning' });
    expect(contaStatusBadge('pagar', 'APROVADO', false)).toEqual({ label: 'Aprovado', status: 'info' });
    expect(contaStatusBadge('pagar', 'PAGO', false)).toEqual({ label: 'Pago', status: 'success' });
    expect(contaStatusBadge('pagar', 'CANCELADO', false)).toEqual({ label: 'Cancelado', status: 'neutral' });
    expect(contaStatusBadge('receber', 'RECEBIDO', false)).toEqual({ label: 'Recebido', status: 'success' });
  });
  it('status desconhecido cai em Rascunho, como antes', () => {
    expect(contaStatusBadge('pagar', 'QUALQUER', false)).toEqual({ label: 'Rascunho', status: 'neutral' });
    expect(contaStatusBadge('receber', 'APROVADO', false)).toEqual({ label: 'Rascunho', status: 'neutral' });
  });
});

describe('detalheStatusBadge', () => {
  it('cobre os status de título e de lançamento', () => {
    expect(detalheStatusBadge('PREVISTO')).toEqual({ label: 'Previsto', status: 'warning' });
    expect(detalheStatusBadge('REALIZADO')).toEqual({ label: 'Realizado', status: 'success' });
    expect(detalheStatusBadge('A_RECEBER')).toEqual({ label: 'A Receber', status: 'info' });
    expect(detalheStatusBadge('X')).toEqual({ label: 'Rascunho', status: 'neutral' });
  });
});

describe('legendas', () => {
  it('diz quantas contas aparecem e de quantas', () => {
    expect(contasCaption(0, 0)).toBe('');
    expect(contasCaption(1, 1)).toBe('1 conta');
    expect(contasCaption(7, 7)).toBe('7 contas');
    expect(contasCaption(50, 120)).toBe('Mostrando 50 de 120 contas');
  });
  it('total filtrado descreve a contagem da RPC', () => {
    expect(totalFiltradoSub(1)).toBe('1 lançamento com os filtros aplicados');
    expect(totalFiltradoSub(3)).toBe('3 lançamentos com os filtros aplicados');
  });
});
