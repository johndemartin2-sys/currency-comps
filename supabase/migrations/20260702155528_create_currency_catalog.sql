CREATE TABLE public.currency_catalog (
  catalog_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  catalog_system    text NOT NULL DEFAULT 'friedberg',
  catalog_prefix    text,
  catalog_number    text NOT NULL,
  catalog_suffix    text,
  catalog_label     text,
  -- Friedberg-specific (populated only for catalog_system='friedberg')
  fr_number         text,
  fr_key            text,
  -- shared descriptive fields (carried from friedberg_catalog)
  size_category     text,
  type              text,
  denomination      text,
  denomination_value numeric,
  series_year       text,
  signatures        text,
  seal              text,
  district          text,
  districts_letters text,
  city_location     text,
  bank              text,
  bank_signatures   text,
  type_variant      text,
  notes             text,
  source            text,
  status            text NOT NULL DEFAULT 'curated',
  imported_at       timestamptz DEFAULT now(),
  CONSTRAINT currency_catalog_system_chk
    CHECK (catalog_system IN ('friedberg','confederate_t','haxby','milton','newman','other'))
);

CREATE INDEX idx_currency_catalog_system_number
  ON public.currency_catalog (catalog_system, catalog_number);
CREATE INDEX idx_currency_catalog_label
  ON public.currency_catalog (catalog_label);
CREATE INDEX idx_currency_catalog_fr_number
  ON public.currency_catalog (fr_number) WHERE fr_number IS NOT NULL;

CREATE UNIQUE INDEX uq_currency_catalog_sys_num_variant
  ON public.currency_catalog (catalog_system, catalog_number, COALESCE(type_variant,''));