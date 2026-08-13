DROP INDEX IF EXISTS public.uq_currency_catalog_sys_num_variant;

CREATE UNIQUE INDEX uq_currency_catalog_sys_num_variant
  ON public.currency_catalog (catalog_system, catalog_number, COALESCE(type_variant,''), is_star);