import { describe, it, expect } from 'vitest';
import {
  ajustarQuantidade,
  formatarQuantidade,
  parseQuantidade,
  QUANTIDADE_MAXIMA,
  traduzirErroOperacional,
  validarQuantidade,
} from '@/domain/estoque/operacional';

describe('parseQuantidade', () => {
  it('aceita inteiro simples', () => {
    expect(parseQuantidade('12')).toBe(12);
  });

  it('aceita vírgula como separador decimal (teclado BR)', () => {
    expect(parseQuantidade('2,5')).toBe(2.5);
  });

  it('aceita ponto como separador decimal (teclado numérico)', () => {
    expect(parseQuantidade('2.5')).toBe(2.5);
  });

  it('ignora espaços nas bordas', () => {
    expect(parseQuantidade('  7 ')).toBe(7);
  });

  it('recusa texto vazio', () => {
    expect(parseQuantidade('')).toBeNull();
    expect(parseQuantidade('   ')).toBeNull();
  });

  it('recusa negativo — saída negativa viraria entrada silenciosa', () => {
    expect(parseQuantidade('-3')).toBeNull();
  });

  it('recusa notação científica', () => {
    expect(parseQuantidade('1e5')).toBeNull();
  });

  it('recusa texto não numérico', () => {
    expect(parseQuantidade('abc')).toBeNull();
    expect(parseQuantidade('12abc')).toBeNull();
  });

  it('recusa mais de 3 casas decimais (a coluna guarda 3)', () => {
    expect(parseQuantidade('1,2345')).toBeNull();
  });
});

describe('validarQuantidade', () => {
  it('aprova entrada acima do saldo — entrada sempre pode', () => {
    expect(validarQuantidade(100, 'ENTRADA', 0, 'UN').valida).toBe(true);
  });

  it('recusa saída acima do saldo com a quantidade real na mensagem', () => {
    const res = validarQuantidade(8, 'SAIDA', 5, 'UN');
    expect(res.valida).toBe(false);
    expect(res.erro).toContain('apenas 5 UN');
  });

  it('aprova saída exatamente igual ao saldo', () => {
    expect(validarQuantidade(5, 'SAIDA', 5, 'UN').valida).toBe(true);
  });

  it('recusa saída com estoque zerado', () => {
    expect(validarQuantidade(1, 'SAIDA', 0, 'UN').valida).toBe(false);
  });

  it('recusa zero e negativo', () => {
    expect(validarQuantidade(0, 'ENTRADA', 10, 'UN').valida).toBe(false);
    expect(validarQuantidade(-1, 'ENTRADA', 10, 'UN').valida).toBe(false);
  });

  it('recusa quantidade nula com mensagem própria', () => {
    expect(validarQuantidade(null, 'ENTRADA', 10, 'UN').erro).toBe('Informe a quantidade.');
  });

  it('recusa acima do limite de segurança', () => {
    expect(validarQuantidade(QUANTIDADE_MAXIMA + 1, 'ENTRADA', 0, 'UN').valida).toBe(false);
  });
});

describe('ajustarQuantidade', () => {
  it('soma e subtrai', () => {
    expect(ajustarQuantidade(3, 1)).toBe(4);
    expect(ajustarQuantidade(3, -1)).toBe(2);
  });

  it('nunca zera o lançamento pelo botão [-]', () => {
    expect(ajustarQuantidade(1, -1)).toBe(1);
    expect(ajustarQuantidade(null, -1)).toBe(1);
  });

  it('não AUMENTA a quantidade fracionada ao clicar [-]', () => {
    // Item em KG: com piso fixo em 1, 0,5 − 1 viraria 1 e o botão de diminuir
    // aumentaria o lançamento.
    expect(ajustarQuantidade(0.5, -1)).toBe(0.5);
    expect(ajustarQuantidade(0.25, -1)).toBe(0.25);
  });

  it('mantém o passo normal acima de 1', () => {
    expect(ajustarQuantidade(2.5, -1)).toBe(1.5);
  });

  it('trata campo vazio como zero e sobe para 1', () => {
    expect(ajustarQuantidade(null, 1)).toBe(1);
  });

  it('respeita o teto', () => {
    expect(ajustarQuantidade(QUANTIDADE_MAXIMA, 1)).toBe(QUANTIDADE_MAXIMA);
  });

  it('não acumula erro de ponto flutuante', () => {
    expect(ajustarQuantidade(0.1, 0.2)).toBe(0.3);
  });
});

describe('formatarQuantidade', () => {
  it('não mostra casas decimais desnecessárias', () => {
    expect(formatarQuantidade(12)).toBe('12');
  });

  it('mostra decimal quando existe', () => {
    expect(formatarQuantidade(2.5)).toBe('2,5');
  });

  it('usa separador de milhar brasileiro', () => {
    expect(formatarQuantidade(1234)).toBe('1.234');
  });

  it('sobrevive a valor inválido', () => {
    expect(formatarQuantidade(Number.NaN)).toBe('0');
  });
});

describe('traduzirErroOperacional', () => {
  it('extrai o saldo disponível da mensagem do servidor', () => {
    const msg = traduzirErroOperacional('SALDO_INSUFICIENTE: disponivel=5.000, solicitado=8');
    expect(msg).toContain('apenas 5');
    expect(msg).not.toContain('SALDO_INSUFICIENTE');
  });

  it('orienta o operador no caso de produto sem custo', () => {
    expect(traduzirErroOperacional('PRODUTO_SEM_CUSTO'))
      .toContain('Procure um responsável');
  });

  it('traduz setor não autorizado', () => {
    expect(traduzirErroOperacional('SETOR_NAO_AUTORIZADO'))
      .toBe('Você não tem autorização para movimentar este setor.');
  });

  it('traduz produto fora do setor', () => {
    expect(traduzirErroOperacional('PRODUTO_FORA_DO_SETOR'))
      .toContain('não está liberado para o setor');
  });

  it('traduz permissão negada sem jargão de RBAC', () => {
    const msg = traduzirErroOperacional('PERMISSION_DENIED: operacional:movimentacao:create');
    expect(msg).toBe('Você não tem permissão para registrar movimentações.');
  });

  it('traduz sessão sem tenant', () => {
    expect(traduzirErroOperacional('COMPANY_ACCESS_DENIED')).toContain('login novamente');
  });

  it('devolve fallback utilizável quando não reconhece a mensagem', () => {
    expect(traduzirErroOperacional(undefined)).toContain('Tente novamente');
  });
});
