-- Force PostgREST schema cache reload after function updates
NOTIFY pgrst, 'reload schema';