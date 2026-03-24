
-- Add new roles to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'diretor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gerente_geral';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gerente';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'colaborador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'financeiro';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'chefe_setor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'estoquista';

-- Add sector column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sector TEXT DEFAULT NULL;
