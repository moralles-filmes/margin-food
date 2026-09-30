/**
 * ─── Chave de idempotência da criação de componente (Ficha Técnica) ───
 *
 * `criar_componente` (Edge `ficha-tecnica` → `ficha_criar_componente_atomic`)
 * grava cabeçalho e BOM numa transação. A chave cobre tudo o que o usuário
 * preencheu: o retry do mesmo formulário reaproveita a chave e recebe o
 * componente já criado; mudar qualquer campo ou item gera chave nova. O
 * servidor, no reenvio, compara tipo, nome e o conjunto de itens. Semente,
 * derivação e o porquê: `@/lib/chaveOperacao`.
 */

import { chaveOperacao } from '@/lib/chaveOperacao';

export interface ItemComponenteChave {
  produto_id: string | null;
  componente_filho_id: string | null;
  quantidade: number;
  unidade: string;
  origem: string;
}

export function chaveCriacaoComponente(
  semente: string,
  dados: { campos: Record<string, unknown>; itens: ItemComponenteChave[] },
): Promise<string> {
  return chaveOperacao(semente, {
    op: 'ficha_componente',
    campos: dados.campos,
    itens: dados.itens.map(i => [i.produto_id, i.componente_filho_id, i.quantidade, i.unidade, i.origem]),
  });
}
