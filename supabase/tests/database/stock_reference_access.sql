\set ON_ERROR_STOP on
-- Teste de integração em PostgreSQL real, com schema/RLS do projeto e rollback.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT LIKE 'moralles_lookup_test_%'
    OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
 THEN RAISE EXCEPTION 'LOCAL_FIXTURES_ONLY'; END IF;
END $$;
CREATE TEMP TABLE results(label text);
GRANT INSERT, SELECT ON results TO authenticated;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST FAILED: %',label; END IF;
 INSERT INTO results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN insufficient_privilege THEN INSERT INTO results VALUES(label); RETURN;
 END;
 RAISE EXCEPTION 'TEST FAILED (expected 42501): %',label;
END $$;
-- Somente fixtures locais: evita onboarding automático; operações testadas usam triggers normais.
SET LOCAL session_replication_role = replica;
INSERT INTO companies(id,nome) VALUES
 ('b9000000-0000-4000-8000-000000000001','Lookup A'),
 ('b9000000-0000-4000-8000-000000000002','Lookup B');
INSERT INTO auth.users(id,email) VALUES ('a9000000-0000-4000-8000-000000000001','lookup@example.test');
INSERT INTO profiles(id,nome,email,company_id) VALUES
 ('a9000000-0000-4000-8000-000000000001','Lookup','lookup@example.test','b9000000-0000-4000-8000-000000000001');
INSERT INTO company_memberships(user_id,company_id) VALUES
 ('a9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001');
SET LOCAL session_replication_role = origin;
INSERT INTO permissions(key,module) SELECT k,split_part(k,':',1)
 FROM unnest(ARRAY['estoque:dashboard:view','estoque:ranking:view','estoque:perdas:view','estoque:transferencias:view','estoque:preditivo:view','estoque:saldo:view','estoque:movimentacoes:view','estoque:simulador:view','estoque:requisicoes:view','estoque:catalogo:view','estoque:catalogo:create','estoque:catalogo:edit','estoque:movimentacoes:create','inventario:rapido:view','inventario:rapido:create','compras:pedidos:view','compras:pedidos:create','compras:pedidos:edit','estoque:transferencias:create','estoque:movimentacoes:edit','estoque:requisicoes:create','estoque:requisicoes:approve','estoque:requisicoes:close','estoque:requisicoes:manage','cmv:categoria:view','cmv:setor:view','cmv:top-itens:view','cmv:semanal:view','inventario:lista:view','inventario:criar:create','inventario:detalhe:view','inventario:detalhe:edit','inventario:detalhe:close','estoque:cadastros:view','estoque:cadastros:create','estoque:cadastros:edit','estoque:cadastros:delete','estoque:cadastros:manage','configuracoes:usuarios:view','configuracoes:usuarios:create','configuracoes:usuarios:edit','configuracoes:usuarios:delete','configuracoes:usuarios:manage']) k ON CONFLICT DO NOTHING;
-- Sem qualquer papel default, com DENY explícito nas permissões legadas e globais.
INSERT INTO permissions(key,module)
 SELECT k,split_part(k,':',1)
 FROM unnest(ARRAY['stock:read','stock:write','stock:edit','stock:delete','settings:manage','users:manage','system:global:manage']) k
 ON CONFLICT DO NOTHING;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect)
 SELECT 'a9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001',k,'DENY'
 FROM unnest(ARRAY['stock:read','stock:write','stock:edit','stock:delete','settings:manage','users:manage','system:global:manage']) k;
INSERT INTO public.stock_categories(company_id,name,is_active) VALUES
 ('b9000000-0000-4000-8000-000000000001','Active',true),
 ('b9000000-0000-4000-8000-000000000001','Inactive',false),
 ('b9000000-0000-4000-8000-000000000002','Foreign',true);
INSERT INTO public.stock_locations(company_id,name,is_active) VALUES
 ('b9000000-0000-4000-8000-000000000001','Active',true),
 ('b9000000-0000-4000-8000-000000000001','Inactive',false),
 ('b9000000-0000-4000-8000-000000000002','Foreign',true);
INSERT INTO public.stock_sectors(company_id,name,is_active) VALUES
 ('b9000000-0000-4000-8000-000000000001','Active',true),
 ('b9000000-0000-4000-8000-000000000001','Inactive',false),
 ('b9000000-0000-4000-8000-000000000002','Foreign',true);
INSERT INTO public.job_roles(company_id,nome,is_active) VALUES
 ('b9000000-0000-4000-8000-000000000001','Active',true),
 ('b9000000-0000-4000-8000-000000000001','Inactive',false),
 ('b9000000-0000-4000-8000-000000000002','Foreign',true);
INSERT INTO public.turnos(company_id,nome,ativo,hora_inicio,hora_fim) VALUES
 ('b9000000-0000-4000-8000-000000000001','Active',true,'08:00','16:00'),
 ('b9000000-0000-4000-8000-000000000001','Inactive',false,'08:00','16:00'),
 ('b9000000-0000-4000-8000-000000000002','Foreign',true,'08:00','16:00');
CREATE TEMP TABLE cases(table_name text, permission_key text, full_read boolean, write_action text);
INSERT INTO cases VALUES
 ('stock_categories','estoque:dashboard:view',false,'none'),
 ('stock_categories','estoque:ranking:view',false,'none'),
 ('stock_categories','estoque:perdas:view',false,'none'),
 ('stock_categories','estoque:transferencias:view',false,'none'),
 ('stock_categories','estoque:preditivo:view',false,'none'),
 ('stock_categories','estoque:saldo:view',false,'none'),
 ('stock_categories','estoque:movimentacoes:view',false,'none'),
 ('stock_categories','estoque:simulador:view',false,'none'),
 ('stock_categories','estoque:requisicoes:view',false,'none'),
 ('stock_categories','estoque:catalogo:view',false,'none'),
 ('stock_categories','estoque:catalogo:create',false,'none'),
 ('stock_categories','estoque:catalogo:edit',false,'none'),
 ('stock_categories','estoque:movimentacoes:create',false,'none'),
 ('stock_categories','inventario:rapido:view',false,'none'),
 ('stock_categories','inventario:rapido:create',false,'none'),
 ('stock_categories','compras:pedidos:view',false,'none'),
 ('stock_categories','compras:pedidos:create',false,'none'),
 ('stock_categories','compras:pedidos:edit',false,'none'),
 ('stock_locations','estoque:catalogo:view',false,'none'),
 ('stock_locations','estoque:catalogo:create',false,'none'),
 ('stock_locations','estoque:catalogo:edit',false,'none'),
 ('stock_locations','estoque:transferencias:view',false,'none'),
 ('stock_locations','estoque:transferencias:create',false,'none'),
 ('stock_sectors','estoque:movimentacoes:view',false,'none'),
 ('stock_sectors','estoque:movimentacoes:create',false,'none'),
 ('stock_sectors','estoque:movimentacoes:edit',false,'none'),
 ('stock_sectors','estoque:requisicoes:view',false,'none'),
 ('stock_sectors','estoque:requisicoes:create',false,'none'),
 ('stock_sectors','estoque:requisicoes:approve',false,'none'),
 ('stock_sectors','estoque:requisicoes:close',false,'none'),
 ('stock_sectors','estoque:requisicoes:manage',false,'none'),
 ('stock_sectors','cmv:categoria:view',false,'none'),
 ('stock_sectors','cmv:setor:view',false,'none'),
 ('stock_sectors','cmv:top-itens:view',false,'none'),
 ('stock_sectors','cmv:semanal:view',false,'none'),
 ('turnos','inventario:lista:view',false,'none'),
 ('turnos','inventario:criar:create',false,'none'),
 ('turnos','inventario:detalhe:view',false,'none'),
 ('turnos','inventario:detalhe:edit',false,'none'),
 ('turnos','inventario:detalhe:close',false,'none'),
 ('stock_categories','estoque:cadastros:view',true,'view'),
 ('stock_categories','estoque:cadastros:create',true,'create'),
 ('stock_categories','estoque:cadastros:edit',true,'edit'),
 ('stock_categories','estoque:cadastros:delete',true,'delete'),
 ('stock_categories','estoque:cadastros:manage',true,'manage'),
 ('stock_categories','',false,'none'),
 ('stock_locations','estoque:cadastros:view',true,'view'),
 ('stock_locations','estoque:cadastros:create',true,'create'),
 ('stock_locations','estoque:cadastros:edit',true,'edit'),
 ('stock_locations','estoque:cadastros:delete',true,'delete'),
 ('stock_locations','estoque:cadastros:manage',true,'manage'),
 ('stock_locations','',false,'none'),
 ('stock_sectors','estoque:cadastros:view',true,'view'),
 ('stock_sectors','estoque:cadastros:create',true,'create'),
 ('stock_sectors','estoque:cadastros:edit',true,'edit'),
 ('stock_sectors','estoque:cadastros:delete',true,'delete'),
 ('stock_sectors','estoque:cadastros:manage',true,'manage'),
 ('stock_sectors','',false,'none'),
 ('job_roles','configuracoes:usuarios:view',true,'none'),
 ('job_roles','configuracoes:usuarios:create',true,'none'),
 ('job_roles','configuracoes:usuarios:edit',true,'none'),
 ('job_roles','configuracoes:usuarios:delete',true,'none'),
 ('job_roles','configuracoes:usuarios:manage',true,'none'),
 ('turnos','',false,'none'),
 ('job_roles','',false,'none');
DO $test$
DECLARE c record; amount integer; affected integer; expected integer; name_column text; active_column text;
 label text; insert_sql text;
BEGIN
 FOR c IN SELECT * FROM cases LOOP
  DELETE FROM user_permissions WHERE effect='ALLOW' AND user_id='a9000000-0000-4000-8000-000000000001';
  IF c.permission_key <> '' THEN
   INSERT INTO user_permissions(user_id,company_id,permission_key,effect) VALUES
    ('a9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001',c.permission_key,'ALLOW');
  END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"a9000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{"x-company-id":"b9000000-0000-4000-8000-000000000001"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  label:=c.table_name||' / '||coalesce(nullif(c.permission_key,''),'no permission');
  name_column:=CASE WHEN c.table_name LIKE 'stock_%' THEN 'name' ELSE 'nome' END;
  active_column:=CASE WHEN c.table_name='turnos' THEN 'ativo' ELSE 'is_active' END;
  expected:=CASE WHEN c.permission_key='' THEN 0 WHEN c.full_read THEN 2 ELSE 1 END;
  EXECUTE format('SELECT count(*) FROM public.%I',c.table_name) INTO amount;
  PERFORM pg_temp.ok(amount=expected,label||' visible rows='||expected);
  EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id<>%L::uuid',c.table_name,'b9000000-0000-4000-8000-000000000001') INTO amount;
  PERFORM pg_temp.ok(amount=0,label||' foreign tenant invisible');
  EXECUTE format('UPDATE public.%I SET %I=%I WHERE %I=%L',c.table_name,name_column,name_column,name_column,'Active');
  GET DIAGNOSTICS affected=ROW_COUNT;
  PERFORM pg_temp.ok(affected=CASE WHEN c.write_action IN ('edit','manage') THEN 1 ELSE 0 END,label||' update gate');
  EXECUTE format('DELETE FROM public.%I WHERE %I=%L',c.table_name,name_column,'Inactive');
  GET DIAGNOSTICS affected=ROW_COUNT;
  PERFORM pg_temp.ok(affected=CASE WHEN c.write_action IN ('delete','manage') THEN 1 ELSE 0 END,label||' delete gate');
  insert_sql:=format('INSERT INTO public.%I(company_id,%I%s) VALUES(%L::uuid,%L%s) RETURNING 1',
   c.table_name,name_column,CASE WHEN c.table_name='turnos' THEN ',hora_inicio,hora_fim' ELSE '' END,
   'b9000000-0000-4000-8000-000000000001','New',CASE WHEN c.table_name='turnos' THEN ',''08:00'',''16:00''' ELSE '' END);
  IF c.write_action IN ('create','manage') THEN
   EXECUTE insert_sql INTO amount;
   PERFORM pg_temp.ok(amount=1,label||' insert returning');
  ELSE PERFORM pg_temp.denied(insert_sql,label||' insert forbidden'); END IF;
  PERFORM pg_temp.denied(replace(insert_sql,'b9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000002'),label||' foreign insert forbidden');
  EXECUTE format('UPDATE public.%I SET %I=%I WHERE company_id=%L::uuid',c.table_name,name_column,name_column,'b9000000-0000-4000-8000-000000000002');
  GET DIAGNOSTICS affected=ROW_COUNT;
  PERFORM pg_temp.ok(affected=0,label||' foreign update blocked');
  IF c.write_action IN ('edit','manage') THEN
   PERFORM pg_temp.denied(format('UPDATE public.%I SET company_id=%L::uuid WHERE %I=%L',c.table_name,'b9000000-0000-4000-8000-000000000002',name_column,'Active'),label||' tenant reassignment forbidden');
  END IF;
  -- Escopo forjado sem membership precisa recusar ou retornar zero, nunca vazar.
  PERFORM set_config('request.headers','{"x-company-id":"b9000000-0000-4000-8000-000000000002"}',true);
  BEGIN
   EXECUTE format('SELECT count(*) FROM public.%I',c.table_name) INTO amount;
   PERFORM pg_temp.ok(amount=0,label||' forged header invisible');
  EXCEPTION WHEN insufficient_privilege THEN
   INSERT INTO results VALUES(label||' forged header rejected');
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.headers','{"x-company-id":"b9000000-0000-4000-8000-000000000001"}',true);
  -- Restaura apenas as fixtures modificadas para o próximo caso.
  EXECUTE format('DELETE FROM public.%I WHERE %I=%L',c.table_name,name_column,'New');
  IF c.write_action IN ('delete','manage') THEN
   EXECUTE format('INSERT INTO public.%I(company_id,%I,%I) VALUES(%L::uuid,%L,false)',c.table_name,name_column,active_column,'b9000000-0000-4000-8000-000000000001','Inactive');
  END IF;
 END LOOP;
END $test$;
SELECT count(*) AS assertions_passed FROM results;
ROLLBACK;
