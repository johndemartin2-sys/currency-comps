ALTER TABLE public.currency_catalog
  ADD COLUMN is_specimen boolean NOT NULL DEFAULT false;

CREATE INDEX idx_currency_catalog_is_specimen
  ON public.currency_catalog (is_specimen) WHERE is_specimen = true;

-- extend the unique index so a specimen and its issued counterpart can coexist
DROP INDEX IF EXISTS public.uq_currency_catalog_sys_num_variant;
CREATE UNIQUE INDEX uq_currency_catalog_sys_num_variant
  ON public.currency_catalog (catalog_system, catalog_number, COALESCE(type_variant,''), is_star, is_specimen);