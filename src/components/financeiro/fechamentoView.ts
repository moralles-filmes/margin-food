import { formatDateBR, parseLocalDate } from '@/lib/formatters';

/**
 * Rótulos e limites de apresentação do Fechamento de Caixa e dos Cadastros Base (Redesign V2, Fase
 * 05B). Só texto e números de layout: nenhuma consulta, soma ou regra de negócio mora aqui.
 */

/** Abaixo disto a lista de fechamentos vira cartões (a tabela de 7 colunas precisa de ~980 px; 1366 px com sidebar dá 1022). */
export const FECHAMENTO_LISTA_LIMITE_PX = 1000;
/** Marcas: 5 colunas com Switch e edição. */
export const MARCAS_LISTA_LIMITE_PX = 720;
/** Plano de Contas: código, nome, tipo, natureza e ações. */
export const PLANO_LISTA_LIMITE_PX = 640;
/** Centros de Custo: nome, descrição e ações. */
export const CENTROS_LISTA_LIMITE_PX = 560;
/** Regras de categorização: padrão, tipo, categoria, centro, prioridade e ações. */
export const REGRAS_LISTA_LIMITE_PX = 760;

const dataBR = (iso: string) => formatDateBR(parseLocalDate(iso));

/** Período dos números exibidos — o do filtro da última carga que deu certo, não o do campo em edição. */
export function periodoFechamentoLabel(inicio: string, fim: string): string {
  if (inicio && fim) return inicio === fim ? dataBR(inicio) : `${dataBR(inicio)} a ${dataBR(fim)}`;
  if (inicio) return `a partir de ${dataBR(inicio)}`;
  if (fim) return `até ${dataBR(fim)}`;
  return 'todo o histórico';
}

export function diasFechamentoLabel(dias: number): string {
  return dias === 1 ? '1 dia com fechamento' : `${dias} dias com fechamento`;
}

/** Tipo da conta contábil — os mesmos rótulos das opções do formulário. */
export const PLANO_TIPO_LABEL: Record<string, string> = {
  receita: 'Receita',
  despesa: 'Despesa',
  ativo: 'Ativo',
  passivo: 'Passivo',
  patrimonio: 'Patrimônio',
};

/** Natureza da conta contábil — os mesmos rótulos das opções do formulário. */
export const PLANO_NATUREZA_LABEL: Record<string, string> = {
  operacional: 'Operacional',
  financeira: 'Financeira',
  nao_operacional: 'Não Operacional',
};

/** Rótulo do mapa; valor fora dele (legado) aparece cru, nunca some. */
export function rotuloOuValor(mapa: Record<string, string>, valor: string | null | undefined): string {
  if (!valor) return '—';
  return mapa[valor] ?? valor;
}

/** Selo do tipo da categoria (receita/despesa), com a mesma semântica de Recorrências (D57). */
export function categoriaTipoBadge(tipo: string): { status: 'success' | 'danger' | 'neutral'; label: string } {
  if (tipo === 'receita') return { status: 'success', label: 'Receita' };
  if (tipo === 'despesa') return { status: 'danger', label: 'Despesa' };
  return { status: 'neutral', label: tipo };
}

/** Tipo de correspondência da regra de categorização. */
export const MATCH_LABELS: Record<string, string> = { contem: 'Contém', exato: 'Exato', regex: 'Regex' };
