# Currency Comps — Tampermonkey Harvesters

Userscripts that harvest sold-lot data into Supabase via the `ingest-proxy`
edge function. Each script authenticates with a private harvest key
(`x-harvest-key` header) — the `HARVEST_KEY` constant in each CONFIG block
ships as a placeholder. **NEVER commit a script with a real `hk_` key: this
repo is public.** Keys live in the password manager; hashes only in
`public.harvest_api_keys` (revoke per-harvester with `UPDATE ... SET
revoked_at = now()`).

| Script | Version | Source | Notes |
|---|---|---|---|
| currency-harvester-stacks-v9.7.0.user.js | 9.7.0 | archive.stacksbowers.com | API-direct + DOM modes; Enrich mode (price/unsold/thumbnail repair via /ajax/lot); private-key write path |
| currency-harvester-heritage-v9.6.0.user.js | 9.6.0 | currency.ha.com | sweep/top-up/probe; private-key write path |
| currency-harvester-greatcollections-v1.0.4.user.js | 1.0.4 | greatcollections.com | leaf-sweep + recent-sales top-up; SVG price decoder (glyph map); hybrid detail fetch; Unicode-dash normalization |

Shared: the `SHARED CORE v1` block (series/Friedberg parser) is byte-identical
across all three — change it in ALL, and re-run each script's boot self-test.

Write path: `POST /functions/v1/ingest-proxy/<ingest_rpc>` with
`x-harvest-key`. The anon/publishable key cannot write (EXECUTE revoked on all
ingest RPCs, 2026-08-19). A 401 stops any run like a circuit breaker.

Full context: Claude project docs (harvester-private-key-migration,
gc-harvester, data-quality-backfills — all dated 2026-08-19).
