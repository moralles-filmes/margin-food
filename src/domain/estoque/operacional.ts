/**
 * ─── Movimentação Operacional — regras puras ───
 *
 * Funções sem dependência de React, Supabase ou DOM, para serem testadas
 * isoladamente. A validação que vale é sempre a do banco
 * (`op_registrar_movimentacao`); o que está aqui existe para dar resposta
 * imediata na tela e traduzir o erro do servidor em texto que o operador
 * entenda — nunca para substituir o gate do servidor.
 *
 * O operacional só registra SAÍDA; entrada é lançada no módulo administrativo.
 * O banco recusa qualquer outro tipo (`TIPO_INVALIDO`).
 */

import type { ChavesPendentes } from '@/lib/chaveOperacao';

export interface SetorOperacional {
  setorId: string;
  nome: string;
}

export interface ProdutoOperacional {
  produtoId: string;
  nome: string;
  sku: string;
  unidadeMedida: string;
  /** Saldo em unidade base. Único número "de estoque" que o operador enxerga. */
  saldo: number;
  /** true quando o setor já tem catálogo próprio montado. */
  vinculado: boolean;
}

export interface MovimentacaoOperacionalRegistrada {
  id: string;
  idempotente: boolean;
  produtoNome: string;
  unidadeMedida: string;
  setor: string;
  quantidade: number;
  saldoAnterior: number;
  saldoNovo: number;
}

/** Limite de segurança para o campo de quantidade (evita dedo escorregando no teclado). */
export const QUANTIDADE_MAXIMA = 999_999;

/** Itens por saída em lote — mesmo limite do servidor (`op_registrar_saidas_lote`). */
export const LOTE_MAXIMO_ITENS = 50;

/**
 * Converte o texto digitado em número.
 *
 * Aceita vírgula ou ponto como separador decimal porque o operador digita no
 * teclado do celular sem pensar em locale. Devolve `null` quando o texto não
 * representa um número utilizável — quem chama decide a mensagem.
 */
export function parseQuantidade(raw: string): number | null {
  const texto = raw.trim();
  if (!texto) return null;

  // Só dígitos, um separador decimal e sinal ausente. Nada de notação científica.
  if (!/^\d{1,7}([.,]\d{1,3})?$/.test(texto)) return null;

  const valor = Number(texto.replace(',', '.'));
  if (!Number.isFinite(valor)) return null;
  return valor;
}

export interface ValidacaoQuantidade {
  valida: boolean;
  /** Mensagem pronta para a tela quando `valida` é false. */
  erro?: string;
}

/**
 * Valida a quantidade da saída contra o saldo conhecido.
 *
 * `saldoDisponivel` é o saldo que a tela carregou — pode estar desatualizado se
 * outra pessoa movimentou o mesmo item nesse meio tempo. Por isso o bloqueio
 * definitivo é do banco; aqui só evitamos a ida ao servidor no caso óbvio.
 */
export function validarQuantidade(
  quantidade: number | null,
  saldoDisponivel: number,
  unidade: string,
): ValidacaoQuantidade {
  if (quantidade === null) {
    return { valida: false, erro: 'Informe a quantidade.' };
  }
  if (quantidade <= 0) {
    return { valida: false, erro: 'A quantidade precisa ser maior que zero.' };
  }
  if (quantidade > QUANTIDADE_MAXIMA) {
    return { valida: false, erro: `Quantidade acima do limite (${QUANTIDADE_MAXIMA}).` };
  }
  if (quantidade > saldoDisponivel) {
    return {
      valida: false,
      erro: `Quantidade indisponível. Existem apenas ${formatarQuantidade(saldoDisponivel)} ${unidade} neste setor.`,
    };
  }
  return { valida: true };
}

/**
 * Passo do botão [-] / [+].
 *
 * O piso não é 1 fixo: em item pesado (0,5 KG), um piso de 1 faria o [-]
 * AUMENTAR a quantidade. Quando o passo levaria a zero ou negativo, a regra é
 * manter o valor atual — o botão não tem efeito em vez de ter o efeito contrário.
 */
export function ajustarQuantidade(atual: number | null, delta: number): number {
  const base = atual ?? 0;
  const proximo = Math.round((base + delta) * 1000) / 1000;
  if (proximo <= 0) return base > 0 ? base : 1;
  if (proximo > QUANTIDADE_MAXIMA) return QUANTIDADE_MAXIMA;
  return proximo;
}

/**
 * Formata para EXIBIÇÃO: 12 em vez de 12,000, 2,5 em vez de 2,500, 1.234 com
 * separador de milhar.
 *
 * Não use para preencher o campo de quantidade — o separador de milhar volta a
 * passar por `parseQuantidade`. Para isso existe `quantidadeParaCampo`.
 */
export function formatarQuantidade(valor: number): string {
  if (!Number.isFinite(valor)) return '0';
  const arredondado = Math.round(valor * 1000) / 1000;
  return arredondado.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

/**
 * Formata para REALIMENTAR o campo editável de quantidade.
 *
 * Sem separador de milhar, de propósito: `formatarQuantidade(1001)` é `"1.001"`
 * e `parseQuantidade("1.001")` é `1,001` — o ponto é decimal em JS. Escrever o
 * texto agrupado de volta no input fazia o [+] em 1000 virar 1,001 sem nenhum
 * erro na tela, gravando ~1000x menos do que o operador enxergava.
 * O invariante é `parseQuantidade(quantidadeParaCampo(x)) === x`.
 */
export function quantidadeParaCampo(valor: number): string {
  if (!Number.isFinite(valor)) return '';
  const arredondado = Math.round(valor * 1000) / 1000;
  return arredondado.toLocaleString('pt-BR', {
    useGrouping: false,
    maximumFractionDigits: 3,
  });
}

/**
 * Chave de idempotência da confirmação.
 *
 * Determinística de propósito: repetir a MESMA operação (retry depois de falha
 * de rede) reaproveita a chave e o servidor devolve o lançamento original;
 * mudar produto, setor ou quantidade produz chave nova, então um reenvio
 * nunca é confundido com a operação anterior. A `semente` é a pendente desta
 * saída (`chaveSaida`), liberada só quando ela é confirmada.
 */
export function chaveRequisicao(
  semente: string,
  produtoId: string,
  setorId: string,
  quantidade: number | null,
): string {
  return [semente, produtoId, setorId, quantidade ?? ''].join('|');
}

/** O que `op_registrar_movimentacao` compara no reenvio (o tipo é sempre SAIDA). */
export interface IdentidadeSaida {
  produtoId: string;
  setorId: string;
  quantidade: number;
}

/**
 * Chave de uma saída, unitária ou item de lista: semente pendente DESTE
 * conteúdo (`useChavesPendentes('operacional-saida')`) + identidade. Uma saída
 * gravada sem resposta mantém a chave até ser confirmada — mesmo que o
 * operador lance outra no meio, ou a coloque numa lista —, e o servidor
 * devolve a já gravada em vez de dar saída duas vezes. Chame só no envio.
 */
export function chaveSaida(pendentes: ChavesPendentes<IdentidadeSaida>, saida: IdentidadeSaida): string {
  return chaveRequisicao(pendentes.semente(saida), saida.produtoId, saida.setorId, saida.quantidade);
}

/**
 * Traduz o erro do `op_registrar_movimentacao` para o operador.
 *
 * As mensagens evitam vocabulário administrativo: o operador não precisa saber
 * o que é RBAC nem o que é custo médio — precisa saber o que fazer agora.
 */
export function traduzirErroOperacional(mensagem: string | undefined): string {
  const msg = mensagem ?? '';

  if (msg.includes('SALDO_INSUFICIENTE')) {
    const disponivel = /disponivel=([\d.]+)/.exec(msg)?.[1];
    return disponivel !== undefined
      ? `Quantidade indisponível. Existem apenas ${formatarQuantidade(Number(disponivel))} neste setor.`
      : 'Quantidade indisponível para este produto.';
  }
  if (msg.includes('PRODUTO_SEM_CUSTO')) {
    return 'Este produto ainda não tem custo cadastrado. Procure um responsável antes de dar saída.';
  }
  if (msg.includes('PRODUTO_FORA_DO_SETOR')) {
    return 'Este produto não está liberado para o setor selecionado.';
  }
  if (msg.includes('PRODUTO_NAO_ENCONTRADO')) {
    return 'Produto não encontrado ou inativo.';
  }
  if (msg.includes('SETOR_NAO_AUTORIZADO')) {
    return 'Você não tem autorização para movimentar este setor.';
  }
  if (msg.includes('QUANTIDADE_INVALIDA')) {
    return 'A quantidade precisa ser maior que zero.';
  }
  if (msg.includes('REQUEST_ID_REUTILIZADO')) {
    // Só acontece se algo reenviar a chave de uma confirmação anterior para
    // outra operação. A tela renova a chave sozinha; a orientação é refazer.
    return 'Esta confirmação não confere com o lançamento anterior. Refaça o lançamento.';
  }
  if (msg.includes('TIPO_INVALIDO')) {
    return 'A movimentação operacional só registra saída. Entradas são lançadas no Controle de Estoque.';
  }
  // Erros da saída em lote (op_registrar_saidas_lote).
  if (msg.includes('LOTE_TAMANHO_INVALIDO')) {
    return `Uma saída pode ter no máximo ${LOTE_MAXIMO_ITENS} itens. Confirme esta e comece outra.`;
  }
  if (msg.includes('LOTE_ITEM_INVALIDO')) {
    return 'Este item está incompleto. Remova-o e adicione de novo.';
  }
  if (msg.includes('LOTE_INVALIDO')) {
    return 'Não foi possível montar a lista de saída. Refaça o lançamento.';
  }
  if (msg.includes('PERMISSION_DENIED')) {
    return 'Você não tem permissão para registrar movimentações.';
  }
  if (msg.includes('COMPANY_ACCESS_DENIED')) {
    return 'Sua sessão não está vinculada a uma unidade válida. Faça login novamente.';
  }
  return msg || 'Não foi possível registrar a movimentação. Tente novamente.';
}
