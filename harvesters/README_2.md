# Currency Comps — Tampermonkey Harvesters

Userscripts that harvest sold-lot data into Supabase via the `ingest-proxy` edge function. Each script authenticates with a private harvest key (`x-harvest-key` header) — the `HARVEST_KEY` constant in each CONFIG block ships as a placeholder. **NEVER commit a script with a real `hk_` key: this repo is public.** Keys live in the password manager; hashes only in `public.harvest_api_keys` (revoke per-harvester with `UPDATE ... SET revoked_at = now()`).

Filenames are stable (no version in the name) — the version lives in each script's `@version` header and changelog. Updating = overwrite the file.

| Script | Version | Source | Notes |
|---|---|---|---|
| `currency-harvester-stacks.user.js` | 9.7.3 | archive.stacksbowers.com | API-direct + DOM modes; Enrich mode (price/unsold/thumbnail repair via `/ajax/lot`, penny-exact BP handling); grade_raw fix; top-up cutoff wins over known pages |
| `currency-harvester-heritage.user.js` | 9.8.2 | currency.ha.com | sweep/top-up/probe; thumbnail lazy-load fix (`data-src`); pager detection; auto-slicer (Terapeak facet JSON); run lock / tab ownership |
| `currency-harvester-greatcollections.user.js` | 1.0.13 | greatcollections.com | leaf-sweep + top-up; SVG price glyph decoder; hybrid detail fetch; Unicode normalization; pacing; login guard; leaf ledger; bot-check tolerance; run lock; **Audit mode** (read-only coverage check) |
| `currency-harvester-lynknight.user.js` | 1.0.3 | archive.lynknight.com | two-stage upsert (list → detail); structured serial parsing; windows-1252 charset fix; type-row parsing; login detection; localStorage resumable sweep; Heal mode |
| `currency-harvester-ebay.user.js` | 2.0.4 | ebay.com (Terapeak) | Terapeak JSON driver; strict Fr validation; GM_xmlhttpRequest CSP handling; Best-Offer accepted-price handling |

**Shared:** the `SHARED CORE v1` block (series/Friedberg parser) is byte-identical across Heritage, Stack's, and GreatCollections — change it in ALL, and re-run each script's boot self-test.

**Write path:** `POST /functions/v1/ingest-proxy/<rpc>` with `x-harvest-key`. The anon/publishable key cannot write (EXECUTE revoked on all ingest RPCs, 2026-08-19). A 401 stops any run like a circuit breaker.

**Full context:** Claude project docs (harvester-private-key-migration, gc-harvester, data-quality-backfills, sb-enricher, and later sessions).
