-- 1) Canonical base-number column (digits only). Generated -> auto-computes for all rows.
ALTER TABLE public.lots_currency
  ADD COLUMN friedberg_base text
  GENERATED ALWAYS AS (
    NULLIF(regexp_replace(COALESCE(friedberg_number, ''), '[^0-9]', '', 'g'), '')
  ) STORED;

-- 2) Index for fast "Show all variants" lookups
CREATE INDEX IF NOT EXISTS lots_currency_friedberg_base_idx
  ON public.lots_currency (friedberg_base);

-- 3) Expose friedberg_base through the view the app reads (appended at end)
CREATE OR REPLACE VIEW public.lots_currency_resolved AS
 WITH cat AS (
         SELECT DISTINCT ON (fc.fr_number) fc.fr_number,
            fc.fr_key,
            fc.series_year,
            fc.denomination,
            fc.type,
            fc.districts_letters,
            fc.row_id
           FROM friedberg_catalog fc
          ORDER BY fc.fr_number, (fc.series_year ~ '^(18|19|20)[0-9][0-9]$'::text) DESC, (fc.type IS NOT NULL) DESC, (fc.districts_letters IS NOT NULL) DESC, fc.row_id
        )
 SELECT lc.id,
    lc.source,
    lc.source_lot_id,
    lc.lot_url,
    lc.title,
    lc.sold_on,
    lc.sold_year,
    lc.price_realized,
    lc.price_kind,
    lc.price_estimate_low,
    lc.price_estimate_high,
    lc.currency_code,
    lc.type_class,
    lc.series_date,
    lc.series_type,
    lc.denomination,
    lc.denomination_raw,
    lc.friedberg_number,
    lc.friedberg_number_normalized,
    lc.grading_company,
    lc.grade_raw,
    lc.grade_numeric,
    lc.ppq_epq,
    lc.serial_number,
    lc.signatures,
    lc.is_star_note,
    lc.auction_event_id,
    lc.auction_event_name,
    lc.thumbnail_url,
    lc.raw,
    lc.scraped_at,
    lc.updated_at,
    lc.state_code,
    lc.charter_number,
    lc.data_quality,
    lc.series_year,
    lc.series_letter,
    lc.classified_by,
    lc.catalog_number,
    lc.catalog_system,
    lc.catalog_source,
        CASE
            WHEN lc.charter_number IS NOT NULL AND lc.charter_number <> ''::text AND (lc.friedberg_number IS NULL OR lc.friedberg_number = ''::text) THEN NULLIF(lc.friedberg_number, ''::text)
            ELSE COALESCE(NULLIF(lc.friedberg_number, ''::text), cat.fr_number, lc.catalog_number)
        END AS display_fr,
        CASE
            WHEN lc.charter_number IS NOT NULL AND lc.charter_number <> ''::text AND (lc.friedberg_number IS NULL OR lc.friedberg_number = ''::text) THEN lc.series_year::text
            ELSE COALESCE(NULLIF(cat.series_year, ''::text), lc.series_year::text)
        END AS display_year,
        CASE
            WHEN lc.charter_number IS NOT NULL AND lc.charter_number <> ''::text AND (lc.friedberg_number IS NULL OR lc.friedberg_number = ''::text) THEN lc.denomination
            ELSE COALESCE(cat.denomination, lc.denomination)
        END AS display_denom,
        CASE
            WHEN lc.charter_number IS NOT NULL AND lc.charter_number <> ''::text AND (lc.friedberg_number IS NULL OR lc.friedberg_number = ''::text) THEN lc.series_type
            ELSE COALESCE(cat.type, lc.series_type)
        END AS display_type,
        CASE
            WHEN lc.charter_number IS NOT NULL AND lc.charter_number <> ''::text AND (lc.friedberg_number IS NULL OR lc.friedberg_number = ''::text) THEN NULL::text
            ELSE cat.districts_letters
        END AS display_district,
    lc.friedberg_base
   FROM lots_currency lc
     LEFT JOIN cat ON cat.fr_number = COALESCE(NULLIF(lc.catalog_number, ''::text), NULLIF(lc.friedberg_number, ''::text));