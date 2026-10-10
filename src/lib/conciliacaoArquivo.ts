import { fitidKey } from '@/lib/conciliacaoConciliados';
import { periodoDoArquivo, type PeriodoArquivo } from '@/lib/conciliacaoTransferMatch';

/**
 * O extrato carregado na sessão de conciliação da conta: chaves `tipo|fitId` e
 * período de TODAS as linhas do arquivo, inclusive as que já saíram da lista
 * (processadas, ignoradas, transferência criada).
 *
 * A linha processada continua dona do seu vínculo. Calculado só sobre as linhas
 * que sobraram, o FITID dela passava a "fora do arquivo" no refresh e no
 * reprocesso da ContaMax: o lançamento dela voltava à contagem por conteúdo e a
 * transferência dela voltava a candidata, e qualquer uma das duas cobria outra
 * linha igual que ainda estava pendente. O período encolhido também tirava do
 * reconhecimento a transferência de uma linha que continuava na lista.
 */
export interface ArquivoConciliacao {
  fitids: string[];
  periodo?: PeriodoArquivo;
}

/** Soma ao arquivo da sessão (ou a nenhum, num arquivo novo) as linhas dadas. */
export function acumularArquivo(
  anterior: ArquivoConciliacao | null | undefined,
  linhas: ReadonlyArray<{ tipo: string; fitId?: string | null; data: string }>,
): ArquivoConciliacao {
  const fitids = new Set(anterior?.fitids ?? []);
  for (const l of linhas) {
    if (l.fitId) fitids.add(fitidKey(l.tipo, l.fitId));
  }
  const datas = linhas.map(l => l.data);
  if (anterior?.periodo) datas.push(anterior.periodo.inicio, anterior.periodo.fim);
  return { fitids: [...fitids], periodo: periodoDoArquivo(datas) };
}

/** Valida o que veio do sessionStorage; formato inesperado = sem arquivo guardado. */
export function lerArquivoConciliacao(raw: unknown): ArquivoConciliacao | null {
  if (!raw || typeof raw !== 'object') return null;
  const { fitids, periodo } = raw as { fitids?: unknown; periodo?: unknown };
  if (!Array.isArray(fitids) || !fitids.every(f => typeof f === 'string')) return null;
  if (periodo === undefined) return { fitids };
  const p = periodo as { inicio?: unknown; fim?: unknown } | null;
  if (!p || typeof p.inicio !== 'string' || typeof p.fim !== 'string') return { fitids };
  return { fitids, periodo: { inicio: p.inicio, fim: p.fim } };
}
