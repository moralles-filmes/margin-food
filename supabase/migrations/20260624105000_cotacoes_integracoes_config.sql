-- ════════════════════════════════════════════════════════════════════════════
-- Cotação (RFQ) — Fase 5: configuração de integrações (Z-API + IA por empresa)
-- ════════════════════════════════════════════════════════════════════════════
-- Tabela cotacao_ia_config (1 linha/empresa, chave de IA por empresa) + RPCs
-- get/save MASCARADAS para Z-API e IA: o segredo (token/api_key) nunca volta
-- inteiro ao cliente (só os últimos 4 dígitos + flag has_*). O save preserva o
-- segredo quando o campo vem em branco (a UI nunca reenvia o segredo salvo).
-- Várias funções → aplicar via MCP apply_migration (db push v2.75 quebra
-- CREATE FUNCTION + statement seguinte — ver CLAUDE.md).
--
-- Permissão: gerencia quem tem compras:cotacao:manage OU
-- configuracoes:integracoes:manage OU system:global:manage.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela: cotacao_ia_config (chave de IA por empresa — usada na Fase 6)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cotacao_ia_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  provider    text NOT NULL DEFAULT 'gemini' CHECK (provider IN ('gemini','openai','anthropic')),
  api_key     text,
  model       text,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cotacao_ia_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_ia_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cotacao_ia_config_all ON public.cotacao_ia_config;
CREATE POLICY cotacao_ia_config_all ON public.cotacao_ia_config FOR ALL TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:manage','configuracoes:integracoes:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:manage','configuracoes:integracoes:manage','system:global:manage']));

DROP TRIGGER IF EXISTS trg_cotacao_ia_config_force_company ON public.cotacao_ia_config;
CREATE TRIGGER trg_cotacao_ia_config_force_company BEFORE INSERT OR UPDATE ON public.cotacao_ia_config
  FOR EACH ROW EXECUTE FUNCTION public.cotacao_force_company_id();
DROP TRIGGER IF EXISTS trg_cotacao_ia_config_updated_at ON public.cotacao_ia_config;
CREATE TRIGGER trg_cotacao_ia_config_updated_at BEFORE UPDATE ON public.cotacao_ia_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.cotacao_ia_config IS 'Cotação: chave de IA por empresa (Fase 6 — lida pela Edge Function via service-role).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper de permissão (inline nas RPCs): manage de cotação OU integrações OU global
-- ─────────────────────────────────────────────────────────────────────────────

-- get_cotacao_zapi_config — retorna config MASCARADA (sem token/client_token cru)
CREATE OR REPLACE FUNCTION public.get_cotacao_zapi_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_user    uuid;
  v_cfg     record;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT public.has_any_permission(v_user, ARRAY['compras:cotacao:manage','configuracoes:integracoes:manage','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: configuracoes:integracoes:manage';
  END IF;

  SELECT instance_id, token, client_token, base_url, default_phone, ativo
    INTO v_cfg
  FROM public.cotacao_zapi_config
  WHERE company_id = v_company;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('configured', false, 'base_url', 'https://api.z-api.io', 'ativo', true);
  END IF;

  RETURN jsonb_build_object(
    'configured', true,
    'instance_id', v_cfg.instance_id,
    'base_url', coalesce(v_cfg.base_url, 'https://api.z-api.io'),
    'default_phone', v_cfg.default_phone,
    'ativo', v_cfg.ativo,
    'has_token', v_cfg.token IS NOT NULL AND length(v_cfg.token) > 0,
    'token_last4', CASE WHEN v_cfg.token IS NOT NULL AND length(v_cfg.token) >= 4 THEN right(v_cfg.token, 4) ELSE NULL END,
    'has_client_token', v_cfg.client_token IS NOT NULL AND length(v_cfg.client_token) > 0,
    'client_token_last4', CASE WHEN v_cfg.client_token IS NOT NULL AND length(v_cfg.client_token) >= 4 THEN right(v_cfg.client_token, 4) ELSE NULL END
  );
END;
$$;

-- save_cotacao_zapi_config — upsert; token/client_token preservados se vierem em branco
CREATE OR REPLACE FUNCTION public.save_cotacao_zapi_config(
  p_instance_id   text DEFAULT NULL,
  p_token         text DEFAULT NULL,
  p_client_token  text DEFAULT NULL,
  p_base_url      text DEFAULT NULL,
  p_default_phone text DEFAULT NULL,
  p_ativo         boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_user    uuid;
  v_token       text;
  v_client_tok  text;
  v_existing    record;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT public.has_any_permission(v_user, ARRAY['compras:cotacao:manage','configuracoes:integracoes:manage','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: configuracoes:integracoes:manage';
  END IF;

  SELECT token, client_token INTO v_existing
  FROM public.cotacao_zapi_config WHERE company_id = v_company;

  -- preserva o segredo existente quando o campo vem vazio/nulo
  v_token      := CASE WHEN p_token IS NULL OR btrim(p_token) = '' THEN v_existing.token ELSE btrim(p_token) END;
  v_client_tok := CASE WHEN p_client_token IS NULL OR btrim(p_client_token) = '' THEN v_existing.client_token ELSE btrim(p_client_token) END;

  INSERT INTO public.cotacao_zapi_config (company_id, instance_id, token, client_token, base_url, default_phone, ativo)
  VALUES (
    v_company,
    NULLIF(btrim(coalesce(p_instance_id,'')), ''),
    v_token,
    v_client_tok,
    coalesce(NULLIF(btrim(coalesce(p_base_url,'')), ''), 'https://api.z-api.io'),
    NULLIF(btrim(coalesce(p_default_phone,'')), ''),
    coalesce(p_ativo, true)
  )
  ON CONFLICT (company_id) DO UPDATE SET
    instance_id   = EXCLUDED.instance_id,
    token         = EXCLUDED.token,
    client_token  = EXCLUDED.client_token,
    base_url      = EXCLUDED.base_url,
    default_phone = EXCLUDED.default_phone,
    ativo         = EXCLUDED.ativo;

  RETURN public.get_cotacao_zapi_config();
END;
$$;

-- get_cotacao_ia_config — retorna config MASCARADA (sem api_key cru)
CREATE OR REPLACE FUNCTION public.get_cotacao_ia_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_user    uuid;
  v_cfg     record;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT public.has_any_permission(v_user, ARRAY['compras:cotacao:manage','configuracoes:integracoes:manage','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: configuracoes:integracoes:manage';
  END IF;

  SELECT provider, api_key, model, ativo INTO v_cfg
  FROM public.cotacao_ia_config WHERE company_id = v_company;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('configured', false, 'provider', 'gemini', 'ativo', true);
  END IF;

  RETURN jsonb_build_object(
    'configured', true,
    'provider', v_cfg.provider,
    'model', v_cfg.model,
    'ativo', v_cfg.ativo,
    'has_api_key', v_cfg.api_key IS NOT NULL AND length(v_cfg.api_key) > 0,
    'api_key_last4', CASE WHEN v_cfg.api_key IS NOT NULL AND length(v_cfg.api_key) >= 4 THEN right(v_cfg.api_key, 4) ELSE NULL END
  );
END;
$$;

-- save_cotacao_ia_config — upsert; api_key preservada se vier em branco
CREATE OR REPLACE FUNCTION public.save_cotacao_ia_config(
  p_provider text DEFAULT 'gemini',
  p_api_key  text DEFAULT NULL,
  p_model    text DEFAULT NULL,
  p_ativo    boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_user    uuid;
  v_key     text;
  v_existing text;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT public.has_any_permission(v_user, ARRAY['compras:cotacao:manage','configuracoes:integracoes:manage','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: configuracoes:integracoes:manage';
  END IF;
  IF coalesce(p_provider,'gemini') NOT IN ('gemini','openai','anthropic') THEN
    RAISE EXCEPTION 'VALIDATION: provedor de IA inválido';
  END IF;

  SELECT api_key INTO v_existing FROM public.cotacao_ia_config WHERE company_id = v_company;
  v_key := CASE WHEN p_api_key IS NULL OR btrim(p_api_key) = '' THEN v_existing ELSE btrim(p_api_key) END;

  INSERT INTO public.cotacao_ia_config (company_id, provider, api_key, model, ativo)
  VALUES (
    v_company,
    coalesce(p_provider, 'gemini'),
    v_key,
    NULLIF(btrim(coalesce(p_model,'')), ''),
    coalesce(p_ativo, true)
  )
  ON CONFLICT (company_id) DO UPDATE SET
    provider = EXCLUDED.provider,
    api_key  = EXCLUDED.api_key,
    model    = EXCLUDED.model,
    ativo    = EXCLUDED.ativo;

  RETURN public.get_cotacao_ia_config();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cotacao_zapi_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_cotacao_zapi_config(text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cotacao_ia_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_cotacao_ia_config(text, text, text, boolean) TO authenticated;
