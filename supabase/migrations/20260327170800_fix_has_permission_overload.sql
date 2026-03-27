
-- OVERLOAD: has_permission(text)
-- Permite chamadas com apenas um argumento, assumindo auth.uid() automaticamente.
-- Isso resolve o erro "function has_permission(unknown) does not exist" em procedures legadas.

CREATE OR REPLACE FUNCTION public.has_permission(_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_permission(auth.uid(), _permission);
$$;

-- Garantir que a versão original de 2 argumentos continue funcionando (já está, mas reforça-se o search_path)
ALTER FUNCTION public.has_permission(uuid, text) SET search_path = public;

-- Notificar o PostgREST para recarregar o esquema
NOTIFY pgrst, 'reload schema';
