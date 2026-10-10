# Conciliação — uma linha do extrato por lançamento: aplicação em produção

Duas migrations, independentes entre si e do frontend (assinaturas e retornos não mudam):

| Migration | O que muda |
|---|---|
| `20261010150000_conciliacao_auto_bind_transferencia_mutua` | `reconcile_auto_bind_transfer_counterparts`: vínculo automático só para o par vizinho mútuo único do lote, com a transferência dentro do período do lote; linha inválida não derruba o lote |
| `20261010160000_conciliacao_vinculo_unico_por_lancamento` | `reconcile_bind_extrato` recusa 2º FITID no mesmo lançamento (`LANCAMENTO_JA_VINCULADO`); `reconcile_import_lancamento` procura o lançamento sem FITID pela ocorrência certa |

Os testes de produção terminam **sempre** em erro com o relatório, e a transação inteira é desfeita. Nada fica gravado.

## Passo a passo (SQL Editor do Supabase)

1. **Antes de aplicar**, rode cada teste (colar o arquivo inteiro e "Run"; no aviso "Potential issues", "Run without RLS"):
   - `teste-producao.sql` → esperado `TESTE OK — N ok, 0 falha(s)`. Nas linhas "publicada": A, B e I diferentes da nova, V com erro, G "PULADO".
   - `teste-vinculo-unico.sql` → esperado `TESTE OK`. Nas linhas "publicada": B1 e I1 diferentes da nova, G "PULADO".
2. Aplique `supabase/migrations/20261010150000_conciliacao_auto_bind_transferencia_mutua.sql` (arquivo inteiro, "Run").
3. Aplique `supabase/migrations/20261010160000_conciliacao_vinculo_unico_por_lancamento.sql`.
4. **Depois de aplicar**, rode os dois testes de novo → `TESTE OK`, as linhas "publicada" iguais às da nova e o G OK.
5. No terminal, registre as versões (nunca `supabase db push`, nem o repair que o CLI sugerir):
   ```bash
   supabase migration repair --status applied 20261010150000 --project-ref wuzxpbixprrgssoeeaez --yes
   supabase migration repair --status applied 20261010160000 --project-ref wuzxpbixprrgssoeeaez --yes
   ```
6. Rode os Advisors do projeto (Security e Performance).

Qualquer `FALHA` ou `TESTE NÃO RODOU`: não aplique. Se já aplicou, reverta.

## Reversão

- `reversao.sql` volta `reconcile_auto_bind_transfer_counterparts` à definição anterior.
- `reversao-vinculo-unico.sql` volta `reconcile_bind_extrato` e `reconcile_import_lancamento` às definições anteriores.

Nenhum dado precisa ser desfeito. As versões novas só deixam de vincular, recusam vínculo duplicado e criam o lançamento que a versão antiga deixava de criar.

## Teste de integração local

`supabase/tests/database/conciliacao_cobertura_unica_ephemeral.sql` aplica as duas migrations (duas vezes) num PostgreSQL descartável e confere 33 cenários, inclusive isolamento entre empresas e um lote de 5000 linhas:

```bash
powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/conciliacao_cobertura_unica_ephemeral.sql
```
