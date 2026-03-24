export const ESTORNO_TYPES = new Set(["ENTRADA_ESTORNO", "SAIDA_ESTORNO"]);

export interface StockMovementReversalCandidate {
  tipo?: string | null;
  origem?: string | null;
  estorno_de_id?: string | null;
}

export function isEstornoMovement(movement: StockMovementReversalCandidate): boolean {
  return Boolean(
    movement.estorno_de_id ||
      movement.origem === "ESTORNO" ||
      (movement.tipo && ESTORNO_TYPES.has(movement.tipo))
  );
}

export function isOriginalEntradaForReversal(tipo: string): boolean {
  return tipo === "ENTRADA" || tipo === "AJUSTE" || tipo.startsWith("ENTRADA");
}

export function getReversalTipo(tipo: string): "SAIDA_ESTORNO" | "ENTRADA_ESTORNO" {
  return isOriginalEntradaForReversal(tipo) ? "SAIDA_ESTORNO" : "ENTRADA_ESTORNO";
}
