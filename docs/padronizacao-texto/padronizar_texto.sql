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
