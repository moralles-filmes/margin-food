
-- BLOCO 1: Drop legacy RPC get_planning_spend_summary
-- This function has NO company_id filtering (CRITICAL cross-tenant leak)
-- It has been fully replaced by _planning_spend_summary_guarded + _planning_spend_summary_inner
-- Confirmed: no frontend/backend callers exist
DROP FUNCTION IF EXISTS public.get_planning_spend_summary(integer, integer, text, text);
