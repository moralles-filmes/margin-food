CREATE OR REPLACE FUNCTION public.list_profiles_minimal(
  p_search text DEFAULT '',
  p_limit int DEFAULT 50
)
RETURNS TABLE(id uuid, nome text, email text, avatar_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Any authenticated user with basic read needs can list minimal profiles
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  RETURN QUERY
    SELECT p.id, p.nome, p.email, p.avatar_url
    FROM profiles p
    WHERE (p_search = '' OR p.nome ILIKE '%' || p_search || '%' OR p.email ILIKE '%' || p_search || '%')
    ORDER BY p.nome
    LIMIT p_limit;
END;
$$;

-- ============ 3) MASKING: rh_beneficios.numero_cartao ============

-- Add last4 column
ALTER TABLE public.rh_beneficios ADD COLUMN IF NOT EXISTS numero_cartao_last4 text;

-- Backfill existing data
UPDATE public.rh_beneficios
  SET numero_cartao_last4 = RIGHT(numero_cartao, 4)
  WHERE numero_cartao IS NOT NULL AND numero_cartao != '';

-- Trigger to auto-populate last4 and mask audit