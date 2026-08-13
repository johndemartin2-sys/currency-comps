-- Rollback infrastructure: additive only, touches no existing objects
create schema if not exists rollback;

create table if not exists rollback.artifacts (
  name        text primary key,
  kind        text not null,          -- 'ddl' | 'script' | 'note'
  content     text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days'
);

comment on schema rollback is 'Reverse-button storage for fr-master-repivot. Snapshots + DDL captures + ROLLBACK.sql. Retention 30 days from creation.';
