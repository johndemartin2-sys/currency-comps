drop function if exists public.analytics_suffix_failures(integer);

create function public.analytics_suffix_failures(days int default 7)
returns table(
  fr_query text, fr_base text, times bigint, distinct_users bigint,
  friedberg_only boolean, other_filters text,
  exact_inventory bigint, base_inventory bigint,
  confidence text, diagnosis text, last_seen timestamptz
) language sql stable as $$
  with cand as (
    select s.filters->>'friedberg' as raw,
           public.fr_norm(s.filters->>'friedberg') as nrm,
           public.fr_base(s.filters->>'friedberg') as bse,
           (select coalesce(string_agg(k || '=' || (s.filters->>k), ', ' order by k), '')
              from jsonb_object_keys(s.filters) k
             where k not in ('mode','friedberg')) as others,
           coalesce(p.email,'(anon)') as email,
           s.created_at
    from public.search_log s
    left join public.profiles p on p.id = s.user_id
    where s.result_count = 0
      and s.created_at >= current_date - (days || ' days')::interval
      and coalesce(s.filters->>'friedberg','') <> ''
  ),
  agg as (
    select raw, nrm, bse, others, count(*) n, count(distinct email) u, max(created_at) ls
    from cand where bse is not null group by 1,2,3,4
  ),
  inv as (
    select public.fr_norm(l.friedberg_number) as nrm,
           public.fr_base(l.friedberg_number) as bse,
           count(*) c
    from public.lots_currency l
    where public.fr_base(l.friedberg_number) in (select bse from agg)
    group by 1,2
  ),
  scored as (
    select a.*,
      coalesce((select sum(i.c) from inv i where i.nrm = a.nrm),0) as exact_c,
      coalesce((select sum(i.c) from inv i where i.bse = a.bse),0) as base_c
    from agg a
  )
  select raw, bse, n, u,
    (others = ''), nullif(others,''),
    exact_c, base_c,
    case
      when others <> '' then 'LOW - co-filtered, zero may be legitimate'
      when exact_c > 0 then 'HIGH'
      else 'MEDIUM'
    end,
    case
      when exact_c > 0 then 'Inventory exists for exact match but search returned 0'
      when base_c > 0 then 'Base has inventory, variant does not'
      else 'No inventory for this Friedberg'
    end,
    ls
  from scored
  order by (others = '') desc, exact_c desc, n desc;
$$;