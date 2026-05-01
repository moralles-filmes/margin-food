# Functional Audit — 2026-05-01

**Project:** Margin Food (Vite 5 + React 18 + TypeScript 5 + Supabase)
**Auditor:** Automated functional scan (7 detectors)
**Scope:** `src/` only — Edge Functions and SQL migrations excluded per spec

---

## Resumo executivo

| Severidade | Quantidade |
|------------|-----------|
| BLOCKER    | 2         |
| HIGH       | 6         |
| MEDIUM     | 5         |
| LOW        | 3         |
| **Total**  | **16**    |

**Veredito:** NEEDS_WORK — 0 BLOCKERs em fluxos de pagamento, mas 2 BLOCKERs de qualidade (debug log exposto em produção + silenciamento completo de sync crítico) combinados com 6 HIGHs de tratamento de erro silenciado bloqueiam deploy com confiança plena.

---

## BLOCKER
### [phantom-buttons / empty-handlers — 2 findings]

#### B1. `src/components/AdminUsersView.tsx:575`
```tsx
console.log(`Switching to role ${newR}, found ${defaults.length} default perms`);
```
**Problema:** `console.log` de debug exposto em produção dentro do handler `onChange` do select "Perfil de acesso" na tela Configurações > Usuários. Vaza informação sobre estrutura interna de permissões para DevTools em produção (nome de role, contagem de permissões padrão). Qualquer usuário admin que abra o DevTools e troque o role de um usuário vê esses dados.
**Fix sugerido:**
- A: Remover a linha `console.log(...)` completamente — o efeito visual é nulo para o usuário.
- B: Substituir por `console.debug(...)` (silenciado em produção por bundler se configurado).
- C: Mover para contexto de teste unitário se o log for necessário para debugging.
**Confiança:** 🟢 alta

---

#### B2. `src/components/FichaTecnicaView.tsx:310`
```tsx
invokeApi('sync_preco_salmao_auto', { preco_kg_limpo: localSalmonCost, lote_info: info })
  .then(...)
  .catch(() => {}); // silent
```
**Problema:** A sincronização automática do preço do salmão para o backend (`sync_preco_salmao_auto`) silencia completamente qualquer falha — incluindo falhas de rede, erro 403, timeout ou bug na Edge Function. O preço exibido no frontend ficará divergente do banco sem nenhum indicador de erro para o usuário ou log para debugging. Isso afeta diretamente o cálculo de CMV e precificação de fichas técnicas.
**Fix sugerido:**
- A: Substituir `.catch(() => {})` por `.catch((e) => console.warn('[salmon-price-sync]', e))` — falha não-bloqueante mas rastreável.
- B: Exibir um toast de aviso não-crítico (`toast.warning('Preço do salmão não sincronizado com o servidor')`) para que o usuário saiba quando o valor local diverge.
- C: Armazenar flag `salmonSyncFailed` no estado e exibir badge de aviso no card de preço do salmão.
**Confiança:** 🟢 alta

---

## HIGH
### [empty-handlers — 4 findings]

#### H1. `src/components/AdminUsersView.tsx:170,201`
```tsx
const fetchJobRoles = useCallback(async () => {
  try {
    const { data } = await supabase.from('job_roles')...
  } catch { /* ignore */ }   // linha 170
}, []);

const fetchRolePermissions = useCallback(async () => {
  try { ... } catch { /* ignore */ }   // linha 201
}, []);
```
**Problema:** Falhas ao carregar cargos (`job_roles`) ou permissões de roles (`role_permissions`) são completamente ignoradas. O usuário admin verá dropdowns vazios sem aviso — pode atribuir roles errados ou salvar usuários sem permissões. Não há toast, não há log, não há estado de erro exposto na UI.
**Fix sugerido:**
- A: Adicionar `toast.error('Erro ao carregar cargos. Recarregue a página.')` no catch de `fetchJobRoles` e mensagem similar em `fetchRolePermissions`.
- B: Expor `loadError` no estado do componente e renderizar banner de aviso acima dos dropdowns quando não for possível carregar os dados.
**Confiança:** 🟢 alta

---

#### H2. `src/components/admin/AccessManagementCard.tsx:74`
```tsx
const fetchAudit = useCallback(async () => {
  try {
    const { data } = await supabase.from('admin_actions_log')...
    setAuditLogs((data as AuditEntry[]) || []);
  } catch {}   // linha 74 — completamente vazio
}, []);
```
**Problema:** Falha ao carregar o log de auditoria de acesso é completamente silenciada — sem log, sem toast, sem estado de erro. O card de auditoria exibirá lista vazia sem qualquer indicação ao administrador de que houve erro de carregamento. Adicionalmente, `catch {}` sem binding é difícil de diagnosticar em produção.
**Fix sugerido:**
- A: `catch (e) { console.error('[audit-log]', e); setAuditError('Falha ao carregar log'); }` e renderizar estado de erro no card.
- B: Adicionar toast discreto: `toast.error('Log de auditoria indisponível')`.
**Confiança:** 🟢 alta

---

#### H3. `src/components/AdminUsersView.tsx:111,115`
```tsx
try {
  const parsed = JSON.parse(text);
  if (parsed?.error) return parsed.error;
} catch { }      // linha 111 — JSON parse falhou silenciosamente
// ...
} catch { }      // linha 115 — todo o bloco de parse de erro silenciado
return error?.message || 'Erro';
```
**Problema:** A função `parseInvokeError` usa dois `catch {}` aninhados vazios para tratar erros de parse. Embora o fallback `error?.message || 'Erro'` exista, qualquer exceção inesperada (como `error.context` sendo undefined) fará o usuário ver apenas "Erro" genérico ao criar/editar usuários. O bloco já foi corrigido uma vez (CLAUDE.md, 2026-04-14) mas os catches internos permanecem.
**Fix sugerido:**
- A: `catch (parseErr) { /* JSON inválido — continuar com fallback */ }` — sem ação mas explícito sobre a intenção.
- B: Adicionar ao menos `console.debug('[parseInvokeError]', parseErr)` no catch interno para rastreabilidade.
**Confiança:** 🟡 média (é erro de qualidade, não catastrófico devido ao fallback)

---

#### H4. `src/components/FichaTecnicaView.tsx:103-110` (dentro de `invokeApi`)
```tsx
try {
  const parsed = typeof data === 'object' && data?.error ? data.error : null;
  if (parsed?.code === 'FORBIDDEN_TENANT') throw new Error('...');
  if (parsed?.code === 'NOT_FOUND') throw new Error('...');
  if (parsed?.message) throw new Error(parsed.message);
} catch (parseErr: any) {
  if (parseErr.message !== msg) throw parseErr;
}
```
**Problema:** A lógica de re-throw no `catch` de `parseErr` é sutil e frágil — se `parseErr.message === msg` (isto é, a mensagem de erro do parse coincidir com a mensagem de erro HTTP original), a exceção é silenciada em vez de ser propagada. Na prática isso pode engolir erros FORBIDDEN_TENANT ou NOT_FOUND se o `error.message` do Supabase tiver o mesmo texto. É um edge case mas afeta o módulo mais crítico (74KB, Fichas Técnicas).
**Fix sugerido:**
- A: Separar o guard: `catch (parseErr: any) { if (!(parseErr instanceof ExpectedError)) throw parseErr; }` com classe de erro específica.
- B: Simplificar: deixar o try/catch apenas para o `JSON.parse`, sem re-throw condicional.
**Confiança:** 🟡 média

---

### [stub-functions — 2 findings]

#### H5. Templates stub (3 arquivos) — `src/components/templates/`
```
DashboardSectionTemplate.tsx:58   // TODO: replace with actual RPC / aggregation
CrudSectionTemplate.tsx:69        // TODO: replace with actual RPC or query
AnalyticsSectionTemplate.tsx:69   // TODO: replace with actual RPC or aggregation query
```
**Problema:** Os três templates em `src/components/templates/` (criados 2026-03-24, ~38 dias atrás) são stubs puros — `load()` nunca busca dado real, `handleCreate()` nunca persiste, `handleExport()` emite apenas toast fake. **Embora não sejam importados por nenhum módulo de produção** (verificado — nenhum componente real os importa), eles estão em `src/components/` (não em `src/templates/` ou `src/examples/`), o que pode levá-los a ser importados acidentalmente. O `handleCreate` do `CrudSectionTemplate` não persiste nada mas exibe toast de sucesso, o que é particularmente perigoso.
**Fix sugerido:**
- A: Mover para `src/templates/` (fora de `src/components/`) e adicionar sufixo `.template.tsx` para tornar claro que não são módulos prontos.
- B: Adicionar `throw new Error('Template não implementado — substitua os TODO markers antes de usar')` em `load()`, `handleCreate()`, `handleDelete()`, `handleExport()`.
- C: Se não há previsão de uso, remover os arquivos até que um módulo real precise deles.
**Confiança:** 🟢 alta (stubs confirmados por inspeção direta)

---

#### H6. `src/components/templates/AnalyticsSectionTemplate.tsx:93`
```tsx
const handleExport = async (format: 'pdf' | 'excel') => {
  // ...
  try {
    // TODO: implement actual export using pdfGenerator or xlsx
    toast.success(`Exportação ${format.toUpperCase()} iniciada`);
  }
```
**Problema:** Botão de exportação (PDF e Excel) visível ao usuário exibe toast de sucesso sem gerar arquivo algum. É o pior tipo de phantom button — feedback positivo falso. Embora o template não seja usado agora, este padrão específico de "toast de sucesso sem ação" não deve existir nem em templates, pois pode ser copiado para código de produção.
**Fix sugerido:** Ver H5 — o fix da localização resolve este também. Se mantido, substituir o `toast.success` por `toast.info('Exportação não implementada neste template')`.
**Confiança:** 🟢 alta

---

## MEDIUM
### [empty-handlers — 2 findings em módulos não-críticos]

#### M1. `src/components/estoque/ListaFixaSetorAdmin.tsx:151,165,203`
```tsx
} catch {
  toast.error('Erro ao adicionar produto'); // linha 151
}
// ...
} catch {
  toast.error('Erro ao remover'); // linha 165
}
// ...
} catch {
  toast.error('Erro ao alterar status'); // linha 203
}
```
**Problema:** Tres catches sem binding (`catch {` em vez de `catch (e) {`) em operações CRUD da Lista Fixa de Setor. O toast de erro é exibido corretamente, mas sem o erro original logado, diagnóstico em produção é cego. Arquivo atualizado em 2026-04-29.
**Fix sugerido:** Adicionar binding `catch (e)` e `console.error('[lista-fixa]', e)` em cada bloco.
**Confiança:** 🟢 alta

---

#### M2. `src/components/compras/AlertasFaltaEstoqueView.tsx:132`
```tsx
} catch {
  toast.error('Erro ao confirmar alerta');
}
```
**Problema:** Catch sem binding na confirmação de alerta de falta de estoque. Mesma classe de problema que M1 — o toast existe mas não há rastreabilidade do erro.
**Fix sugerido:** `catch (e) { console.error('[alertas-estoque]', e); toast.error('Erro ao confirmar alerta'); }`
**Confiança:** 🟢 alta

---

### [todos — 2 findings em templates]

#### M3. `src/components/templates/DashboardSectionTemplate.tsx:37-83`
**Problema:** 7 marcadores TODO no template de dashboard (38 dias sem resolução). Arquivo criado 2026-03-24 e não modificado desde então. Embora sem importadores diretos, a presença em `src/components/` com permissões `useCan('modulo:dashboard:view')` hardcoded pode causar ruído no RBAC lint.
**Fix sugerido:** Ver H5.
**Confiança:** 🟢 alta

---

#### M4. `src/components/templates/CrudSectionTemplate.tsx:52-127`
**Problema:** 9 marcadores TODO, incluindo `handleCreate` que exibe `toast.success('Item criado')` sem criar nada. Idem M3.
**Fix sugerido:** Ver H5.
**Confiança:** 🟢 alta

---

### [commented-code — 1 finding]

#### M5. `src/components/AdminUsersView.tsx:575` (debug log — já reportado em B1)
Além do `console.log` reportado em B1, o componente tem lógica de onChange em elemento `<select>` nativo misturada com lógica de permissões (linhas 570-582) que é tecnicamente funcional mas opaca. Não é código comentado, mas é candidato a refactor.
**Nota:** Contabilizado em B1 — não duplicado aqui. Listado para contexto do plano de execução.

---

## LOW
### [empty-handlers — handlers verdadeiramente benignos]

#### L1. `src/components/financeiro/ConciliacaoBancariaSection.tsx:97,108`
```tsx
try { sessionStorage.setItem(SESSION_KEY(contaId), JSON.stringify(linhas)); } catch {}
try { sessionStorage.removeItem(SESSION_KEY(contaId)); } catch {}
```
**Problema:** Falha de sessionStorage silenciada. Em modo privado/incógnito ou quando storage está cheio, a linha do extrato não será persistida entre navegações — mas o fluxo não quebra (dados ainda ficam no estado React enquanto o componente está montado).
**Fix sugerido:** Nenhum urgente. Opcionalmente: `catch (e) { /* sessionStorage indisponível — dados não persistem entre navegações */ }`.
**Confiança:** 🟢 alta

---

#### L2. `src/components/financeiro/CategorizacaoSection.tsx:160-165,248-254`
```tsx
try { new RegExp(form.padrao); } catch {
  toast.error('Regex inválido. Corrija o padrão antes de salvar.');
  return;
}
```
**Problema:** `catch` sem binding em validação de regex. É um catch com ação (toast + return), então é funcional. O único problema é falta de binding, o que é LOW.
**Fix sugerido:** `catch (_) {` ou `catch (e: unknown) {` para deixar claro que o erro é descartado intencionalmente.
**Confiança:** 🟢 alta

---

#### L3. `src/components/FichaTecnicaView.tsx:310` — já reportado em B2
O catch silenciado em `sync_preco_salmao_auto` já foi escalado para BLOCKER — não duplicado aqui.

---

### [todos — sem findings fora de templates]

Nenhum TODO encontrado em código de produção fora de `src/components/templates/`. Os arquivos `supabase/functions/` estão fora do escopo desta auditoria.

---

### [broken-routes — 0 findings]

Todas as chamadas `navigate()` encontradas referenciam rotas existentes em `App.tsx`:
- `/` — `<Route path="/" element={<Index />} />`
- `/login` — `<Route path="/login" element={<Login />} />`
- `/reset-password` — `<Route path="/reset-password" element={<ResetPassword />} />`
- `/admin` — `<Route path="/admin" element={<AdminPanel />} />`

Nenhum `<Link to="...">` encontrado em componentes (`react-router-dom`'s `Link` não é utilizado diretamente — navegação é feita via `navigate()` e `onClick` handlers).

---

### [phantom-buttons — 0 findings além dos já reportados]

Nenhum `onClick={() => {}}` vazio encontrado. Nenhum `href="#"` ou `href="javascript:void"` encontrado. Os botões de exportação de todos os módulos de produção (AlertasSection, RecorrenciasSection, FechamentoCaixaSection, SecurityAuditView, RequisicaoDetailModal) têm implementação real com XLSX ou jsPDF.

---

### [mocked-data — 0 findings]

Nenhum lorem ipsum, email fake (`@example.com`, `@test.com`), nome fake (John Doe, Jane Doe), imagem placeholder (picsum, placehold.co), constante `MOCK_` ou array com IDs sequenciais encontrado em código de produção. Os placeholders em `AdminCompaniesView.tsx` e `AccessManagementCard.tsx` são atributos HTML `placeholder=` de inputs (correto).

---

## Plano de execução

### Onda 1 — BLOCKERs (estimativa: 15 min)
- [ ] B1 — `AdminUsersView.tsx:575`: Remover `console.log(...)` no handler de troca de role
- [ ] B2 — `FichaTecnicaView.tsx:310`: Substituir `.catch(() => {})` por `.catch((e) => console.warn('[salmon-price-sync]', e))`

### Onda 2 — HIGH (estimativa: 1h)
- [ ] H1 — `AdminUsersView.tsx:170,201`: Adicionar toast de erro em `fetchJobRoles` e `fetchRolePermissions`
- [ ] H2 — `AccessManagementCard.tsx:74`: Adicionar estado de erro e log em `fetchAudit`
- [ ] H3 — `AdminUsersView.tsx:111,115`: Adicionar comentário explícito nos catches (`/* JSON parse inválido — continuar com fallback */`)
- [ ] H4 — `FichaTecnicaView.tsx:103-110`: Refatorar lógica de re-throw no `parseErr` catch
- [ ] H5/H6 — Templates: Mover `src/components/templates/` para `src/templates/` ou adicionar guards de "não implementado" nos stubs

### Onda 3 — MEDIUM (estimativa: 30 min)
- [ ] M1 — `ListaFixaSetorAdmin.tsx:151,165,203`: Adicionar binding e `console.error` nos 3 catches
- [ ] M2 — `AlertasFaltaEstoqueView.tsx:132`: Idem, binding + console.error
- [ ] M3/M4 — Templates: Resolvido junto com H5/H6

### Onda 4 — LOW (estimativa: 10 min)
- [ ] L1 — `ConciliacaoBancariaSection.tsx:97,108`: Adicionar comentário explícito nos catches de sessionStorage
- [ ] L2 — `CategorizacaoSection.tsx:160,250`: Adicionar `_` binding nos catches de validação regex

---

## Notas adicionais

**Arquitetura positiva observada:**
- Todos os módulos de exportação de produção (XLSX, jsPDF) estão implementados — nenhum botão de exportação fantasma em módulos usados.
- Todas as Edge Functions invocadas (`ficha-tecnica`, `cmv`, `inventario`, `requisicao-estoque`, `purchase-requisitions`, `rh`, `admin-users`, `admin-companies`, `check-password`) existem em `supabase/functions/`.
- As chamadas via URL direta (`admin-create-user`, `rbac-lint-full`, `rbac-lint-quick`, `ai-chat`) também têm implementações em disco.
- Nenhum dado mockado em telas de produção.
- Nenhuma rota quebrada.

**Risco técnico não-funcional observado (fora do escopo dos 7 detectores, para registro):**
- `src/components/templates/CrudSectionTemplate.tsx:52-56` usa chaves de permissão `modulo:subaba:*` que não existem no registry RBAC. Se importado acidentalmente, o usuário verá "Acesso negado" em todos os perfis.
