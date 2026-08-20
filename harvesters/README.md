# Currency Comps — Tampermonkey Harvesters

Userscripts that harvest sold-lot data into Supabase via the `ingest-proxy`
edge function. Each script authenticates with a private harvest key
(`x-harvest-key` header) — the `HARVEST_KEY` constant in each CONFIG block
ships as a placeholder. **NEVER commit a script with a real `hk_` key: this
repo is public.** Keys live in the password manager; hashes only in
`public.harvest_api_keys` (revoke per-harvester with `UPDATE ... SET
revoked_at = now()`).

Filenames are stable (no version in the name) — the version lives in each
script's `@version` header and changelog. Updating = overwrite the file.

| Script | Version | Source | Notes |
|---|---|---|---|
| currency-harvester-stacks.user.js | 9.7.1 | archive.stacksbowers.com | API-direct + DOM modes; Enrich mode (price/unsold/thumbnail repair via /ajax/lot, penny-exact BP handling) |
| currency-harvester-heritage.user.js | 9.6.0 | currency.ha.com | sweep/top-up/probe |
| currency-harvester-greatcollections.user.js | 1.0.6 | greatcollections.com | leaf-sweep + top-up; SVG price glyph decoder; hybrid detail fetch; Unicode normalization; pacing; login guard |

Shared: the `SHARED CORE v1` block (series/Friedberg parser) is byte-identical
across all three — change it in ALL, and re-run each script's boot self-test.

Write path: `POST /functions/v1/ingest-proxy/<rpc>` with `x-harvest-key`.
The anon/publishable key cannot write (EXECUTE revoked on all ingest RPCs,
2026-08-19). A 401 stops any run like a circuit breaker.

Full context: Claude project docs (harvester-private-key-migration,
gc-harvester, data-quality-backfills, sb-enricher — 2026-08-19/20).
