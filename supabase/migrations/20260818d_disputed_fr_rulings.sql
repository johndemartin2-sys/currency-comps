-- =====================================================================
-- 20260818d  (APPLIED to live 2026-08-18)
-- Rulings on the disputed Friedberg numbers
-- (docs/VERIFICATION_deep_dive.md "settle these by hand" list).
--
-- RULED (override + direct fix):
--   Fr. 823  1915 -> 1918   18/18 titles unanimous, incl. the Serial
--                           Number 1 note at $55,200; every lot is a
--                           professionally attributed 1918 $20 FRBN
--                           Atlanta. Census 1915 is wrong for this key.
--   Fr. 825  1915 -> 1918   9/9 titles unanimous, same family.
--   Fr. 1959KW 1934 -> 1934C  all 33 sibling census rows (1959A-1959LW)
--                           say 1934C, 300+ titles agree; the bare
--                           '1934' is a census typo on this one variant.
--
-- LEFT AS-IS (documented, no confident ruling):
--   Fr. 2040 / 2040F / 2040L  census 2006 vs titles split ~55/45 with
--                           2004A - catalogers themselves disagree.
--   Fr. 202A-D  census 1863 vs titles 1861, only 2-3 votes each.
--   Fr. 388  title "consensus" 1683 is a charter number leak; curated
--                           1875 stands.
--   Fr. 224 / 268 / 61  no longer disputed - consensus now agrees
--                           with catalog (1896 / 1896 / 1862).
-- As-run: all 27 Fr.823/825 lots now Series 1918.
-- =====================================================================
insert into public.catalog_series_overrides (fr_join_key, series_designation, reason) values
  ('823',    '1918',  'census said 1915; 18/18 titles say 1918 $20 FRBN Atlanta incl. serial-1 note @$55.2k'),
  ('825',    '1918',  'census said 1915; 9/9 titles say 1918, same FRBN family as Fr.823'),
  ('1959KW', '1934C', 'census typo: bare 1934 on one variant; all 33 siblings + 300+ titles say 1934C')
on conflict (fr_join_key) do update
  set series_designation = excluded.series_designation, reason = excluded.reason;

update public.catalog_master
   set series_designation = o.series_designation,
       series_year = left(o.series_designation, 4),
       series_source = 'override_20260818'
  from public.catalog_series_overrides o
 where o.fr_join_key = catalog_master.fr_join_key
   and o.fr_join_key in ('823','825','1959KW');

-- re-teach the affected lots through the (now trusted-only) trigger
update public.lots_currency set updated_at = now()
 where fr_canon in ('823','825','1959KW');
