<!-- GERADO por scripts/check-padrao.mjs --write-nested a partir de .claude/rules/. Não edite aqui: edite as rules e regenere. -->
# Regras para agentes ao trabalhar em src/components/inventario/

O Codex lê este arquivo. O Claude Code recebe as mesmas regras por `.claude/rules/`. As regras gerais estão no `AGENTS.md` da raiz.

## Inventário — ao tocar contagem, leitura de código, câmera ou finalização

Antes de alterar, leia `docs/modules/inventario.md`.

Pontos críticos:

- No método por código, toda escrita de contagem passa por `inventario_ajustar_contagem` (soma sob lock), nunca pelo total de `update_contagem`; desfazer e edição exigem `p_esperado`.
- "Não contado" é `contagem_fisica` NULL, nunca 0: um 0 esquecido zera o saldo do produto na finalização.
- O `.wasm` do ZXing é servido do próprio domínio, na mesma versão que o `barcode-detector` usa; `camera=(self)` e `'wasm-unsafe-eval'` no `vercel.json` existem por isso.
