-- Chave fantasma em salmon_manipulations_update, achada por cruzamento durante o Grupo E
-- (fora do escopo original de pg_proc, mas mesmo bug de chave fantasma).
--
-- salmon_manipulations_update gateia UPDATE por 'salmon:manipulacao:edit' — ação que
-- não existe para o submódulo (salmon:manipulacao só tem view/create/delete no
-- registry). Ninguém consegue conceder essa chave pela tela; hoje ela só é satisfeita
-- por system:global:manage.
--
-- Impacto vivo hoje é zero: não existe UPDATE direto de salmon_manipulations no
-- frontend (grep em src/ confirma). "Editar" uma manipulação
-- (useSalmonStore.updateManipulation) é implementado como cancelar + recriar via
-- _salmon_cancel_manipulation_guarded + _salmon_create_manipulation_guarded — ambas
-- SECURITY DEFINER com owner postgres (rolbypassrls=true), que já checam
-- salmon:manipulacao:delete / salmon:manipulacao:create corretamente e não passam por
-- esta RLS. Mesmo sem incidente, a policy fica estruturalmente inconcedível — mesma
-- classe de bug do restante desta correção — e é alinhada por consistência e por
-- segurança caso um caminho direto de UPDATE via PostgREST apareça no futuro.
--
-- Fix ADITIVO (não substituição): salmon:manipulacao:create entra porque é a ação
-- real que cobre "editar" no fluxo atual (cancelar+recriar usa create), e
-- salmon:manipulacao:edit é mantida no array — role_permissions ainda concede essa
-- chave para admin/diretor/gerente_geral, então removê-la não muda nada mas mantê-la
-- respeita a regra aditiva do restante desta correção.

ALTER POLICY "salmon_manipulations_update" ON public.salmon_manipulations
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['salmon:manipulacao:create', 'salmon:manipulacao:edit', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
  );
