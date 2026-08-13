-- PGRST203 fix: the v2 (20-param, p_thumbnail_url DEFAULT NULL) was ADDED as an
-- overload beside the 19-param guards version instead of replacing it, making
-- every 19-key REST call ambiguous. Drop the 19-param; the 20-param serves both
-- call shapes via the default. (19-param already vaulted:
-- fn_ingest_stacks_bowers_lot_guards_20260812.)
drop function public.ingest_stacks_bowers_lot(
  text,text,text,text,date,numeric,text,boolean,text,text,integer,
  text,text,text,text,integer,text,text,jsonb);
