-- Drop the older duplicate function (with defaults on p_start_date/p_end_date)
-- keeping the newer version that has required p_start_date/p_end_date
DROP FUNCTION IF EXISTS public.get_stock_top_consumed(date, date, text, text, integer);