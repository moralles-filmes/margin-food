import { describe, expect, it } from 'vitest';
import { mensagemErroEscala } from './escala';

describe('mensagemErroEscala', () => {
  it('permissão de criar tem mensagem própria; as demais caem em "alterar"', () => {
    expect(mensagemErroEscala('PERMISSION_DENIED: rh:escalas:create')).toBe('Você não tem permissão para criar escalas.');
    expect(mensagemErroEscala('PERMISSION_DENIED: rh:escalas:edit')).toBe('Você não tem permissão para alterar escalas.');
  });

  it('erros de estado e de validação do servidor', () => {
    expect(mensagemErroEscala('ESCALA_PUBLICADA')).toBe('A escala já foi publicada e não pode mais ser alterada.');
    expect(mensagemErroEscala('DIA_FORA_DA_SEMANA')).toBe('O dia escolhido não pertence à semana da escala.');
    expect(mensagemErroEscala('COLABORADOR_INVALIDO')).toBe('Colaborador não encontrado ou inativo nesta unidade.');
    expect(mensagemErroEscala('TURNO_DUPLICADO')).toBe('Esse colaborador já tem um turno começando nesse horário no mesmo dia.');
    expect(mensagemErroEscala('TROCA_JA_DECIDIDA')).toBe('Essa troca de turno já foi decidida.');
    expect(mensagemErroEscala('ESCALA_ALTERADA'))
      .toBe('Outra pessoa alterou a escala enquanto você revisava. Confira os turnos recarregados e publique de novo.');
    expect(mensagemErroEscala('ESCALA_VAZIA')).toBe('A escala não tem turnos para publicar.');
    expect(mensagemErroEscala('HORARIO_INVALIDO')).toBe('Turno de trabalho precisa ter início e fim diferentes.');
    expect(mensagemErroEscala('NOT_FOUND')).toBe('Registro não encontrado nesta unidade. A escala foi recarregada.');
  });

  it('erro desconhecido mostra o texto do servidor', () => {
    expect(mensagemErroEscala('falha de rede')).toBe('Erro: falha de rede');
    expect(mensagemErroEscala(undefined)).toBe('Erro: falha desconhecida');
  });
});
