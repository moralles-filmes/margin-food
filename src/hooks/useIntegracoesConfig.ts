import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Configs MASCARADAS retornadas pelas RPCs get_* (o segredo nunca volta inteiro).
export interface ZapiConfigMasked {
  configured: boolean;
  instance_id?: string | null;
  base_url: string;
  default_phone?: string | null;
  ativo: boolean;
  has_token?: boolean;
  token_last4?: string | null;
  has_client_token?: boolean;
  client_token_last4?: string | null;
}

export interface IaConfigMasked {
  configured: boolean;
  provider: string;
  model?: string | null;
  ativo: boolean;
  has_api_key?: boolean;
  api_key_last4?: string | null;
}

export interface ZapiSaveInput {
  instance_id?: string | null;
  token?: string | null;        // vazio = preserva o salvo
  client_token?: string | null; // vazio = preserva o salvo
  base_url?: string | null;
  default_phone?: string | null;
  ativo?: boolean;
}

export interface IaSaveInput {
  provider?: string;
  api_key?: string | null;      // vazio = preserva o salvo
  model?: string | null;
  ativo?: boolean;
}

// RPCs novas ainda não estão nos tipos gerados do Supabase.
const db = supabase as any;

/** Lê/grava as credenciais de integração (Z-API + IA) da empresa, sempre mascaradas. */
export function useIntegracoesConfig() {
  const { user } = useAuth();
  const [zapi, setZapi] = useState<ZapiConfigMasked | null>(null);
  const [ia, setIa] = useState<IaConfigMasked | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const [z, i] = await Promise.all([
        db.rpc('get_cotacao_zapi_config'),
        db.rpc('get_cotacao_ia_config'),
      ]);
      if (z.error) throw z.error;
      if (i.error) throw i.error;
      setZapi(z.data as ZapiConfigMasked);
      setIa(i.data as IaConfigMasked);
      setError(null);
    } catch (e: any) {
      console.error('[useIntegracoesConfig.reload]', e);
      setError(e?.message ?? 'Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  const saveZapi = useCallback(async (input: ZapiSaveInput) => {
    const { data, error: err } = await db.rpc('save_cotacao_zapi_config', {
      p_instance_id: input.instance_id ?? null,
      p_token: input.token ?? null,
      p_client_token: input.client_token ?? null,
      p_base_url: input.base_url ?? null,
      p_default_phone: input.default_phone ?? null,
      p_ativo: input.ativo ?? true,
    });
    if (err) throw err;
    setZapi(data as ZapiConfigMasked);
    return data as ZapiConfigMasked;
  }, []);

  const saveIa = useCallback(async (input: IaSaveInput) => {
    const { data, error: err } = await db.rpc('save_cotacao_ia_config', {
      p_provider: input.provider ?? 'gemini',
      p_api_key: input.api_key ?? null,
      p_model: input.model ?? null,
      p_ativo: input.ativo ?? true,
    });
    if (err) throw err;
    setIa(data as IaConfigMasked);
    return data as IaConfigMasked;
  }, []);

  return { zapi, ia, loading, error, reload, saveZapi, saveIa };
}
