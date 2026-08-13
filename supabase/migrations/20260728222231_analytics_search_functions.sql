-- Helpers: normalize a Friedberg string and extract its numeric base
create or replace function public.fr_norm(txt text)
returns text language sql immutable as $$
  select nullif(upper(regexp_replace(regexp_replace(coalesce(txt,''), '^\s*[Ff][Rr]\.?\s*', ''), '[^0-9A-Za-z]', '', 'g')), '')
$$;

create or replace function public.fr_base(txt text)
returns text language sql immutable as $$
  select nullif(substring(public.fr_norm(txt) from '^[0-9]+'), '')
$$;

-- 1. Daily search log (the original query, parameterized + owner flag)
create or replace function public.analytics_search_daily(days int default 7)
returns table(
  day date, user_email text, is_owner boolean, searches bigint,
  searches_with_results bigint, zero_result_searches bigint,
  zero_pct numeric, search_detail text
) language sql stable as $$
  select
    s.created_at::date,
    coalesce(p.email, '(anonymous - no profile)'),
    coalesce(p.email = 'johndemartin2@gmail.com', false),
    count(*),
    count(*) filter (where s.result_count > 0),
    count(*) filter (where s.result_count = 0),
    round(100.0 * count(*) filter (where s.result_count = 0) / nullif(count(*),0), 1),
    string_agg(
      case when coalesce(s.title_query,'') <> '' then s.title_query
           else 'filters: ' || s.filters::text end || ' -> ' || s.result_count,
      chr(10) order by s.created_at)
  from public.search_log s
  left join public.profiles p on p.id = s.user_id
  where s.created_at >= current_date - (days || ' days')::interval
  group by 1,2,3
  order by 1 desc, 4 desc;
$$;

-- 2. Zero-result searches, rolled up
create or replace function public.analytics_zero_results(days int default 7)
returns table(
  query_kind text, query_text text, times bigint,
  distinct_users bigint, owner_only boolean, last_seen timestamptz
) language sql stable as $$
  with z as (
    select s.created_at,
      coalesce(p.email,'(anonymous - no profile)') as email,
      case when coalesce(s.title_query,'') <> '' then 'text' else 'filters' end as kind,
      case when coalesce(s.title_query,'') <> '' then lower(trim(s.title_query))
           else s.filters::text end as qtext
    from public.search_log s
    left join public.profiles p on p.id = s.user_id
    where s.result_count = 0
      and s.created_at >= current_date - (days || ' days')::interval
  )
  select kind, qtext, count(*), count(distinct email),
    bool_and(email = 'johndemartin2@gmail.com'), max(created_at)
  from z group by 1,2 order by 3 desc, 6 desc;
$$;

-- 3. Suffix / sub-variety failures, cross-checked against live inventory
create or replace function public.analytics_suffix_failures(days int default 7)
returns table(
  fr_query text, fr_base text, times bigint, distinct_users bigint,
  exact_inventory bigint, base_inventory bigint, diagnosis text, last_seen timestamptz
) language sql stable as $$
  with cand as (
    select s.filters->>'friedberg' as raw,
           public.fr_norm(s.filters->>'friedberg') as nrm,
           public.fr_base(s.filters->>'friedberg') as bse,
           coalesce(p.email,'(anon)') as email,
           s.created_at
    from public.search_log s
    left join public.profiles p on p.id = s.user_id
    where s.result_count = 0
      and s.created_at >= current_date - (days || ' days')::interval
      and coalesce(s.filters->>'friedberg','') <> ''
  ),
  agg as (
    select raw, nrm, bse, count(*) n, count(distinct email) u, max(created_at) ls
    from cand where bse is not null group by 1,2,3
  ),
  inv as (
    select public.fr_norm(l.friedberg_number) as nrm,
           public.fr_base(l.friedberg_number) as bse,
           count(*) c
    from public.lots_currency l
    where public.fr_base(l.friedberg_number) in (select bse from agg)
    group by 1,2
  )
  select a.raw, a.bse, a.n, a.u,
    coalesce((select sum(i.c) from inv i where i.nrm = a.nrm),0),
    coalesce((select sum(i.c) from inv i where i.bse = a.bse),0),
    case
      when coalesce((select sum(i.c) from inv i where i.nrm = a.nrm),0) > 0
        then 'SEARCH BUG - exact match exists in inventory'
      when coalesce((select sum(i.c) from inv i where i.bse = a.bse),0) > 0
        then 'SUFFIX GAP - base has inventory, variant does not'
      else 'no inventory for this Friedberg'
    end,
    a.ls
  from agg a
  order by 3 desc;
$$;

-- 4. New / returning / dormant user activity
create or replace function public.analytics_user_activity(days int default 7)
returns table(
  user_email text, tier text, subscription_status text,
  first_search timestamptz, last_search timestamptz,
  searches_in_window bigint, days_active bigint, zero_pct numeric,
  lifetime_searches bigint, cohort text
) language sql stable as $$
  with life as (
    select coalesce(p.email,'(anonymous - no profile)') as email,
           max(p.tier) as tier, max(p.subscription_status) as sub,
           min(s.created_at) as first_search, max(s.created_at) as last_search,
           count(*) as lifetime
    from public.search_log s
    left join public.profiles p on p.id = s.user_id
    group by 1
  ),
  win as (
    select coalesce(p.email,'(anonymous - no profile)') as email,
           count(*) n, count(distinct s.created_at::date) d,
           round(100.0 * count(*) filter (where s.result_count = 0) / nullif(count(*),0), 1) zpct
    from public.search_log s
    left join public.profiles p on p.id = s.user_id
    where s.created_at >= current_date - (days || ' days')::interval
    group by 1
  )
  select l.email, l.tier, l.sub, l.first_search, l.last_search,
         coalesce(w.n,0), coalesce(w.d,0), w.zpct, l.lifetime,
         case
           when l.first_search >= current_date - (days || ' days')::interval then 'new'
           when w.n is null then 'dormant'
           else 'returning'
         end
  from life l left join win w on w.email = l.email
  order by coalesce(w.n,0) desc, l.lifetime desc;
$$;