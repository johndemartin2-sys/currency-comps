-- Tiered search engine (JD-approved design 2026-08-12):
-- T1 catalog-key match | T2 token-AND FTS | T3 typo-corrected FTS | T4 legacy whole-string similarity
-- Visibility (search_visible) enforced on every tier. Same rowtype as search_lots_fuzzy for transparent swap.
create or replace function public.search_lots_v2(
  p_query text, p_category text default null, p_limit integer default 50, p_threshold real default 0.3)
returns table(id bigint, category text, title text, sold_on date, price_realized numeric,
              grade_raw text, lot_url text, thumbnail_url text, rank real)
language plpgsql stable set search_path to 'public','pg_catalog','pg_temp' as $$
declare
  v_q text := btrim(coalesce(p_query,''));
  v_key text := null;
  v_tsq tsquery;
  v_tsq_fixed tsquery;
  v_lim int := greatest(1, least(p_limit, 200));
  v_n int := 0;
  v_fixed text;
begin
  -- coins keep legacy behavior (7 searches lifetime; not in scope)
  if p_category = 'coins' then
    return query
      select l.id, l.category::text, l.title, l.sold_on, l.price_realized, l.grade_raw, l.lot_url, l.thumbnail_url,
             word_similarity(v_q, l.title) as rank
      from lots_all l
      where l.category::text='coins' and l.title is not null
        and (v_q % l.title or l.title ilike '%'||v_q||'%')
        and word_similarity(v_q, l.title) >= p_threshold
      order by rank desc, l.price_realized desc nulls last limit v_lim;
    return;
  end if;

  -- Tier 0: parse. Whole-query catalog token -> key. (Bare numbers alongside words stay text: years.)
  if v_q ~* '^(fr\.?\s*)?([0-9]{2,4}([a-z]|-?exp|-?sp(wm|nm)?[fb]?)?|t-?[0-9]{1,3}|ep-?[0-9]{1,3}[a-z]?)\*?$' then
    v_key := public.fr_canon(regexp_replace(v_q, '\*$', ''));
  end if;
  v_tsq := websearch_to_tsquery('simple', v_q);

  -- Tier 1: keyed catalog match
  if v_key is not null then
    return query
      select lc.id, 'currency'::text, lc.title, lc.sold_on, lc.price_realized, lc.grade_raw, lc.lot_url, lc.thumbnail_url,
             2.0::real as rank
      from lots_currency lc
      where lc.search_visible and (lc.fr_canon = v_key or lc.fr_base_canon = v_key)
      order by lc.sold_on desc nulls last limit v_lim;
    get diagnostics v_n = row_count;
    if v_n > 0 then return; end if;
  end if;

  -- Tier 2: token-AND full text
  if v_tsq is not null then
    return query
      select lc.id, 'currency'::text, lc.title, lc.sold_on, lc.price_realized, lc.grade_raw, lc.lot_url, lc.thumbnail_url,
             (1.0 + ts_rank(lc.title_fts, v_tsq))::real
      from lots_currency lc
      where lc.search_visible and lc.title_fts @@ v_tsq
      order by ts_rank(lc.title_fts, v_tsq) desc, lc.sold_on desc nulls last limit v_lim;
    get diagnostics v_n = row_count;
    if v_n > 0 then return; end if;
  end if;

  -- Tier 3: per-token typo correction via title_word_freq, then rerun FTS
  select string_agg(coalesce(fix.word, tok.t), ' ') into v_fixed
  from unnest(regexp_split_to_array(lower(regexp_replace(v_q,'[^a-z0-9 ]',' ','gi')),'\s+')) with ordinality tok(t, ord)
  left join lateral (
    select w.word from title_word_freq w
    where length(tok.t) >= 4 and w.word % tok.t
      and not exists (select 1 from title_word_freq e where e.word = tok.t)
    order by similarity(w.word, tok.t) * ln(w.n + 1) desc limit 1
  ) fix on true
  where tok.t <> '';
  if v_fixed is not null and lower(v_fixed) <> lower(v_q) then
    v_tsq_fixed := websearch_to_tsquery('simple', v_fixed);
    return query
      select lc.id, 'currency'::text, lc.title, lc.sold_on, lc.price_realized, lc.grade_raw, lc.lot_url, lc.thumbnail_url,
             (0.5 + ts_rank(lc.title_fts, v_tsq_fixed))::real
      from lots_currency lc
      where lc.search_visible and lc.title_fts @@ v_tsq_fixed
      order by ts_rank(lc.title_fts, v_tsq_fixed) desc, lc.sold_on desc nulls last limit v_lim;
    get diagnostics v_n = row_count;
    if v_n > 0 then return; end if;
  end if;

  -- Tier 4: legacy whole-string similarity (now visibility-safe)
  return query
    select lc.id, 'currency'::text, lc.title, lc.sold_on, lc.price_realized, lc.grade_raw, lc.lot_url, lc.thumbnail_url,
           word_similarity(v_q, lc.title) as rank
    from lots_currency lc
    where lc.search_visible and lc.title is not null
      and (v_q % lc.title or lc.title ilike '%'||v_q||'%')
      and word_similarity(v_q, lc.title) >= p_threshold
    order by rank desc, lc.price_realized desc nulls last limit v_lim;
end $$;
