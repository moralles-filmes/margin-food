# Manifesto do release integrado

Fonte executável: [manifest.generated.json](../../../release/multiunit-stabilization-20260916/manifest.generated.json). SHA-256 do manifesto usado no ensaio: `c1eaa6fb267d71bc52bd10e3d0eed0f104e267ba5963766a4fa3bdeb1d90ed8e`.

## Regra de histórico

As 14 candidatas F2–F8 permanecem ausentes do histórico remoto. Elas **não** serão reparadas, renumeradas, marcadas como aplicadas nem executadas pela raiz. Após autorização, somente as versões forward `20260916220000`–`20260916221400`, no diretório isolado, podem ser registradas. `20260910003448`, `20260915120000` e o hotfix vivo `20260916153928` permanecem intactos.

| Ordem | Forward | Tratamento | Substitui/avança |
|---:|---|---|---|
| 1 | `20260916220000_phase2_containment_forward.sql` | byte idêntico | F2 `20260915140812` |
| 2 | `20260916220100_phase3_logs_compatible_forward.sql` | avanço compatível | F3 `20260915144030`; troca só preflight incompatível por invariantes semânticos do Salmão atual |
| 3 | `20260916220200_phase3_log_classifier_forward.sql` | byte idêntico | F3 classificador `20260915144031` |
| 4 | `20260916220300_phase4_salmon_forward.sql` | byte idêntico | F4 `20260915200818` |
| 5 | `20260916220400_phase5_supplier_forward.sql` | byte idêntico | F5 `20260915225538` |
| 6 | `20260916220500_phase6_catalog_forward.sql` | avanço compatível | F6 `20260915232846`; aceita `public,pg_temp` produzido por F5 e valida tenant/preço semanticamente |
| 7 | `20260916220600_phase7_containment_compatible_forward.sql` | avanço compatível | F7 `20260916133617`; verifica dependências e digest exato do hotfix |
| 8 | `20260916220700_phase7_preserve_reference_hotfix.sql` | substituída pelo hotfix vivo | F7 `20260916133618`; somente verifica as 17 policies, sem recriá-las |
| 9–12 | `20260916220800`–`20260916221100` | byte idêntico | writers, conflitos, readers e notificações F7 |
| 13–14 | `20260916221200`–`20260916221300` | byte idêntico | Storage/Realtime F8 |
| 15 | `20260916221400_stabilization_residual_forward.sql` | avanço novo | contratos funcionais, atômicos, FKs, ACLs, tipos e Storage residual |

Os hashes individuais e de fonte estão no JSON executável; o builder falha se a substituição textual esperada não for única. O runner falha se qualquer arquivo divergir do hash antes de criar o clone.

## Dependências e invariantes

- origem obrigatória: catálogo vivo equivalente com hotfix de 17 policies e sem nenhuma das 14 candidatas;
- F3: `create_salmon_entry_atomic(date,...,date)` e `_salmon_create_entry_guarded(text,...,text)` presentes; overload de nove argumentos ausente; cancelamentos inserem estorno antes do UPDATE;
- F7: digest exato `9a49d198cabb2ec4f9fd1984e8c20404`; `phase7_active_consumers` ausente;
- F8: bucket continua privado e as seis tabelas Realtime publicam apenas INSERT/UPDATE;
- residual: não muda fórmulas financeiras nem reconstrói saldo; `produtos.saldo_atual` continua a leitura oficial.

## Objetos principais do avanço residual

RPCs: `mutate_purchase_requisition_atomic`, `_salmon_replace_*`, `cancel_stock_movement_atomic`, `confirm_purchase_shopping_atomic`, `receive_purchase_order_atomic`, `delete_purchase_order_atomic`, `replace_rh_banco_horas_period_atomic`, readers guardados e correções de planejamento/inventário/RFQ.

Relações/constraints: `purchase_receipt_batches`, `rh_documentos.storage_state`, FKs compostas de requisições, remoção de FKs simples de compra/turno e unique tenant-scoped de metas Salmão.

## Prova da sequência

O runner criou `moralles_stabilization_release_20260916221043` a partir de `moralles_phase9_test_live`, restaurou somente o substrato de catálogo Storage/Realtime omitido pelo template, aplicou os 15 arquivos e clonou cada estágio para regressão. Resultado e tails com hashes: [release-rehearsal.json](release-rehearsal.json).

O substrato local não contém bytes Storage e o PostgreSQL local não tem `wal_level=logical`; portanto catálogo/publication foram verificados, mas streaming e restauração de objetos não foram alegados.
