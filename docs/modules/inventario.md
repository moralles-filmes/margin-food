# Módulo: Inventário

> Regras movidas do `AGENTS.md` em 2026-10-07 (Padrão SaaS, Fase 9), com o texto preservado. Submódulos: `src/permissions/registry.ts`. Tabelas: tipo gerado `src/integrations/supabase/types.ts` (todas com `company_id`).

- Chave do módulo: `inventario`
- Status: ativo
- Flag: nenhuma

## Responsabilidade

- Faz: inventário físico (lista, criação, contagem manual ou por código de barras, inclusive pela câmera), inventário rápido, detalhe e fechamento, dashboard, auditoria e conferentes.
- Não faz: o ajuste de saldo fora da finalização → [estoque.md](estoque.md).
- Código: `src/components/InventarioView.tsx`, `QuickInventorySection.tsx`, `src/components/inventario/`, `src/components/camera/`, `src/hooks/useInventarioStore.ts`, Edge `inventario`.

## Submódulos e permissões

| Submódulo | Ações (`inventario:<submodulo>:<acao>`) | Escopo |
|---|---|---|
| `lista` | view, create, edit, delete, export | empresa |
| `criar` | create | empresa |
| `rapido` | view, create | empresa |
| `detalhe` | view, edit, close, export | empresa |
| `dashboard` | view, export | empresa |
| `auditoria` | view, approve, edit, export | empresa |
| `conferentes` | view, manage | empresa |

## Tabelas

| Tabela | Escopo | Observação |
|---|---|---|
| `inventarios` / `inventario_itens` | empresa | `metodo_contagem`, `contagem_fisica` (NULL = não contado) |
| `inventario_conferentes` | empresa | conferentes |
| `audit_inventario_log` | empresa (`company_id` nullable) | trilha |

## Invariantes

- **Inventário `metodo_contagem='codigo'`: toda escrita de contagem passa por `inventario_ajustar_contagem` (soma sob lock), nunca pelo total de `update_contagem`** — leitura soma com `p_chave` derivada da operação (reenvio não soma de novo); desfazer e edição pela lista exigem `p_esperado` = valor que a tela mostrava e devolvem `conflito` se mudou. Gravar o total perdia leituras simultâneas e fazia o desfazer subtrair de um total já corrigido. "Não contado" é `contagem_fisica` NULL, nunca 0: `finalize_inventory_atomic` só ajusta itens NOT NULL, e um 0 esquecido zera o saldo do produto. A primeira leitura tira o inventário de RASCUNHO (a tela de leitura não tem "Iniciar contagem").
- **Leitura pela câmera (Inventário) é o motivo de `camera=(self)` e `'wasm-unsafe-eval'` nos headers do `vercel.json`** — o `.wasm` do ZXing (iPhone não tem `BarcodeDetector` nativo) é servido do próprio domínio (`zxing-wasm/reader/zxing_reader.wasm?url` + `prepareZXingModule`), nunca do jsDelivr que a lib usa por padrão; o `zxing-wasm` direto precisa ser a mesma versão que o `barcode-detector` usa (`zxing-wasm-versao.test.ts` compara o SHA-256 do binário).
- Ficha Técnica e Inventário ficam em unidade contábil (base); só Ranking/Preditivo do Estoque exibem em unidade de compra ([estoque.md](estoque.md)).

## Commands, queries e eventos

- Commands: `inventario_ajustar_contagem`, `finalize_inventory_atomic`, Edge `inventario` (ação `update_contagem`, que grava o total — não usar no método por código).

## Dependências

- Estoque Geral: a finalização ajusta `produtos.saldo_atual` pelos itens contados.
