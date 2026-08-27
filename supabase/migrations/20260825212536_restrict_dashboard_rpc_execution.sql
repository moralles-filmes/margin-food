REVOKE EXECUTE ON FUNCTION public.get_fin_dashboard_summary(date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_fin_dashboard_charts(date, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_fin_dashboard_summary(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_fin_dashboard_charts(date, date) TO authenticated, service_role;
