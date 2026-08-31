export type ImportFilter = 'todos' | 'conciliar' | 'sugestoes' | 'criar' | 'conciliados' | 'ignorados' | 'internos';

interface ImportFilterRow {
  selecionada: boolean;
  matchId?: string;
  suggestions?: unknown[];
  jaConciliada?: boolean;
  ignorada?: boolean;
  movimentacaoInterna?: boolean;
}

export function matchesImportFilter(linha: ImportFilterRow, filter: ImportFilter): boolean {
  const isDone = linha.matchId?.endsWith('-done');
  const isInternal = !!linha.movimentacaoInterna;
  // Movimento interno possui tratamento próprio. Mesmo que um registro legado
  // também venha marcado como ignorado/conciliado, ele aparece somente em
  // "Internos" e nunca volta para os filtros de trabalho financeiro.
  const isIgnored = !!linha.ignorada && !isInternal;
  const isReconciled = !!linha.jaConciliada && !isInternal && !isIgnored;
  const isInactive = isReconciled || isIgnored || isInternal;
  const hasMatch = !!linha.matchId && !isDone;
  const hasSuggestions = !linha.matchId && !isInactive && !!linha.suggestions?.length;

  if (filter === 'conciliar') return hasMatch && !isInactive;
  if (filter === 'sugestoes') return hasSuggestions;
  if (filter === 'criar') return linha.selecionada && !linha.matchId && !isInactive;
  if (filter === 'conciliados') return isReconciled;
  if (filter === 'ignorados') return isIgnored;
  if (filter === 'internos') return isInternal;
  return true;
}
