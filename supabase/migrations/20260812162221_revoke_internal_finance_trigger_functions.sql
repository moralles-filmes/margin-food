-- Funções de trigger são internas e não devem aparecer como RPCs PostgREST.
REVOKE ALL ON FUNCTION public.fin_prepare_category_reporting_class() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_protect_system_category() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_fin_ensure_non_operational_categories() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_set_entity_report_exclusion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_fin_rateio_report_exclusion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_fin_category_propagate_reporting_class() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_fin_require_category_on_reconciliation() FROM PUBLIC;
