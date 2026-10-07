---
paths:
  - "src/components/inventario/**"
  - "src/components/camera/**"
  - "src/components/InventarioView.tsx"
  - "src/components/QuickInventorySection.tsx"
  - "src/hooks/useInventarioStore.ts"
  - "supabase/functions/inventario/**"
---

# Inventário — ao tocar contagem, leitura de código, câmera ou finalização

Antes de alterar, leia `docs/modules/inventario.md`.

Pontos críticos:

- No método por código, toda escrita de contagem passa por `inventario_ajustar_contagem` (soma sob lock), nunca pelo total de `update_contagem`; desfazer e edição exigem `p_esperado`.
- "Não contado" é `contagem_fisica` NULL, nunca 0: um 0 esquecido zera o saldo do produto na finalização.
- O `.wasm` do ZXing é servido do próprio domínio, na mesma versão que o `barcode-detector` usa; `camera=(self)` e `'wasm-unsafe-eval'` no `vercel.json` existem por isso.
