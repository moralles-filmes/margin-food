/**
 * Grupo gerencial da categoria financeira (`fin_categorias.grupo`).
 *
 * O `value` é o texto gravado no banco e lido pela Apresentação Sócios para
 * montar os detalhamentos (CMV, Pessoal, Operações…) — nunca renomear, nem
 * corrigir o acento de 'empréstimo'; só o `label` é exibido.
 *
 * Categoria sem grupo próprio usa o grupo do ancestral mais próximo (mesma
 * regra de `categoryGroup` na Apresentação e de `own_group`/`effective_group`
 * nas RPCs `get_fin_presentation_*`).
 */

export type CategoriaTipo = 'receita' | 'despesa';

export interface GrupoOption {
  value: string;
  label: string;
  tipo: CategoriaTipo;
}

export const GRUPO_OPTIONS: readonly GrupoOption[] = [
  { value: 'receita_operacional', label: 'Receita operacional', tipo: 'receita' },
  { value: 'outras_receitas', label: 'Outras receitas', tipo: 'receita' },
  { value: 'receita_financeira', label: 'Receita financeira', tipo: 'receita' },
  { value: 'cmv', label: 'CMV', tipo: 'despesa' },
  { value: 'impostos', label: 'Impostos sobre vendas', tipo: 'despesa' },
  { value: 'taxa', label: 'Taxas (cartão, marketplace)', tipo: 'despesa' },
  { value: 'pessoal', label: 'Pessoal', tipo: 'despesa' },
  { value: 'ocupacao', label: 'Ocupação (aluguel, IPTU)', tipo: 'despesa' },
  { value: 'utilidades', label: 'Utilidades (luz, água, gás)', tipo: 'despesa' },
  { value: 'marketing', label: 'Vendas e marketing', tipo: 'despesa' },
  { value: 'administrativa', label: 'Administrativas', tipo: 'despesa' },
  { value: 'manutencao', label: 'Manutenção', tipo: 'despesa' },
  { value: 'financeira', label: 'Financeiras (juros, tarifas)', tipo: 'despesa' },
  { value: 'investimento', label: 'Investimentos', tipo: 'despesa' },
  { value: 'empréstimo', label: 'Empréstimos', tipo: 'despesa' },
  { value: 'aporte', label: 'Aportes de sócios', tipo: 'receita' },
  { value: 'dividendos', label: 'Distribuição de lucros', tipo: 'despesa' },
];

/** Mesma normalização das RPCs (`lower(btrim(grupo))`); vazio vira `null`. */
export function normalizarGrupo(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase('pt-BR');
  return normalized ? normalized : null;
}

function opcaoDoGrupo(value: string | null | undefined): GrupoOption | undefined {
  const normalized = normalizarGrupo(value);
  if (normalized === null) return undefined;
  return GRUPO_OPTIONS.find(option => option.value === normalized);
}

/** Nome exibido do grupo; valor fora da lista aparece como foi gravado. */
export function grupoLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return opcaoDoGrupo(trimmed)?.label ?? trimmed;
}

/** `true` só quando o grupo é conhecido e pertence ao outro tipo de categoria. */
export function grupoDeOutroTipo(value: string | null | undefined, tipo: string): boolean {
  const option = opcaoDoGrupo(value);
  return option !== undefined && option.tipo !== tipo;
}

/**
 * Opções do tipo da categoria. O valor já gravado continua na lista mesmo que
 * seja de outro tipo ou desconhecido — sem isso o select apareceria vazio e a
 * próxima gravação apagaria o grupo sem ninguém ter escolhido isso.
 */
export function grupoOptionsForTipo(tipo: string, atual: string | null | undefined): GrupoOption[] {
  const options = GRUPO_OPTIONS.filter(option => option.tipo === tipo);
  const value = atual ?? '';
  if (value === '' || options.some(option => option.value === value)) return options;
  return [
    ...options,
    { value, label: grupoLabel(value) ?? value, tipo: tipo === 'receita' ? 'receita' : 'despesa' },
  ];
}

export interface CategoriaGrupoNode {
  id: string;
  parent_id: string | null;
  grupo: string | null;
}

/** Grupo que uma categoria sem grupo próprio herdaria a partir de `parentId`. */
export function grupoHerdado(
  parentId: string | null | undefined,
  categorias: readonly CategoriaGrupoNode[],
): string | null {
  const porId = new Map(categorias.map(categoria => [categoria.id, categoria]));
  const visitados = new Set<string>();
  let atual = parentId ? porId.get(parentId) : undefined;

  while (atual && !visitados.has(atual.id)) {
    const grupo = normalizarGrupo(atual.grupo);
    if (grupo !== null) return grupo;
    visitados.add(atual.id);
    atual = atual.parent_id ? porId.get(atual.parent_id) : undefined;
  }
  return null;
}

/**
 * Sem grupo próprio nem herdado, a despesa some dos detalhamentos da
 * Apresentação Sócios. Por isso o grupo é obrigatório quando não há o que
 * herdar — sempre, na categoria principal. Não operacional fica de fora: nunca
 * entra nos detalhamentos.
 */
export function grupoObrigatorio(
  parentId: string | null | undefined,
  categorias: readonly CategoriaGrupoNode[],
  naoOperacional: boolean,
): boolean {
  return !naoOperacional && grupoHerdado(parentId, categorias) === null;
}
