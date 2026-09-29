/**
 * Chave de idempotência das criações do Financeiro (Livro Razão, transferência,
 * Contas a Pagar/Receber). Derivação e o porquê: `@/lib/chaveOperacao`.
 *
 * A semente é POR CONTEÚDO pendente (`criarChavesPendentes`), não uma só por
 * tela: com uma semente única que girava a cada sucesso, "A grava mas a
 * resposta se perde → B diferente dá certo → reenvio de A" saía com chave nova
 * e duplicava A. Aqui só a confirmação de A libera a semente de A.
 */

import { chaveOperacao, jsonCanonico, novaSemente } from '@/lib/chaveOperacao';

/**
 * @param escopo     tipo de operação ('lancamento', 'transferencia', 'conta_pagar'…),
 *                   para duas telas nunca gerarem a mesma chave
 * @param semente    troca só depois de uma criação confirmada
 * @param identidade o payload exato enviado à RPC (sem a própria chave)
 */
export function chaveIdempotencia(escopo: string, semente: string, identidade: unknown): Promise<string> {
  return chaveOperacao(semente, { escopo, identidade });
}

export interface ChavesPendentes {
  /** Chave do envio: reaproveita a semente enquanto este conteúdo não for confirmado. */
  chave(identidade: unknown): Promise<string>;
  /** Criação confirmada: o mesmo conteúdo enviado de novo depois disto é um lançamento novo. */
  confirmar(identidade: unknown): void;
}

/**
 * Sementes por conteúdo ainda não confirmado, para uma tela (`escopo`).
 *
 * Enquanto um conteúdo não recebe resposta de sucesso, reenviá-lo — duplo
 * clique, retry, fechar e reabrir o formulário, outras criações bem-sucedidas
 * no meio — gera sempre a mesma chave. Depois de `confirmar`, o mesmo conteúdo
 * ganha semente nova: dois lançamentos iguais em sequência são legítimos.
 */
export function criarChavesPendentes(
  escopo: string,
  gerarSemente: () => string = novaSemente,
): ChavesPendentes {
  const pendentes = new Map<string, string>();
  return {
    chave(identidade) {
      // A semente é escolhida antes do primeiro await: duas chamadas simultâneas
      // com o mesmo conteúdo nunca sorteiam sementes diferentes.
      const conteudo = jsonCanonico(identidade);
      let semente = pendentes.get(conteudo);
      if (!semente) {
        semente = gerarSemente();
        pendentes.set(conteudo, semente);
      }
      return chaveIdempotencia(escopo, semente, identidade);
    },
    confirmar(identidade) {
      pendentes.delete(jsonCanonico(identidade));
    },
  };
}

/**
 * Erros das RPCs de criação ligados à idempotência. Devolve `null` quando a
 * mensagem não é de idempotência, para a tela seguir com o tratamento dela.
 */
export function traduzirErroIdempotencia(mensagem: string | undefined): string | null {
  const msg = mensagem ?? '';
  if (msg.includes('REQUEST_ID_REUTILIZADO')) {
    // Só acontece se a chave de uma confirmação anterior for reenviada com outro
    // conteúdo. A tela renova a chave sozinha; a orientação é conferir e refazer.
    return 'Este envio não confere com o registro já gravado. Recarregue a tela e confira antes de lançar de novo.';
  }
  if (msg.includes('PARCELA_FORA_DE_ORDEM')) {
    return 'A lista de recorrências está desatualizada. Recarregue e tente de novo.';
  }
  if (msg.includes('LANCAMENTO_JA_VINCULADO')) {
    return 'Este lançamento do extrato já está vinculado a outro título ou baixa.';
  }
  if (msg.includes('IDEMPOTENCY_KEY_INVALIDA')) {
    return 'Não foi possível identificar este envio. Recarregue a tela e tente de novo.';
  }
  return null;
}
