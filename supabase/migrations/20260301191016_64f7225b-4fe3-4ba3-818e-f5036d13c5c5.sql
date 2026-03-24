
ALTER TABLE public.inventarios ADD COLUMN deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.inventario_itens ADD COLUMN deleted_at timestamptz DEFAULT NULL;

CREATE INDEX idx_inventarios_deleted_at ON public.inventarios (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventario_itens_deleted_at ON public.inventario_itens (deleted_at) WHERE deleted_at IS NULL;
