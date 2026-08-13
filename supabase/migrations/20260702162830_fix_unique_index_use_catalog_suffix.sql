-- Correct the identity key: catalog_suffix (not type_variant) distinguishes sub-varieties.
DROP INDEX IF EXISTS public.uq_currency_catalog_sys_num_variant;
CREATE UNIQUE INDEX uq_currency_catalog_sys_num_suffix
  ON public.currency_catalog
  (catalog_system, catalog_number, COALESCE(catalog_suffix,''), is_star, is_specimen);