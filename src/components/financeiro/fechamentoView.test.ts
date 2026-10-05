import { describe, expect, it } from 'vitest';
import {
  PLANO_NATUREZA_LABEL,
  PLANO_TIPO_LABEL,
  categoriaTipoBadge,
  diasFechamentoLabel,
  periodoFechamentoLabel,
  rotuloOuValor,
} from './fechamentoView';

describe('fechamentoView', () => {
  it('período dos números exibidos, inclusive filtro aberto', () => {
    expect(periodoFechamentoLabel('2026-10-01', '2026-10-31')).toBe('01/10/2026 a 31/10/2026');
    expect(periodoFechamentoLabel('2026-10-05', '2026-10-05')).toBe('05/10/2026');
    expect(periodoFechamentoLabel('2026-10-01', '')).toBe('a partir de 01/10/2026');
    expect(periodoFechamentoLabel('', '2026-10-31')).toBe('até 31/10/2026');
    expect(periodoFechamentoLabel('', '')).toBe('todo o histórico');
  });

  it('contagem de dias no singular e no plural', () => {
    expect(diasFechamentoLabel(1)).toBe('1 dia com fechamento');
    expect(diasFechamentoLabel(5)).toBe('5 dias com fechamento');
  });

  it('tipo e natureza do plano usam os rótulos do formulário; valor legado aparece cru', () => {
    expect(rotuloOuValor(PLANO_TIPO_LABEL, 'patrimonio')).toBe('Patrimônio');
    expect(rotuloOuValor(PLANO_NATUREZA_LABEL, 'nao_operacional')).toBe('Não Operacional');
    expect(rotuloOuValor(PLANO_TIPO_LABEL, 'compensacao')).toBe('compensacao');
    expect(rotuloOuValor(PLANO_TIPO_LABEL, null)).toBe('—');
  });

  it('selo do tipo da categoria com a semântica de Recorrências', () => {
    expect(categoriaTipoBadge('receita')).toEqual({ status: 'success', label: 'Receita' });
    expect(categoriaTipoBadge('despesa')).toEqual({ status: 'danger', label: 'Despesa' });
    expect(categoriaTipoBadge('outro')).toEqual({ status: 'neutral', label: 'outro' });
  });
});
