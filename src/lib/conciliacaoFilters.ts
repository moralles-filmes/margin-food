export type ImportFilter = 'todos' | 'conciliar' | 'sugestoes' | 'criar' | 'conciliados' | 'ignorados';

interface ImportFilterRow {
  selecionada: boolean;
  matchId?: string;
  suggestions?: unknown[];
  jaConciliada?: boolean;
  ignorada?: boolean;
}

export function matchesImportFilter(linha: ImportFilterRow, filter: ImportFilter): boolean {
  const isDone = linha.matchId?.endsWith('-done');
  const isInactive = !!linha.jaConciliada || !!linha.ignorada;
  const hasMatch = !!linha.matchId && !isDone;
  const hasSuggestions = !linha.matchId && !isInactive && !!linha.suggestions?.length;

  if (filter === 'conciliar') return hasMatch && !linha.jaConciliada;
  if (filter === 'sugestoes') return hasSuggestions;
  if (filter === 'criar') return linha.selecionada && !linha.matchId && !isInactive;
  if (filter === 'conciliados') return !!linha.jaConciliada;
  if (filter === 'ignorados') return !!linha.ignorada;
  return true;
}
