import { normalizeSearchText } from '@/lib/utils';

/** Lançamento já conciliado da conta, usado para reconhecer linha de extrato repetida. */
export interface ConciliadoRow {
  id: string;
  data_competencia: string;
  data_pagamento: string | null;
  valor: number;
  tipo: string;
  descricao: string | null;
}

/** Vínculo FITID ↔ lançamento gravado em fin_conciliacao_vinculos. */
export interface VinculoRow {
  external_id: string;
  tipo: string;
  lancamento_id: string;
}

export function bankLineKey(linha: { data: string; valor: number; tipo: string; descricao?: string | null }) {
  // Normalizado (sem acento/maiúsculas/espaços extras): o banco pode truncar a
  // descrição em tamanho diferente entre dois downloads do mesmo extrato, e
  // igualdade exata deixaria passar despercebida a mesma reimportação.
  return `${linha.data}|${Number(linha.valor)}|${linha.tipo}|${normalizeSearchText(linha.descricao || '')}`;
}

/** Chave de vínculo/linha no mesmo formato do fast-path de FITID (`tipo|external_id`). */
export function fitidKey(tipo: string, externalId: string) {
  return `${tipo}|${externalId}`;
}

/**
 * Contador de lançamentos já conciliados por conteúdo (valor/data/descrição),
 * usado para reconhecer linha de extrato reimportada como "já conciliada".
 *
 * Lançamento cujo vínculo de FITID aparece no ARQUIVO ATUAL fica FORA deste
 * contador: ele será reivindicado pela identidade bancária (fast-path de FITID),
 * e contá-lo aqui também faria a MESMA baixa ser reivindicada duas vezes — uma
 * pelo FITID e outra por valor/data/descrição. Em vendas legítimas repetidas no
 * mesmo dia (mesmo valor, mesma bandeira) isso marcava as duas linhas como "já
 * conciliada" e a venda que de fato faltava no razão sumia da lista de pendentes.
 *
 * A exclusão é condicionada ao FITID estar no arquivo porque Santander e PagBank
 * regeneram o FITID a cada download (embutem o timestamp): o vínculo antigo não
 * bate com nada no arquivo novo e, excluindo incondicionalmente, o lançamento
 * ficava fora das DUAS camadas — cada linha do histórico reaparecia como
 * "Criar novo" a cada novo download do mesmo extrato.
 */
export function buildConciliadosCounts(
  conciliados: ConciliadoRow[],
  vinculos: VinculoRow[],
  fitidsNoArquivo: ReadonlySet<string>,
): Map<string, number> {
  const vinculoKeysPorLancamento = new Map<string, string[]>();
  for (const v of vinculos) {
    if (!v.lancamento_id) continue;
    const keys = vinculoKeysPorLancamento.get(v.lancamento_id);
    if (keys) keys.push(fitidKey(v.tipo, v.external_id));
    else vinculoKeysPorLancamento.set(v.lancamento_id, [fitidKey(v.tipo, v.external_id)]);
  }

  const counts = new Map<string, number>();
  for (const l of conciliados) {
    const vinculoKeys = vinculoKeysPorLancamento.get(l.id);
    if (vinculoKeys && vinculoKeys.some(k => fitidsNoArquivo.has(k))) continue;
    // A linha do extrato traz a data em que o dinheiro se moveu, que para uma
    // baixa de CP/CR é `data_pagamento` — `data_competencia` é a competência do
    // boleto e pode estar semanas atrás.
    const dataChave = l.data_pagamento || l.data_competencia;
    const key = bankLineKey({ data: dataChave, valor: l.valor, tipo: l.tipo, descricao: l.descricao });
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}
