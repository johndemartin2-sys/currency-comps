-- Coin schema additions for the Comp Tool (run before the ingest function).
-- ALTER TYPE ADD VALUE must be committed before the function references CACG.

ALTER TYPE grading_company_enum ADD VALUE IF NOT EXISTS 'CACG';

ALTER TABLE public.lots_coins ADD COLUMN IF NOT EXISTS category text;
CREATE INDEX IF NOT EXISTS lots_coins_category_idx ON public.lots_coins (category);
