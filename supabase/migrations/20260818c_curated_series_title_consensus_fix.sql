-- =====================================================================
-- 20260818c  (APPLIED to live 2026-08-18)
-- Repair 36 curated catalog rows contradicted by >=85% title consensus
-- (n>=5). Audit of all 738 curated rows with a title consensus found
-- 644 agree, 37 strongly contradicted, 57 weakly (left alone).
--
-- Two defect patterns in the curated tier:
--   A. letter dropped  (Fr.1530 "1928"  -> true 1928E; Fr.2153 -> 1934A)
--   B. wrong year      (Fr.2166 "1929"  -> true 1969C; Fr.2002 "1934"
--                       -> 1928B; Fr.1535 "1963" -> 1953C)
-- Every consensus value was cross-checked against standard Friedberg
-- numbering before being written.
--
-- Fr.388 is EXCLUDED from the 37: its "consensus" (1683, 5 votes) is a
-- charter number leaking into the year slot; curated 1875 is correct.
--
-- NOTE: this migration depends on tmp_curated_audit_20260818, built
-- in-session from a stripped-title token consensus over lots_currency.
-- The audit construction is recorded in docs/CHANGELOG-20260818.md.
-- Backup: bak_curated_series_20260818 (36 rows as-run).
-- =====================================================================
create table if not exists public.bak_curated_series_20260818 as
select cm.row_id, cm.fr_join_key, cm.series_designation, cm.series_source, cm.series_year
from public.catalog_master cm
join tmp_curated_audit_20260818 a on a.fr_join_key = cm.fr_join_key
where a.curated_series <> a.consensus_series
  and a.votes >= 5 and a.share >= 0.85
  and a.fr_join_key <> '388';

update public.catalog_master cm
   set series_designation = a.consensus_series,
       series_year = left(a.consensus_series, 4),
       series_source = 'title_consensus_20260818'
  from tmp_curated_audit_20260818 a
 where a.fr_join_key = cm.fr_join_key
   and cm.row_id in (select row_id from public.bak_curated_series_20260818);

-- Fixed keys (36): 1530->1928E 1535->1953C 1653->1934C 2002->1928B
-- 2055->1934A 2056->1934B 2101->1928A 2103->1934A 2104->1934B
-- 2105->1934C 2106->1934D 2108->1950A 2109->1950B 2110->1950C
-- 2111->1950D 2112->1950E 2113->1963A 2115->1969A 2121->1981A
-- 2151->1928A 2153->1934A 2154->1934B 2155->1934C 2158->1950A
-- 2159->1950B 2160->1950C 2161->1950D 2162->1950E 2163->1963A
-- 2166->1969C 2170->1981A 2179->2003A 2183->2009A 2187->2009A
-- 2202->1934A 2212->1934A
