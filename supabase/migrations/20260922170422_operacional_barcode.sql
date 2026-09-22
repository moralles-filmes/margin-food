-- ─────────────────────────────────────────────────────────────────────────────
-- Movimentação Operacional — Fase 4: código de barras
--
-- Não existia NENHUM campo de código de barras no schema (nem barcode, nem EAN,
-- nem GTIN) — só `produtos.sku`, que é código interno gerado (`MP-0050`) e não
-- serve para leitura óptica. O campo nasce aqui.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.produtos add column if not exists barcode text;

comment on column public.produtos.barcode is
  'Código de barras (EAN/GTIN/interno). TEXT, nunca numérico: zero à esquerda é significativo e GTIN-14 estoura a precisão de integer.';

-- Unicidade POR EMPRESA, não global: o mesmo EAN pode existir no catálogo de
-- duas unidades diferentes, e um índice global impediria a segunda de cadastrar.
-- Parcial, para não colidir entre os milhares de produtos sem código.
create unique index if not exists uq_produtos_barcode_empresa
  on public.produtos (company_id, barcode)
  where barcode is not null and barcode <> '';

-- Espaço e separador que o leitor às vezes injeta não podem criar um segundo
-- cadastro do mesmo código nem furar a unicidade.
alter table public.produtos drop constraint if exists produtos_barcode_formato;
alter table public.produtos add constraint produtos_barcode_formato
  check (barcode is null or barcode ~ '^[0-9A-Za-z._-]{4,64}$');
