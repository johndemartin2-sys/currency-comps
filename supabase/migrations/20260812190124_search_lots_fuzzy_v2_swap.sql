-- Transparent swap: same signature & rowtype, tiered engine inside. v1 DDL vaulted (fn_search_lots_fuzzy_v1).
create or replace function public.search_lots_fuzzy(
  p_query text, p_category text default null::text, p_limit integer default 50, p_threshold real default 0.3)
returns table(id bigint, category text, title text, sold_on date, price_realized numeric,
              grade_raw text, lot_url text, thumbnail_url text, rank real)
language sql stable set search_path to 'public','pg_catalog','pg_temp' as $$
  select * from public.search_lots_v2(p_query, p_category, p_limit, p_threshold);
$$;
