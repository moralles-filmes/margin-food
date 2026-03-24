
-- Drop the OLD overload of list_purchase_orders_cursor with p_responsible uuid
-- This fixes PGRST203 ambiguity error
DROP FUNCTION IF EXISTS public.list_purchase_orders_cursor(
  integer, 
  timestamp with time zone, 
  uuid, 
  text, 
  text, 
  text, 
  text, 
  uuid
);
