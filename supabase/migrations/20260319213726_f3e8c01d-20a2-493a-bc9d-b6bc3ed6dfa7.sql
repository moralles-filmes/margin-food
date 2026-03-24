-- Drop older duplicate get_stock_consumption_history (with defaults on all params)
-- Keep newer version with required p_start_date/p_end_date
DROP FUNCTION IF EXISTS public.get_stock_consumption_history(date, date, uuid, text, text);