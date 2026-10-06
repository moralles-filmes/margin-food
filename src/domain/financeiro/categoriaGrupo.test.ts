import { describe, expect, it } from 'vitest';
import {
  GRUPO_OPTIONS,
  grupoDeOutroTipo,
  grupoHerdado,
  grupoLabel,
  grupoObrigatorio,
  grupoOptionsForTipo,
  type CategoriaGrupoNode,
} from './categoriaGrupo';

describe('grupo da categoria financeira', () => {
  it('mantém os valores gravados que a Apresentação Sócios lê', () => {
    expect(GRUPO_OPTIONS.map(option => option.value)).toEqual([
      'receita_operacional', 'outras_receitas', 'receita_financeira',
      'cmv', 'impostos', 'taxa', 'pessoal', 'ocupacao', 'utilidades',
      'marketing', 'administrativa', 'manutencao', 'financeira',
      'investimento', 'empréstimo', 'aporte', 'dividendos',
    ]);
  });

  it('exibe o nome legível e preserva valor desconhecido', () => {
    expect(grupoLabel('cmv')).toBe('CMV');
    expect(grupoLabel(' Empréstimo ')).toBe('Empréstimos');
    expect(grupoLabel('alimentação')).toBe('alimentação');
    expect(grupoLabel('')).toBeNull();
    expect(grupoLabel(null)).toBeNull();
  });

  it('oferece só as opções do tipo da categoria', () => {
    expect(grupoOptionsForTipo('receita', '').map(option => option.value)).toEqual([
      'receita_operacional', 'outras_receitas', 'receita_financeira', 'aporte',
    ]);
    expect(grupoOptionsForTipo('despesa', '').map(option => option.value)).not.toContain('aporte');
  });

  it('mantém na lista o valor já gravado de outro tipo ou fora da lista', () => {
    const despesaComGrupoDeReceita = grupoOptionsForTipo('despesa', 'receita_operacional');
    expect(despesaComGrupoDeReceita.at(-1)).toEqual({
      value: 'receita_operacional', label: 'Receita operacional', tipo: 'despesa',
    });

    const desconhecido = grupoOptionsForTipo('despesa', 'alimentação');
    expect(desconhecido.at(-1)?.value).toBe('alimentação');

    expect(grupoOptionsForTipo('despesa', 'cmv')).toHaveLength(
      GRUPO_OPTIONS.filter(option => option.tipo === 'despesa').length,
    );
  });

  it('detecta grupo conhecido de outro tipo ao trocar o tipo da categoria', () => {
    expect(grupoDeOutroTipo('cmv', 'receita')).toBe(true);
    expect(grupoDeOutroTipo('cmv', 'despesa')).toBe(false);
    expect(grupoDeOutroTipo('alimentação', 'receita')).toBe(false);
    expect(grupoDeOutroTipo('', 'receita')).toBe(false);
  });

  it('herda o grupo do ancestral mais próximo', () => {
    const categorias: CategoriaGrupoNode[] = [
      { id: 'raiz', parent_id: null, grupo: null },
      { id: 'cmv', parent_id: 'raiz', grupo: ' CMV ' },
      { id: 'carnes', parent_id: 'cmv', grupo: '' },
      { id: 'pessoal', parent_id: 'raiz', grupo: 'pessoal' },
    ];

    expect(grupoHerdado('carnes', categorias)).toBe('cmv');
    expect(grupoHerdado('pessoal', categorias)).toBe('pessoal');
    expect(grupoHerdado('raiz', categorias)).toBeNull();
    expect(grupoHerdado(null, categorias)).toBeNull();
    expect(grupoHerdado('inexistente', categorias)).toBeNull();
  });

  it('não entra em laço com árvore circular', () => {
    const categorias: CategoriaGrupoNode[] = [
      { id: 'a', parent_id: 'b', grupo: null },
      { id: 'b', parent_id: 'a', grupo: null },
    ];

    expect(grupoHerdado('a', categorias)).toBeNull();
  });

  it('exige grupo quando não há o que herdar, menos em não operacional', () => {
    const categorias: CategoriaGrupoNode[] = [
      { id: 'legado', parent_id: null, grupo: null },
      { id: 'despesas', parent_id: null, grupo: 'administrativa' },
      { id: 'pessoal', parent_id: 'despesas', grupo: null },
    ];

    // Categoria principal: nada acima para herdar.
    expect(grupoObrigatorio('', categorias, false)).toBe(true);
    expect(grupoObrigatorio(null, categorias, false)).toBe(true);
    // Filha de raiz antiga sem grupo também não herda nada.
    expect(grupoObrigatorio('legado', categorias, false)).toBe(true);
    // Herda de qualquer ancestral.
    expect(grupoObrigatorio('despesas', categorias, false)).toBe(false);
    expect(grupoObrigatorio('pessoal', categorias, false)).toBe(false);
    // RECEITAS/DESPESAS NÃO OPERACIONAIS nunca entram nos detalhamentos.
    expect(grupoObrigatorio('', categorias, true)).toBe(false);
  });
});
