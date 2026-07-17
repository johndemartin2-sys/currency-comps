-- ============================================================
-- 04_search_suggestions.sql
-- Search UX: fuzzy title suggestions (pg_trgm) + nightly refresh.
--
-- Powers the "Did you mean ...?" hint and depends on pg_trgm
-- (already enabled) and, for the nightly job, pg_cron.
--
-- Apply once against the primary database. Idempotent where possible.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Title-word dictionary (distinct words from lot titles, >=3 chars)
-- ------------------------------------------------------------
create materialized view if not exists title_word_freq as
select word, count(*) as n
from (
  select unnest(regexp_split_to_array(lower(title), '\s+')) as word
  from lots_currency_resolved
  where title is not null
) w
where length(word) >= 3
group by word;

-- Trigram index for fast similarity() lookups.
create index if not exists title_word_freq_trgm
  on title_word_freq using gin (word gin_trgm_ops);

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
create unique index if not exists title_word_freq_word_uidx
  on title_word_freq (word);

-- ------------------------------------------------------------
-- 2. Suggestion RPC used by the front-end (currency_app.html)
-- ------------------------------------------------------------
create or replace function suggest_title_terms(p_term text, p_limit int default 3)
returns table(suggestion text, score real, n bigint)
language sql
stable
as $$
  select word, similarity(word, lower(p_term)) as score, n
  from title_word_freq
  where similarity(word, lower(p_term)) > 0.35
  order by score desc, n desc
  limit p_limit
$$;

grant execute on function suggest_title_terms(text, int) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Nightly refresh via pg_cron
--    REQUIRES pg_cron enabled:
--    Dashboard > Database > Extensions > pg_cron  (or uncomment below)
-- ------------------------------------------------------------
-- create extension if not exists pg_cron;

select cron.schedule(
  'refresh_title_word_freq',   -- job name (re-running replaces it)
  '17 4 * * *',                -- 04:17 UTC daily (off-peak)
  $$refresh materialized view concurrently title_word_freq;$$
);

-- Management helpers:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select cron.unschedule('refresh_title_word_freq');
