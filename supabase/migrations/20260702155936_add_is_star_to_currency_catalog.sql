ALTER TABLE public.currency_catalog
  ADD COLUMN is_star boolean NOT NULL DEFAULT false;

CREATE INDEX idx_currency_catalog_is_star
  ON public.currency_catalog (is_star) WHERE is_star = true;