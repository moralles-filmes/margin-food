/**
 * Centro de custo nos relatórios do Financeiro (DRE, DFC e Dashboard).
 *
 * O servidor devolve, junto com `valores_por_categoria`, a mesma apuração quebrada por centro
 * (`valores_por_centro_custo`, chave = id do centro ou `sem_centro`) e a lista dos centros com valor
 * no período (`centros_custo`). Sem nenhum valor com centro no período as duas voltam vazias e a
 * tela não mostra nada de centro de custo — o relatório fica exatamente como era.
 *
 * Para cada categoria, a soma dos centros é o valor da categoria (o servidor garante); por isso
 * "Todos os centros" é sempre o próprio `valores_por_categoria`, sem somar nada no cliente.
 */

export const CENTRO_CUSTO_TODOS = 'todos';
/** Mesma chave que o servidor usa em `valores_por_centro_custo` para o valor sem centro. */
export const CENTRO_CUSTO_SEM = 'sem_centro';

const ROTULO_TODOS = 'Todos os centros de custo';
const ROTULO_SEM = 'Sem centro de custo';
const ROTULO_REMOVIDO = 'Centro de custo removido';

export interface CentroCustoResumo {
  id: string;
  nome: string;
}

export type ValoresPorCategoria = Record<string, number>;
export type ValoresPorCentroCusto = Record<string, ValoresPorCategoria>;

/** id → nome de todo centro já visto na tela, para rotular uma seleção fora do período atual. */
export type NomesCentroCusto = Record<string, string>;

/** Lê `centros_custo` da resposta da RPC; ausente (banco antigo) ou malformado vira lista vazia. */
export function lerCentrosCusto(valor: unknown): CentroCustoResumo[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((c): c is { id: unknown; nome: unknown } => typeof c === 'object' && c !== null)
    .map(c => ({ id: String(c.id), nome: String(c.nome) }));
}

export interface OpcaoCentroCusto {
  value: string;
  label: string;
}

/**
 * Valores por categoria do recorte escolhido.
 * Sem dado de centro no período, tudo é "sem centro": `SEM` devolve a base e um centro específico
 * não tem valor nenhum.
 */
export function valoresDoCentroCusto(
  base: ValoresPorCategoria,
  porCentro: ValoresPorCentroCusto | undefined,
  centros: readonly CentroCustoResumo[],
  selecao: string,
): ValoresPorCategoria {
  if (selecao === CENTRO_CUSTO_TODOS) return base;
  if (centros.length === 0) return selecao === CENTRO_CUSTO_SEM ? base : {};
  return porCentro?.[selecao] ?? {};
}

/**
 * O filtro só aparece quando o período tem valor com centro de custo — ou quando já há um recorte
 * escolhido, para ele não sumir (e a tela não voltar para "todos" sem aviso) ao trocar de mês.
 */
export function mostrarFiltroCentroCusto(centros: readonly CentroCustoResumo[], selecao: string): boolean {
  return centros.length > 0 || selecao !== CENTRO_CUSTO_TODOS;
}

/** Junta os centros do período ao registro de nomes já vistos. Devolve o mesmo objeto se nada mudou. */
export function registrarNomesCentroCusto(
  nomes: NomesCentroCusto,
  centros: readonly CentroCustoResumo[],
): NomesCentroCusto {
  const novos = centros.filter(c => nomes[c.id] !== c.nome);
  if (novos.length === 0) return nomes;
  const atualizado = { ...nomes };
  for (const c of novos) atualizado[c.id] = c.nome;
  return atualizado;
}

export function rotuloCentroCusto(selecao: string, nomes: NomesCentroCusto): string {
  if (selecao === CENTRO_CUSTO_TODOS) return '';
  if (selecao === CENTRO_CUSTO_SEM) return ROTULO_SEM;
  return nomes[selecao] ?? ROTULO_REMOVIDO;
}

/** Todos · centros do período (+ o escolhido, se estiver fora dele) · Sem centro de custo. */
export function opcoesCentroCusto(
  centros: readonly CentroCustoResumo[],
  selecao: string,
  nomes: NomesCentroCusto,
): OpcaoCentroCusto[] {
  const opcoes: OpcaoCentroCusto[] = [{ value: CENTRO_CUSTO_TODOS, label: ROTULO_TODOS }];
  for (const c of centros) opcoes.push({ value: c.id, label: c.nome });
  const selecaoForaDoPeriodo = selecao !== CENTRO_CUSTO_TODOS
    && selecao !== CENTRO_CUSTO_SEM
    && !centros.some(c => c.id === selecao);
  if (selecaoForaDoPeriodo) opcoes.push({ value: selecao, label: rotuloCentroCusto(selecao, nomes) });
  opcoes.push({ value: CENTRO_CUSTO_SEM, label: ROTULO_SEM });
  return opcoes;
}

export interface DespesaPorCentroCusto {
  centro_custo_id: string | null;
  nome: string;
  valor: number;
}

/** Maior despesa primeiro; "Sem centro de custo" sempre por último, por maior que seja. */
export function ordenarDespesasPorCentro(
  rows: readonly DespesaPorCentroCusto[],
): { nome: string; valor: number }[] {
  return [...rows]
    .sort((a, b) => {
      if ((a.centro_custo_id === null) !== (b.centro_custo_id === null)) return a.centro_custo_id === null ? 1 : -1;
      return b.valor - a.valor;
    })
    .map(r => ({ nome: r.nome, valor: r.valor }));
}
