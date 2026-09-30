import { describe, expect, it } from 'vitest';
import { mensagemErroFolha } from './folha';

describe('mensagemErroFolha', () => {
  it('status mudou entre abrir e clicar: diz o status atual, não o erro técnico', () => {
    expect(mensagemErroFolha('STATUS_INVALIDO: PAGO -> APROVADO')).toBe(
      'A folha está paga — a lista foi atualizada. Confira antes de repetir.',
    );
    expect(mensagemErroFolha('FOLHA_TRANSICAO_INVALIDA: APROVADO -> CALCULADO')).toContain('aprovada');
  });

  it('folha fechada não é recalculada', () => {
    expect(mensagemErroFolha('FOLHA_FECHADA: folha PAGO não pode ser recalculada'))
      .toBe('Folha aprovada ou paga não pode ser recalculada.');
  });

  it('permissão e folha inexistente', () => {
    expect(mensagemErroFolha('PERMISSION_DENIED: rh:folha:manage')).toBe('Sem permissão para gerenciar a folha.');
    expect(mensagemErroFolha('NOT_FOUND')).toContain('não encontrada');
  });

  it('erro desconhecido passa adiante; vazio vira genérico', () => {
    expect(mensagemErroFolha('falha de rede')).toBe('falha de rede');
    expect(mensagemErroFolha(undefined)).toBe('Erro ao atualizar a folha.');
  });
});
