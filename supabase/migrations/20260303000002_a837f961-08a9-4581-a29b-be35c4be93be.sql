
-- Fix: Drop the old overloaded list_movimentacoes_cursor with wrong default p_direction='IN'
DROP FUNCTION IF EXISTS public.list_movimentacoes_cursor(
  integer, 
  timestamp with time zone, 
  uuid, 
  text, 
  uuid, 
  text, 
  text, 
  date, 
  date, 
  boolean
);
