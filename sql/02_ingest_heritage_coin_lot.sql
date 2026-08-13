-- ============================================================================
-- 02_ingest_heritage_coin_lot.sql
--
-- REGENERATED 2026-08-13 from the live database. The previous contents of this
-- file were STALE and dangerous to re-run.
--
-- What happened:
--   Migration 20260812200657 rewrote this function in place using a
--   `do $do$ ... replace(v_def, ...) ... $do$` block, changing the return
--   value from 'ok:' to 'ins:'/'upd:' so the coin harvester could tell an
--   insert from an update and stop paging correctly.
--
--   Because that migration performed a text substitution rather than shipping
--   the new body, the current definition was never written to any file. This
--   file was the old 'ok:' version; re-running it would have silently reverted
--   the harvester's whole-page stop logic.
--
-- Source of truth: pg_get_functiondef() against project wqizwluccqqfkedpgvve.
-- Verified byte-for-byte by md5 against the live catalog.
--
-- NOTE: statements unrelated to this function that previously lived here
-- (lots_coins column and index changes) are captured in the schema snapshot
-- produced by export_schema.sql. This file now does exactly what its name says.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ingest_heritage_coin_lot(p_source_lot_id text, p_lot_url text, p_title text, p_sold_on date, p_price_realized numeric, p_category text, p_denomination text, p_denomination_raw text, p_grading_company text, p_grade_raw text, p_grade_numeric integer, p_has_cac boolean, p_has_plus boolean, p_pcgs_number text, p_designation text, p_variety text, p_die_state text, p_rarity text, p_auction_event_id text, p_raw jsonb, p_series_year integer DEFAULT NULL::integer, p_thumbnail_url text DEFAULT NULL::text, p_color text DEFAULT NULL::text, p_strike_designation text DEFAULT NULL::text, p_surface_designation text DEFAULT NULL::text, p_strike_type text DEFAULT NULL::text, p_ha_category text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_now timestamptz := now();
v_denom text := NULLIF(p_denomination,'');
v_color text := NULLIF(upper(btrim(p_color)),'');
v_strike text := NULLIF(upper(btrim(p_strike_designation)),'');
v_surface text := NULLIF(upper(btrim(p_surface_designation)),'');
v_legacy text := NULLIF(upper(btrim(p_designation)),'');
v_variety text := NULLIF(btrim(p_variety),'');
v_stype text := NULLIF(upper(btrim(p_strike_type)),'');
v_inserted boolean;
BEGIN
IF p_source_lot_id IS NULL OR p_source_lot_id = '' THEN RAISE EXCEPTION 'reject: source_lot_id missing'; END IF;
IF p_sold_on IS NULL THEN RAISE EXCEPTION 'reject: sold_on missing'; END IF;
IF p_price_realized IS NULL THEN RAISE EXCEPTION 'reject: price_realized missing'; END IF;
IF p_category IS NULL OR p_category = '' THEN RAISE EXCEPTION 'reject: category missing'; END IF;
IF p_grade_raw IS NULL OR p_grade_raw = '' THEN RAISE EXCEPTION 'reject: grade descriptor missing'; END IF;
IF p_grade_numeric IS NOT NULL AND (p_grade_numeric < 1 OR p_grade_numeric > 70) THEN RAISE EXCEPTION 'reject: grade_numeric out of range'; END IF;

-- Normalize incoming strike_type synonyms.
IF v_stype IN ('PR','PF','PROOF') THEN v_stype := 'PROOF';
ELSIF v_stype IN ('SP','SMS','SPECIMEN') THEN v_stype := 'SPECIMEN';
ELSIF v_stype IN ('MS','BIZ','BUSINESS','CIRCULATION') THEN v_stype := 'BUSINESS';
END IF;

-- Rescue strike TYPE values that arrive in the strike DESIGNATION slot (pre-v1.4.4 harvesters).
IF v_strike IN ('PR','PF','PROOF') THEN
v_stype := COALESCE(v_stype,'PROOF'); v_strike := NULL;
ELSIF v_strike IN ('SP','SPECIMEN') THEN
v_stype := COALESCE(v_stype,'SPECIMEN'); v_strike := NULL;
END IF;

-- Heritage designation short codes -> canonical vocabulary. 'ND' means no designation.
IF v_surface IN ('CA','CAMEO') THEN v_surface := 'CAM';
ELSIF v_surface IN ('DC','DCA','DCAMEO') THEN v_surface := 'DCAM';
ELSIF v_surface IN ('DM','DMPL') THEN v_surface := 'DPL';
END IF;
IF v_surface = 'ND' THEN v_surface := NULL; END IF;
IF v_color = 'ND' THEN v_color := NULL; END IF;
IF v_strike = 'ND' THEN v_strike := NULL; END IF;

-- Route a legacy designation into the correct modern column.
IF v_legacy IS NOT NULL THEN
IF v_legacy IN ('PR','PF','PROOF') THEN
v_stype := COALESCE(v_stype,'PROOF');
ELSIF v_legacy IN ('RD','RB','BN') AND v_color IS NULL THEN
v_color := v_legacy;
ELSIF v_legacy IN ('PL','DPL','DMPL','DM','CAM','CA','DCAM','DC','SP') AND v_surface IS NULL THEN
v_surface := CASE v_legacy
WHEN 'DMPL' THEN 'DPL' WHEN 'DM' THEN 'DPL'
WHEN 'CA' THEN 'CAM' WHEN 'DC' THEN 'DCAM'
ELSE v_legacy END;
ELSIF v_legacy IN ('FB','FBL','FH','FT','5FS') AND v_strike IS NULL THEN
v_strike := v_legacy;
ELSIF v_legacy = 'FS' AND v_variety IS NULL THEN
-- 'FS' on a cent is a Fivaz-Stanton variety number, never Full Steps.
v_variety := NULLIF('FS-' || COALESCE(substring(p_title from '(?i)FS[-#]?[[:space:]]?([0-9]{3,4}[A-Za-z]?)'), ''), 'FS-');
END IF;
END IF;

-- Derive strike_type when the harvester did not supply one: certified grade wins, category is fallback.
IF v_stype IS NULL THEN
v_stype := CASE
WHEN p_grade_raw ~* '^[[:space:]]*(PR|PF)' THEN 'PROOF'
WHEN p_grade_raw ~* '^[[:space:]]*SP' THEN 'SPECIMEN'
WHEN p_category ILIKE 'Proof%' THEN 'PROOF'
WHEN p_category ILIKE '%Sms%' THEN 'SPECIMEN'
ELSE 'BUSINESS'
END;
END IF;

-- Controlled vocabulary: reject junk rather than storing it.
IF v_stype NOT IN ('PROOF','BUSINESS','SPECIMEN') THEN RAISE EXCEPTION 'reject: strike_type %', v_stype; END IF;
IF v_color IS NOT NULL AND v_color NOT IN ('RD','RB','BN') THEN RAISE EXCEPTION 'reject: color % not in (RD,RB,BN)', v_color; END IF;
IF v_surface IS NOT NULL AND v_surface NOT IN ('PL','DPL','CAM','DCAM','SP') THEN RAISE EXCEPTION 'reject: surface_designation %', v_surface; END IF;
IF v_strike IS NOT NULL AND v_strike NOT IN ('FS','FB','FBL','FH','FT','5FS') THEN RAISE EXCEPTION 'reject: strike_designation %', v_strike; END IF;

-- Derive denomination from category when the harvester did not supply one.
-- Colonials are intentionally left NULL (mixed denominations; parsed from title by the harvester).
IF v_denom IS NULL THEN
v_denom := CASE
WHEN p_category ~* 'half cent'         THEN '1/2C'
WHEN p_category ~* 'two cent'          THEN '2C'
WHEN p_category ~* 'twenty cent'       THEN '20C'
WHEN p_category ~* 'three cent nickel' THEN '3CN'
WHEN p_category ~* 'three cent silver' THEN '3CS'
WHEN p_category ~* 'three cent'        THEN NULL   -- ambiguous metal, do not guess
WHEN p_category ~* 'colonial'          THEN NULL   -- mixed denominations
WHEN p_category ~* '\mcents?\M'        THEN '1C'
ELSE NULL
END;
END IF;

INSERT INTO public.lots_coins (
source, source_lot_id, lot_url, title, sold_on, price_realized, price_kind,
category, denomination, denomination_raw, grading_company, grade_raw, grade_numeric,
has_cac, has_plus, pcgs_number,
color, strike_designation, surface_designation, strike_type,
variety, die_state, rarity,
auction_event_id, series_year, thumbnail_url, raw, scraped_at, updated_at, ha_category
) VALUES (
'heritage_auctions', p_source_lot_id, p_lot_url, p_title, p_sold_on, p_price_realized, 'realized',
p_category, v_denom, NULLIF(p_denomination_raw,''),
NULLIF(p_grading_company,'')::grading_company_enum, p_grade_raw, p_grade_numeric,
COALESCE(p_has_cac,false), COALESCE(p_has_plus,false),
NULLIF(p_pcgs_number,''),
v_color, v_strike, v_surface, v_stype,
v_variety, NULLIF(p_die_state,''), NULLIF(p_rarity,''),
p_auction_event_id, p_series_year, NULLIF(p_thumbnail_url,''), p_raw, v_now, v_now, NULLIF(p_ha_category,'')
)
ON CONFLICT (source, source_lot_id) DO UPDATE SET
lot_url=EXCLUDED.lot_url, title=EXCLUDED.title, sold_on=EXCLUDED.sold_on,
price_realized=EXCLUDED.price_realized, price_kind=EXCLUDED.price_kind,
category=EXCLUDED.category,
ha_category=COALESCE(EXCLUDED.ha_category, lots_coins.ha_category),
denomination=COALESCE(EXCLUDED.denomination, lots_coins.denomination),
denomination_raw=EXCLUDED.denomination_raw,
grading_company=EXCLUDED.grading_company, grade_raw=EXCLUDED.grade_raw, grade_numeric=EXCLUDED.grade_numeric,
has_cac=EXCLUDED.has_cac, has_plus=EXCLUDED.has_plus,
pcgs_number=COALESCE(EXCLUDED.pcgs_number, lots_coins.pcgs_number),
color=COALESCE(EXCLUDED.color, lots_coins.color),
strike_designation=COALESCE(EXCLUDED.strike_designation, lots_coins.strike_designation),
surface_designation=COALESCE(EXCLUDED.surface_designation, lots_coins.surface_designation),
strike_type=COALESCE(EXCLUDED.strike_type, lots_coins.strike_type),
variety=COALESCE(EXCLUDED.variety, lots_coins.variety),
die_state=COALESCE(EXCLUDED.die_state, lots_coins.die_state),
rarity=COALESCE(EXCLUDED.rarity, lots_coins.rarity),
auction_event_id=EXCLUDED.auction_event_id, series_year=EXCLUDED.series_year,
thumbnail_url=COALESCE(EXCLUDED.thumbnail_url, lots_coins.thumbnail_url),
raw=EXCLUDED.raw, updated_at=EXCLUDED.updated_at
RETURNING (xmax = 0) INTO v_inserted;

RETURN (CASE WHEN v_inserted THEN 'ins:' ELSE 'upd:' END) || p_source_lot_id;
END;
$function$
;

-- ---------------------------------------------------------------------------
-- Privileges. NOT emitted by pg_get_functiondef(), so they must be stated
-- explicitly or they are lost. Verified against pg_proc.proacl 2026-08-13.
-- ---------------------------------------------------------------------------
grant execute on function public.ingest_heritage_coin_lot(
  p_source_lot_id text, p_lot_url text, p_title text, p_sold_on date,
  p_price_realized numeric, p_category text, p_denomination text,
  p_denomination_raw text, p_grading_company text, p_grade_raw text,
  p_grade_numeric integer, p_has_cac boolean, p_has_plus boolean,
  p_pcgs_number text, p_designation text, p_variety text, p_die_state text,
  p_rarity text, p_auction_event_id text, p_raw jsonb, p_series_year integer,
  p_thumbnail_url text, p_color text, p_strike_designation text,
  p_surface_designation text, p_strike_type text, p_ha_category text
) to anon, authenticated, service_role;
