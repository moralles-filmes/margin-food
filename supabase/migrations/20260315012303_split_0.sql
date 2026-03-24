CREATE OR REPLACE FUNCTION public.strip_html(p_text text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(p_text, ''), '<[^>]*>', '', 'g');
$$;

-- RPC: guarded create conta a pagar (atomic insert + rateios + audit)