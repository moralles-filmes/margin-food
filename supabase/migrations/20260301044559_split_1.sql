CREATE OR REPLACE FUNCTION public._planning_upsert_meta_guarded(
  p_year int,
  p_month int,
  p_categoria text,
  p_target_value numeric,
  p_alerta_amarelo numeric DEFAULT 80,
  p_alerta_vermelho numeric DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT has_permission(v_uid, 'planning:meta-compras:edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar metas de compras';
  END IF;

  INSERT INTO planning_metas_compra (year, month, categoria, target_value, alerta_amarelo_percent, alerta_vermelho_percent, ativo, created_by)
  VALUES (p_year, p_month, p_categoria, p_target_value, p_alerta_amarelo, p_alerta_vermelho, true, v_uid)
  ON CONFLICT (year, month, categoria) DO UPDATE SET
    target_value = EXCLUDED.target_value,
    alerta_amarelo_percent = EXCLUDED.alerta_amarelo_percent,
    alerta_vermelho_percent = EXCLUDED.alerta_vermelho_percent,
    ativo = true,
    updated_at = now();

  v_result := jsonb_build_object('success', true);
  RETURN v_result;
END;
$$;

-- 3. Guarded delete (soft) meta