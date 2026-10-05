import { describe, expect, it } from 'vitest';
import {
  CHIP_TOM,
  MATCH_ORIGEM,
  extratoLinhaFundo,
  extratoLinhaResolvida,
  extratoLinhaStatus,
  extratoLinhasCaption,
  extratoTipoBadge,
  lancamentoConciliacaoBadge,
  sugestoesLabel,
  type ExtratoLinhaEstado,
} from './conciliacaoView';

const base: ExtratoLinhaEstado = {
  isDone: false,
  isInternal: false,
  isAutomaticPending: false,
  isJaConciliada: false,
  isIgnorada: false,
  hasMatch: false,
  hasSuggestions: false,
};

describe('conciliacaoView', () => {
  it('status da linha segue a mesma precedência do render anterior', () => {
    expect(extratoLinhaStatus(base)).toEqual({ label: 'Criar novo', status: 'info' });
    expect(extratoLinhaStatus({ ...base, hasSuggestions: true })).toEqual({ label: 'Sugestão p/ conciliar', status: 'warning' });
    expect(extratoLinhaStatus({ ...base, hasMatch: true, hasSuggestions: true })).toEqual({ label: 'Conciliar c/ existente', status: 'success' });
    expect(extratoLinhaStatus({ ...base, isIgnorada: true, hasMatch: true })).toEqual({ label: 'Ignorado', status: 'neutral' });
    expect(extratoLinhaStatus({ ...base, isJaConciliada: true, isIgnorada: true })).toEqual({ label: 'Já conciliado', status: 'neutral' });
    expect(extratoLinhaStatus({ ...base, isAutomaticPending: true, isJaConciliada: true })).toEqual({ label: 'Tratamento pendente', status: 'warning' });
    expect(extratoLinhaStatus({ ...base, isInternal: true, isIgnorada: true })).toEqual({ label: 'Mov. interna', status: 'info' });
    expect(extratoLinhaStatus({ ...base, isDone: true, isInternal: true })).toEqual({ label: 'Concluído', status: 'success' });
  });

  it('"Criar novo" desmarcado fica neutro (o Processar não grava a linha); os demais selos não dependem da seleção', () => {
    expect(extratoLinhaStatus(base, false)).toEqual({ label: 'Criar novo', status: 'neutral' });
    expect(extratoLinhaStatus({ ...base, hasSuggestions: true }, false)).toEqual({ label: 'Sugestão p/ conciliar', status: 'warning' });
    expect(extratoLinhaStatus({ ...base, hasMatch: true }, false)).toEqual({ label: 'Conciliar c/ existente', status: 'success' });
  });

  it('fundo da linha usa tokens -soft e nunca opacidade', () => {
    expect(extratoLinhaFundo(base)).toBe('');
    expect(extratoLinhaFundo({ ...base, hasMatch: true })).toBe('bg-success-soft');
    expect(extratoLinhaFundo({ ...base, hasSuggestions: true })).toBe('bg-warning-soft');
    expect(extratoLinhaFundo({ ...base, isJaConciliada: true })).toBe('bg-muted');
    expect(extratoLinhaFundo({ ...base, isIgnorada: true })).toBe('bg-muted');
    expect(extratoLinhaFundo({ ...base, isInternal: true, isIgnorada: true })).toBe('bg-info-soft');
    expect(extratoLinhaFundo({ ...base, isAutomaticPending: true })).toBe('bg-warning-soft');
    const todas = [
      extratoLinhaFundo({ ...base, isDone: true }),
      ...Object.values(CHIP_TOM),
      ...Object.values(MATCH_ORIGEM).map(o => o.className),
    ].join(' ');
    expect(todas).not.toMatch(/\/\d|opacity|#[0-9a-f]{3,6}|dark:/i);
  });

  it('linha resolvida = conciliada ou ignorada', () => {
    expect(extratoLinhaResolvida(base)).toBe(false);
    expect(extratoLinhaResolvida({ ...base, isJaConciliada: true })).toBe(true);
    expect(extratoLinhaResolvida({ ...base, isIgnorada: true })).toBe(true);
  });

  it('tipo da linha: ContaMax é interna, o resto Receita/Despesa', () => {
    expect(extratoTipoBadge('RECEITA', false)).toEqual({ label: 'Receita', status: 'success' });
    expect(extratoTipoBadge('DESPESA', false)).toEqual({ label: 'Despesa', status: 'danger' });
    expect(extratoTipoBadge('DESPESA', true)).toEqual({ label: 'Interna', status: 'neutral' });
  });

  it('rótulos de contagem', () => {
    expect(sugestoesLabel(1)).toBe('1 sugestão');
    expect(sugestoesLabel(3)).toBe('3 sugestões');
    expect(extratoLinhasCaption(13, 13)).toBe('13 linhas');
    expect(extratoLinhasCaption(1, 1)).toBe('1 linha');
    expect(extratoLinhasCaption(3, 13)).toBe('Mostrando 3 de 13 linhas');
  });

  it('situação do lançamento usa o vocabulário Conciliado/Pendente', () => {
    expect(lancamentoConciliacaoBadge(true)).toEqual({ label: 'Conciliado', status: 'success' });
    expect(lancamentoConciliacaoBadge(false)).toEqual({ label: 'Pendente', status: 'warning' });
    expect(lancamentoConciliacaoBadge(null)).toEqual({ label: 'Pendente', status: 'warning' });
  });
});
