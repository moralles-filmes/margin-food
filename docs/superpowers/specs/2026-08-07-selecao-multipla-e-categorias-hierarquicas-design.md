# Seleção múltipla + exclusão em massa + categoria hierárquica no Financeiro

**Data:** 2026-08-07
**Status:** Aprovado para planejamento

## Contexto

Duas melhorias de UX pedidas pelo usuário no módulo Financeiro:

1. Hoje não existe seleção múltipla em nenhuma lista do Financeiro — exclusão é sempre item por item. O usuário quer marcar vários itens de uma vez, com botões "Selecionar todas"/"Desmarcar", e excluir tudo junto.
2. O seletor de categoria (`CategoryCombobox`) usado em Conciliação Bancária, Boletos (Contas a Pagar) e outros pontos do Financeiro mostra a lista de categorias totalmente plana (ex: "SALMAO"), mesmo a tabela `fin_categorias` já tendo hierarquia de 3 níveis (Categoria → Subcategoria → Item, ex: "CMV → PEIXES → SALMAO", visível hoje só na árvore de "Estrutura de Categorias"). O usuário quer essa hierarquia visível também no seletor.

## Escopo

- **Dentro do escopo:**
  - `CadastroBaseTree.tsx` (árvore "Estrutura de Categorias"): seleção múltipla de itens-folha + exclusão em massa.
  - `ConciliacaoBancariaSection.tsx`, aba "Lançamentos": seleção múltipla + exclusão em massa.
  - `CategoryCombobox.tsx` e seus ~7 pontos de uso: agrupamento visual por hierarquia (Categoria › Subcategoria).
- **Fora do escopo:**
  - Qualquer outra tela do Financeiro sem seleção múltipla hoje (ex: Contas a Pagar/Receber como listas — não pedido).
  - Mudar o que é selecionável no `CategoryCombobox` (continua podendo escolher categoria/subcategoria/item diretamente, igual hoje).
  - Exclusão em cascata de categorias com filhos (decisão explícita: só folhas são selecionáveis para exclusão em massa).
  - Novas RPCs ou migrations — as três mudanças reusam guards/RPCs/queries client-side já existentes.

## Seção 1 — Seleção múltipla + exclusão em massa na árvore de Categorias

**Arquivo:** `src/components/financeiro/CadastroBaseTree.tsx`

- Novo estado `selectedIds: Set<string>` no componente.
- Checkbox aparece **apenas em linhas-folha** (`isLeaf = !hasChildren && depth > 0`, mesma regra já usada em `canDelete && isLeaf` nas linhas 262-267 hoje). Categorias/subcategorias com filhos não ganham checkbox — usuário continua precisando remover os filhos primeiro para excluir um nível intermediário (comportamento atual inalterado).
- Toolbar (acima da árvore) ganha:
  - Botão **"Selecionar todas"** — marca todas as folhas atualmente carregadas na árvore.
  - Botão **"Desmarcar"** — limpa `selectedIds`.
  - Botão **"Excluir selecionados (N)"** — só aparece/habilita quando `selectedIds.size > 0`.
- Ao clicar em excluir: abre `useConfirmDialog()` (mesmo hook já usado no delete individual) confirmando a quantidade.
- Execução: itera sobre `selectedIds`, reaplicando por item exatamente a lógica que `handleDelete` (linhas 490-525) já faz hoje:
  1. Checa `fin_lancamentos`/`fin_lancamento_rateios` por `categoria_id = id`; se houver vínculo, marca como bloqueado com motivo.
  2. Senão, `supabase.from('fin_categorias').update({ ativo: false }).eq('id', id)`.
- Falha parcial: os itens sem vínculo são excluídos; os vinculados são pulados. Ao final, um toast único resume o resultado (ex: "8 excluídas, 2 bloqueadas — vinculadas a lançamentos").
- Após concluir: recarrega a árvore (`load()`) e limpa `selectedIds`.
- Sem RPC nova — mesmo padrão de `update ativo=false` client-side já usado hoje, apenas em loop.

## Seção 2 — Seleção múltipla + exclusão em massa na aba "Lançamentos" (Conciliação Bancária)

**Arquivo:** `src/components/financeiro/ConciliacaoBancariaSection.tsx`, tabela da aba "Lançamentos" (linhas ~1303-1345)

- Essa tabela já tem um checkbox por linha, mas ele alterna `conciliado` diretamente (`conciliar(item.id, !!v)`, linha 1334) — propósito diferente de seleção para ação em massa.
- Adicionar **uma coluna nova, à esquerda**, com checkbox dedicado a seleção múltipla — não mexe no checkbox de conciliação existente, que continua fazendo a mesma coisa de hoje.
- Estado de seleção: novo array/local state (ex: `selectedLancamentoIds: string[]`), independente do estado de `conciliado`.
- Toolbar acima da tabela ganha o mesmo trio de botões da Seção 1: **"Selecionar todas" / "Desmarcar" / "Excluir selecionados (N)"**.
- Confirmação via `useConfirmDialog()`.
- Execução: itera sobre os ids selecionados chamando a RPC `_guarded_delete_lancamento(p_id, p_expected_updated_at)` — a mesma RPC que o botão de exclusão individual já chama (usa o `updated_at` já carregado na linha para o optimistic lock).
- Falha parcial: mesmo padrão da Seção 1 — deleta o que puder, resume em um toast o que foi bloqueado e o motivo (reaproveitando `mapFinanceiroDeleteError` já existente em `src/lib/financeiroErrorMap.ts`).
- Após concluir: recarrega a lista (`loadLancamentos()`) e limpa a seleção.

## Seção 3 — Categoria hierárquica no `CategoryCombobox`

**Arquivos:**
- Novo: `src/lib/categoriaOptions.ts`
- `src/components/financeiro/CategoryCombobox.tsx`
- 7 pontos de consumo: `ConciliacaoBancariaSection.tsx` (query linha 194 + usos linhas 1176, 1483), `CriarLancamentoExtratoDialog.tsx` (query linha 78 + usos linhas 460, 473), `ContasPagarSection.tsx` (query linha 139), `ContasReceberSection.tsx` (query linha 134), `LivroRazaoSection.tsx` (query linha 205), `CategorizacaoSection.tsx` (query linha 108), `OrcamentoSection.tsx` (query linha 105).

### Helper novo: `buildCategoryOptions`

```ts
// src/lib/categoriaOptions.ts
interface CategoriaRow { id: string; nome: string; codigo?: string | null; tipo?: string; parent_id: string | null }
interface CategoryOptionWithGroup extends CategoryOption { groupLabel: string }

function buildCategoryOptions(rows: CategoriaRow[]): CategoryOptionWithGroup[]
```

- Constrói um mapa `id -> row`.
- Para cada linha, percorre a cadeia de `parent_id` para montar o caminho dos ancestrais (nomes, da raiz até o pai direto, excluindo a própria linha).
- `groupLabel` = ancestrais unidos por `" › "` (ex: `"CMV › PEIXES"`); categorias de topo (sem pai) recebem `groupLabel: ""`.

### Mudança no `CategoryCombobox.tsx`

- `CategoryOption` ganha campo opcional `groupLabel?: string`.
- Em vez de um único `<CommandGroup>` com todas as opções (linhas 58-74 hoje), agrupa as opções por `groupLabel` e renderiza um `<CommandGroup heading={groupLabel || undefined}>` por grupo distinto, na ordem em que aparecem.
- Texto de cada `CommandItem` continua igual a hoje (`codigo — nome`, ou só `nome` se não houver código).
- Sem `groupLabel` (opções antigas, se algum caller não for migrado) cai no comportamento atual de grupo único — mudança é aditiva/retrocompatível.
- Busca (`cmdk`) continua funcionando igual — grupos vazios após filtro são escondidos automaticamente pelo próprio `cmdk`.

### Mudança nos 7 call sites

- Cada `.select(...)` de `fin_categorias` ganha `parent_id` na lista de colunas.
- Cada mapeamento manual de linha crua → `CategoryOption` é substituído por uma chamada a `buildCategoryOptions(rows)`.
- Nenhuma mudança de RPC/migration — `parent_id` já existe na tabela.

## Testes

- **Seção 1:** selecionar 2 folhas de categorias diferentes → excluir → ambas desativadas (`ativo=false`) e somem da árvore; selecionar uma folha vinculada a lançamento + uma livre → excluir → só a livre some, toast reporta a bloqueada.
- **Seção 2:** mesmo par de cenários (bloqueio por vínculo/optimistic lock) na aba Lançamentos da Conciliação.
- **Seção 3:** abrir o combobox em Conciliação Bancária e em Contas a Pagar (Boletos) e conferir visualmente o agrupamento "CMV › PEIXES" com os itens embaixo; buscar por "salmao" e conferir que só o grupo correspondente aparece.
- `tsc --noEmit` limpo ao final (padrão do projeto, ver CLAUDE.md).

## Fora de escopo / não decidido aqui

- Exclusão em cascata de categorias com filhos (rejeitada explicitamente nesta rodada).
- Qualquer outra tela de listagem do Financeiro sem seleção múltipla hoje.
