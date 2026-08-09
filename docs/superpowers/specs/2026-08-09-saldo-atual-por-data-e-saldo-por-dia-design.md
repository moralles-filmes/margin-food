# Livro Razão: Saldo atual respeitando filtro de data + linha de saldo por dia

Data: 2026-08-09
Módulo: Financeiro → Lançamentos → Livro Razão
Contexto: feedback de produção sobre a entrega de `2026-08-09-saldo-livro-razao-e-conferencia-extrato-design.md` (já em produção). O design original de "Saldo no Livro Razão" (Parte 1) especificava só a coluna Saldo por linha e o card "Saldo atual" lendo sempre o cache (saldo real de hoje, sem parâmetro de data) — nenhum dos dois comportamentos abaixo estava no escopo original.

## Problemas reportados

1. **"Saldo atual" não muda com o filtro de data** — o card sempre mostra o saldo real de hoje (lido de `fin_contas_saldo_cache`), mesmo quando o usuário filtra o Livro Razão até uma data no passado. Esperado: refletir o saldo da conta *naquela data*.
2. **Falta uma linha de saldo por dia**, no estilo de um extrato bancário: uma linha cheia entre os grupos de lançamentos de cada dia, mostrando o saldo de fechamento daquele dia.

## Parte A — "Saldo atual" respeita o filtro "até"

### Requisito
O card "Saldo atual" mostra o saldo da conta (ou soma das contas ativas, se "Todas contas") **na data `filtroDataAte`**, quando esse filtro está preenchido. Sem `filtroDataAte`, comportamento atual é mantido (saldo real de hoje, lido do cache). O filtro `filtroDataDe` (data inicial) não tem nenhum efeito sobre esse número — ele sempre acumula desde o início da conta.

### Abordagem
Estender `get_fin_saldo_atual(p_conta_id uuid DEFAULT NULL)` com um novo parâmetro `p_data date DEFAULT NULL`:
- `p_data IS NULL` → comportamento inalterado: lê `fin_contas_saldo_cache` (rápido, saldo real de hoje).
- `p_data IS NOT NULL` → calcula via ledger, mesma fórmula assinada já usada em `get_fin_saldo_conta_em` (RECEITA soma, DESPESA subtrai, TRANSFERENCIA por direção), somada ao `saldo_inicial`:
  - `p_conta_id` informado: soma `saldo_inicial` daquela conta + lançamentos REALIZADO/CONCILIADO com `data_competencia <= p_data` daquela conta (mesmo guard `AND conta_id = p_conta_id` já usado em `get_fin_saldo_conta_em`/`list_fin_lancamentos_cursor` para RECEITA/DESPESA, e `conta_id`/`conta_destino_id` para TRANSFERENCIA).
  - `p_conta_id IS NULL` ("Todas contas"): soma `saldo_inicial` de todas as contas ativas + lançamentos RECEITA/DESPESA de todas elas até `p_data`, **excluindo TRANSFERENCIA** (mesmo critério já usado no cálculo "sem filtro de conta" do design original — movimento interno não muda o total da empresa).

Alternativa descartada: sempre calcular via ledger (nunca ler o cache) — mais simples de código, mas perde a leitura rápida do caso comum (sem filtro de data), que é o mais frequente.

### Mudanças técnicas
- **Migration nova**: `CREATE OR REPLACE FUNCTION get_fin_saldo_atual(p_conta_id uuid DEFAULT NULL, p_data date DEFAULT NULL)`. Guards inalterados (`assert_tenant()` + `finance:read`).
- **`LivroRazaoSection.tsx`**: `loadSaldoAtual()` passa `p_data: filtroDataAte || null`; adiciona `filtroDataAte` às dependências do `useCallback` (já está na lista de dependências do `useEffect` que dispara `loadSaldoAtual()` — só falta no próprio `useCallback` e no payload da chamada RPC).

## Parte B — Linha de saldo por dia na tabela

### Requisito
Mantém a tabela atual do Livro Razão (com sua coluna "Saldo" por lançamento) e insere uma linha divisória de largura cheia antes de cada grupo de lançamentos do mesmo dia, mostrando a data e o saldo de fechamento daquele dia.

### Abordagem
Sem migration nova. `list_fin_lancamentos_cursor` já retorna os itens ordenados `data_competencia DESC, id DESC` (garantido pelo cursor), então linhas do mesmo dia já ficam contíguas no array `items` — o agrupamento é só apresentação, feito 100% no cliente.

Regra para o saldo mostrado em cada linha divisória: primeiro `saldo_apos` não-nulo encontrado percorrendo aquele grupo de dia de cima para baixo (a primeira linha de cada dia, em ordem DESC, é a transação mais recente daquele dia = saldo de fechamento). Lançamentos PREVISTO têm `saldo_apos = null` (não entram no ledger) — se todas as linhas de um dia forem PREVISTO, usa o último `saldo_apos` não-nulo já visto na varredura (carry-forward: "nada mudou de fato o saldo real nesse dia"), ou "—" se nenhuma linha anterior na página carregada tiver saldo conhecido (início do histórico carregado).

Implementação: uma passada única sobre `items` (já em ordem DESC) computando, para cada item, o "saldo do dia corrente" via carry-forward de `lastKnownSaldo`; agrupar por `data_competencia`; ao renderizar, inserir a linha divisória antes do primeiro item de cada grupo nesse valor.

Alternativa descartada: nova RPC/coluna agregada por dia no backend — desnecessário, o dado já está disponível e correto no array já carregado; geraria uma segunda fonte de verdade para o mesmo número.

### Mudanças técnicas
- **`LivroRazaoSection.tsx`**:
  - Novo `useMemo` (`groupedItems` ou similar) que particiona `items` (já ordenados) em grupos por `data_competencia`, cada grupo carregando o saldo de fechamento do dia (regra acima).
  - Na renderização da tabela, para cada grupo: `<TableRow>` de largura cheia (`<TableCell colSpan={8}>`) com a data formatada (`formatDateBR`) e "Saldo do dia: {fmtBRL(saldo)}" (ou "—" se desconhecido), seguida das linhas normais de lançamento daquele grupo (mantendo todas as colunas/células/ações atuais sem alteração).
  - Sem mudança de paginação: ao clicar "carregar mais", o `useMemo` reagrupa o array inteiro (já crescido) — grupos que já apareciam permanecem estáveis, só o último grupo pode ganhar mais linhas se a página seguinte trouxer mais itens do mesmo dia.

## Fora de escopo
- `get_fin_lancamentos_totais` (barra Entradas/Saídas/Resultado) — continua somando por período, sem relação com nenhum dos dois pontos acima.
- `get_fin_saldo_conta_em` — não muda; já faz exatamente o cálculo pontual por conta que a Parte A reaproveita (mas não chama diretamente, para não obrigar `p_conta_id` quando `p_conta_id IS NULL` é um caso válido em `get_fin_saldo_atual`).
- Nenhuma mudança em cache/Dashboard/DRE/DFC/Conciliação Bancária.
- Sem nova tabela, sem nova coluna persistida.

## Testes
- `tsc --noEmit` limpo.
- Validação manual (mesma limitação de ambiente das entregas anteriores — sem browser disponível na implementação): conferir "Saldo atual" mudando ao alterar o filtro "até" (com e sem filtro de conta), e as linhas de saldo por dia aparecendo corretamente intercaladas com os lançamentos, inclusive em um dia com só lançamentos PREVISTO (carry-forward) e no primeiro dia carregado da história da conta ("—").
