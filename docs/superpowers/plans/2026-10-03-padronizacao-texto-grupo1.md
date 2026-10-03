# Padronização de Maiúsculas/Minúsculas (Grupo 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nomes e descrições digitados no Grupo 1 são gravados no padrão "cada palavra com inicial maiúscula, conectivos em minúsculo, siglas e unidades no padrão", e o histórico já gravado é corrigido uma vez.

**Architecture:** Uma função pura `padronizarTexto` (cliente) aplicada no ponto em que cada tela envia o texto ao banco — nunca trigger: 8 RPCs comparam o texto exato no reenvio idempotente e recusariam reenvios legítimos se o banco reescrevesse o valor. A chave de idempotência continua derivada do que o usuário digitou; só o valor enviado sai padronizado. O histórico é corrigido por um script SQL que espelha a função em `pg_temp` (some ao fim da sessão), roda primeiro em simulação (DO-block que aborta e devolve as contagens) e só grava com `padronizacao.aplicar = 'sim'`.

**Tech Stack:** React 18 + TypeScript, Vitest, Supabase (PostgreSQL 17, locale ICU en-US.UTF-8), PL/pgSQL.

**Spec:** conversa de 2026-10-03 (decisões do usuário): padrão "A" (cada palavra maiúscula, conectivos minúsculos), lista fixa de siglas comuns (sem siglas de loja como GM/REN), atualizar o histórico uma vez; Grupo 1 = CP/CR descrição, lançamentos digitados do Livro Razão, centro de custo, nome do produto, ficha técnica (nome/categoria), título de pedido e de cotação, RH (nome/cargo/função). Grupo 2 (categorias/setores/locais de estoque, fornecedores, categorias financeiras, marcas, contas bancárias, empresas, usuários) fica para outro chat.

## Global Constraints

- Só muda caixa e espaços: `normalizeSearchText(padronizarTexto(x)) === normalizeSearchText(x).replace(/\s+/g, ' ')` — dedup da conciliação e buscas `*_unaccent` dependem disso.
- Idempotente: `padronizarTexto(padronizarTexto(x)) === padronizarTexto(x)`.
- Nunca padronizar: texto vindo do extrato bancário (`reconcile_import_lancamento`), transferências (`create_transfer`/`update_transfer`), observações, códigos, SKU, unidades de medida de cadastro, e-mail, CPF/CNPJ.
- Chave de idempotência derivada do conteúdo **digitado**; payload enviado com o texto padronizado (reenvio pendente de antes do deploy vira `REQUEST_ID_REUTILIZADO`, nunca duplicata).
- Comentários de negócio em português; commits `tipo(escopo): descrição`; branch + PR + merge (nunca push na main).
- Script SQL não cria objeto permanente (só `pg_temp`), exclui a empresa placeholder `00000000-0000-0000-0000-000000000001` e roda em um único DO-block (tudo ou nada).

## Review Focus

- Edição no Livro Razão de lançamento vindo do extrato (`origem='conciliacao'`, não conciliado): a descrição bancária não pode ser padronizada — teste/revisão em Task 2.
- Reenvio da criação (CP, CR, Livro Razão, produto, ficha, pedido, cotação): chave igual à de antes (conteúdo digitado) e payload padronizado — teste em Task 3 (pedido).
- Triggers de validação que rodam em todo UPDATE (`fin_validar_codigo_pagamento`, `validate_fin_lancamento`, `trg_block_placeholder_company`, travas de pedido aprovado) derrubando o backfill — a simulação em Task 4 roda os triggers de verdade antes de gravar.
- Divergência TS × SQL (acento, sigla, unidade) — casos compartilhados checados nos dois lados (Task 1 + Task 4).
- Texto vazio/só espaços/pontuação solta (`-`, `;`) — casos na Task 1.

---

### Task 1: Função `padronizarTexto` + casos compartilhados

**Files:**
- Create: `src/lib/padronizarTexto.ts`
- Create: `src/lib/padronizarTexto.test.ts`
- Create: `docs/padronizacao-texto/padronizar_texto.sql` (espelho SQL + casos; usado na Task 4)

**Interfaces:**
- Produces: `export function padronizarTexto(texto: string): string`

- [ ] **Step 1: Escrever o SQL com os casos (fonte única dos casos de conferência)**

`docs/padronizacao-texto/padronizar_texto.sql` — funções `pg_temp.*` + DO-block de conferência. Os pares entre `-- CASOS-INICIO` e `-- CASOS-FIM` são lidos pelo teste TS. Conteúdo exato:

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
    'PIX','NF','NFe','NF-e','NFCe','NFC-e','CT-e','CNPJ','CPF','RG','CNH','CEP',
    'LTDA','ME','EPP','EIRELI','MEI','S/A','TED','DOC','TEF','PDV',
    'INSS','FGTS','IPTU','IPVA','ICMS','ISS','ISSQN','PIS','COFINS','IRPJ','IRRF','CSLL',
    'DAS','DARF','GPS','GRU','GNRE','CLT','PJ','PF','RH','TI','VR','VA','VT','EPI','EPIs',
    'CMV','DRE','DFC','SIF','UHT','PVC','LED','USB','TV','E-mail',
    'SP','RJ','MG','RS','SC','PR','DF','BA','PE','MS','MT','ES','RN','PB',
    'PP','GG','XG','XGG','II','III','IV','VI','VII','VIII','IX','XI','XII'
  ]) s where lower(s) = p_chave limit 1
$$;

create or replace function pg_temp.pt_unidade(p_chave text) returns text
language sql immutable as $$
  select u from unnest(array[
    'kg','kgs','g','gr','grs','mg','ml','L','lt','lts','m','cm','mm',
    'un','und','unid','cx','pct','pc','pcs'
  ]) u where lower(u) = p_chave limit 1
$$;

create or replace function pg_temp.pt_segmento(p_seg text, p_sep_anterior text, p_seg_anterior text)
returns text language sql immutable as $$
  select case
    when p_seg = '' then p_seg
    when p_sep_anterior = '-' and lower(p_seg) = any(array[
      'me','te','se','lhe','lhes','lo','la','los','las','nos','vos','o','a','os','as'
    ]) then lower(p_seg)
    when p_sep_anterior in ('''', '’') and length(p_seg_anterior) <> 1 then lower(p_seg)
    else coalesce(pg_temp.pt_sigla(lower(p_seg)), pg_temp.pt_capitalizar(p_seg))
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

create or replace function pg_temp.pt_nucleo(p_nucleo text, p_meio boolean, p_apos_numero boolean, p_antes_numero boolean)
returns text language plpgsql immutable as $$
declare
  v_chave text := lower(p_nucleo);
  v_r text;
begin
  if p_nucleo ~ '[0-9]' then return pg_temp.pt_numero(p_nucleo); end if;
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
  v_r := pg_temp.pt_sigla(v_chave);
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
        i < v_n and v_nucleo[i + 1] ~ '^[0-9]'
      ) || v_suf[i]);
    end if;
  end loop;
  return array_to_string(v_saida, ' ');
end $$;

do $conferencia$
declare
  r record;
  v_obtido text;
  v_falhas text := '';
begin
  for r in select * from (values
-- CASOS-INICIO
    ('CONTA DE LUZ CEMIG', 'Conta de Luz Cemig'),
    ('conta de luz cemig', 'Conta de Luz Cemig'),
    ('nf 1234 peixaria silva ltda', 'NF 1234 Peixaria Silva LTDA'),
    ('MARIA DAS GRAÇAS DOS SANTOS', 'Maria das Graças dos Santos'),
    ('COCA COLA LATA 350ML', 'Coca Cola Lata 350ml'),
    ('CAIXA 20 X 30', 'Caixa 20 x 30'),
    ('AÇÚCAR CRISTAL 1KG', 'Açúcar Cristal 1kg'),
    ('Arroz Branco 5 KG', 'Arroz Branco 5 kg'),
    ('Pinho Gel 2l', 'Pinho Gel 2L'),
    ('GUARANÁ ZERO 1,5L', 'Guaraná Zero 1,5L'),
    ('Saco Virgem 15cm x 20 cm', 'Saco Virgem 15cm x 20 cm'),
    ('BOBINA PICOTADA 20X30', 'Bobina Picotada 20x30'),
    ('SACOLA 40X50CM', 'Sacola 40x50cm'),
    ('Espumante Bossa N°2', 'Espumante Bossa N°2'),
    ('Filme Pvc 800m', 'Filme PVC 800m'),
    ('Macarrão de Arroz Bifun 500Grs', 'Macarrão de Arroz Bifun 500grs'),
    ('Margarina 500 Gramas', 'Margarina 500 Gramas'),
    ('Coca Cola 1.5', 'Coca Cola 1.5'),
    ('Marmitex de Isopor G', 'Marmitex de Isopor G'),
    ('Misso Balde 10 k', 'Misso Balde 10 K'),
    ('DAS SIMPLES NACIONAL', 'DAS Simples Nacional'),
    ('TAXA DAS MAQUININHAS', 'Taxa das Maquininhas'),
    ('PAGAMENTO DAS', 'Pagamento DAS'),
    ('inss e fgts', 'INSS e FGTS'),
    ('folha de pagamento - dia 5', 'Folha de Pagamento - Dia 5'),
    ('(JOSE) lixo', '(Jose) Lixo'),
    ('  aluguel   loja  centro ', 'Aluguel Loja Centro'),
    ('vitamina c', 'Vitamina C'),
    ('conta a pagar', 'Conta a Pagar'),
    ('O BOTICÁRIO', 'O Boticário'),
    ('PAGUE-ME', 'Pague-me'),
    ('COCA-COLA', 'Coca-Cola'),
    ('COPO D''ÁGUA', 'Copo D''Água'),
    ('MCDONALD''S', 'Mcdonald''s'),
    ('E-MAIL MARKETING', 'E-mail Marketing'),
    ('NF-E 123', 'NF-e 123'),
    ('ENTRADA/SAIDA', 'Entrada/Saida'),
    ('XPTO S.A.', 'Xpto S.A.'),
    ('EMPRESA S/A', 'Empresa S/A'),
    ('FOLHA 1ª QUINZENA', 'Folha 1ª Quinzena'),
    ('PAGAMENTO REN', 'Pagamento Ren'),
    ('SANTANDER GM', 'Santander Gm'),
    ('epis cozinha', 'EPIs Cozinha'),
    ('de', 'De'),
    ('e', 'E'),
    ('-', '-'),
    ('', '')
-- CASOS-FIM
  ) c(entrada, esperado) loop
    v_obtido := pg_temp.padronizar_texto(r.entrada);
    if v_obtido is distinct from r.esperado then
      v_falhas := v_falhas || format(E'\n%L -> %L (esperado %L)', r.entrada, v_obtido, r.esperado);
    end if;
  end loop;
  if v_falhas <> '' then
    raise exception 'PADRONIZACAO_DIVERGENTE:%', v_falhas;
  end if;
end $conferencia$;
```

- [ ] **Step 2: Escrever o teste que falha**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeSearchText } from '@/lib/utils';
import { padronizarTexto } from './padronizarTexto';

function casosDoSql(): Array<[string, string]> {
  const sql = readFileSync(resolve(__dirname, '../../docs/padronizacao-texto/padronizar_texto.sql'), 'utf8');
  const bloco = sql.split('-- CASOS-INICIO')[1].split('-- CASOS-FIM')[0];
  return [...bloco.matchAll(/\('((?:[^']|'')*)',\s*'((?:[^']|'')*)'\)/g)]
    .map(m => [m[1].replace(/''/g, "'"), m[2].replace(/''/g, "'")]);
}

describe('padronizarTexto', () => {
  const casos = casosDoSql();
  it('lê os casos compartilhados com o SQL', () => { expect(casos.length).toBeGreaterThan(30); });
  it.each(casos)('%s', (entrada, esperado) => { expect(padronizarTexto(entrada)).toBe(esperado); });
  it.each(casos)('é idempotente: %s', entrada => {
    const uma = padronizarTexto(entrada);
    expect(padronizarTexto(uma)).toBe(uma);
  });
  it.each(casos)('só muda caixa e espaços: %s', entrada => {
    expect(normalizeSearchText(padronizarTexto(entrada))).toBe(normalizeSearchText(entrada).replace(/\s+/g, ' '));
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `bun run test src/lib/padronizarTexto.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 4: Implementar `src/lib/padronizarTexto.ts`** — espelho exato do SQL do Step 1 (mesmas listas, mesma ordem de regras):

```ts
/**
 * Padroniza maiúsculas/minúsculas de nomes e descrições digitados (pt-BR):
 * cada palavra com inicial maiúscula, conectivos (de, da, e…) em minúsculo no
 * meio do texto, siglas conhecidas no padrão (PIX, INSS, LTDA) e unidades logo
 * depois de número (1kg, 350 ml, 2L, 20x30).
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
  'PIX', 'NF', 'NFe', 'NF-e', 'NFCe', 'NFC-e', 'CT-e', 'CNPJ', 'CPF', 'RG', 'CNH', 'CEP',
  'LTDA', 'ME', 'EPP', 'EIRELI', 'MEI', 'S/A', 'TED', 'DOC', 'TEF', 'PDV',
  'INSS', 'FGTS', 'IPTU', 'IPVA', 'ICMS', 'ISS', 'ISSQN', 'PIS', 'COFINS', 'IRPJ', 'IRRF', 'CSLL',
  'DAS', 'DARF', 'GPS', 'GRU', 'GNRE', 'CLT', 'PJ', 'PF', 'RH', 'TI', 'VR', 'VA', 'VT', 'EPI', 'EPIs',
  'CMV', 'DRE', 'DFC', 'SIF', 'UHT', 'PVC', 'LED', 'USB', 'TV', 'E-mail',
  'SP', 'RJ', 'MG', 'RS', 'SC', 'PR', 'DF', 'BA', 'PE', 'MS', 'MT', 'ES', 'RN', 'PB',
  'PP', 'GG', 'XG', 'XGG', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII',
]);

// Só valem logo depois de um número ("5 KG" → "5 kg"); soltas são palavras.
const UNIDADES = porChave([
  'kg', 'kgs', 'g', 'gr', 'grs', 'mg', 'ml', 'L', 'lt', 'lts', 'm', 'cm', 'mm',
  'un', 'und', 'unid', 'cx', 'pct', 'pc', 'pcs',
]);

// Em minúsculo só no meio do texto: "DAS Simples" e "Pagamento DAS" são siglas.
const CONECTIVOS = new Set([
  'a', 'à', 'ao', 'aos', 'as', 'às', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelas', 'pelo', 'pelos',
  'por', 'pra', 'pro', 'sem', 'sob',
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

function formatarSegmento(segmento: string, separadorAnterior: string, segmentoAnterior: string): string {
  if (!segmento) return segmento;
  const chave = minusculo(segmento);
  if (separadorAnterior === '-' && ENCLITICOS.has(chave)) return chave;
  // "D'Água" mantém a maiúscula; "Mcdonald's" não.
  if ((separadorAnterior === "'" || separadorAnterior === '’') && [...segmentoAnterior].length !== 1) return chave;
  return SIGLAS.get(chave) ?? capitalizar(segmento);
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
}

function formatarNucleo(nucleo: string, { meio, aposNumero, antesNumero }: Posicao): string {
  if (/[0-9]/.test(nucleo)) return formatarComNumero(nucleo);
  const chave = minusculo(nucleo);
  if (meio && CONECTIVOS.has(chave)) return chave;
  if (aposNumero) {
    const unidade = UNIDADES.get(chave);
    if (unidade) return unidade;
  }
  if (chave === 'x' && aposNumero && antesNumero) return 'x';
  const sigla = SIGLAS.get(chave);
  if (sigla) return sigla;
  if ([...nucleo].length === 1) return maiusculo(nucleo);
  return formatarComposto(nucleo);
}

const comecaComNumero = (token?: Token) => !!token && /^[0-9]/.test(token.nucleo);

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
      }) + t.suf;
    })
    .join(' ');
}
```
- [ ] **Step 5: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 6: Commit** — `feat(texto): padronizarTexto para nomes e descrições`

### Task 2: Financeiro — CP, CR, Livro Razão, título do extrato, centro de custo

**Files:**
- Modify: `src/components/financeiro/ContasPagarSection.tsx` (save, ~l.492-516)
- Modify: `src/components/financeiro/ContasReceberSection.tsx` (save, ~l.372-391)
- Modify: `src/components/financeiro/LivroRazaoSection.tsx` (estado `editOrigem`; fluxo normal ~l.629-664; transferência intocada)
- Modify: `src/components/financeiro/CriarLancamentoExtratoDialog.tsx` (só a chamada `reconcile_create_titulo_from_extrato`, ~l.298)
- Modify: `src/components/financeiro/CentrosCustoFinSection.tsx` (save, ~l.91-101)
- Test: `src/test/financeiro-cadastros-unicidade.test.tsx` (centro de custo grava nome padronizado)

**Interfaces:** Consumes `padronizarTexto` (Task 1).

- [ ] **Step 1: Teste do centro de custo** — no teste existente, criar com `nome: 'CENTRO DE CUSTO COZINHA'` e esperar o insert com `nome: 'Centro de Custo Cozinha'`. Rodar → FAIL.
- [ ] **Step 2: Aplicar.** Padrão em toda criação com chave:

```ts
const payload = editingItem ? params : { ...params, p_idempotency_key: await chavesCriacao.chave(params) };
// A chave fica com o texto digitado; o banco recebe o padronizado.
const { data, error } = await (supabase.rpc as any)(rpc, { ...payload, p_descricao: padronizarTexto(params.p_descricao) });
```

Livro Razão: `const [editOrigem, setEditOrigem] = useState<string | null>(null)` (set em `openEdit`, null em `resetForm`); enviar `p_descricao: editId && editOrigem !== 'manual' ? form.descricao : padronizarTexto(form.descricao)` sem alterar `rpcParams` usado na chave/`confirmar`. Extrato: só `p_descricao: padronizarTexto(descricao)` em `reconcile_create_titulo_from_extrato` (o `reconcile_import_lancamento` continua com o texto do banco). Centro de custo: `p_nome: padronizarTexto(form.nome)` e insert `{ ...form, nome: padronizarTexto(form.nome) }`.
- [ ] **Step 3: Rodar** `bun run test src/test/financeiro-cadastros-unicidade.test.tsx src/components/FinanceiroView.test.tsx` → PASS.
- [ ] **Step 4: Commit** — `feat(financeiro): padroniza descrições de contas, lançamentos e centros de custo`

### Task 3: Estoque, Ficha Técnica, Compras, RH

**Files:**
- Modify: `src/hooks/useEstoqueGeralStore.ts` (`addProduto` l.652 e `updateProduto` l.690: `padronizarTexto(p.nomeProduto)`)
- Modify: `src/components/FichaTecnicaView.tsx` (`handleSave`: payload enviado com `nome`/`categoria` padronizados; `chaveCriacaoComponente` continua sobre `campos` digitados)
- Modify: `src/hooks/usePurchaseOrdersStore.ts` (create: chave sobre `payload`, envio `{ ...payload, title: padronizarTexto(payload.title) }`; edit: `title: padronizarTexto(updates.title || '')`)
- Modify: `src/hooks/useCotacoesStore.ts` (create: chave/`confirmar` sobre `args`, envio `p_titulo` padronizado; update: `p_titulo` padronizado)
- Modify: `src/components/RhView.tsx` (create/update: `nome`, `cargo`, `funcao` padronizados)
- Test: `src/hooks/usePurchaseOrdersStore.createOrder.test.ts`, `src/test/produto-form-codigos-barras.test.tsx` (se cobrir o payload)

- [ ] **Step 1: Teste do pedido** — `createOrder({ ...orderData, title: 'PEDIDO DE HORTIFRUTI' })` envia `p_payload.title === 'Pedido de Hortifruti'` e a mesma `p_idempotency_key` que o conteúdo digitado gera. Rodar → FAIL.
- [ ] **Step 2: Aplicar** nos 5 arquivos.
- [ ] **Step 3: Rodar** `bun run test src/hooks src/test/produto-form-codigos-barras.test.tsx` → PASS.
- [ ] **Step 4: Commit** — `feat(cadastros): padroniza nome de produto, ficha, pedido, cotação e colaborador`

### Task 4: Backfill do histórico (produção, após o merge)

**Files:**
- Create: `docs/padronizacao-texto/backfill_grupo1.sql`

- [ ] **Step 1: Script** — DO-block único: UPDATE só onde `col IS DISTINCT FROM pg_temp.padronizar_texto(col)` e `company_id IS DISTINCT FROM` placeholder em: `fin_contas_pagar.descricao`, `fin_contas_receber.descricao`, `fin_lancamentos.descricao` (`origem IN ('manual','espelho_cp','espelho_cr') AND tipo <> 'TRANSFERENCIA'`), `fin_centros_custo.nome`, `produtos.nome_produto`, `ficha_componentes.nome/categoria`, `purchase_orders.title`, `cotacoes.titulo`, `rh_colaboradores.nome/cargo/funcao`. Sem `padronizacao.aplicar = 'sim'` termina em `RAISE EXCEPTION 'SIMULACAO ...'` com as contagens (rollback).
- [ ] **Step 2: Simulação** — `padronizar_texto.sql` + `backfill_grupo1.sql` numa chamada; esperado: conferência OK e `SIMULACAO (nada gravado): cp=… …`. Conferir amostra antes→depois por tabela.
- [ ] **Step 3: Aplicar** — mesma chamada com `set padronizacao.aplicar = 'sim';` antes do DO.
- [ ] **Step 4: Verificar** — contagem de linhas ainda divergentes = 0 em cada tabela; texto antigo fica em `audit_logs` (triggers de auditoria).

### Task 5: Documentação, PR e prompt do Grupo 2

- [ ] CLAUDE.md + AGENTS.md: uma regra (padronização no cliente, nunca trigger; chave sobre o digitado).
- [ ] `bun run lint`, `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`, `bun run test`.
- [ ] Branch `feat/padronizacao-texto` → PR → merge → backfill (Task 4) → prompt do Grupo 2 ao usuário.
