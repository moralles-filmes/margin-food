-- Grupo E — RPCs gateadas por CHAVE FANTASMA fora do Financeiro.
--
-- Mesmo bug de 20260912131731 / 20260914120000: RPCs SECURITY DEFINER gateiam por
-- string de permissão que nunca existiu em src/permissions/registry.ts
-- (ALL_PERMISSION_KEYS). Chave fantasma não aparece em Admin → Permissões, ninguém
-- consegue conceder, e o próprio Admin → Permissões grava DENY para toda chave default
-- do perfil que a matriz não mostra. Resultado: o gate do banco só é satisfeito por
-- acidente, via outra chave do array.
--
-- Confirmado em produção (2026-09-14) que o usuário 07849560… já está com DENY
-- explícito em estoque:geral:view, estoque:movimentacoes:manage, salmon:manipulacao:edit
-- e cmv:simulador:view — exatamente o padrão Royal Parma.
--
-- Duas das fantasmas nem sequer têm forma válida para o submódulo:
--   estoque:movimentacoes:* = view/create/edit/cancel/export  (não existe `manage`)
--   salmon:manipulacao:*    = view/create/delete              (não existe `edit`)
--
-- ATENÇÃO: public.permissions (tabela) NÃO serve como prova de que a chave é válida —
-- rpc_sync_permissions_from_registry() faz upsert e nunca apaga linha órfã, então
-- estoque:geral:view / estoque:movimentacoes:manage / salmon:manipulacao:edit /
-- cmv:simulador:view ainda estão lá como lixo histórico. A fonte de verdade é o
-- registry do frontend.
--
-- Mapeamento (todos os detentores ALLOW da fantasma já têm a chave de destino —
-- conferido em role_permissions + user_permissions):
--   get_stock_summary            'estoque:geral:view'          → dashboard:view + saldo:view + stock:read
--   list_movimentacoes_cursor    'estoque:geral:view'          → removida (redundante)
--   list_movimentacoes_cursor    'cmv:simulador:view'          → 'estoque:simulador:view'
--   stock_insert_movement_atomic 'estoque:movimentacoes:manage' → 'stock:movements:create'
--   upsert_salmon_leftover_atomic 'salmon:manipulacao:edit'    → 'salmon:write'
--   list_profiles_minimal        'rh:colaboradores:view'        → 'rh:prontuario:view'
--
-- Reescrita via pg_get_functiondef + regexp_replace sobre a definição VIVA: preserva
-- owner, grants, SET search_path, assert_tenant() e o corpo atual; aborta se o trecho
-- esperado não existir (drift).

DO $rpcs$
DECLARE
  r     record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- get_stock_summary lê produtos.saldo_atual (valor/contagem de estoque):
      -- é figura de Dashboard/Saldo, não de Movimentações. Sem a troca, o único gate
      -- granular restante seria estoque:movimentacoes:view.
      ('public.get_stock_summary()',
       '''estoque:geral:view''',
       '''estoque:dashboard:view'', ''estoque:saldo:view'', ''stock:read'''),

      -- Aqui a fantasma é puro ruído: o array já tem estoque:movimentacoes:view,
      -- stock:read e stock:movements:read. Remover (não trocar) mantém o gate idêntico.
      ('public.list_movimentacoes_cursor(text,uuid,text,text,date,date,boolean,timestamp with time zone,uuid,integer)',
       '''estoque:geral:view''\s*,\s*',
       ''),
      -- O Simulador mora no módulo `estoque` no registry, não em `cmv`.
      ('public.list_movimentacoes_cursor(text,uuid,text,text,date,date,boolean,timestamp with time zone,uuid,integer)',
       '''cmv:simulador:view''',
       '''estoque:simulador:view'''),

      -- INSERT de movimentação = ação `create`; já presente no array. A fantasma vira a
      -- chave legada equivalente, a mesma que a policy movimentacoes_insert usa.
      ('public.stock_insert_movement_atomic(uuid,numeric,text,text,text,text,text,text,text,jsonb)',
       '''estoque:movimentacoes:manage''',
       '''stock:movements:create'''),

      -- Upsert de sobra do dia é disparado por useSalmonStore.recordLeftover(), dentro
      -- do fluxo de Manipulação; salmon:manipulacao:create já cobre. A fantasma vira a
      -- legada salmon:write (que inclui salmon:manipulacao:create).
      ('public.upsert_salmon_leftover_atomic(date,numeric,text)',
       '''salmon:manipulacao:edit''',
       '''salmon:write'''),

      -- rh não tem submódulo `colaboradores`; o prontuário é o cadastro de pessoas.
      -- assert_tenant() e o JOIN em company_memberships ficam intactos (reescrita da
      -- definição viva, não recriação manual).
      ('public.list_profiles_minimal(text,integer)',
       '''rh:colaboradores:view''',
       '''rh:prontuario:view''')
    ) AS t(sig, pat, rep)
  LOOP
    v_def := pg_get_functiondef(r.sig::regprocedure);
    IF v_def !~ r.pat THEN
      RAISE EXCEPTION 'DRIFT: padrão % não encontrado em %', r.pat, r.sig;
    END IF;
    v_new := regexp_replace(v_def, r.pat, r.rep, 'g');
    EXECUTE v_new;
  END LOOP;
END;
$rpcs$;

-- Guarda final: nenhuma das 5 fantasmas pode restar em FUNÇÃO pública.
-- Escopo proposital em pg_proc: as policies produtos_select / movimentacoes_* ainda
-- carregam fantasmas redundantes (inócuas, cobertas por OR) e ficam para um cleanup
-- futuro; salmon_manipulations_update é a única policy realmente bloqueante e é
-- corrigida na migration seguinte (20260914145000).
DO $guard$
DECLARE
  v_sigs text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
  INTO v_sigs
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~ '''(estoque:geral:view|estoque:movimentacoes:manage|salmon:manipulacao:edit|rh:colaboradores:view|cmv:simulador:view)''';

  IF v_sigs IS NOT NULL THEN
    RAISE EXCEPTION 'Chave fantasma ainda presente em função pública: %', v_sigs;
  END IF;
END;
$guard$;
