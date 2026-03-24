import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  getReversalTipo,
  isEstornoMovement,
  isOriginalEntradaForReversal,
} from "./stock-reversal.ts";

Deno.test("reconhece movimentos de estorno por tipo, origem ou vínculo", () => {
  assertEquals(isEstornoMovement({ tipo: "ENTRADA_ESTORNO" }), true);
  assertEquals(isEstornoMovement({ tipo: "SAIDA_ESTORNO" }), true);
  assertEquals(isEstornoMovement({ origem: "ESTORNO" }), true);
  assertEquals(isEstornoMovement({ estorno_de_id: "mov-1" }), true);
  assertEquals(isEstornoMovement({ tipo: "SAIDA_REQUISICAO", origem: "REQUISICAO" }), false);
});

Deno.test("preserva a semântica atual para decidir o tipo do estorno", () => {
  assertEquals(isOriginalEntradaForReversal("ENTRADA"), true);
  assertEquals(isOriginalEntradaForReversal("ENTRADA_RECEBIMENTO"), true);
  assertEquals(isOriginalEntradaForReversal("AJUSTE"), true);
  assertEquals(isOriginalEntradaForReversal("SAIDA_REQUISICAO"), false);
  assertEquals(isOriginalEntradaForReversal("BAIXA_PERDA"), false);
});

Deno.test("gera o tipo reverso correto para cancelamento", () => {
  assertEquals(getReversalTipo("ENTRADA"), "SAIDA_ESTORNO");
  assertEquals(getReversalTipo("ENTRADA_RECEBIMENTO"), "SAIDA_ESTORNO");
  assertEquals(getReversalTipo("SAIDA"), "ENTRADA_ESTORNO");
  assertEquals(getReversalTipo("SAIDA_REQUISICAO"), "ENTRADA_ESTORNO");
});
