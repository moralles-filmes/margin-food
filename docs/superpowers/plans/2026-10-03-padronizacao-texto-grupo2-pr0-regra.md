# Padronização de texto — Grupo 2, PR 0 (regra) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensinar à regra de padronização a sigla sem vogal (JBS, GM), as siglas novas, romanos/tamanhos só como palavra solta e a letra depois de designador — nos dois lados (TS e SQL) — e reaplicar o backfill do Grupo 1 em produção.

**Architecture:** `src/lib/padronizarTexto.ts` é a regra usada no cliente; `docs/padronizacao-texto/padronizar_texto.sql` é o espelho em funções `pg_temp` usado só pelo backfill. Os casos de conferência moram no SQL, entre `-- CASOS-INICIO` e `-- CASOS-FIM`, e são lidos também por `src/lib/padronizarTexto.test.ts` — um caso novo testa os dois lados. Nenhuma migration: nada fica no banco além dos dados do backfill.

**Tech Stack:** TypeScript 5, Vitest (Bun), PostgreSQL 15 (Supabase, projeto `wuzxpbixprrgssoeeaez`), MCP Supabase `execute_sql`.

**Spec:** `docs/superpowers/specs/2026-10-03-padronizacao-texto-grupo2-design.md` (seção "PR 0 — Design").

> **Nota de execução:** a revisão final da branch corrigiu os itens 2, 6 e 8 da regra (designador forte/fraco, classe explícita de consoantes, pedaço depois de enclítico). O código das Tasks 1–2 abaixo é a primeira versão; a versão final está no commit `fix(texto): ...` e na spec.

## Global Constraints

- A regra só muda caixa e espaços: `normalizeSearchText(padronizarTexto(x)) === normalizeSearchText(x).replace(/\s+/g, ' ')` (já testado para todo caso).
- Regra nova muda os dois lados (TS e SQL) e os casos compartilhados; caso de teste só entre `-- CASOS-INICIO`/`-- CASOS-FIM`.
- Padronização no cliente, nunca trigger; a chave de idempotência continua derivada do texto digitado (CLAUDE.md).
- Tasks 1–3 não gravam nada no banco: o SQL roda só `pg_temp` + DO-block de conferência.
- Backfill em produção: simulação primeiro; aplicação só com aprovação explícita do usuário.
- Commits `tipo(escopo): descrição`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; antes de commitar, `git diff --cached | grep -E 'eyJ|sb_secret_|password|api_key'` vazio.
- Fluxo: branch `feat/padronizacao-texto-grupo2` → PR → merge. Nunca push na `main`.
- Trabalhar na worktree `C:\Users\Yuri\Documents\Desenvolvedor\margin.food\.claude\worktrees\padronizacao-grupo2` (todas as paths abaixo são relativas a ela).

## Review Focus

- Sigla de estado em palavra composta ("BAURU/SP") continua sigla depois que romanos/tamanhos saem dos pedaços → caso `('BAURU/SP', 'Bauru/SP')` na Task 1.
- "a" depois de palavra que não é designador continua conectivo ("VENDA A PRAZO" → "Venda a Prazo") → caso na Task 1.
- "Nº" (o "º" é letra Unicode) dá o mesmo resultado no TS e no SQL, qualquer que seja o `[[:alpha:]]` do banco → caso `('NOTA Nº 15', 'Nota Nº 15')` na Task 1, conferido no SQL na Task 2.
- Texto já gravado pelo Grupo 1 em caixa mista ("Santander Gm") vira "Santander GM" no reaplicar → caso `('Santander Gm', 'Santander GM')` na Task 1.
- Sigla sem vogal digitada em minúsculo ("dg clean") vira "DG Clean" → caso na Task 1.

---

### Task 1: Regra nova no TypeScript + casos compartilhados

**Files:**
- Modify: `docs/padronizacao-texto/padronizar_texto.sql` (só o bloco entre `-- CASOS-INICIO` e `-- CASOS-FIM`)
- Modify: `src/lib/padronizarTexto.ts` (arquivo inteiro abaixo)
- Test: `src/lib/padronizarTexto.test.ts` (sem mudança; lê os casos do SQL)

**Interfaces:**
- Consumes: nada.
- Produces: `padronizarTexto(texto: string): string` (assinatura inalterada); casos compartilhados que a Task 2 confere no SQL.

- [ ] **Step 0: Preparar a worktree**

Run (PowerShell, na worktree): `bun install --frozen-lockfile`
Expected: instala sem erro (~100 s). Não usar junction para o `node_modules` do checkout principal — quebra testes do leitor de código de barras.

- [ ] **Step 1: Escrever os casos (teste que falha)**

Em `docs/padronizacao-texto/padronizar_texto.sql`, trocar a linha

```sql
    ('SANTANDER GM', 'Santander Gm'),
```

por

```sql
    ('SANTANDER GM', 'Santander GM'),
```

e inserir, logo depois da linha `    ('epis cozinha', 'EPIs Cozinha'),`, o bloco:

```sql
    ('JBS', 'JBS'),
    ('GRAFICA JB', 'Grafica JB'),
    ('TDG MIX', 'TDG Mix'),
    ('dg clean', 'DG Clean'),
    ('CPFL ENERGIA', 'CPFL Energia'),
    ('BTG PACTUAL', 'BTG Pactual'),
    ('Santander Gm', 'Santander GM'),
    ('XYZ COMERCIO', 'Xyz Comercio'),
    ('BROWNIE MR BAY', 'Brownie Mr Bay'),
    ('DR. SILVA', 'Dr. Silva'),
    ('CX PAPEL TOALHA', 'Cx Papel Toalha'),
    ('ARROZ KG', 'Arroz Kg'),
    ('PARAFUSO 5 PÇS', 'Parafuso 5 Pçs'),
    ('NFS-E 55', 'NFS-e 55'),
    ('DIFAL SP', 'DIFAL SP'),
    ('DAE COLABORADOR', 'DAE Colaborador'),
    ('ICMS-ST', 'ICMS-ST'),
    ('BAURU/SP', 'Bauru/SP'),
    ('BEM-TE-VI', 'Bem-te-Vi'),
    ('DOM PEDRO II', 'Dom Pedro II'),
    ('CAMISA GG', 'Camisa GG'),
    ('OVO TIPO A GRANDE', 'Ovo Tipo A Grande'),
    ('VITAMINA E 400MG', 'Vitamina E 400mg'),
    ('CATEGORIA E SUBCATEGORIA', 'Categoria e Subcategoria'),
    ('VENDA A PRAZO', 'Venda a Prazo'),
    ('NOTA Nº 15', 'Nota Nº 15'),
    ('AÇÚCAR SACHÊ 5G', 'Açúcar Sachê 5g'),
    ('C6 BANK', 'C6 Bank'),
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bunx vitest run src/lib/padronizarTexto.test.ts`
Expected: FAIL — entre outros, `padroniza ["JBS","JBS"]` recebe `"Jbs"`, `["SANTANDER GM","Santander GM"]` recebe `"Santander Gm"`, `["BEM-TE-VI","Bem-te-Vi"]` recebe `"Bem-te-VI"`, `["OVO TIPO A GRANDE",…]` recebe `"Ovo Tipo a Grande"`.

- [ ] **Step 3: Implementar a regra no TypeScript**

Substituir o conteúdo de `src/lib/padronizarTexto.ts` por:

```ts
/**
 * Padroniza maiúsculas/minúsculas de nomes e descrições digitados (pt-BR):
 * cada palavra com inicial maiúscula, conectivos (de, da, e…) em minúsculo no
 * meio do texto, siglas no padrão (PIX, INSS, LTDA e palavra curta sem vogal,
 * como JBS e GM) e unidades logo depois de número (1kg, 350 ml, 2L, 20x30).
 *
 * Só muda caixa e espaços — `normalizeSearchText` do resultado é o mesmo do
 * original —, então buscas e o dedup da conciliação (que comparam sem caixa)
 * não mudam. Aplicar no envio ao banco, nunca na chave de idempotência.
 *
 * Espelhada em SQL para o backfill (`docs/padronizacao-texto/padronizar_texto.sql`);
 * os casos de conferência de lá rodam também em `padronizarTexto.test.ts`.
 */

const LOCALE = 'pt-BR';

const minusculo = (s: string) => s.toLocaleLowerCase(LOCALE);
const maiusculo = (s: string) => s.toLocaleUpperCase(LOCALE);

function porChave(lista: string[]): Map<string, string> {
  return new Map(lista.map(s => [minusculo(s), s]));
}

const SIGLAS = porChave([
  'PIX', 'NF', 'NFe', 'NF-e', 'NFCe', 'NFC-e', 'NFSe', 'NFS-e', 'CT-e', 'MDF-e', 'CNPJ', 'CPF', 'RG', 'CNH', 'CEP',
  'LTDA', 'ME', 'EPP', 'EIRELI', 'MEI', 'S/A', 'TED', 'DOC', 'TEF', 'PDV',
  'INSS', 'FGTS', 'IPTU', 'IPVA', 'ICMS', 'ST', 'DIFAL', 'ISS', 'ISSQN', 'PIS', 'COFINS', 'IRPJ', 'IRRF', 'CSLL',
  'DAS', 'DAE', 'DARF', 'GPS', 'GRU', 'GNRE', 'CLT', 'PJ', 'PF', 'RH', 'TI', 'VR', 'VA', 'VT', 'EPI', 'EPIs',
  'CMV', 'DRE', 'DFC', 'SIF', 'UHT', 'PVC', 'LED', 'USB', 'TV', 'E-mail',
  'SP', 'RJ', 'MG', 'RS', 'SC', 'PR', 'DF', 'BA', 'PE', 'MS', 'MT', 'ES', 'RN', 'PB',
  'PP', 'GG', 'XG', 'XGG', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII',
]);

// Romanos e tamanhos só valem como palavra solta ("Dom Pedro II", "Camisa GG"),
// nunca em pedaço de palavra composta ("Bem-te-Vi").
const SO_PALAVRA_SOLTA = new Set(['pp', 'gg', 'xg', 'xgg', 'ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii']);

// Só valem logo depois de um número ("5 KG" → "5 kg"); soltas são palavras.
const UNIDADES = porChave([
  'kg', 'kgs', 'g', 'gr', 'grs', 'mg', 'ml', 'L', 'lt', 'lts', 'm', 'cm', 'mm',
  'un', 'und', 'unid', 'cx', 'pct', 'pc', 'pcs',
]);

// Palavra curta sem vogal é sigla (JBS, GM, CPFL), menos unidade, tratamento e "Pç".
const SEM_VOGAL = /^[^\P{L}aeiouyáàâãäéèêëíìîïóòôõöúùûüýÿ]{2,4}$/u;
const SEM_VOGAL_NAO_SIGLA = new Set(['mr', 'mrs', 'sr', 'srs', 'dr', 'drs', 'pç', 'pçs']);

// Em minúsculo só no meio do texto: "DAS Simples" e "Pagamento DAS" são siglas.
const CONECTIVOS = new Set([
  'a', 'à', 'ao', 'aos', 'as', 'às', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelas', 'pelo', 'pelos',
  'por', 'pra', 'pro', 'sem', 'sob',
]);

// Letra solta depois destes fica maiúscula mesmo no meio ("Tipo A Grande").
const DESIGNADORES = new Set([
  'tipo', 'vitamina', 'classe', 'grupo', 'série', 'serie', 'bloco', 'plano', 'lote',
  'modelo', 'letra', 'nível', 'nivel', 'fase', 'turno', 'categoria',
]);

// Pronome depois de hífen fica minúsculo ("Pague-me").
const ENCLITICOS = new Set(['me', 'te', 'se', 'lhe', 'lhes', 'lo', 'la', 'los', 'las', 'nos', 'vos', 'o', 'a', 'os', 'as']);

const INICIO_NAO_ALFANUMERICO = /^[^\p{L}\p{Nd}]*/u;
const FIM_NAO_ALFANUMERICO = /[^\p{L}\p{Nd}]*$/u;
const UNIDADE_COLADA = /^([0-9]+(?:[.,][0-9]+)?)(\p{L}+)$/u;
const DIMENSAO = /^([0-9]+(?:[.,][0-9]+)?(?:[xX][0-9]+(?:[.,][0-9]+)?)+)(\p{L}*)$/u;
const SEPARADOR = /([-/'’.])/;

interface Token {
  pre: string;
  nucleo: string;
  suf: string;
}

function separar(token: string): Token {
  const pre = token.match(INICIO_NAO_ALFANUMERICO)?.[0] ?? '';
  if (pre.length === token.length) return { pre: token, nucleo: '', suf: '' };
  const suf = token.match(FIM_NAO_ALFANUMERICO)?.[0] ?? '';
  return { pre, nucleo: token.slice(pre.length, token.length - suf.length), suf };
}

function capitalizar(s: string): string {
  const [primeiro = '', ...resto] = [...s];
  return maiusculo(primeiro) + minusculo(resto.join(''));
}

function siglaSemVogal(chave: string): string | undefined {
  if (!SEM_VOGAL.test(chave) || UNIDADES.has(chave) || SEM_VOGAL_NAO_SIGLA.has(chave)) return undefined;
  return maiusculo(chave);
}

function formatarSegmento(segmento: string, separadorAnterior: string, segmentoAnterior: string): string {
  if (!segmento) return segmento;
  const chave = minusculo(segmento);
  if (separadorAnterior === '-' && ENCLITICOS.has(chave)) return chave;
  // "D'Água" mantém a maiúscula; "Mcdonald's" não.
  if ((separadorAnterior === "'" || separadorAnterior === '’') && [...segmentoAnterior].length !== 1) return chave;
  const sigla = SO_PALAVRA_SOLTA.has(chave) ? undefined : SIGLAS.get(chave);
  return sigla ?? siglaSemVogal(chave) ?? capitalizar(segmento);
}

function formatarComposto(nucleo: string): string {
  const pedacos = nucleo.split(SEPARADOR); // [segmento, separador, segmento, ...]
  let saida = formatarSegmento(pedacos[0], '', '');
  for (let i = 2; i < pedacos.length; i += 2) {
    saida += pedacos[i - 1] + formatarSegmento(pedacos[i], pedacos[i - 1], pedacos[i - 2]);
  }
  return saida;
}

function formatarComNumero(nucleo: string): string {
  const colada = nucleo.match(UNIDADE_COLADA);
  if (colada) {
    const unidade = UNIDADES.get(minusculo(colada[2]));
    return unidade ? colada[1] + unidade : nucleo;
  }
  const dimensao = nucleo.match(DIMENSAO);
  if (dimensao) {
    const sufixo = dimensao[2] ? UNIDADES.get(minusculo(dimensao[2])) ?? dimensao[2] : '';
    return dimensao[1].replace(/X/g, 'x') + sufixo;
  }
  return nucleo;
}

interface Posicao {
  meio: boolean;
  aposNumero: boolean;
  antesNumero: boolean;
  aposDesignador: boolean;
  antesPalavra: boolean;
}

function formatarNucleo(nucleo: string, { meio, aposNumero, antesNumero, aposDesignador, antesPalavra }: Posicao): string {
  if (/[0-9]/.test(nucleo)) return formatarComNumero(nucleo);
  const chave = minusculo(nucleo);
  // "Vitamina E 400mg", mas "Categoria e Subcategoria" (conjunção).
  if (aposDesignador && [...nucleo].length === 1 && !(chave === 'e' && antesPalavra)) return maiusculo(nucleo);
  if (meio && CONECTIVOS.has(chave)) return chave;
  if (aposNumero) {
    const unidade = UNIDADES.get(chave);
    if (unidade) return unidade;
  }
  if (chave === 'x' && aposNumero && antesNumero) return 'x';
  const sigla = SIGLAS.get(chave) ?? siglaSemVogal(chave);
  if (sigla) return sigla;
  if ([...nucleo].length === 1) return maiusculo(nucleo);
  return formatarComposto(nucleo);
}

const comecaComNumero = (token?: Token) => !!token && /^[0-9]/.test(token.nucleo);
const comecaComLetra = (token?: Token) => !!token && /^\p{L}/u.test(token.nucleo);
const ehDesignador = (token?: Token) => !!token && DESIGNADORES.has(minusculo(token.nucleo));

export function padronizarTexto(texto: string): string {
  const tokens = texto.trim().split(/\s+/).filter(t => t !== '').map(separar);
  const comNucleo = tokens.flatMap((t, i) => (t.nucleo ? [i] : []));
  const primeiro = comNucleo[0];
  const ultimo = comNucleo[comNucleo.length - 1];
  return tokens
    .map((t, i) => {
      if (!t.nucleo) return t.pre;
      return t.pre + formatarNucleo(t.nucleo, {
        meio: i !== primeiro && i !== ultimo,
        aposNumero: comecaComNumero(tokens[i - 1]),
        antesNumero: comecaComNumero(tokens[i + 1]),
        aposDesignador: ehDesignador(tokens[i - 1]),
        antesPalavra: comecaComLetra(tokens[i + 1]),
      }) + t.suf;
    })
    .join(' ');
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bunx vitest run src/lib/padronizarTexto.test.ts`
Expected: PASS em todos (`padroniza`, `é idempotente`, `só muda caixa e espaços`) para os 75 casos.

- [ ] **Step 5: Lint e tipos do arquivo**

Run: `bunx eslint src/lib/padronizarTexto.ts` e `bunx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/padronizarTexto.ts docs/padronizacao-texto/padronizar_texto.sql
git diff --cached | grep -E 'eyJ|sb_secret_|password|api_key'   # deve sair vazio
git commit -m "feat(texto): sigla sem vogal, siglas novas e letra depois de designador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Espelho SQL da regra + conferência no banco

**Files:**
- Modify: `docs/padronizacao-texto/padronizar_texto.sql` (funções; os casos já vieram da Task 1)

**Interfaces:**
- Consumes: casos entre `-- CASOS-INICIO`/`-- CASOS-FIM` (Task 1).
- Produces: `pg_temp.padronizar_texto(text) returns text` com a regra nova, usado por `docs/padronizacao-texto/backfill_grupo1.sql` (Task 4). Assinatura de `pg_temp.pt_nucleo` passa a ter 6 parâmetros (só chamada dentro do próprio arquivo).

- [ ] **Step 1: Confirmar que o SQL atual diverge dos casos novos (teste que falha)**

Rodar o arquivo inteiro `docs/padronizacao-texto/padronizar_texto.sql` (com os casos da Task 1) pelo MCP `mcp__claude_ai_Supabase__execute_sql`, `project_id = wuzxpbixprrgssoeeaez`, `query` = conteúdo integral do arquivo. Só cria funções `pg_temp` e roda o DO-block; não grava nada.
Expected: erro `PADRONIZACAO_DIVERGENTE:` listando, entre outros, `'JBS' -> 'Jbs' (esperado 'JBS')` e `'BEM-TE-VI' -> 'Bem-te-VI' (esperado 'Bem-te-Vi')`.

- [ ] **Step 2: Implementar o espelho**

Em `docs/padronizacao-texto/padronizar_texto.sql`, substituir tudo do início do arquivo até a linha anterior a `do $conferencia$` por:

```sql
-- Padronização de maiúsculas/minúsculas — espelho SQL de src/lib/padronizarTexto.ts.
-- Tudo em pg_temp: existe só na sessão que roda o script, nada fica no banco.
-- Qualquer mudança de regra precisa ser feita nos dois lados; os casos abaixo
-- são conferidos aqui (DO-block) e em src/lib/padronizarTexto.test.ts.

create or replace function pg_temp.pt_capitalizar(p text) returns text
language sql immutable as $$ select upper(left(p, 1)) || lower(substr(p, 2)) $$;

create or replace function pg_temp.pt_sigla(p_chave text) returns text
language sql immutable as $$
  select s from unnest(array[
    'PIX','NF','NFe','NF-e','NFCe','NFC-e','NFSe','NFS-e','CT-e','MDF-e','CNPJ','CPF','RG','CNH','CEP',
    'LTDA','ME','EPP','EIRELI','MEI','S/A','TED','DOC','TEF','PDV',
    'INSS','FGTS','IPTU','IPVA','ICMS','ST','DIFAL','ISS','ISSQN','PIS','COFINS','IRPJ','IRRF','CSLL',
    'DAS','DAE','DARF','GPS','GRU','GNRE','CLT','PJ','PF','RH','TI','VR','VA','VT','EPI','EPIs',
    'CMV','DRE','DFC','SIF','UHT','PVC','LED','USB','TV','E-mail',
    'SP','RJ','MG','RS','SC','PR','DF','BA','PE','MS','MT','ES','RN','PB',
    'PP','GG','XG','XGG','II','III','IV','VI','VII','VIII','IX','XI','XII'
  ]) s where lower(s) = p_chave limit 1
$$;

-- Romanos e tamanhos só valem como palavra solta, nunca em pedaço de palavra composta.
create or replace function pg_temp.pt_so_solta(p_chave text) returns boolean
language sql immutable as $$
  select p_chave = any(array['pp','gg','xg','xgg','ii','iii','iv','vi','vii','viii','ix','xi','xii'])
$$;

create or replace function pg_temp.pt_unidade(p_chave text) returns text
language sql immutable as $$
  select u from unnest(array[
    'kg','kgs','g','gr','grs','mg','ml','L','lt','lts','m','cm','mm',
    'un','und','unid','cx','pct','pc','pcs'
  ]) u where lower(u) = p_chave limit 1
$$;

-- Palavra curta sem vogal é sigla (JBS, GM, CPFL), menos unidade, tratamento e "Pç".
create or replace function pg_temp.pt_sem_vogal(p_chave text) returns text
language sql immutable as $$
  select case
    when p_chave ~ '^[[:alpha:]]{2,4}$'
     and p_chave !~ '[aeiouyáàâãäéèêëíìîïóòôõöúùûüýÿ]'
     and pg_temp.pt_unidade(p_chave) is null
     and p_chave <> all(array['mr','mrs','sr','srs','dr','drs','pç','pçs'])
    then upper(p_chave)
  end
$$;

create or replace function pg_temp.pt_segmento(p_seg text, p_sep_anterior text, p_seg_anterior text)
returns text language sql immutable as $$
  select case
    when p_seg = '' then p_seg
    when p_sep_anterior = '-' and lower(p_seg) = any(array[
      'me','te','se','lhe','lhes','lo','la','los','las','nos','vos','o','a','os','as'
    ]) then lower(p_seg)
    when p_sep_anterior in ('''', '’') and length(p_seg_anterior) <> 1 then lower(p_seg)
    else coalesce(
      case when pg_temp.pt_so_solta(lower(p_seg)) then null else pg_temp.pt_sigla(lower(p_seg)) end,
      pg_temp.pt_sem_vogal(lower(p_seg)),
      pg_temp.pt_capitalizar(p_seg)
    )
  end
$$;

create or replace function pg_temp.pt_composto(p_nucleo text) returns text
language plpgsql immutable as $$
declare
  v_saida text := '';
  v_seg text := '';
  v_sep text := '';
  v_seg_anterior text := '';
  v_c text;
begin
  for i in 1 .. length(p_nucleo) loop
    v_c := substr(p_nucleo, i, 1);
    if v_c in ('-', '/', '''', '’', '.') then
      v_saida := v_saida || pg_temp.pt_segmento(v_seg, v_sep, v_seg_anterior) || v_c;
      v_seg_anterior := v_seg;
      v_sep := v_c;
      v_seg := '';
    else
      v_seg := v_seg || v_c;
    end if;
  end loop;
  return v_saida || pg_temp.pt_segmento(v_seg, v_sep, v_seg_anterior);
end $$;

create or replace function pg_temp.pt_numero(p_nucleo text) returns text
language plpgsql immutable as $$
declare
  m text[];
  v_unidade text;
begin
  m := regexp_match(p_nucleo, '^([0-9]+(?:[.,][0-9]+)?)([[:alpha:]]+)$');
  if m is not null then
    v_unidade := pg_temp.pt_unidade(lower(m[2]));
    return case when v_unidade is not null then m[1] || v_unidade else p_nucleo end;
  end if;
  m := regexp_match(p_nucleo, '^([0-9]+(?:[.,][0-9]+)?(?:[xX][0-9]+(?:[.,][0-9]+)?)+)([[:alpha:]]*)$');
  if m is not null then
    return replace(m[1], 'X', 'x')
      || case when m[2] = '' then '' else coalesce(pg_temp.pt_unidade(lower(m[2])), m[2]) end;
  end if;
  return p_nucleo;
end $$;

create or replace function pg_temp.pt_nucleo(
  p_nucleo text, p_meio boolean, p_apos_numero boolean, p_antes_numero boolean,
  p_apos_designador boolean, p_antes_palavra boolean
)
returns text language plpgsql immutable as $$
declare
  v_chave text := lower(p_nucleo);
  v_r text;
begin
  if p_nucleo ~ '[0-9]' then return pg_temp.pt_numero(p_nucleo); end if;
  -- "Vitamina E 400mg", mas "Categoria e Subcategoria" (conjunção).
  if p_apos_designador and length(p_nucleo) = 1 and not (v_chave = 'e' and p_antes_palavra) then
    return upper(p_nucleo);
  end if;
  if p_meio and v_chave = any(array[
    'a','à','ao','aos','as','às','com','da','das','de','do','dos','e','em',
    'na','nas','no','nos','o','os','ou','para','pela','pelas','pelo','pelos',
    'por','pra','pro','sem','sob'
  ]) then return v_chave; end if;
  if p_apos_numero then
    v_r := pg_temp.pt_unidade(v_chave);
    if v_r is not null then return v_r; end if;
  end if;
  if v_chave = 'x' and p_apos_numero and p_antes_numero then return 'x'; end if;
  v_r := coalesce(pg_temp.pt_sigla(v_chave), pg_temp.pt_sem_vogal(v_chave));
  if v_r is not null then return v_r; end if;
  if length(p_nucleo) = 1 then return upper(p_nucleo); end if;
  return pg_temp.pt_composto(p_nucleo);
end $$;

create or replace function pg_temp.padronizar_texto(p_texto text) returns text
language plpgsql immutable as $$
declare
  v_texto text;
  v_tokens text[];
  v_pre text[] := '{}';
  v_nucleo text[] := '{}';
  v_suf text[] := '{}';
  v_saida text[] := '{}';
  v_n int;
  v_primeiro int;
  v_ultimo int;
  v_t text;
  v_p text;
  v_s text;
begin
  if p_texto is null then return null; end if;
  v_texto := btrim(regexp_replace(p_texto, '\s+', ' ', 'g'), ' ');
  if v_texto = '' then return ''; end if;
  v_tokens := string_to_array(v_texto, ' ');
  v_n := array_length(v_tokens, 1);
  for i in 1 .. v_n loop
    v_t := v_tokens[i];
    v_p := substring(v_t from '^[^[:alnum:]]*');
    if length(v_p) = length(v_t) then
      v_pre := v_pre || v_t;
      v_nucleo := v_nucleo || ''::text;
      v_suf := v_suf || ''::text;
    else
      v_s := substring(v_t from '[^[:alnum:]]*$');
      v_pre := v_pre || v_p;
      v_nucleo := v_nucleo || substr(v_t, length(v_p) + 1, length(v_t) - length(v_p) - length(v_s));
      v_suf := v_suf || v_s;
      if v_primeiro is null then v_primeiro := i; end if;
      v_ultimo := i;
    end if;
  end loop;
  for i in 1 .. v_n loop
    if v_nucleo[i] = '' then
      v_saida := v_saida || v_pre[i];
    else
      v_saida := v_saida || (v_pre[i] || pg_temp.pt_nucleo(
        v_nucleo[i],
        i <> v_primeiro and i <> v_ultimo,
        i > 1 and v_nucleo[i - 1] ~ '^[0-9]',
        i < v_n and v_nucleo[i + 1] ~ '^[0-9]',
        i > 1 and lower(v_nucleo[i - 1]) = any(array[
          'tipo','vitamina','classe','grupo','série','serie','bloco','plano','lote',
          'modelo','letra','nível','nivel','fase','turno','categoria'
        ]),
        i < v_n and v_nucleo[i + 1] ~ '^[[:alpha:]]'
      ) || v_suf[i]);
    end if;
  end loop;
  return array_to_string(v_saida, ' ');
end $$;

```

(O DO-block `$conferencia$` e os casos continuam como ficaram na Task 1.)

- [ ] **Step 3: Conferir no banco**

Rodar de novo o arquivo inteiro pelo MCP `execute_sql` (`project_id = wuzxpbixprrgssoeeaez`, `query` = conteúdo integral do arquivo).
Expected: sucesso, sem `PADRONIZACAO_DIVERGENTE` (o DO-block não devolve linhas).

- [ ] **Step 4: Teste do lado TS continua verde**

Run: `bunx vitest run src/lib/padronizarTexto.test.ts src/test/padronizacaoBackfill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/padronizacao-texto/padronizar_texto.sql
git diff --cached | grep -E 'eyJ|sb_secret_|password|api_key'   # deve sair vazio
git commit -m "feat(texto): espelho SQL da sigla sem vogal e da letra depois de designador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Verificação completa, PR e merge

**Files:** nenhum arquivo novo.

**Interfaces:**
- Consumes: commits das Tasks 1–2 na branch `feat/padronizacao-texto-grupo2` (que também tem a spec e este plano).
- Produces: PR mergeado na `main` → deploy da Vercel (projeto `moralles-food`).

- [ ] **Step 1: Suíte completa**

Run: `bun run test`, `bun run lint`, `bunx tsc --noEmit -p tsconfig.app.json`
Expected: tudo verde. Falha fora de `padronizarTexto` que também falha na `main` não é desta branch — confirmar com `git stash`/checkout da `main` antes de concluir.

- [ ] **Step 2: Commitar o plano e publicar a branch**

```bash
git add docs/superpowers/plans/2026-10-03-padronizacao-texto-grupo2-pr0-regra.md
git commit -m "docs(texto): plano do PR 0 do Grupo 2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/padronizacao-texto-grupo2
```

- [ ] **Step 3: Abrir o PR**

```bash
gh pr create --base main --head feat/padronizacao-texto-grupo2 \
  --title "feat(texto): padronização Grupo 2 — PR 0 (regra)" \
  --body "Regra da padronização de maiúsculas/minúsculas, nos dois lados (TS + espelho SQL):

- palavra de 2 a 4 letras sem vogal vira sigla (JBS, GM, CPFL), exceto unidades, Mr/Sr/Dr e Pç;
- siglas novas: NFS-e, NFSe, MDF-e, DIFAL, ST, DAE;
- romanos e tamanhos só como palavra solta (Bem-te-Vi);
- letra solta depois de designador fica maiúscula (Tipo A, Vitamina E), exceto 'e' + palavra.

Spec: docs/superpowers/specs/2026-10-03-padronizacao-texto-grupo2-design.md
Depois do deploy: reaplicar docs/padronizacao-texto/backfill_grupo1.sql (simulação → aprovação → aplicação).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4: Esperar o CI e mergear**

Run: `gh pr checks --watch`, depois `gh pr merge --merge --delete-branch=false`
Expected: checks verdes; merge feito. Se algum check falhar, parar e reportar — não mergear.

- [ ] **Step 5: Confirmar o deploy**

Pelo MCP da Vercel (`list_deployments` do projeto `moralles-food`), confirmar que o deploy de produção do commit de merge está `READY`.

---

### Task 4: Reaplicar o backfill do Grupo 1 em produção

**Files:** nenhum (usa `docs/padronizacao-texto/padronizar_texto.sql` e `docs/padronizacao-texto/backfill_grupo1.sql` sem alteração).

**Interfaces:**
- Consumes: `pg_temp.padronizar_texto` da Task 2; deploy `READY` da Task 3.
- Produces: dados do Grupo 1 na regra nova; contagem de linhas fora do padrão = 0.

Cada chamada do MCP `execute_sql` é uma sessão nova: o conteúdo de `padronizar_texto.sql` vai **na mesma chamada** do que usa as funções.

- [ ] **Step 1: Combinar o horário com o usuário**

Perguntar quando rodar: algumas horas depois do deploy (abas com o bundle antigo ainda gravam "Gm") e fora do horário de operação (reenvio de operação antiga pode ser recusado com `REQUEST_ID_REUTILIZADO`). Não seguir sem a resposta.

- [ ] **Step 2: Prévia (antes → depois)**

`query` = conteúdo de `padronizar_texto.sql` + :

```sql
with alvo as (
  select 'contas_pagar' campo, descricao antes from public.fin_contas_pagar
   where company_id is distinct from '00000000-0000-0000-0000-000000000001'
  union all select 'contas_receber', descricao from public.fin_contas_receber
   where company_id is distinct from '00000000-0000-0000-0000-000000000001'
  union all select 'lancamentos', t.descricao from public.fin_lancamentos t
   where t.company_id is distinct from '00000000-0000-0000-0000-000000000001'
     and t.origem in ('manual', 'espelho_cp', 'espelho_cr') and t.tipo <> 'TRANSFERENCIA'
     and not exists (select 1 from public.fin_audit_logs a
                      where a.acao = 'criar_baixado_extrato' and a.depois->>'lancamento_id' = t.id::text)
  union all select 'centros_custo', nome from public.fin_centros_custo
   where company_id is distinct from '00000000-0000-0000-0000-000000000001'
  union all select 'produtos', nome_produto from public.produtos
   where company_id is distinct from '00000000-0000-0000-0000-000000000001'
  union all select 'fichas.nome', nome from public.ficha_componentes
   where company_id is distinct from '00000000-0000-0000-0000-000000000001'
  union all select 'fichas.categoria', categoria from public.ficha_componentes
   where company_id is distinct from '00000000-0000-0000-0000-000000000001'
  union all select 'pedidos', title from public.purchase_orders
   where company_id is distinct from '00000000-0000-0000-0000-000000000001'
  union all select 'cotacoes', titulo from public.cotacoes
   where company_id is distinct from '00000000-0000-0000-0000-000000000001'
  union all select 'colaboradores.nome', nome from public.rh_colaboradores
   where company_id is distinct from '00000000-0000-0000-0000-000000000001'
  union all select 'colaboradores.cargo', cargo from public.rh_colaboradores
   where company_id is distinct from '00000000-0000-0000-0000-000000000001'
  union all select 'colaboradores.funcao', funcao from public.rh_colaboradores
   where company_id is distinct from '00000000-0000-0000-0000-000000000001'
),
muda as (select campo, antes, pg_temp.padronizar_texto(antes) depois from alvo
          where antes is distinct from pg_temp.padronizar_texto(antes))
select campo, count(*) linhas,
       (select string_agg(m2.antes || ' → ' || m2.depois, ' | ')
          from (select distinct antes, depois from muda m2 where m2.campo = m.campo limit 8) m2) amostra
  from muda m group by campo order by campo;
```

Expected: só linhas cuja mudança vem da regra nova (ex.: "… Gm" → "… GM", "Jbs" → "JBS"). Uma mudança inesperada (ex.: palavra comum virando MAIÚSCULA) → parar: a regra precisa de exceção nova (volta à Task 1/2 em PR novo).

- [ ] **Step 3: Simulação**

`query` = conteúdo de `padronizar_texto.sql` + conteúdo de `backfill_grupo1.sql`.
Expected: erro `SIMULACAO (nada gravado): contas_pagar=… contas_receber=… lancamentos=… …` com as mesmas contagens da prévia (colaboradores conta por linha, não por campo). Qualquer outro erro (ex.: trigger de pedido aprovado recusando `title`) → parar e reportar.

- [ ] **Step 4: Aprovação**

Mostrar ao usuário a prévia (Step 2) e as contagens da simulação (Step 3). Aplicar só com "sim" explícito.

- [ ] **Step 5: Aplicar**

`query` = `set padronizacao.aplicar = 'sim';` + conteúdo de `padronizar_texto.sql` + conteúdo de `backfill_grupo1.sql`.
Expected: sucesso com `NOTICE APLICADO: …` (contagens iguais às da simulação).

- [ ] **Step 6: Recontagem**

Repetir a query do Step 2.
Expected: zero linhas (nenhum campo fora do padrão). Se sobrar alguma, é escrita do bundle antigo depois da aplicação: rodar Steps 3–6 de novo mais tarde.

- [ ] **Step 7: Relatar**

Reportar ao usuário as contagens aplicadas e a recontagem = 0.
