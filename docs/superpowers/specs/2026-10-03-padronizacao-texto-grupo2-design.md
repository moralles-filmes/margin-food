# Padronização de maiúsculas/minúsculas — Grupo 2 (cadastros copiados como texto)

**Data:** 2026-10-03
**Status:** PR 0 aprovado para planejamento; PR 1–3 terão spec própria

## Contexto

O Grupo 1 (PR #142) criou `padronizarTexto` (`src/lib/padronizarTexto.ts`), o espelho SQL
`docs/padronizacao-texto/padronizar_texto.sql` (casos compartilhados entre `CASOS-INICIO`/`CASOS-FIM`)
e o backfill `backfill_grupo1.sql`, já aplicado em produção. A regra é aplicada no cliente, no valor
enviado ao banco, nunca por trigger (CLAUDE.md).

O Grupo 2 trata os cadastros cujo nome é copiado como texto em outras tabelas, além de cadastros
com grafia de nome próprio (marcas, contas, fornecedores).

## Levantamento no banco vivo (2026-10-03)

| Cadastro | Linhas | Mudam com a regra atual | Duplicados por `lower(nome)` na empresa | Cópias como texto |
|---|---|---|---|---|
| Fornecedores (`suppliers.name`) | 54 | 51 | 0 | `fin_contas_pagar.fornecedor` 356 (todas iguais ao cadastro pelo `supplier_id`; o resto é vazio), `salmon_entries` 5 sem FK, `salmon_manipulations` 3, `supplier_item_prices.supplier_id` 4 (legado; FK real é `supplier_uuid`), `produtos.last_supplier` 1, `purchase_orders.supplier_name` 2 (travado após aprovação) |
| Categorias financeiras (`system_key is null`) | 316 | 206 (20 de 21 raízes) | 0 | nenhuma (só FK) |
| Contas (`fin_contas.nome`) | 13 | 10 (vários só com espaço sobrando no fim) | 0 | nenhuma |
| Marcas do fechamento | 9 | 9 | 0 (índice já é `lower(btrim(nome))`) | nenhuma |
| Estoque: categorias / setores / locais | 51 / 33 / 18 | 9 / 6 / 6 | 0 (índices já são `lower(name)` em ativos) | `produtos.categoria` 640, `produtos.local_estoque` 630, `movimentacoes_estoque.setor` 2.069, requisições, listas fixas, alertas — todas iguais ao cadastro |
| Cargos (`job_roles.nome`) | 29 | 2 | 1: "Gerente geral"/"Gerente Geral" (Moralles), nenhum dos dois referenciado | nenhuma |
| Usuários (`profiles.nome`) | 20 | 1 (espaço no fim) | — | — |
| Empresas (`companies.nome`) | 5 | 0 | 0 | — |
| Canais de venda / cenários | 0 / 0 | — | — | — |

Órfãos nas cópias ("Cozinha", "Pescados", "Diretoria") já estão no padrão. Nenhuma cópia diverge do
cadastro só pela caixa.

Dependências conferidas: a Apresentação Sócios agrupa por `fin_categorias.grupo`, não pelo nome;
`fin_get_categoria_desconto_*` compara `lower(nome)`; o Santander/ContaMax é detectado por
`fin_contas.banco`. `movimentacoes_estoque` tem triggers de UPDATE (saldo, validação, auditoria) —
ponto central do PR 3.

## Decisões do usuário

1. **Nomes próprios** (fornecedores, marcas, contas) seguem a regra geral, com uma regra nova:
   palavra de 2 a 4 letras sem vogal vira sigla (JBS, PMG, GM, BTG). Vale para todos os campos,
   inclusive os do Grupo 1. iFood/PagBank viram Ifood/Pagbank.
2. **Raízes do plano de contas** (categoria sem pai) ficam sempre em MAIÚSCULO; filhas seguem a regra.
3. **Ordem:** PR 0 (regra) → PR 1 (cadastros sem cópia) → PR 2 (fornecedores) → PR 3 (estoque).
4. **Pendências da revisão do Grupo 1** entram no PR 0.

## Decomposição

| PR | Escopo | Spec |
|---|---|---|
| 0 | Regra: sigla sem vogal, siglas novas, romanos/tamanhos só soltos, letra depois de designador; reaplicar o backfill do Grupo 1 | esta |
| 1 | Categorias financeiras (raiz em MAIÚSCULO), contas, marcas, cargos (unificar o duplicado), usuários (só no envio + trim), empresas (só no envio) | própria |
| 2 | Fornecedores: padronizar no envio e renomeação com cascata das cópias na mesma transação | própria |
| 3 | Estoque (categorias, setores, locais): renomeação atômica com cascata — hoje renomear não propaga | própria |

**Fora do escopo:** canais de venda e cenários (vazios); `purchase_orders.supplier_name` (travado
por `trg_po_block_post_approval_changes`); snapshots históricos (`*_snapshot`, atas, apresentações);
`rh_colaboradores.setor` (é código); texto de extrato bancário; códigos, SKU, unidades, e-mail,
observações.

## PR 0 — Design

### Regra

Ordem de avaliação de cada palavra (núcleo sem pontuação das pontas), com as mudanças em **negrito**:

1. Tem dígito → tratamento de número/unidade (inalterado).
2. **Letra solta logo depois de um designador → MAIÚSCULA** ("à" nunca):
   - designador forte (tipo, classe, vitamina, série/serie, bloco, modelo, letra): sempre, exceto
     `e` seguido de palavra (conjunção) — "Tipo A Grande", "Tipo e Marca";
   - designador fraco (lote, plano, fase, turno, categoria, grupo, nível/nivel): só quando não vem
     palavra depois — "Grupo A 2026", mas "Lote a Vencer", "Plano à Vista".
3. Conectivo no meio do texto → minúsculo (inalterado).
4. Unidade logo depois de número; `x` entre números (inalterado).
5. Sigla da lista (inalterado), com as **siglas novas NFS-e, NFSe, MDF-e, DIFAL, ST, DAE**.
6. **Sigla sem vogal:** 2 a 4 letras, todas da classe explícita de consoantes
   `[bcdfghjklmnpqrstvwxzçñ]` (não `\p{L}`/`[[:alpha:]]`, para "ª"/"º" não contarem e o resultado não
   depender do ctype do banco) → MAIÚSCULA. Exceções, que seguem para a capitalização normal:
   as unidades da lista `UNIDADES` (Kg, Ml, Cm, Mm, Gr, Grs, Lt, Lts, Mg, Cx, Pct, Pc, Pcs, Kgs),
   os tratamentos Mr, Mrs, Sr, Srs, Dr, Drs, Jr, Mc e as abreviações Pç, Pçs, Mç, Mçs, Dz, Fd, Hr, Hrs.
7. Letra única → MAIÚSCULA (inalterado).
8. Palavra composta (`-`, `/`, `'`, `’`, `.`): cada pedaço passa por enclítico, apóstrofo, sigla e
   **sigla sem vogal** (mesmas exceções). **Pedaço logo depois de um pronome enclítico só é
   capitalizado** ("Bem-te-Vi", não o romano VI); romanos continuam valendo nos demais pedaços
   ("Fase II/III", "Cozinheiro I/II").

Palavra com letra e número que não é unidade continua como foi digitada ("C6", "A4").
"5G" continua virando "5g": num restaurante, gramas é o caso dominante e a regra não tem contexto
para distinguir de internet 5G — limitação aceita.

As exceções do item 6 vêm de uma varredura das palavras sem vogal em todos os campos dos Grupos 1 e
2 (2026-10-03): gm, fgts, ml, kg, pmg, cpfl, cm, cmv, jb, jbs, mdg, pvc, tdg, grs, mm, mr, dg, lt,
mxm, rh, sp. Só "mr" ("Brownie Mr Bay") e as unidades não são sigla.

O item 2 não constava da aprovação em chat: a exceção para `e` evita "Categoria E Subcategoria" e
"Grupo E Família". Hoje não há nenhuma ocorrência dos itens 2 e 8 nos dados.

Revisão da branch (2026-10-03): a primeira versão dos itens 2, 6 e 8 regredia saídas corretas
("Plano À Vista", "Lote A Vencer", "Fase Ii/Iii", "DRª Silva", "Jose da Silva JR"); o texto acima
já é o corrigido, com casos para cada regressão.

### Implementação

- `src/lib/padronizarTexto.ts` e `docs/padronizacao-texto/padronizar_texto.sql` mudam juntos; a
  lista de exceções reaproveita `UNIDADES`/`pt_unidade` em vez de duplicar as unidades.
- Casos novos entre `CASOS-INICIO`/`CASOS-FIM` (conferidos nos dois lados por
  `padronizarTexto.test.ts`, que também cobre idempotência e "só muda caixa e espaços"):

  | Entrada | Esperado |
  |---|---|
  | `JBS` | `JBS` |
  | `SANTANDER GM` (substitui o caso atual) | `Santander GM` |
  | `GRAFICA JB` | `Grafica JB` |
  | `TDG MIX` | `TDG Mix` |
  | `CPFL ENERGIA` | `CPFL Energia` |
  | `BTG PACTUAL` | `BTG Pactual` |
  | `XYZ COMERCIO` | `Xyz Comercio` |
  | `BROWNIE MR BAY` | `Brownie Mr Bay` |
  | `DR. SILVA` | `Dr. Silva` |
  | `CX PAPEL TOALHA` | `Cx Papel Toalha` |
  | `ARROZ KG` | `Arroz Kg` |
  | `PARAFUSO 5 PÇS` | `Parafuso 5 Pçs` |
  | `NFS-E 55` | `NFS-e 55` |
  | `DIFAL SP` | `DIFAL SP` |
  | `DAE COLABORADOR` | `DAE Colaborador` |
  | `ICMS-ST` | `ICMS-ST` |
  | `BEM-TE-VI` | `Bem-te-Vi` |
  | `DOM PEDRO II` | `Dom Pedro II` |
  | `CAMISA GG` | `Camisa GG` |
  | `OVO TIPO A GRANDE` | `Ovo Tipo A Grande` |
  | `VITAMINA E 400MG` | `Vitamina E 400mg` |
  | `CATEGORIA E SUBCATEGORIA` | `Categoria e Subcategoria` |
  | `AÇÚCAR SACHÊ 5G` | `Açúcar Sachê 5g` |
  | `C6 BANK` | `C6 Bank` |
  | `PLANO À VISTA` | `Plano à Vista` |
  | `LOTE A VENCER` | `Lote a Vencer` |
  | `GRUPO A 2026` | `Grupo A 2026` |
  | `FASE II/III` | `Fase II/III` |
  | `DRª SILVA` | `Drª Silva` |
  | `JOSE DA SILVA JR` | `Jose da Silva Jr` |

  Os demais casos de borda (Bauru/SP, Venda a Prazo, Nº, Mc Donalds, Ovos Dz…) estão no SQL.

- CLAUDE.md não muda: a linha existente já aponta para o código e exige mudar os dois lados.

### Entrega e dados

1. PR com a regra; merge; deploy da Vercel.
2. Algumas horas depois (abas com o bundle antigo continuam gravando "Gm" até recarregar),
   reaplicar `backfill_grupo1.sql` sem alteração — ele só atualiza linhas que divergem da regra:
   simulação com contagens e amostra antes → depois, aprovação do usuário, aplicação com
   `set padronizacao.aplicar = 'sim';`, recontagem de linhas fora do padrão = 0.
3. Os cadastros do Grupo 2 não são tocados no PR 0; cada um tem o backfill no seu PR.

### Riscos

- Reenvio idempotente de uma operação gravada antes do backfill compara o texto antigo
  ("Gm") com o novo ("GM") e pode ser recusado com `REQUEST_ID_REUTILIZADO`. A janela é a do
  backfill; mitigação: rodar fora do horário de operação.
- Palavra sem vogal que não é sigla e não está nas exceções vira MAIÚSCULA. A varredura não achou
  nenhuma além de "Mr"; abreviação nova entra na lista de exceções (dois lados + caso).

## Notas para os PRs seguintes

- **PR 1:** conferir se `seed_default_categories`/onboarding gravam as raízes em MAIÚSCULO (as raízes
  atuais estão) e as filhas no padrão da regra. Raízes com `system_key` são
  imutáveis (`fin_protect_system_category`) e ficam fora do backfill. Cargo duplicado: inativar
  "Gerente geral" (sem referência em `profiles`/`company_memberships`) antes do backfill, por causa
  de `job_roles_company_id_nome_key`. `onboard_new_company` compara o nome no reenvio.
- **PR 2:** `suppliers_name_company_key` é sensível a caixa (0 colisões hoje). Cópias extras além da
  lista original: `produtos.last_supplier`, `salmon_manipulations.supplier_name`,
  `purchase_reminders.supplier_id` (texto), `salmon_auditorias_compra.fornecedor` (vazias ou 1–3
  linhas). `get_fin_kpis` agrupa por `TRIM(fornecedor)`.
- **PR 3:** cópias extras: `solicitacoes_compra.setor_solicitante`, `solic_compra_mercado_item.categoria`,
  `profiles.sector`. Conferir os triggers de UPDATE de `movimentacoes_estoque` antes de desenhar a
  cascata e invalidar o `cmv_cache` depois.
