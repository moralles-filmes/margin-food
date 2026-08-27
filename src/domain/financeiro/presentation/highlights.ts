import {
  DETERMINISTIC_HIGHLIGHT_RULES,
  type DeterministicHighlight,
} from './contracts';

const RULE_ORDER = new Map(
  DETERMINISTIC_HIGHLIGHT_RULES.map((rule, index) => [rule, index]),
);

/** Ordem estável: prioridade, regra contratual e id; nunca depende de IA. */
export function sortDeterministicHighlights(
  highlights: readonly DeterministicHighlight[],
): DeterministicHighlight[] {
  return [...highlights].sort((a, b) => (
    a.priority - b.priority
    || (RULE_ORDER.get(a.rule) ?? Number.MAX_SAFE_INTEGER) - (RULE_ORDER.get(b.rule) ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id, 'pt-BR')
  ));
}
