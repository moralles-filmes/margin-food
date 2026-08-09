# Saldo no Livro Razão + Conferência de saldo ao importar extrato

Data: 2026-08-09
Módulo: Financeiro → Lançamentos (Livro Razão e Conciliação Bancária)

## Contexto

Hoje o Livro Razão lista lançamentos sem mostrar o saldo da conta em nenhum momento — o usuário não tem, dentro do sistema, uma visão "estilo extrato bancário" (saldo por linha, saldo atual). E ao importar um extrato para conciliação, o sistema não confere se o saldo final que o banco informa bate com o que o sistema calcula — só descobre divergências de lançamentos antigos depois de terminar de conciliar tudo (ou nunca).

Duas funcionalidades novas, independentes entre si mas que compartilham a mesma base de cálculo de saldo (o padrão já usado por `fin_contas_saldo_cache`/`refresh_saldo_cache`: `saldo_inicial` da conta + soma sinalizada dos lançamentos REALIZADO/CONCILIADO).

## Parte 1 — Saldo no Livro Razão

### Requisito
- Tabela do Livro Razão ganha uma coluna **Saldo**: o saldo da conta imediatamente após aquele lançamento (estilo extrato bancário — cada linha mostra o saldo resultante).
- Um card **"Saldo atual"** no resumo (ao lado de Entradas/Saídas/Resultado): saldo total de todas as contas ativas quando o filtro "Todas contas" está selecionado, ou o saldo daquela conta específica quando filtrado.

### Regras de cálculo (saldo por linha)
- **Ignora os filtros de Tipo e Origem** — eles decidem só o que aparece na lista; o saldo mostrado é sempre a verdade da conta, igual a um extrato de banco onde filtrar a visualização não muda o saldo real ao lado de cada transação.
- **Não aplica** a exclusão de `origem='conciliacao' AND conciliado IS NOT TRUE` (regra do Livro Razão/DRE para renda por competência) — esse saldo reflete dinheiro que já entrou/saiu de fato, mesmo que o lançamento esteja com categorização pendente. Mesmo critério já usado em "Saldo em Caixa" (ver princípio equivalente em CLAUDE.md).
- **Com conta específica filtrada**: escopo = `saldo_inicial` daquela conta + lançamentos onde `conta_id = conta` (RECEITA soma, DESPESA subtrai) ou `conta_destino_id = conta` / `conta_id = conta` para TRANSFERENCIA (mesma lógica assinada de `refresh_saldo_cache`).
- **Sem filtro de conta ("Todas contas")**: escopo = soma de `saldo_inicial` de todas as contas ativas + lançamentos RECEITA/DESPESA de todas elas, **excluindo TRANSFERENCIA** (movimento interno entre contas da própria empresa, saldo total não muda).
- Ordenação para o cálculo acumulado é a mesma já usada no cursor da lista (`data_competencia DESC, id DESC` — ou seu inverso ASC para acumular): garante que o saldo mostrado em cada linha decresce de forma consistente com a ordem visual da tabela (mais recente no topo = saldo atual da conta).
- Escopo de datas: calcula sobre todo o histórico até `p_end` (filtro "até"), sem limitar por `p_start` — o saldo de uma linha reflete a conta inteira até aquele ponto, não um recorte da janela de datas visível.

### Mudanças técnicas
- **Migration nova**: `CREATE OR REPLACE FUNCTION list_fin_lancamentos_cursor(...)` — adiciona `saldo_apos` ao JSON de cada item, calculado via CTE de janela (`SUM(delta) OVER (ORDER BY data_competencia, id)`) sobre o ledger completo (escopo conforme acima), unida ao resultado paginado/filtrado por `id`.
- **Migration nova**: `CREATE FUNCTION get_fin_saldo_atual(p_conta_id uuid DEFAULT NULL)` — lê `fin_contas_saldo_cache` (soma de todas as contas ativas quando `p_conta_id IS NULL`, ou o saldo de uma conta específica). Guards: `assert_tenant()` + mesma permissão de leitura já usada em `list_fin_lancamentos_cursor` (`finance:read`).
- **`LivroRazaoSection.tsx`**:
  - `Lancamento` ganha `saldo_apos: number | null`.
  - Nova coluna "Saldo" na tabela (após "Valor"), formatada com `fmtBRL`, cor `text-destructive` quando negativo.
  - Novo estado `saldoAtual` + `loadSaldoAtual()` chamando `get_fin_saldo_atual`, disparado junto com `load()`/`loadTotais()` e ao trocar `filtroConta`.
  - Card "Saldo atual: R$ X" na barra de resumo existente.

### Fora de escopo
- Não altera `fin_contas_saldo_cache`, `refresh_saldo_cache` nem nenhuma outra tela (Dashboard, DRE, DFC, Conciliação) — só leitura, sem tocar na escrita/manutenção do cache.
- Não pagina nem faz cache do saldo por linha separadamente — é recalculado a cada carregamento de página, aceitando o custo (mesmo padrão de `get_fin_cashflow`/`get_fin_fluxo_projecao`, que já fazem `SUM` sobre todo o histórico de lançamentos sem otimização adicional).

## Parte 2 — Conferência de saldo ao importar extrato

### Requisito
Ao importar um arquivo de extrato (OFX ou CSV) para conciliação, antes de liberar a tela de matching, o sistema deve:
1. Pedir o saldo final informado pelo usuário (o saldo real da conta na data mais recente do arquivo, que ele vê no banco).
2. Calcular o saldo que o sistema esperaria nessa mesma data, com base nos lançamentos **já registrados antes do período do extrato** + a movimentação líquida das linhas do próprio arquivo importado.
3. Avisar se não bater — isso indica erro em lançamentos **anteriores** ao período do arquivo (o caso de uso citado: lançamentos até 30/07 corretos, saldo informado de 05/08 não bate com [saldo até 30/07] + [soma das linhas de 01–05/08] → hà algo errado antes de 30/07, sem precisar terminar de conciliar 01–05/08 primeiro).

### Fluxo
Ordem dentro de `handleFile` (depois do parse e da checagem de conta que já existe hoje — `verifyContaExtrato` — e só quando ela resulta em `match` ou `unverified` com override do usuário):

1. Calcula client-side: `minDate`/`maxDate` das linhas parseadas; `deltaExtrato` = soma sinalizada (RECEITA +, DESPESA −) de todas as linhas do arquivo.
2. Abre `ConfirmarSaldoExtratoDialog`:
   - Mostra nome do arquivo, período importado, campo de valor (BRL) para o **saldo final em `maxDate`**.
   - Se o OFX tiver `<LEDGERBAL><BALAMT>`/`<DTASOF>`, pré-preenche o campo com esse valor (indicador visual de "veio do arquivo", inspirado no ícone de raio do print do Conta Azul) — mas o campo continua editável e a confirmação é sempre manual (botão "Confirmar valor").
   - CSV normalmente não tem esse dado embutido → campo abre vazio, preenchimento manual obrigatório.
3. Ao clicar "Confirmar valor": chama `get_fin_saldo_conta_em(p_conta_id, p_data)` com `p_data = minDate - 1 dia`, obtendo o saldo da conta **antes** do período do extrato. Soma `deltaExtrato` → **saldo calculado**.
4. Compara `saldo informado` × `saldo calculado` (tolerância de R$ 0,01):
   - **Bate**: toast de sucesso ("Saldo confere!"), fecha o diálogo, segue para `processarLinhas(parsed)` normalmente.
   - **Não bate**: o mesmo diálogo transiciona para um estado de alerta mostrando os dois valores e a diferença, com o aviso de que o problema está em lançamentos anteriores a `minDate`. Botões: **"Cancelar importação"** (mesmo comportamento do cancelamento hoje — descarta as linhas parseadas, limpa o input de arquivo) ou **"Continuar mesmo assim"** (segue para `processarLinhas(parsed)`, o aviso é só diagnóstico, não bloqueia o trabalho de conciliação).
5. **Sem persistência** — nenhuma tabela nova de histórico. A checagem é feita só no momento do upload, no cliente + 1 RPC de leitura.

### Mudanças técnicas
- **`src/lib/extratoParser.ts`**: `parseOFX` passa a extrair `<LEDGERBAL><BALAMT>` e `<LEDGERBAL><DTASOF>` (mesmo padrão de regex já usado para `<BANKACCTFROM>`). Novo campo opcional em `ExtratoParseResult`: `saldoFinalArquivo?: { valor: number; data: string }`. `parseCSV` não preenche esse campo (CSV brasileiro não tem esse dado padronizado).
- **Migration nova**: `CREATE FUNCTION get_fin_saldo_conta_em(p_conta_id uuid, p_data date)` — retorna `numeric`: `saldo_inicial` da conta + soma sinalizada (mesma fórmula de `refresh_saldo_cache`) dos lançamentos REALIZADO/CONCILIADO daquela conta com `data_competencia <= p_data`. Guards: `assert_tenant()` + `has_any_permission(['financeiro:conciliacao:view','financeiro:conciliacao:manage','system:global:manage'])`.
- **Novo componente** `ConfirmarSaldoExtratoDialog.tsx` (dois estados internos: "informar" e "divergência"), seguindo o padrão visual já usado no `AlertDialog` de conta divergente (`contaMismatch`) desta mesma tela.
- **`ConciliacaoBancariaSection.tsx`**: novo estado `confirmSaldoDialog`; `handleFile` para de chamar `processarLinhas(parsed)` direto e passa a abrir esse diálogo primeiro; os dois desfechos (bate / continuar mesmo assim) chamam `processarLinhas(parsed)`; "Cancelar importação" replica a limpeza que já ocorre no cancelamento do diálogo de conta divergente.

### Edge cases
- Arquivo com uma única linha/data: `minDate === maxDate`; `p_data = minDate - 1 dia` funciona normalmente (fronteira exclusiva).
- Conta nova sem nenhum lançamento anterior ao período: `get_fin_saldo_conta_em` retorna só o `saldo_inicial` cadastrado da conta — comportamento correto (base é o que foi cadastrado).
- Usuário reimporta o mesmo período (parte das linhas já conciliadas): o cálculo usa a soma bruta das linhas do arquivo, independente do estado de conciliação — é uma checagem "a fonte bate com a fonte", não depende de quanto já foi processado.

## Fora de escopo (ambas as partes)
- Nenhuma mudança em `fin_contas_saldo_cache`/`refresh_saldo_cache`, Dashboard Financeiro, DRE, DFC ou Projeção de Fluxo de Caixa.
- Sem tabela de histórico de confirmações de saldo de extrato.
- Sem alteração de RLS/policies — só novas funções `SECURITY DEFINER` seguindo os guards padrão do módulo Financeiro.

## Testes
- `tsc --noEmit` limpo.
- Testes unitários (Vitest) para a extração de `LEDGERBAL`/`DTASOF` em `extratoParser.test.ts` (arquivo OFX com e sem o bloco).
- Validação manual (sem ambiente de browser disponível na implementação): revisar visualmente a coluna Saldo no Livro Razão (valores positivos/negativos, filtro por conta vs. todas) e o fluxo completo do diálogo de conferência de saldo (bate / não bate / cancelar) antes de considerar 100% validado — mesmo padrão já usado em entregas anteriores deste projeto.
