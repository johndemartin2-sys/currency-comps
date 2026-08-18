# 2026-08-18 — hardening batch

Everything below is **already applied to the live database**; the migration
files in `supabase/migrations/2026818*.sql` are the record, annotated with
as-run results. Harvester files in `sql/` are the shipped versions.

## Database

| Migration | What it does |
|---|---|
| `20260818_fr_series_reject_guard` | The three currency ingest RPCs now REJECT any write where `series_year` equals the lot's own Friedberg base — the original corruption bug can never re-enter. One census-validated exception (Fr. 1969 = Series 1969) honoured via `v_census_series`. |
| `20260818b_...feedback_loop_fix` | 62 corrupt self-match catalog rows quarantined (Fr.1901→"1901" pattern). `resolve_lot_from_catalog` now only teaches lots from trusted rows (trust_rank ≤ 2) and sets the series LETTER. The old trigger silently overwrote 24,486 backfill writes before this fix — order matters. |
| `20260818c_...title_consensus_fix` | 36 curated catalog rows repaired against ≥85% title consensus (letter-drops like Fr.1530 1928→1928E; wrong years like Fr.2166 1929→1969C). All cross-checked against standard Friedberg numbering. Fr.388 excluded (charter-number leak). |
| `20260818d_disputed_fr_rulings` | Fr. 823/825 → Series 1918 (titles unanimous, incl. the serial-1 note at $55.2k). Fr. 1959KW → 1934C. Fr. 2040-family, 202A-D, 388 documented as unresolved. Fr. 224/268/61 no longer disputed. |
| `20260818e_...backfill` | 42,526 lots repaired in `lots_currency.series_year/letter` from stripped-title tokens, census-checked (census wins disagreements — mostly changeover pairs). year=Fr# corruption 30,987 → 4,419; "1935D $1 invert" works on the base table (13 rows). Plus 16 national-ephemera lots reclassified. |

Backup tables (all in `public`): `bak_series_yl_20260818`,
`bak_catalog_selfmatch_20260818`, `bak_curated_series_20260818`,
`bak_spurious_charter_20260818`.

## Harvesters (sql/)

- `coin-harvester.user.js` → **v1.5.0**: engine hardening backported from
  currency v9.5.0 (4-worker post pool, transient-only retry, circuit-breaker
  stop, configurable page size with auto-calibration, 25-check boot
  self-test). Extraction byte-unchanged — a 322,912-row eval verified it.
- `currency-harvester-heritage.user.js` → **v9.5.0**: SHARED CORE v1 parser
  (catalog-ref stripping, ranked series matching, A–H letter gate).
- `currency-harvester-stacks.user.js` → **v9.5.1**: same SHARED CORE
  byte-identical, plus API category-slice type classification.

## Still open

- eBay harvester is still on the old parser; the new reject guard will now
  make its bad parses fail loudly (`rej` counts) instead of corrupting rows.
- 4,419 residual year=Fr# rows have no clean lettered token to correct from.
- Fr. 2040 family and Fr. 202A-D remain genuinely disputed.
