import { normalizeSearchText } from '@/lib/utils';

/** Lançamento já conciliado da conta, usado para reconhecer linha de extrato repetida. */
export interface ConciliadoRow {
  id: string;
  data_competencia: string;
  data_pagamento: string | null;
  valor: number;
  tipo: string;
  descricao: string | null;
  origem?: string | null;
}

/** Vínculo FITID ↔ lançamento gravado em fin_conciliacao_vinculos. */
export interface VinculoRow {
  external_id: string;
  tipo: string;
  lancamento_id: string;
}

export function bankLineKey(linha: { data: string; valor: number; tipo: string; descricao?: string | null }) {
  // Normalizado (sem acento/maiúsculas/espaços extras): o banco pode variar o
  // espaçamento interno da descrição entre dois downloads do mesmo extrato
  // (confirmado no Santander), e normalizeSearchText() só remove acento/caixa —
  // sem colapsar espaços aqui, a mesma linha reimportada não bate com a chave
  // da linha já conciliada e reaparece como pendente.
  const descricaoNormalizada = normalizeSearchText(linha.descricao || '').replace(/\s+/g, ' ');
  return `${linha.data}|${Number(linha.valor)}|${linha.tipo}|${descricaoNormalizada}`;
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

/**
 * Detecta lançamentos importados de um extrato anterior que não existem mais no
 * arquivo atual. Alguns bancos regeneram não só o FITID, mas também o conjunto de
 * linhas (caso real: rendimentos ContaMax desapareceram do OFX do Santander).
 *
 * A comparação é sensível a ocorrências e só considera `origem=conciliacao` com
 * vínculo bancário persistido. Transferências, lançamentos manuais e espelhos de
 * CP/CR ficam fora para evitar falsos positivos.
 */
export function findStaleImportedRows(
  conciliados: ConciliadoRow[],
  vinculos: VinculoRow[],
  fitidsNoArquivo: ReadonlySet<string>,
  linhasArquivo: ReadonlyArray<{ data: string; valor: number; tipo: string; descricao?: string | null; fitId?: string }>,
): ConciliadoRow[] {
  const fileDates = linhasArquivo
    .map(line => line.data.slice(0, 10))
    .filter(data => /^\d{4}-\d{2}-\d{2}$/.test(data));
  if (fileDates.length === 0) return [];
  const firstFileDate = fileDates.reduce((first, data) => data < first ? data : first);
  const lastFileDate = fileDates.reduce((last, data) => data > last ? data : last);

  const vinculoKeysPorLancamento = new Map<string, string[]>();
  const fitidsAtuaisVinculados = new Set<string>();

  for (const vinculo of vinculos) {
    if (!vinculo.lancamento_id) continue;
    const key = fitidKey(vinculo.tipo, vinculo.external_id);
    const keys = vinculoKeysPorLancamento.get(vinculo.lancamento_id);
    if (keys) keys.push(key);
    else vinculoKeysPorLancamento.set(vinculo.lancamento_id, [key]);
    if (fitidsNoArquivo.has(key)) fitidsAtuaisVinculados.add(key);
  }

  // Linhas reivindicadas pelo FITID atual não podem também cobrir outro
  // lançamento pelo conteúdo.
  const availableFileCounts = new Map<string, number>();
  for (const line of linhasArquivo) {
    const currentFitidKey = line.fitId ? fitidKey(line.tipo, line.fitId) : undefined;
    if (currentFitidKey && fitidsAtuaisVinculados.has(currentFitidKey)) continue;
    const key = bankLineKey(line);
    availableFileCounts.set(key, (availableFileCounts.get(key) || 0) + 1);
  }

  const stale: ConciliadoRow[] = [];
  for (const row of conciliados) {
    if (row.origem !== 'conciliacao' || !['RECEITA', 'DESPESA'].includes(row.tipo)) continue;
    const vinculoKeys = vinculoKeysPorLancamento.get(row.id);
    if (!vinculoKeys || vinculoKeys.length === 0) continue;
    if (vinculoKeys.some(key => fitidsNoArquivo.has(key))) continue;

    const data = row.data_pagamento || row.data_competencia;
    if (data < firstFileDate || data > lastFileDate) continue;
    const contentKey = bankLineKey({
      data,
      valor: row.valor,
      tipo: row.tipo,
      descricao: row.descricao,
    });
    const available = availableFileCounts.get(contentKey) || 0;
    if (available > 0) {
      if (available === 1) availableFileCounts.delete(contentKey);
      else availableFileCounts.set(contentKey, available - 1);
      continue;
    }
    stale.push(row);
  }

  return stale;
}
