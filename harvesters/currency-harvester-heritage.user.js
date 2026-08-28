// ==UserScript==
// @name         Currency Comp Harvester Heritage v9.8.3
// @namespace    jdmstrategy.currency-comps
// @version      9.8.3
// @description  Coin-harvester engine (sweep + top up + self-pagination) with v8 currency extraction -> ingest_heritage_lot via ingest-proxy
// @match        https://currency.ha.com/c/search/results.zx*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
// v9.8.3 (2026-08-27): COLONIAL TYPING FROM THE URL ROOT + category crumbs.
//   Lot URLs are /itm/<root>/<seg2>/<slug>/a/<auction>-<lot>.s. For type
//   notes <root> is the size bucket and <seg2> the type; for Colonial lots
//   <root> is "colonial-notes" and <seg2> is the COLONY ("connecticut",
//   "continental-currency", ...). parseRow typed from <seg2>, so colonies
//   read as state obsoletes (17K rows from the first Colonial sweep) and
//   Continental issues fell into the "...-issue" fractional rule (3K rows).
//   Now: when <root> is a type root (colonial-notes, confederate-notes,
//   obsolete-banknotes) it wins over <seg2>. Every row also carries
//   raw.ha_path_root and, in a sweep, raw.ha_category (the swept id), so
//   category provenance is auditable from here on. Rows already written are
//   fixed by SQL backfill (2026-08-27).
// v9.8.2 (2026-08-26): RUN LOCK (one loop per tab) + TAB CLAIM (one tab per
//   run). The script runs on every Heritage tab in the profile, and a tab
//   loaded while run state says running:true auto-resumes - a second HA tab
//   (a recon tab, a restored tab) silently ran the same sweep in parallel,
//   both advancing pages and slices. Now: (a) tick()/planLoop() refuse to
//   start while a loop is active in this tab ("already running"); (b) the
//   run state carries an OWNER tab token - the tab that started or resumed
//   the run - and any other tab that finds running:true shows "run owned by
//   another tab" and stays idle. Press Resume in a tab to claim the run
//   (e.g. after the owner tab was closed). Same pattern as GC v1.0.10.
// v9.8.1 (2026-08-26): PLANNER READS THE FACET JSON. The sidebar counts are
//   not in the results HTML (9.8.0's probes saw "no facets rendered"); they
//   come from /c/webservices/search/guided-navigation-archive.zx, a JSON
//   endpoint that returns every facet for the given filters. ONE call per
//   category returns the whole auction_year facet (all years at once), and
//   one call per over-cap year (with auction_year set) returns the
//   auction_type facet. Planning Colonial is now 1 probe instead of 25.
// v9.8.0 (2026-08-26): AUTO-SLICER. Heritage caps any query at 100 pages x
//   50 = 5,000 lots (verified: page 101+ repeats). A category like Obsoletes
//   (152K sold) or Colonial (47.6K) can never be swept as one query; the old
//   probe/gap design just reported the shortfall. Now the sweep PLANS itself:
//   PLAN PHASE (mode 'plan'): for each category id entered, probe each
//   auction_year 2002..now by fetching page 1 with &auction_year=Y and
//   reading the category's own facet count (the sidebar counts follow the
//   active filters). One probe per delay tick (same pacing as page loads -
//   an unpaced burst of probes tripped Cloudflare during recon). Probe
//   results persist in run state, so a reload resumes the plan.
//   SLICE RULES per (cat, year): 0 -> skip; <=5,000 -> one newest-first
//   slice; <=10,000 -> newest-first + oldest-first (the two ends of the same
//   list, overlap comes back as upd:); >10,000 -> split by auction_type
//   (Signature 5273 / Showcase 5272 / Select 5271), re-probe, apply the same
//   rules; a sub-slice still over 10,000 is harvested both ways and flagged
//   in the GAP list. Year slices need no probe page - the floor is Jan 1.
//   CAP GUARD: a slice ends at page 100 (or when the pager has no next and
//   the page is short). A newest-first year slice that hits the cap without
//   reaching its floor is flagged as a GAP with the date it reached.
//   Panel: "auto-slice by year" checkbox (default ON) on Build + Start
//   Sweep; leaving it off gives the legacy probe/harvest slices. Mode line
//   shows "slice i/n cat 3212 2019 Select desc". Resume works in plan and
//   sweep phases alike.
// v9.7.4 (2026-08-26): PACING + CHALLENGE PAUSE. Heritage served a bot check
//   during the first paced-less 9.7.3 top-up. (1) "delay s" panel field
//   (default 8, +/-25% jitter) - a pause before EVERY page navigation in
//   top-up and sweep; persisted to run state on edit so Resume honors it;
//   mode line shows the effective delay. (2) A page whose rows never render
//   (what a challenge/interstitial looks like to findRows) now PAUSES the
//   run in place - pass the check in this tab, press Resume, same page -
//   instead of finishing. Sweep mode keeps advancing the slice as before.
// v9.7.3 (2026-08-26): ALL-SKIPPED PAGE IS NOT THE END OF THE LIST.
//   The newest-first archive interleaves sales, and a whole page can belong
//   to a World Currency sale (event 282634, 2026-08-25) whose lot URLs have
//   a non-US path shape - every row is (correctly) skipped, r.seen is 0, and
//   tick() read that as "no rows on page N" and FINISHED with 800+ US lots
//   from the Aug 4 / Aug 11 weekly sales still behind it. Now: a page where
//   rows rendered but all were skipped is walked past whenever the pager
//   links to page N+1; "no rows" ends the run only on a truly empty page
//   with no next link. In sweep mode the same page just advances the slice
//   as before.
// v9.7.2 (2026-08-26): TOP UP "STOP AT" DATE NOW WINS OVER KNOWN PAGES.
//   Top Up stopped on the first fully-known page BEFORE checking the stop-at
//   date, so with page 1 already harvested a dated top-up ended instantly
//   ("whole page already harvested") and never reached the gap a partial
//   run left behind. Now, when a stop-at date is set, Top Up walks THROUGH
//   known pages (one cheap upd: RPC per lot) and stops only when the page's
//   newest sale is on/before the date. No date = unchanged (stop on first
//   fully-known page = the weekly refresh). Same rule as Stack's v9.7.3.
// v9.7.1 (2026-08-26): FALSE 'last page' STOP + thumbnail retry/diagnostics.
//   (1) FALSE LAST PAGE. tick() ended a top-up with 'last page' whenever
//   r.seen < pageSize(). r.seen EXCLUDES rows skipped as promo/upcoming, so a
//   full page carrying a few skip rows (seen 45 + skip 5) read as the end of
//   the archive. Live 2026-08-26: a top-up stopped on page 9 after ONE auction
//   (142634) with 992K sold lots behind it. Now: if the page links to
//   page N+1 (a[href*="page=<ps>~<N+1>"]) the run continues regardless of
//   seen; 'last page' fires only when there is no next link AND the page is
//   short. The existing 'page did not advance' guard still catches a full
//   page with no link.
//   (2) THUMBNAILS. The v9.7.0 run landed thumbs in whole-page blocks: 2 of 9
//   pages captured 100%, the other 7 captured 0%, so the miss is per page
//   render, not per row. processPage now (a) records WHY a row had no image
//   (raw.thumb_miss: 'noimg' | 'placeholder:<attrs>' | 'other:<classes>') so
//   the next run tells us the cause, and (b) if any parsed row lacks a thumb,
//   waits THUMB_RETRY_MS then re-reads images from the CURRENT DOM (re-found
//   by lot link, in case the framework re-rendered the list) before posting.
//   Never blocks a row: a still-missing thumb posts as null exactly as before.
//   SHARED CORE v1 untouched.
// v9.7.0 (2026-08-26): THUMBNAIL LAZY-LOAD FIX + ppq_epq crumb.
//   THE BUG. Heritage lazy-loads result thumbnails: only the first ~4 rows on
//   a page carry a real src; every later <img class="thumbnail lazyload"> is
//   served with src="data:image/svg+xml,..." (a 1x1 placeholder) and the real
//   URL in data-src (plus a larger variant in data-image2). parseRow read
//   img.src, so ~80% of rows shipped the placeholder or null.
//   MEASURED 2026-08-26: 96,001 Heritage rows held the SVG placeholder as
//   thumbnail_url, only 8,471 had a real URL (1.5% real coverage, not 18%).
//   A one-time SQL NULL-out of the placeholders is a separate approved step.
//   THE FIX. thumbFromImg(): data-src -> data-image2 -> src, and anything
//   that is not http(s) (data:, blank) becomes null. raw.image_large carries
//   data-image2 when it differs from the thumbnail (RPC has no column for it
//   yet; kept for a later backfill). raw.ppq_epq = PPQ|EPQ from title+grade
//   (Heritage writes "30PPQ" with no space, so no leading word boundary).
//   Payload params p_type_class/p_ppq_epq/p_serial_text/p_cert_number are
//   NOT sent yet: PostgREST rejects unknown RPC params, so they wait for the
//   ingest_heritage_lot migration and land in v9.7.1.
//   SHARED CORE v1 untouched, still byte-identical with Stack's / GC / LK.
// v9.6.0 (2026-08-19): PRIVATE-KEY WRITE PATH. Writes now go through the
//   ingest-proxy edge function with a private x-harvest-key header. The
//   publishable (anon) key is GONE from this script: EXECUTE on the ingest
//   RPCs was revoked from anon/authenticated on 2026-08-19, so the old
//   /rest/v1/rpc path is dead by design.
//     before:  POST /rest/v1/rpc/ingest_heritage_lot   apikey: <anon>
//     after:   POST /functions/v1/ingest-proxy/ingest_heritage_lot
//              x-harvest-key: <private key>
//   The proxy passes the RPC's status and body straight through, so the
//   ins:/upd:, reject: and circuit-breaker handling below is UNCHANGED.
//   A 401 (missing/revoked key) STOPS the run like a breaker instead of
//   grinding through pages. Boot guard: refuses to sweep until the key
//   placeholder is replaced. CORS is handled by the proxy (fetch + preflight
//   with the x-harvest-key header are allowed), so @grant none still works.
//   SHARED CORE untouched, still byte-identical with Stack's.
// v9.5.1 (2026-08-18): STATE FROM TITLE for obsoletes/nationals/colonials.
//   Previously state_code was only set from the URL slug when sweeping the
//   nationals category (3101), so 94,206 obsolete lots landed with no state
//   even though nearly every title leads with one ("Boston, MA- Cochituate
//   Bank ..."). A one-time SQL backfill (bak_obsolete_state_20260818) fixed
//   history; this stops the gap at ingest. Two title shapes:
//     "Boston, MA- ..."            leading City, ST-   (2-letter code)
//     "Virginia, Norfolk. ..."     leading state name
//   Gated to National/Obsolete/Colonial series types so a Federal Reserve
//   district city ("New York") can never be read as a state. The SHARED
//   CORE block is untouched and stays byte-identical with Stack's.
// v9.5.0 (2026-08-18): series parser extracted into the SHARED CORE block,
//   now byte-identical with the Stack's Bowers harvester. No behaviour change
//   from v9.4.0 beyond the added Stack's-shape self-test cases and the
//   Friedberg year-range guard (Fr. 1902-1908 must never parse as an Fr#).
// v9.4.0 (2026-08-17): SERIES PARSING REBUILT. This is a data-correctness release;
//   the run engine, panel, pagination, sweep/top-up logic and RPC contract are
//   untouched. raw.v stays 'v8'; raw.hv = 9.4.0.
//
//   THE BUG. SERIES_YEAR_RE was matched against the whole title with .match(),
//   which returns the LEFTMOST hit. Currency titles lead with the Friedberg
//   number, so the Fr# was captured as the series year:
//
//       "Fr. 1916-L. 1988A $1 Federal Reserve Note"
//             ^^^^ stored as series_year        ^^^^^ the actual series, never reached
//
//   Worse, the pattern's own '\s*-?\s*([A-Ea-e])?' tail invited the FEDERAL
//   RESERVE DISTRICT letter to be stored as the series letter: "Fr. 1900-A"
//   parsed as year 1900, letter A.
//
//   MEASURED IN THE LIVE TABLE (703,153 lots, 2026-08-17):
//     * 30,986 rows carry a Friedberg number in series_year
//     * 19,808 rows carry a district letter in series_letter
//     * replaying the v9.3.2 regex over every stored title would produce
//       51,143 Fr#-as-year rows - v9.3.0's widening to 20xx raised the
//       exposure by ~65%, it simply had not been harvested through yet
//
//   THE A-E CAP WAS ALSO DROPPING REAL DATA. Series letters run to H
//   (1935H closes the $1 Silver Certificates; 1928F/G are Legal Tenders).
//   Of 5,822 genuine F/G/H notes in the corpus only 327 were stored
//   correctly - 4,907 had a NULL letter and 588 had the wrong one.
//
//   THE FIX, in three parts:
//     1. strip EVERY catalog reference from the title first - Friedberg and
//        Whitman, hyphenated or compact, including comma/ampersand
//        continuation lists ("Fr. 1908-A, 1908-D, 1909-C & 1911-D")
//     2. then match a series token in what remains, A-H only. Not I-L: every
//        I/J/K/L in 703K titles is a district letter, never a series
//        (I=3, J=3, K=8, L=2 occurrences, versus 433 for H)
//     3. rank the forms - adjacent "1935D" first, separated "1928-F" second,
//        bare year last - instead of folding the separator into one pattern
//
//   VALIDATED against all 703,153 stored titles before shipping:
//                                    v9.3.2      v9.4.0
//     titles yielding a year .......  573,086 -> 587,551
//     titles yielding a letter .....        - ->  97,191
//     series_year = Friedberg # ....   51,143 ->     506
//     disagrees with title series ..        - ->      37
//
//   The residual 506 are lots whose title contains no series at all beyond a
//   Friedberg number that happens to look like a year. No title-only parser
//   can resolve those; see the server-side guard note at the foot of this file.
//
//   END-TO-END CHECK. This exact JavaScript was then run over 242 real titles
//   pulled at random from the live table and compared against the census
//   series for each lot's Friedberg number:
//       exact match ... 241 / 242  (99.59%)
//       no year found .   0
//       mismatched ....   1
//   The single miss is a two-note lot that names both series in one title:
//     "1 Dollar, 1923 & 1928A. P-Fr. 237 & 1601"  -> parsed 1928A, census 1923.
//   Every single-note title parsed correctly. The boot-time self-test below
//   pins the eleven hardest of these shapes so a future edit cannot regress
//   them silently.
//
//   RELATED, ALREADY LIVE: lots_currency_resolved.display_year now takes its
//   value from catalog_master.series_designation (migration
//   lots_currency_resolved_display_year_series, 2026-08-17), so the APP no
//   longer depends on this parse for Friedberg-numbered notes. It still
//   matters for the ~221K lots with no catalog entry, for the no-Fr#
//   triangulation branch of resolve_lot_from_catalog, and for analytics.
//
// v9.3.2 (2026-08-12): thumbnails + configurable page size.
//   * THUMBNAILS: img.thumbnail was always in the rows (the coin harvester grabs
//     it; currency never did). Now sent as p_thumbnail_url - the RPC gained the
//     parameter 2026-08-12 (drop-and-create, overload count verified = 1). Old
//     rows backfill via COALESCE as sweeps/top-ups touch them.
//   * PAGE SIZE: PER_PAGE is now a panel field (default 50). Old Heritage URLs
//     show 72-per-page exists; if a larger size works in list layout it cuts
//     navigations proportionally. SELF-CALIBRATION GUARD: if page 1 of a run
//     returns exactly 50 rows while a larger size is configured, Heritage
//     ignored the size - the harvester auto-corrects to 50 and says so, instead
//     of silently ending every slice one page in (seen < PER_PAGE would have
//     misread a full page as the last page).
// v9.3.1 (2026-08-12): SORT_ASC_DEFAULT corrected '6' -> '4'. Verified live in
//   browser 2026-08-12: sb=4 is End Date - Oldest (first result Aug 2 1994),
//   sb=5 is End Date - Newest (first result Aug 11 2026). The old '6' default
//   would have silently broken probe mode: probe pages arrive in a different
//   sort, so "oldest on page 1" is not the category's true end date and the
//   GAP list under-reports. Deep-linking with sb=4/5 works; mode=archive
//   must be present on results.zx for archive searches.
// v9.3.0 (2026-08-12): four data-quality fixes + resilience, per harvester eval.
//   * SERIES_YEAR_RE now accepts 20xx (2000-2029): every modern-series note
//     (Series 2001-2021 FRNs) previously ingested with series_year NULL.
//     [SUPERSEDED in 9.4.0 - this also admitted Friedberg numbers 2000-2029
//      as years, which is why the corruption count nearly doubled.]
//   * FRIEDBERG_RE: adopts the Stack's harvester's word form ("Friedberg 379a")
//     and hyphen suffix block ("2201-Blgs", "1900-A", "1273-5"). The hyphen block
//     is constrained to letter-led (up to 5 chars) or a SINGLE digit, so year
//     ranges like "1902-1908" can never be captured as a Friedberg number.
//   * T- and EP-number capture (type-gated): Confederate lots with no Fr# now
//     send "T-41" style keys; Encased Postage lots send "EP-107" style keys.
//     catalog_master keys both natively as of 2026-08-12 (lockfile v1.3.5 P/K).
//     Gated on the lot's canonical series type, so a stray "T-3" in an unrelated
//     title can never leak in. A real Fr# always wins over T/EP.
//   * post(): single retry on transient failures (network / 5xx / 429), adopted
//     from the Stack's harvester. Posts now run through a 4-worker pool per page.
//   * CIRCUIT BREAKER awareness: if the DB's fr-stub breaker trips (systemic
//     unknown-Fr flood), the run STOPS with an explicit message instead of
//     grinding through pages collecting errors. Match: /circuit breaker|ingest_guard/i.
//   * Stale comment removed: ingest_heritage_lot RETURNS 'ins:'/'upd:' (verified
//     live 2026-08-12), so the top-up whole-page stop is exact.
//   raw.v stays 'v8' (RPC contract); raw.hv = 9.3.0 is the audit version.
// v9.2.1 (2026-08-10): FRIEDBERG_RE letter run is now UNBOUNDED ([A-Za-z]*) instead
//   of capped at 3. Real Friedberg suffixes run to 5-6 letters (e.g. fractional
//   Specimen designations 1355SPWMF/SPWMB/SPNMF/SPNMB, experimental 1601EXP,
//   6-letter ASPNMF), which {0,3} truncated. The capture is anchored right after
//   the digits and terminated by \b, so widening the letter run can only ever
//   capture more of a real suffix -- it cannot over-grab. NOTE: this pattern still
//   does not capture an optional -hyphen suffix block (e.g. 2201-Blgs); see the
//   Stacks harvester if that becomes necessary here too.
// v9.2.0 (2026-08-10): FRIEDBERG_RE captures up to 3 trailing letters ([A-Za-z]{0,3})
//   so multi-letter suffixes (SP, AM, LFP, AA) are no longer truncated to one letter.
// v9.1.0 (2026-08-03): probe-then-harvest sweep (see SWEEP design below); gap list;
//   pairs with ingest_heritage_lot returning 'ins:'/'upd:'.
// v9.0.0 (2026-08-03): merges the coin harvester v1.4.12 run engine (localStorage state
//   machine, self-advancing pagination, MessageChannel sleep for background tabs,
//   waitForRows polling, sweep/top-up/dry-run modes) with the currency v8.7.0 row
//   extraction (series_type canonicalization, Friedberg/charter, star notes,
//   denomination, PMG/PCGS grades, promo-row guards). Extraction is byte-for-byte
//   v8.7.0 logic; raw.v stays 'v8' (RPC hard-rejects anything else) and raw.hv
//   carries the real script version for eval against the old harvester.
//   SWEEP design (per John, 2026-08-03): every category is PROBED first -- one page
//   sorted oldest-first, harvested, and its oldest sold_on recorded as the
//   category's true end date -- then HARVESTED newest-first to Heritage's result
//   cap. If the harvest ends before reaching the probed end date, the category is
//   flagged in a persistent GAP list (lots in the middle are beyond the cap and
//   need a further slicing dimension to reach). RPC now returns 'ins:'/'upd:', so
//   top-up's whole-page-already-harvested stop is exact.
//   Runs side-by-side with v8.7.0: separate localStorage key, separate panel.
(function () {
'use strict';
const VERSION = '9.8.3';
// ===================== CONFIG =====================
const SUPABASE_REF = 'wqizwluccqqfkedpgvve';
// v9.6.0: PRIVATE harvest key (hk_...). This is NOT the publishable
// sb_publishable_ key - that key can no longer write. Paste the key you
// were given ONCE, here, and nowhere else.
const HARVEST_KEY = 'PASTE_HARVEST_KEY_HERE';
const RPC_URL = 'https://' + SUPABASE_REF + '.supabase.co/functions/v1/ingest-proxy/ingest_heritage_lot';
const EXTRACTOR_VERSION = 'v8';   // MUST stay 'v8' -- the RPC rejects any other raw.v
const LS_KEY = 'cch9';
// Heritage sort codes, BOTH verified live 2026-08-12:
//   sb=5 = End Date - Newest first
//   sb=4 = End Date - Oldest first (probe mode)
// The panel field can still override if Heritage ever renumbers.
const SORT_DESC = '5';
const SORT_ASC_DEFAULT = '4';
// ROW_PAUSE must stay 0: Chrome clamps setTimeout to 1000ms in hidden tabs.
const PER_PAGE_DEFAULT = 50, ROW_PAUSE = 0, ROW_WAIT = 20000, POLL_MS = 250;
const THUMB_RETRY_MS = 1500;   // v9.7.1: one deferred re-read of lazy images per page
const PAGE_DELAY_S = 8;        // v9.7.4: default pause before each page navigation (+/-25% jitter)
const HA_PAGE_CAP = 100;       // v9.8.0: Heritage serves at most 100 pages per query
const HA_RESULT_CAP = 5000;    // v9.8.0: = HA_PAGE_CAP * 50
const PLAN_YEAR_FROM = 2002;   // v9.8.0: first archive year with meaningful volume
const AUCTION_TYPES = { '5273':'Signature', '5272':'Showcase', '5271':'Select' };   // v9.8.0
function pageSize(){ return (st && st.ps) || PER_PAGE_DEFAULT; }
// ==================================================
/* ================================================================== *
   * SHARED CORE v1  --  KEEP BYTE-IDENTICAL IN BOTH HARVESTERS
   * Heritage: currency-harvester-heritage.user.js
   * Stack's : currency-harvester-stacks.user.js
   * If you change anything between these markers, change it in BOTH and
   * re-run the boot self-test on each.
   * ================================================================== */
  // Step 1 - remove every catalog reference from the title. This MUST run
  // before any year match: currency titles lead with the Friedberg number,
  // so a bare year pattern matched against the raw title captures the Fr#.
  // Covers all reference forms observed across 703,153 live titles:
  //   "Fr. 1613W"   "Fr.1870I"   "Friedberg 379a"   "W.2438I"   "Fr-1531"
  //   "Fr. 2187-A*" "Fr. 1908-A, 1908-D, 1909-C & 1911-D"
  const CATALOG_REF_RE = /\b(?:friedberg|fr|w)\.?\s*#?\s*\d{1,4}[a-z]{0,6}(?:\s*-\s*[a-z0-9]{1,5})?\*?(?:\s*(?:,|&|and)\s*\d{1,4}[a-z]{0,6}(?:\s*-\s*[a-z0-9]{1,5})?\*?)*/gi;
  // Step 2 - match a series token in what survives, most confident form first.
  //   adjacent   "1935D"            - the dominant Heritage form
  //   separated  "1928-F", "1928 D" - common in Stack's / eBay-style titles
  //   year only  "1929"             - reaches to the 1600s for Colonial issues
  // Suffix is A-H. Series letters never ran past H; I-L are Federal Reserve
  // district letters and admitting them is the bug this replaces.
  const SERIES_ADJACENT_RE  = /(?<![\d-])(1[89]\d{2}|20[0-2]\d)([A-H])(?![A-Za-z0-9])/i;
  const SERIES_SEPARATED_RE = /(?<![\d-])(1[89]\d{2}|20[0-2]\d)[ -]([A-H])(?![A-Za-z0-9])/i;
  const SERIES_YEAR_ONLY_RE = /(?<![\d-])(1[6-9]\d{2}|20[0-2]\d)(?![A-Za-z0-9])/;
  // Friedberg. The hyphen block is constrained to letter-led (up to 5 chars)
  // or a SINGLE digit, so a year range like "1902-1908" can never be captured
  // as a Friedberg number.
  const FRIEDBERG_RE = /\b(?:Friedberg|Fr)\.?\s*#?\s*([0-9]{1,4}[A-Za-z]*(?:-(?:[A-Za-z][A-Za-z0-9]{0,4}|\d[A-Za-z]*))?)\b/i;
  // Returns {year, letter}. Never invents a letter it did not see.
  function parseSeries(title) {
    if (!title) return { year: null, letter: null };
    const body = title.replace(CATALOG_REF_RE, ' ');
    const m = body.match(SERIES_ADJACENT_RE)
           || body.match(SERIES_SEPARATED_RE)
           || body.match(SERIES_YEAR_ONLY_RE);
    if (!m) return { year: null, letter: null };
    return { year: parseInt(m[1], 10), letter: m[2] ? m[2].toUpperCase() : null };
  }
  function parseFriedberg(title) {
    if (!title) return null;
    const m = title.match(FRIEDBERG_RE);
    return m ? m[1].toUpperCase() : null;
  }
  // Boot-time self-test. Every case is a real title shape from the live table.
  // A FAIL means the regexes have been edited into a state that reintroduces
  // the Friedberg-as-year bug. Do not harvest until it passes.
  function seriesSelfTest(tag) {
    const cases = [
      ['Fr. 1613W $1 1935D Wide Silver Certificate. PMG Choice Very Fine 35.', 1935, 'D'],
      ['Fr. 1916-L. 1988A $1 Federal Reserve Note. San Francisco.',            1988, 'A'],
      ['Fr. 2051-K $20 1928A Federal Reserve Note. PMG Gem Uncirculated 66',   1928, 'A'],
      ['Fr. 1901-D* $1 1963A Federal Reserve Star Notes.',                     1963, 'A'],
      ['Fr. 1870-I. 1929 $20 Federal Reserve Bank Note. Minneapolis.',         1929, null],
      ['$10. Fr.1860H. W.1737H. Federal Reserve Bank Note. 1929. St. Louis.',  1929, null],
      ['1928-F $5 Legal Tender Note , Fr-1531, VF. The Wide I variety.',       1928, 'F'],
      ['Fr. 1618 $1 1935H Silver Certificate.',                               1935, 'H'],
      ['Fr. 1975-H. 1975 $5 Federal Reserve Note. St. Louis.',                1975, null],
      ['Fr. 2187-A*. 2009-A $100 Federal Reserve Star Note. Boston.',          2009, 'A'],
      ['Continental Currency. 1776 $30. Fine.',                               1776, null],
      // Stack's title shapes
      ['Fr. 1506. 1928E $2 Legal Tender Note. PCGS Currency Gem New 66 PPQ.',  1928, 'E'],
      ['Fr. 1966-L*. 1950E $5  Federal Reserve Star Note. San Francisco.',     1950, 'E'],
      ['Fr. 1935-H. 1976 $2 Federal Reserve Note. St. Louis.',                1976, null],
      ['Fr. 2050-B*. 1928 $20 Federal Reserve Star Note. New York.',           1928, null],
      ['$5. Fr.268. Silver Certificate. 1896. No.121590. Plate B.',            1896, null]
    ];
    let fails = 0;
    cases.forEach(function (c) {
      const got = parseSeries(c[0]);
      if (got.year !== c[1] || got.letter !== c[2]) {
        fails++;
        console.error('[' + tag + ' SELFTEST FAIL]', c[0], '=> got', got.year, got.letter,
                      'want', c[1], c[2]);
      }
    });
    // Friedberg guard: a year range must never be read as a Friedberg number.
    if (parseFriedberg('Fr. 1902-1908 $10 National Bank Notes.') !== '1902') {
      fails++; console.error('[' + tag + ' SELFTEST FAIL] Fr. 1902-1908 captured a year range');
    }
    if (fails) console.error('[' + tag + '] SERIES SELF-TEST: ' + fails + ' FAILED');
    else console.log('[' + tag + '] series self-test ok (' + (cases.length + 1) + ' cases)');
    return fails;
  }
  /* ==================== END SHARED CORE v1 ==================== */
/* =====================================================================
 *  EXTRACTION -- v8.7.0 lineage, series parsing rebuilt in v9.4.0
 * ===================================================================== */
const MONTHS = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const PATH_RE = /^\/itm\/([^\/?#]+)\/([^\/?#]+)\/([^\/?#]+)\/a\/(\d+)-(\d+)\.s/;
const SOLD_RE = /([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})/;
const PRICE_RE = /\$\s*([\d,]+(?:\.\d{2})?)/;
const GRADE_NUM_RE = /(?:^|\s)(\d{1,2})(?=\s|PPQ|EPQ|PQ|Net|$|[A-Za-z])/;
const SIZE_PREFIX_RE = /^(small-size-|large-size-)/;
const CHARTER_RE_CH  = /\bCh\.?\s*#?\s*\(?[A-Za-z]?\)?\s*([0-9]+)\b/i;
const CHARTER_RE_WORD= /\bCharter\s*#?\s*([0-9]+)\b/i;
const STATE_CODES = {
  alabama:'AL', alaska:'AK', arizona:'AZ', arkansas:'AR', california:'CA',
  colorado:'CO', 'colorado-territory':'CO', connecticut:'CT', delaware:'DE',
  'district-of-columbia':'DC', florida:'FL', georgia:'GA', hawaii:'HI',
  'hawaii-territory':'HI', idaho:'ID', illinois:'IL', indiana:'IN', iowa:'IA',
  kansas:'KS', kentucky:'KY', louisiana:'LA', maine:'ME', maryland:'MD',
  massachusetts:'MA', michigan:'MI', minnesota:'MN', mississippi:'MS',
  missouri:'MO', montana:'MT', nebraska:'NE', nevada:'NV', 'new-hampshire':'NH',
  'new-jersey':'NJ', 'new-mexico':'NM', 'new-york':'NY', 'north-carolina':'NC',
  'north-dakota':'ND', ohio:'OH', oklahoma:'OK', oregon:'OR', pennsylvania:'PA',
  'porto-rico':'PR', 'rhode-island':'RI', 'south-carolina':'SC',
  'south-dakota':'SD', tennessee:'TN', texas:'TX', utah:'UT', vermont:'VT',
  virginia:'VA', washington:'WA', 'west-virginia':'WV', wisconsin:'WI', wyoming:'WY'
};
// v9.5.1: state from the title itself, for lots the URL slug cannot type
// (obsoletes above all). Anchored to the title START, mirroring the SQL
// backfill of 2026-08-18 that recovered 92K obsolete states at 94% coverage.
const STATE_ABBR_SET = new Set(Object.values(STATE_CODES));
function stateFromTitle(t) {
  t = t || '';
  const m = t.match(/^[A-Za-z .'()]+,\s*([A-Z]{2})\s*[-–]/);
  if (m && STATE_ABBR_SET.has(m[1])) return m[1];
  const m2 = t.match(/^\(?([A-Za-z ]+?)\)?\s*,/);
  if (m2) {
    const slug = m2[1].trim().toLowerCase().replace(/ /g, '-');
    if (STATE_CODES[slug]) return STATE_CODES[slug];
  }
  return null;
}
    const SERIES_TYPE_MAP = {
  'national-bank-notes':'National Bank Note',
  'national bank note':'National Bank Note',
  'national_bank_note':'National Bank Note',
  'national-bank-note':'National Bank Note',
  'national-bank-note-errors':'National Bank Note',
  'national-gold-bank-notes':'National Gold Bank Note',
  'national gold bank note':'National Gold Bank Note',
  'federal-reserve-notes':'Federal Reserve Note',
  'federal reserve note':'Federal Reserve Note',
  'federal_reserve_note':'Federal Reserve Note',
  'federal-reserve-note':'Federal Reserve Note',
  'federal-reserve-bank-notes':'Federal Reserve Bank Note',
  'federal reserve bank note':'Federal Reserve Bank Note',
  'federal_reserve_bank_note':'Federal Reserve Bank Note',
  'legal-tender-notes':'Legal Tender Note',
  'legal tender note':'Legal Tender Note',
  'legal_tender':'Legal Tender Note',
  'legal-tender':'Legal Tender Note',
  'silver-certificates':'Silver Certificate',
  'silver certificate':'Silver Certificate',
  'silver_certificate':'Silver Certificate',
  'gold-certificates':'Gold Certificate',
  'gold certificate':'Gold Certificate',
  'gold_certificate':'Gold Certificate',
  'treasury-notes':'Treasury Note',
  'treasury note':'Treasury Note',
  'treasury_note':'Treasury Note',
  'compound-interest-treasury-notes':'Treasury Note',
  'demand-notes':'Demand Note',
  'demand note':'Demand Note',
  'demand_note':'Demand Note',
  'fractional':'Fractional Currency',
  'fractional currency':'Fractional Currency',
  'fractional-currency':'Fractional Currency',
  'postage-currency':'Fractional Currency',
  'confederate':'Confederate Currency',
  'confederate currency':'Confederate Currency',
  'confederate-currency':'Confederate Currency',
  'obsolete':'Obsolete Currency',
  'obsolete currency':'Obsolete Currency',
  'obsolete-currency':'Obsolete Currency',
  'colonial_continental':'Colonial / Continental Currency',
  'continental-currency':'Colonial / Continental Currency',
  'colonial-currency':'Colonial / Continental Currency',
  'colonial':'Colonial / Continental Currency',
  'world currency':'World Currency',
  'world-currency':'World Currency',
  'world-war-ii-emergency-notes':'World War II Emergency Note',
  'world war ii emergency note':'World War II Emergency Note',
  'military-payment-certificates':'Military Payment Certificate',
  'military payment certificate':'Military Payment Certificate',
  'mpc':'Military Payment Certificate',
  'encased_postage':'Encased Postage',
  'encased-postage':'Encased Postage',
  'refunding-certificates':'Refunding Certificate',
  'refunding certificate':'Refunding Certificate'
};
const TYPE_CLASS_MAP = {
  'National Bank Note':'national_bank_note',
  'National Gold Bank Note':'national_bank_note',
  'Federal Reserve Note':'federal_reserve_note',
  'Federal Reserve Bank Note':'federal_reserve_bank_note',
  'Legal Tender Note':'legal_tender',
  'Silver Certificate':'silver_certificate',
  'Gold Certificate':'gold_certificate',
  'Treasury Note':'treasury_note',
  'Demand Note':'demand_note',
  'Fractional Currency':'fractional',
  'Confederate Currency':'confederate',
  'Obsolete Currency':'obsolete',
  'Colonial / Continental Currency':'colonial_continental',
  'World Currency':'world_currency',
  'World War II Emergency Note':'other',
  'Military Payment Certificate':'other',
  'Encased Postage':'encased_postage',
  'Refunding Certificate':'other',
  'Other':'other'
};
const CANONICAL_LABELS = new Set(Object.values(SERIES_TYPE_MAP).concat(['Other']));
const NATIONAL_TITLE_RE = /national bank|charter|national currency/i;
const TITLE_FALLBACK = [
  [/national gold bank/i, 'National Gold Bank Note'],
  [/national bank|national currency|\bcharter\b/i, 'National Bank Note'],
  [/federal reserve bank note/i, 'Federal Reserve Bank Note'],
  [/federal reserve note/i, 'Federal Reserve Note'],
  [/silver certificate/i, 'Silver Certificate'],
  [/gold certificate/i, 'Gold Certificate'],
  [/legal tender/i, 'Legal Tender Note'],
  [/compound interest|interest bearing|treasury note/i, 'Treasury Note'],
  [/demand note/i, 'Demand Note'],
  [/fractional|postage currency/i, 'Fractional Currency'],
  [/confederate/i, 'Confederate Currency'],
  [/military payment|\bmpc\b/i, 'Military Payment Certificate'],
  [/emergency note|hawaii|north africa/i, 'World War II Emergency Note'],
  [/encased postage/i, 'Encased Postage'],
  [/refunding certificate/i, 'Refunding Certificate'],
  [/colonial|continental/i, 'Colonial / Continental Currency'],
  [/obsolete/i, 'Obsolete Currency']
];
function normalizeSeriesType(rawSlug, title) {
  const t = title || '';
  const raw = (rawSlug || '').toLowerCase().trim();
  if (rawSlug && CANONICAL_LABELS.has(rawSlug)) return rawSlug;
  if (raw && SERIES_TYPE_MAP[raw]) return SERIES_TYPE_MAP[raw];
  if (raw && /(^|[-_ ])(\d{4}-)?(first|second|third|fourth|fifth)?[-_ ]?issue[s]?$/.test(raw)) {
    return 'Fractional Currency';
  }
  if (raw && /^\d{4}-issues?$/.test(raw)) return 'Fractional Currency';
  if (raw && /^series-\d+$/.test(raw)) return 'Military Payment Certificate';
  if (raw && STATE_CODES.hasOwnProperty(raw)) {
    return NATIONAL_TITLE_RE.test(t) ? 'National Bank Note' : 'Obsolete Currency';
  }
  for (const [re, label] of TITLE_FALLBACK) {
    if (re.test(t)) return label;
  }
  return 'Other';
}
function deriveTypeClass(canonicalLabel) {
  return TYPE_CLASS_MAP[canonicalLabel] || 'other';
}
function currentCurrencyCategory() {
  try { return new URL(location.href).searchParams.get('currency_category'); }
  catch (e) { return null; }
}
function parseDenomination(title) {
  if (!title) return null;
  let m = title.match(/\$\s?([\d,]+)(?!\d)/);
  if (m) return m[1].replace(/,/g, '');
  m = title.match(/£\s?([\d,]+)(?!\d)/);
  if (m) return '£' + m[1].replace(/,/g, '');
  m = title.match(/(\d{1,3})\s?s\.?\s?[/ ]?\s?(\d{1,2})\s?d\b/i);
  if (m) return m[1] + 's ' + m[2] + 'd';
  m = title.match(/(\d{1,3})\s?(?:s\b|shillings?\b)/i);
  if (m) return m[1] + 's';
  m = title.match(/(\d{1,3})\s?(?:d\b|pence\b|penny\b)/i);
  if (m) return m[1] + 'd';
  m = title.match(/(\d{1,3})\s?pounds?\b/i);
  if (m) return '£' + m[1];
  m = title.match(/(\d{1,3})\s?(?:¢|(?:cents?|c)\b)/i);
  if (m) return m[1];
  m = title.match(/(\d{1,4})\s?dollars?\b/i);
  if (m) return m[1];
  return null;
}
function parseCharter(title) {
  if (!title) return null;
  let m = title.match(CHARTER_RE_CH);
  if (m) return m[1];
  m = title.match(CHARTER_RE_WORD);
  if (m) return m[1];
  return null;
}
function pageCategorySlug() {
  const m = (document.title || '').match(/Heritage Auctions Search,\s*(.+)$/i);
  if (!m) return null;
  return m[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || null;
}
function dateToISO(monAbbr, day, year) {
  const mm = MONTHS[monAbbr];
  if (!mm) return null;
  return year + '-' + String(mm).padStart(2,'0') + '-' + String(day).padStart(2,'0');
}
// v9.7.0: lazy-load aware thumbnail. Returns {thumb, large} with http(s) URLs
// or nulls. NEVER returns a data: URI.
function httpOrNull(u) {
  u = (u || '').trim();
  return /^https?:\/\//i.test(u) ? u : null;
}
function thumbFromImg(im) {
  if (!im) return {thumb: null, large: null, miss: 'noimg'};
  const ds  = httpOrNull(im.getAttribute('data-src'));
  const d2  = httpOrNull(im.getAttribute('data-image2'));
  const src = httpOrNull(im.getAttribute('src')) || httpOrNull(im.src);
  const thumb = ds || src || d2;
  const large = (d2 && d2 !== thumb) ? d2 : null;
  let miss = null;
  if (!thumb) {
    // v9.7.1 diagnostic: what did we find instead of a usable URL?
    const attrs = [...im.attributes].map(function(a){ return a.name; }).join(',');
    miss = (/^data:/.test(im.getAttribute('src') || '') ? 'placeholder:' : 'other:') +
           (im.className || '-') + '|' + attrs.slice(0, 80);
  }
  return {thumb, large, miss};
}
// v9.7.1: locate a row's thumbnail <img> in the CURRENT document by lot link,
// so a re-render between parse and post cannot leave us holding a stale node.
function thumbForLot(source_lot_id, li) {
  const a = document.querySelector('a[href*="/a/' + source_lot_id + '.s"]');
  const cur = (a && (a.closest('li') || a.parentElement)) || li;
  return thumbFromImg(cur && (cur.querySelector('img.thumbnail') || cur.querySelector('img')));
}
function parsePpqEpq(text) {
  const m = (text || '').match(/(PPQ|EPQ)\b/i);
  return m ? m[1].toUpperCase() : null;
}
function parseRow(li) {
  const reasons = [];
  let typeFromPage = false;
  const guardLink = li.querySelector('a[href*="/a/"][href*=".s"]');
  const guardHref = guardLink ? guardLink.getAttribute('href') : '';
  const inPromoBlock = !!li.closest('.other-results, .single-item, .sample-result-holder');
  const promoTracker = /ic4=OtherResults|SampleItem/i.test(guardHref);
  const upcomingText = /Live auction on|Qualify to Bid|Estimate:/i.test(li.textContent || '');
  if (inPromoBlock || promoTracker || (upcomingText && !/Auction Ended/i.test(li.textContent||''))) {
    const sid = guardHref && guardHref.match(/\/a\/(\d+-\d+)\.s/);
    return {skip: true, reason: 'cross_promo_upcoming', source_lot_id: sid ? sid[1] : undefined};
  }
  const link = li.querySelector('a[href*="/a/"][href*=".s"]');
  if (!link) return {skip: true, reason: 'no_lot_link'};
  const href = link.getAttribute('href');
  let url;
  try { url = new URL(href, location.origin); } catch (e) { return {skip:true, reason:'bad_url'}; }
  const pm = url.pathname.match(PATH_RE);
  if (!pm) return {skip: true, reason: 'url_shape'};
  const path_root = pm[1];
  let seg2 = pm[2];
  let size_prefix = null;
  const sp = seg2.match(SIZE_PREFIX_RE);
  if (sp) { size_prefix = sp[1].replace(/-$/,''); seg2 = seg2.slice(sp[1].length); }
  let series_type = seg2 || null;
  // v9.8.3: a type root beats the second segment (colony / sub-type)
  const ROOT_TYPES = { 'colonial-notes':'colonial', 'colonial-currency':'colonial', 'continental-currency':'continental-currency',
                       'confederate-notes':'confederate', 'confederate-currency':'confederate',
                       'obsolete-banknotes':'obsolete', 'obsolete-currency':'obsolete', 'obsolete-notes':'obsolete' };
  if (ROOT_TYPES[path_root]) series_type = ROOT_TYPES[path_root];
  if (!series_type) { series_type = pageCategorySlug(); if (series_type) typeFromPage = true; }
  let state_code = null, state_slug = null;
  if (currentCurrencyCategory() === '3101') {
    state_slug = seg2 || null;
    if (state_slug && STATE_CODES[state_slug]) state_code = STATE_CODES[state_slug];
    series_type = 'national-bank-notes';
    typeFromPage = false;
  }
  const auction_id = pm[4], lot_id = pm[5];
  const source_lot_id = auction_id + '-' + lot_id;
  url.search = '';
  const lot_url = url.toString();
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const text  = clean(li.textContent);
  let title = '';
  const titleEl = li.querySelector('.item-title');
  if (titleEl) title = clean(titleEl.textContent);
  if (!title) {
    const sLinks = [...li.querySelectorAll('a[href*="/a/"][href*=".s"]')];
    for (const a of sLinks) {
      const t = clean(a.textContent);
      if (t.length > title.length) title = t;
    }
  }
  title = title.replace(/\s*\(Total:.*$/,'').replace(/\s*Details\.?$/i,'').replace(/\.$/,'').trim() || null;
  // ---- v9.4.0: was a leftmost bare-year match against the raw title ----
  const sy = parseSeries(title);
  const series_year = sy.year, series_letter = sy.letter;
  // ---- FIX (Bug 7): also catch <digits>-<letter>* suffix stars (e.g. "Fr. 1900-A*",
  // "2152-J*") and the words "star note" / "replacement note". The old pattern
  // (/★|\bFr\.\s*\d+\*|\d+\*\s/) stopped at the first digit run and missed the -letter block.
  const is_star_note = /★/.test(text) ||
                       /\bFr\.?\s*#?\s*\d+[A-Za-z]?(?:-[A-Za-z0-9]+)?\*/i.test(text) ||
                       /\bstar\s+note\b|\breplacement\s+note\b/i.test(text);
  const raw_series_type = series_type;
  const canonical_series_type = normalizeSeriesType(series_type, title);
  const type_class = deriveTypeClass(canonical_series_type);
  series_type = canonical_series_type;
  // v9.5.1: title-based state fallback. Only national/obsolete/colonial lots
  // carry a state; FRN district cities must never be read as one.
  if (!state_code && /National Bank|Obsolete|Colonial/i.test(canonical_series_type || '')) {
    const ts = stateFromTitle(title);
    if (ts) state_code = ts;
  }
  // v9.3.0: a real Fr# wins; otherwise type-gated T/EP capture keys Confederate
  // and Encased Postage lots against catalog_master's native T/EP entries.
  let friedberg_number = parseFriedberg(title);
  if (!friedberg_number && canonical_series_type === 'Confederate Currency') {
    const tm = (title || '').match(/\bT[-. ]?\s?(\d{1,3})\b/i);
    if (tm) friedberg_number = 'T-' + tm[1];
  }
  if (!friedberg_number && (canonical_series_type === 'Encased Postage' ||
      /\bHB-\d/i.test(title || ''))) {
    const em = (title || '').match(/\bEP[- ]?(\d{1,3}[A-Za-z]?)\b/i);
    if (em) friedberg_number = 'EP-' + em[1].toUpperCase();
  }
  const charter_number = parseCharter(title);
  let grading_company = null, grade_raw = null, grade_numeric = null;
  for (const block of li.querySelectorAll('.data-block')) {
    const label = clean(block.querySelector('.title')?.textContent);
    const val   = clean(block.querySelector('strong')?.textContent);
    if (!val) continue;
    if (/^Service$/i.test(label)) {
      const sm2 = val.match(/\b(PMG|PCGS|NGC)\b/);
      if (sm2) grading_company = sm2[1];
    } else if (/^Grade$/i.test(label)) {
      grade_raw = val;
      const gn = val.match(GRADE_NUM_RE);
      if (gn) { const n = parseInt(gn[1],10); if (n>=1 && n<=70) grade_numeric = n; }
    }
  }
  if (!grading_company) {
    const svc = text.match(/Service\s+(PMG|PCGS|NGC)\b/);
    if (svc) grading_company = svc[1];
  }
  let sold_on = null;
  let endedText = clean(li.querySelector('.time-remaining')?.textContent);
  if (!endedText) {
    const cols = [...li.querySelectorAll('.info-columns')]
      .map(c => clean(c.textContent))
      .filter(t => /Auction Ended/i.test(t));
    if (cols.length) endedText = cols.join(' ');
  }
  if (endedText) {
    const sm = endedText.match(SOLD_RE);
    if (sm) sold_on = dateToISO(sm[1], parseInt(sm[2],10), sm[3]);
  }
  let price_realized = null;
  let price_login = false;
  const priceNode = li.querySelector('.bot-price-data');
  let priceSrc = clean(priceNode?.textContent);
  if (!priceSrc) {
    const valEl = li.querySelector('.item-value');
    priceSrc = clean(valEl?.textContent);
  }
  if (priceSrc) {
    if (/Sign-?in|Sign In|Join|Log ?in to view/i.test(priceSrc) && !/\$/.test(priceSrc)) {
      reasons.push('price_login_required');
      price_login = true;
    } else {
      const pp = priceSrc.match(PRICE_RE);
      if (pp) price_realized = parseFloat(pp[1].replace(/,/g,''));
    }
  }
  const denomination = parseDenomination(title);
  if (!sold_on) reasons.push('sold_on_null');
  if (price_realized == null && !price_login) reasons.push('price_null');
  if (!denomination) reasons.push('denomination_null');
  const raw = {
    v: EXTRACTOR_VERSION,
    hv: VERSION,                 // real harvester version for eval vs v9.3.2
    path_root, seg2,
    auction_id, lot_id
  };
  if (size_prefix) raw.size_prefix = size_prefix;
  if (typeFromPage) raw.type_from_page = true;
  if (state_slug && !state_code) raw.state_slug = state_slug;
  if (friedberg_number) raw.fr = friedberg_number;
  if (charter_number) raw.charter = charter_number;
  if (raw_series_type && raw_series_type !== canonical_series_type) raw.series_type_raw = raw_series_type;
  if (!raw_series_type) raw.series_type_fallback = 'title_or_other';
  raw.type_class = type_class;
  raw.ha_path_root = path_root;                                   // v9.8.3
  const swept = currentCurrencyCategory(); if (swept) raw.ha_category = swept;
  // v9.7.0 crumbs (columns/params arrive with the RPC migration + v9.7.1)
  const imgInfo = thumbFromImg(li.querySelector('img.thumbnail') || li.querySelector('img'));
  if (imgInfo.large) raw.image_large = imgInfo.large;
  if (imgInfo.miss) raw.thumb_miss = imgInfo.miss;
  const ppq_epq = parsePpqEpq((title || '') + ' ' + (grade_raw || ''));
  if (ppq_epq) raw.ppq_epq = ppq_epq;
  // v9.4.0 audit crumb: lets you find, in SQL, any lot whose series year still
  // equals its Friedberg base number after this release -- the residual ~506 case.
  if (series_year && friedberg_number &&
      String(series_year) === (friedberg_number.match(/^(\d+)/) || [])[1]) {
    raw.series_eq_fr = true;
  }
  if (reasons.length) raw.parse_warn = reasons.join('|');
  if (reasons.length) return {skip: true, reason: reasons.join('|'), source_lot_id,
                              price_login, sold_on, title};
  return {
    skip: false,
    sold_on: sold_on,
    title: title,
    payload: {
      p_source_lot_id: source_lot_id,
      p_lot_url: lot_url,
      p_title: title,
      p_series_type: series_type,
      p_sold_on: sold_on,
      p_price_realized: price_realized,
      p_denomination: denomination,
      p_is_star_note: is_star_note,
      p_grading_company: grading_company,
      p_grade_raw: grade_raw,
      p_grade_numeric: grade_numeric,
      p_auction_event_id: auction_id,
      p_series_year: series_year,
      p_series_letter: series_letter,
      p_state_code: state_code,
      p_friedberg_number: friedberg_number,
      p_charter_number: charter_number,
      p_thumbnail_url: imgInfo.thumb,   // v9.7.0: data-src aware, never a data: URI
      p_raw: raw
    }
  };
}
function findRows() {
  const links = [...document.querySelectorAll('a[href*="/a/"][href*=".s"]')];
  const seen = new Set();
  const rows = [];
  for (const a of links) {
    let li = a.closest('li') || a.parentElement;
    if (!li || seen.has(li)) continue;
    seen.add(li);
    rows.push(li);
  }
  return rows;
}
    /* =====================================================================
     *  ENGINE -- from Heritage Coin Harvester v1.4.12. UNCHANGED in v9.4.0.
     * ===================================================================== */
    // MessageChannel is NOT subject to background tab timer clamping
    const sleep = ms => new Promise(function(r){
      if (!ms){ const c = new MessageChannel(); c.port1.onmessage = function(){ r(); }; c.port2.postMessage(0); return; }
      setTimeout(r, ms);
    });
    const el = id => document.getElementById(id);
    // v9.8.2: this tab's identity, kept in sessionStorage so it survives the
    // script's own page navigations but is unique per tab.
    const TAB_ID = (function(){ try { let t = sessionStorage.getItem('cch9_tab'); if (!t){ t = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('cch9_tab', t); } return t; } catch(e){ return 'x' + Date.now(); } })();
    let loopActive = false;
    function ownsRun(){ return !st.owner || st.owner === TAB_ID; }
    function claimRun(){ st.owner = TAB_ID; }
    function FRESH(){ return { mode:'idle', running:false, i:0, slices:[], cutoff:'', expect:0, owner:null,
      ps:PER_PAGE_DEFAULT, delay:PAGE_DELAY_S, sliceOldest:null, sliceHitCap:false, gaps:[], msg:'', errs:[], plan:null,
      stats:{pages:0,seen:0,new:0,upd:0,rej:0,skip:0,err:0} }; }
    let st = load();
    function load(){ try { const o = Object.assign(FRESH(), JSON.parse(localStorage.getItem(LS_KEY)));
                           if (!o.errs) o.errs = []; if (!o.gaps) o.gaps = []; return o; }
                    catch(e){ return FRESH(); } }
    function save(){ try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch(e){} }
    function logErr(m){
      st.errs.unshift(String(m).slice(0,180));
      if (st.errs.length > 5) st.errs.length = 5;
    }
    // v9.6.0: the key placeholder must be replaced before any write mode runs.
    function keyMissing(){ return HARVEST_KEY.indexOf('hk_') !== 0; }
    /* ---------- URL ---------- */
    function P(n){ return new URL(location.href).searchParams.get(n) || ''; }
    function curPage(){ const m = /^(\d+)~(\d+)$/.exec(P('page')); return m ? parseInt(m[2],10) : 1; }
    function withPage(n){ const u = new URL(location.href); u.searchParams.set('page', pageSize()+'~'+n); return u.toString(); }
    function sliceUrl(cat, sb, page, year, atype){
      const u = new URL(location.href);
      u.searchParams.set('dept', '2021'); u.searchParams.set('mode', 'archive');
      u.searchParams.set('currency_category', cat);
      u.searchParams.set('sb', sb);
      u.searchParams.set('layout','list');
      u.searchParams.set('page', pageSize()+'~'+page);
      if (year) u.searchParams.set('auction_year', String(year)); else u.searchParams.delete('auction_year');   // v9.8.0
      if (atype) u.searchParams.set('auction_type', String(atype)); else u.searchParams.delete('auction_type');
      u.searchParams.delete('ic4');
      return u.toString();
    }
    function curSlice(){ return (st.mode === 'sweep' && st.slices[st.i]) ? st.slices[st.i] : null; }
    function sliceLabel(){
      const s = curSlice();
      if (s) return 'cat ' + s.cat + (s.year ? ' ' + s.year : '') + (s.atype ? ' ' + (AUCTION_TYPES[s.atype] || s.atype) : '') +
        ' ' + (s.year ? (s.sb === SORT_DESC ? 'desc' : 'asc') : s.phase) +
        (s.endDate && !s.year ? ' (end ' + s.endDate + ')' : '');
      return 'cat ' + (currentCurrencyCategory() || '?') + ' sb ' + (P('sb') || '?');
    }
    /* ---------- RPC (v9.6.0: through ingest-proxy, private key header) ---------- */
    async function postOnce(payload){
      const r = await fetch(RPC_URL, { method:'POST',
        headers:{ 'Content-Type':'application/json', 'x-harvest-key': HARVEST_KEY },
        body: JSON.stringify(payload) });
      const t = await r.text();
      if (!r.ok){ const e = new Error(r.status + ' ' + t.slice(0,180)); e.status = r.status; throw e; }
      return t.replace(/^"|"$/g, '');
    }
    // v9.3.0: single retry on transient failures only (network, 5xx, 429).
    // 4xx rejects, breaker trips and 401 key rejections are NEVER retried.
    async function post(payload){
      try { return await postOnce(payload); }
      catch(e){
        const transient = !e.status || e.status >= 500 || e.status === 429;
        const breaker = /circuit breaker|ingest_guard/i.test(String(e.message || e));
        if (!transient || breaker || e.status === 401) throw e;
        await sleep(400);
        return await postOnce(payload);
      }
    }
    /* ---------- wait for rows instead of a fixed delay ---------- */
    function waitForRows(){
      return new Promise(function(res){
        const t0 = Date.now();
        (function poll(){
          if (findRows().length) return res(true);
          if (Date.now() - t0 > ROW_WAIT) return res(false);
          setTimeout(poll, POLL_MS);
        })();
      });
    }
    /* ---------- one page ---------- */
    const POST_WORKERS = 4;   // v9.3.0: pooled posts per page
    async function processPage(dry){
      const rows = findRows();
      const r = { seen:0, ins:0, upd:0, rej:0, skip:0, err:0, noPrice:0,
                  newest:null, oldest:null, breaker:false };
      // phase 1: parse every row (sequential, cheap)
      const queue = [];
      for (let i = 0; i < rows.length; i++){
        const p = parseRow(rows[i]);
        // promo / upcoming rows are not part of the sold result set at all
        if (p.skip && (p.reason === 'cross_promo_upcoming' || p.reason === 'no_lot_link' ||
                       p.reason === 'bad_url' || p.reason === 'url_shape')){
          r.skip++; continue;
        }
        r.seen++;
        if (p.skip){
          r.rej++;
          if (p.price_login) r.noPrice++;
          else logErr('REJ ' + p.reason + ' :: ' + (p.title || p.source_lot_id || '').slice(0,70));
          continue;
        }
        if (p.sold_on){
          if (!r.newest || p.sold_on > r.newest) r.newest = p.sold_on;
          if (!r.oldest || p.sold_on < r.oldest) r.oldest = p.sold_on;
        }
        if (dry){ r.skip++; continue; }
        p.payload._li = rows[i];          // v9.7.1: for the thumbnail retry; stripped before post
        queue.push(p.payload);
      }
      if (dry || !queue.length) return r;
      // v9.7.1: deferred re-read for rows that parsed without a usable image.
      const missing = queue.filter(function(q){ return !q.p_thumbnail_url; });
      if (missing.length){
        await sleep(THUMB_RETRY_MS);
        let healed = 0;
        for (const q of missing){
          const t = thumbForLot(q.p_source_lot_id, q._li);
          if (t.thumb){
            q.p_thumbnail_url = t.thumb;
            if (t.large) q.p_raw.image_large = t.large;
            q.p_raw.thumb_retry = 'healed';
            delete q.p_raw.thumb_miss;
            healed++;
          } else {
            q.p_raw.thumb_retry = 'still_missing';
            if (t.miss) q.p_raw.thumb_miss = t.miss;
          }
        }
        r.thumbMissing = missing.length; r.thumbHealed = healed;
      }
      for (const q of queue) delete q._li;
      // phase 2: pooled posts. ingest_heritage_lot returns 'ins:'/'upd:'
      // (verified live 2026-08-12), so the top-up whole-page stop is exact.
      let cursor = 0;
      async function worker(){
        while (true){
          if (r.breaker) return;
          const i = cursor++;
          if (i >= queue.length) return;
          try {
            const out = await post(queue[i]);
            if (/^upd/.test(out)) r.upd++; else r.ins++;
          } catch(e){
            const msg = String(e.message || e);
            if (/circuit breaker|ingest_guard/i.test(msg)){
              // systemic unknown-Fr flood: the DB's stub breaker is protecting
              // the catalog. STOP the run; do not grind through more pages.
              r.breaker = true;
              logErr('BREAKER ' + msg);
              return;
            }
            if (e.status === 401){
              // v9.6.0: missing/unknown/revoked harvest key. Every subsequent
              // post would fail identically - stop like a breaker.
              r.breaker = true;
              logErr('KEY REJECTED (401) - check HARVEST_KEY. Run stopped.');
              return;
            }
            const isReject = /reject:/.test(msg);
            if (isReject) r.rej++; else r.err++;
            logErr((isReject ? 'REJ ' : 'ERR ') + msg + ' :: lot ' + queue[i].p_source_lot_id);
          }
          await sleep(ROW_PAUSE);
        }
      }
      const ws = [];
      for (let w = 0; w < Math.min(POST_WORKERS, queue.length); w++) ws.push(worker());
      await Promise.all(ws);
      return r;
    }
    function tally(r){
      const s = st.stats;
      s.pages++; s.seen += r.seen; s.new += r.ins; s.upd += r.upd;
      s.rej += r.rej; s.skip += r.skip; s.err += r.err;
    }
    /* ---------- run control ---------- */
    function finish(msg){
      st.running = false; st.expect = 0;
      st.msg = 'RUN COMPLETE (' + msg + ')';
      save(); paint();
    }
    function closeSlice(){
      // leaving a HARVEST slice: compare how far back we got vs the probed end date
      const s = curSlice();
      if (s && s.phase === 'harvest' && s.endDate && st.sliceOldest && st.sliceOldest > s.endDate){
        // v9.8.0: a year slice only counts as a gap when it actually hit the result cap,
        // and not when an oldest-first twin slice follows to cover the other end.
        const nx = st.slices[st.i + 1];
        const twin = !!(nx && s.year && nx.year === s.year && nx.cat === s.cat && nx.atype === s.atype && nx.sb !== s.sb && (s.expected || 0) <= 2 * HA_RESULT_CAP);
        if (!s.year || (st.sliceHitCap && !twin)){
          const g = 'GAP ' + sliceLabel() + ': harvested to ' + st.sliceOldest + ', floor ' + s.endDate;
          if (st.gaps.indexOf(g) === -1) st.gaps.push(g);
        }
      }
      st.sliceOldest = null; st.sliceHitCap = false;
    }
    // v9.7.4: paced navigation - every page load goes through here.
    function goTo(url, label){
      loopActive = true; navScheduled = true;            // v9.8.2: hold the lock across the pause; the navigation ends it
      const base = Math.max(1, parseFloat(st.delay) || PAGE_DELAY_S);
      const waitMs = Math.round(base * 1000 * (0.75 + Math.random() * 0.5));
      let left = Math.round(waitMs / 1000);
      st.msg = (label || 'next page') + ' in ~' + left + 's ...'; save(); paint();
      const tick2 = setInterval(function(){
        if (!st.running){ clearInterval(tick2); loopActive = false; st.msg = 'stopped during pause'; save(); paint(); return; }
        left--; st.msg = (label || 'next page') + ' in ~' + Math.max(0, left) + 's ...'; paint();
      }, 1000);
      setTimeout(function(){
        clearInterval(tick2);
        if (!st.running){ loopActive = false; return; }
        location.href = url;
      }, waitMs);
    }
    function nextSlice(reason){
      closeSlice();
      st.i++;
      if (st.i >= st.slices.length) return finish('sweep finished all ' + st.slices.length + ' slices' +
        (st.gaps.length ? ' - ' + st.gaps.length + ' GAPS, see panel' : ''));
      const s = st.slices[st.i];
      st.expect = 1;
      st.msg = 'slice ' + (st.i+1) + '/' + st.slices.length + ' -> cat ' + s.cat + ' ' + s.phase +
               '  (' + reason + ')';
      save();
      goTo(sliceUrl(s.cat, s.sb, 1, s.year, s.atype), 'slice ' + (st.i+1));
    }
    async function tick(){
      if (!st.running) return;
      if (!ownsRun()){ st.msg = 'run owned by another tab - press Resume here to claim it'; paint(); return; }   // v9.8.2
      if (loopActive){ st.msg = 'already running in this tab (Resume ignored)'; paint(); return; }
      loopActive = true; navScheduled = false;
      try { await tickInner(); } finally { if (!navScheduled) loopActive = false; }
    }
    let navScheduled = false;
    async function tickInner(){
      const got = await waitForRows();
      const page = curPage();
      if (st.expect && page < st.expect){
        return st.mode === 'sweep'
          ? nextSlice('page did not advance (' + page + ' < ' + st.expect + ') - likely result cap')
          : finish('page did not advance (' + page + ' < ' + st.expect + ')');
      }
      st.msg = 'working page ' + page + ' ... ' + sliceLabel(); paint();
      // page-size calibration: configured >50 but Heritage served exactly 50 on page 1
      if (page === 1 && st.ps > 50){
        const rowsNow = findRows().length;
        if (rowsNow === 50){
          st.msg = 'Heritage ignored page size ' + st.ps + ' - auto-corrected to 50';
          st.ps = 50; save(); paint();
        }
      }
      const r = await processPage(false);
      tally(r); save(); paint();
      if (r.breaker)
        return finish('STOPPED - circuit breaker or key rejection. See error panel before resuming.');
      if (r.seen && r.noPrice === r.seen)
        return finish('prices hidden - sign in to Heritage again');
      if (!r.seen){
        if (!got){
          if (st.mode === 'sweep') return nextSlice('rows never rendered on page ' + page);
          // v9.7.4: a challenge/interstitial renders no rows - pause, don't finish
          st.running = false;
          st.msg = 'HERITAGE CHECK? rows never rendered on page ' + page + ' - pass any verification in this tab, then press Resume.';
          save(); paint(); return;
        }
        // v9.7.3: rows rendered but every one was skipped (e.g. a World Currency
        // sale's page) - keep walking while the pager offers a next page.
        const nextLink = !!document.querySelector('a[href*="page=' + pageSize() + '~' + (page + 1) + '"]');
        if (st.mode === 'topup' && r.skip > 0 && nextLink){
          st.msg = 'page ' + page + ': all ' + r.skip + ' rows non-US/promo - skipping ahead'; paint();
          st.expect = page + 1; save();
          return goTo(withPage(page + 1), 'skipping to page ' + (page + 1));
        }
        return st.mode === 'sweep'
          ? nextSlice('empty slice ' + sliceLabel())
          : finish('no rows on page ' + page);
      }
      const s = curSlice();
      if (st.mode === 'sweep' && s){
        if (r.oldest && (!st.sliceOldest || r.oldest < st.sliceOldest)) st.sliceOldest = r.oldest;
        if (s.phase === 'probe'){
          // one oldest-first page: its oldest sold_on is the category's true end date
          s.endDate = r.oldest || null;
          const nx = st.slices[st.i + 1];
          if (nx && nx.cat === s.cat && nx.phase === 'harvest') nx.endDate = s.endDate;
          st.sliceOldest = null;
          return nextSlice('probe done - end date ' + (s.endDate || 'unknown'));
        }
      }
      if (st.mode === 'topup'){
        // v9.7.2: a stop-at date overrides the known-page stop, so gaps get crossed.
        if (!st.cutoff && r.upd === r.seen && r.upd > 0) return finish('whole page already harvested');
        if (st.cutoff && r.newest && r.newest <= st.cutoff) return finish('reached cutoff ' + st.cutoff);
      }
      // v9.7.1: trust the pager, not r.seen (which excludes skipped promo rows)
      const hasNext = !!document.querySelector('a[href*="page=' + pageSize() + '~' + (page + 1) + '"]');
      if (st.mode === 'sweep' && page >= HA_PAGE_CAP){                     // v9.8.0: result cap
        st.sliceHitCap = true; save();
        return nextSlice('result cap at page ' + page);
      }
      if (!hasNext && r.seen < pageSize())
        return st.mode === 'sweep' ? nextSlice('slice complete') : finish('last page');
      st.expect = page + 1; save();
      goTo(withPage(page + 1), 'page ' + (page + 1));
    }
    /* ---------- start modes ---------- */
    /* ---------- v9.8.0 AUTO-SLICER ---------- */
    function planYears(){ const y = []; for (let k = new Date().getFullYear(); k >= PLAN_YEAR_FROM; k--) y.push(k); return y; }
    // v9.8.1: facet JSON for a filter set. Returns { years:{Y:n}, types:{id:n}, total:n }.
    async function probeFacets(cat, year){
      const q = new URLSearchParams({ dept:'2021', mode:'archive', layout:'list', currency_category:String(cat) });
      if (year) q.set('auction_year', String(year));
      const r = await fetch('/c/webservices/search/guided-navigation-archive.zx?' + q.toString(), { credentials:'include' });
      if (r.status === 403 || r.status === 429 || r.status === 503) throw Object.assign(new Error('probe HTTP ' + r.status), { botCheck:true });
      const text = await r.text();
      if (/Just a moment|Verifying Website Traffic|challenge-platform|<html/i.test(text.slice(0, 300))) throw Object.assign(new Error('probe BOT CHECK'), { botCheck:true });
      let j; try { j = JSON.parse(text); } catch(e){ throw new Error('probe: facet JSON unparsable'); }
      const facets = (j && j.facets) || [];
      const pick = function(field){ const f = facets.find(function(x){ return x.field === field; }); return (f && f.data) || []; };
      const out = { years:{}, types:{}, total:0 };
      pick('auction_year').forEach(function(d){ out.years[String(d.value)] = d.count || 0; });
      pick('auction_type').forEach(function(d){ out.types[String(d.value)] = d.count || 0; });
      const cc = pick('currency_category').find(function(d){ return String(d.value) === String(cat); });
      out.total = cc ? (cc.count || 0) : (pick('dept')[0] ? pick('dept')[0].count || 0 : 0);
      return out;
    }
    function startPlan(cats){
      const pending = cats.map(function(c){ return { cat:c, year:null }; });
      st = Object.assign(FRESH(), { mode:'plan', running:true, expect:0, owner:TAB_ID,
            delay: parseFloat(el('cch9-delay').value) || PAGE_DELAY_S,
            ps: parseInt((el('cch9-ps')||{}).value,10) || PER_PAGE_DEFAULT,
            plan: { cats:cats, pending:pending, k:0, counts:{}, notes:[] },
            msg:'planning: ' + cats.length + ' category probes ...' });
      save(); paint(); planLoop();
    }
    let planBusy = false;
    async function planLoop(){
      if (!ownsRun()){ st.msg = 'run owned by another tab - press Resume here to claim it'; paint(); return; }   // v9.8.2
      if (planBusy) return; planBusy = true;
      try {
        const P = st.plan;
        while (st.running && st.mode === 'plan' && P.k < P.pending.length){
          const pr = P.pending[P.k];
          st.msg = 'plan probe ' + (P.k+1) + '/' + P.pending.length + ': cat ' + pr.cat + (pr.year ? ' ' + pr.year + ' by auction type' : ' by year') + ' ...'; paint();
          let f = null;
          try { f = await probeFacets(pr.cat, pr.year); }
          catch(e){
            if (e.botCheck){ st.running = false; st.msg = 'HERITAGE CHECK during planning - reload this tab, pass the verification, then press Resume (plan continues at probe ' + (P.k+1) + ').'; save(); paint(); return; }
            logErr('PROBE cat ' + pr.cat + (pr.year ? ' ' + pr.year : '') + ' ' + String(e.message || e).slice(0,100)); st.stats.err++;
          }
          if (f && !pr.year){
            planYears().forEach(function(y){
              const n = f.years[String(y)] || 0;
              P.counts[pr.cat + '|' + y + '|'] = n;
              if (n > 2 * HA_RESULT_CAP) P.pending.push({ cat:pr.cat, year:y });     // needs the auction_type split
            });
            P.counts[pr.cat + '|total'] = f.total;
          } else if (f && pr.year){
            Object.keys(AUCTION_TYPES).forEach(function(at){ P.counts[pr.cat + '|' + pr.year + '|' + at] = f.types[at] || 0; });
          } else if (!pr.year){
            planYears().forEach(function(y){ P.counts[pr.cat + '|' + y + '|'] = null; });
          }
          P.k++; save(); paint();
          if (P.k < P.pending.length){
            const base = Math.max(1, parseFloat(st.delay) || PAGE_DELAY_S);
            await sleep(Math.round(base * 1000 * (0.75 + Math.random() * 0.5)));
          }
        }
        if (st.running && st.mode === 'plan' && P.k >= P.pending.length) finalizePlan();
      } finally { planBusy = false; }
    }
    function finalizePlan(){
      const P = st.plan, slices = [];
      let lots = 0;
      P.cats.forEach(function(c){
        planYears().forEach(function(y){
          const n = P.counts[c + '|' + y + '|'];
          if (n == null) { P.notes.push('cat ' + c + ' ' + y + ': probe failed - not planned'); return; }
          if (n === 0) return;
          const add = function(atype, m){
            lots += m;
            const floor = y + '-01-01';
            slices.push({ cat:c, sb:SORT_DESC, phase:'harvest', year:y, atype:atype, endDate:floor, expected:m });
            if (m > HA_RESULT_CAP) slices.push({ cat:c, sb:SORT_ASC_DEFAULT, phase:'harvest', year:y, atype:atype, endDate:null, expected:m });
            if (m > 2 * HA_RESULT_CAP) P.notes.push('cat ' + c + ' ' + y + (atype ? ' ' + AUCTION_TYPES[atype] : '') + ': ' + m + ' lots exceeds 2x cap - middle unreachable');
          };
          if (n <= 2 * HA_RESULT_CAP) add(null, n);
          else Object.keys(AUCTION_TYPES).forEach(function(at){
            const m = P.counts[c + '|' + y + '|' + at];
            if (m == null) { P.notes.push('cat ' + c + ' ' + y + ' ' + AUCTION_TYPES[at] + ': probe failed - not planned'); return; }
            if (m > 0) add(at, m);
          });
        });
      });
      P.notes.forEach(function(n){ if (st.gaps.indexOf('PLAN ' + n) === -1) st.gaps.push('PLAN ' + n); });
      if (!slices.length){ return finish('plan found no lots for ' + P.cats.join(',')); }
      st.mode = 'sweep'; st.slices = slices; st.i = 0; st.expect = 1; st.sliceOldest = null; st.sliceHitCap = false;
      st.msg = 'plan done: ' + slices.length + ' slices, ~' + lots.toLocaleString() + ' lots - starting';
      save(); paint();
      const s0 = slices[0];
      goTo(sliceUrl(s0.cat, s0.sb, 1, s0.year, s0.atype), 'slice 1/' + slices.length);
    }
    function buildSweep(){
      if (keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not sweep.'; return paint(); }
      const catsRaw = el('cch9-cats').value.trim();
      const cats = catsRaw.split(/[\s,]+/).filter(function(c){ return /^\d+$/.test(c); });
      if (!cats.length){ st.msg = 'enter at least one numeric currency_category id'; return paint(); }
      if (el('cch9-auto').checked) return startPlan(cats);                 // v9.8.0
      const ascSb = el('cch9-ascsb').value.trim() || SORT_ASC_DEFAULT;
      const probe = el('cch9-probe').checked;
      const slices = [];
      cats.forEach(function(c){
        if (probe) slices.push({ cat:c, sb:ascSb, phase:'probe', endDate:null });
        slices.push({ cat:c, sb:SORT_DESC, phase:'harvest',
                      endDate:null });
      });
      // harvest slices inherit the probe's end date at runtime via prior slice
      const ps = parseInt((el('cch9-ps')||{}).value,10) || PER_PAGE_DEFAULT;
      st = Object.assign(FRESH(), { mode:'sweep', running:true, i:0, slices:slices, expect:1, ps:ps, owner:TAB_ID,
            msg:'sweep armed: ' + cats.length + ' categories' + (probe ? ' (probe+harvest)' : '') +
            (ps !== 50 ? ' - page size ' + ps + ' (will auto-correct if ignored)' : '') });
      save(); paint();
      location.href = sliceUrl(slices[0].cat, slices[0].sb, 1);
    }
    function startTopUp(){
      if (keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not sweep.'; return paint(); }
      const cut = el('cch9-cut').value.trim();
      if (cut && !/^\d{4}-\d{2}-\d{2}$/.test(cut)){ st.msg = 'cutoff must be YYYY-MM-DD'; return paint(); }
      const u = new URL(location.href);
      if (u.searchParams.get('sb') !== SORT_DESC){
        u.searchParams.set('sb', SORT_DESC); u.searchParams.set('page','50~1');
        st = Object.assign(FRESH(), { mode:'topup', running:true, cutoff:cut, expect:1, owner:TAB_ID,
              ps: parseInt((el('cch9-ps')||{}).value,10) || PER_PAGE_DEFAULT,
              msg:'top up: forcing newest-first' });
        save(); return (location.href = u.toString());
      }
      st = Object.assign(FRESH(), { mode:'topup', running:true, cutoff:cut, expect:curPage(), owner:TAB_ID,
            ps: parseInt((el('cch9-ps')||{}).value,10) || PER_PAGE_DEFAULT,
            msg:'top up started' + (cut ? ' - stop at ' + cut : '') });
      save(); paint(); tick();
    }
    async function onePage(dry){
      if (!dry && keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not sweep.'; return paint(); }
      st.msg = dry ? 'dry run ...' : 'single page ...'; paint();
      await waitForRows();
      const r = await processPage(dry);
      tally(r); st.msg = (dry ? 'DRY RUN' : 'PAGE') + ' page ' + curPage() +
        ' - seen ' + r.seen + ' - new ' + r.ins + ' - upd ' + r.upd + ' - rej ' + r.rej +
        ' - skip ' + r.skip + ' - err ' + r.err +
        (r.thumbMissing ? ' - thumbs missing ' + r.thumbMissing + ' healed ' + (r.thumbHealed || 0) : '') +
        (r.newest ? ' - newest ' + r.newest + ' oldest ' + r.oldest : '');
      save(); paint();
    }
    /* ---------- panel ---------- */
    function paint(){
      if (!el('cch9-panel')) return;
      const s = st.stats;
      el('cch9-slice').textContent = 'cat ' + (currentCurrencyCategory() || '-') +
        '  sb ' + (P('sb') || '-') + '  ' + sliceLabel();
      el('cch9-mode').textContent = 'mode ' + st.mode + ' ' + (st.running ? 'RUNNING' : 'idle') +
        '  page ' + curPage() +
        '  rows ' + findRows().length +
        '  key:' + (keyMissing() ? 'MISSING' : 'set') +
        '  delay:' + (parseFloat(st.delay) || PAGE_DELAY_S) + 's' +
        (st.running && !ownsRun() ? '  [OTHER TAB]' : '') +
        (st.mode === 'sweep' && st.slices.length ? '  slice ' + (st.i+1) + '/' + st.slices.length : '') +
        (st.mode === 'plan' && st.plan ? '  probe ' + st.plan.k + '/' + st.plan.pending.length : '');
      el('cch9-msg').textContent = st.msg || '';
      el('cch9-stats').textContent = 'pages ' + s.pages + ' - seen ' + s.seen + ' - new ' + s.new +
        ' - upd ' + s.upd + ' - rej ' + s.rej + ' - skip ' + s.skip + ' - err ' + s.err;
      el('cch9-gaps').textContent = (st.gaps && st.gaps.length) ? st.gaps.join('\n') : '';
      el('cch9-errs').textContent = (st.errs && st.errs.length) ? st.errs.join('\n') : '';
    }
    function buildPanel(){
      if (el('cch9-panel')) return;
      const css = document.createElement('style');
      css.textContent = '#cch9-panel{position:fixed;left:10px;bottom:10px;z-index:2147483647;' +
        'background:#0b3d2e;color:#e6e6e6;font:12px/1.45 Menlo,Consolas,monospace;padding:10px 12px;' +
        'border:1px solid #2f6b57;border-radius:8px;width:330px;box-shadow:0 6px 20px rgba(0,0,0,.5)}' +
        '#cch9-panel .hd{color:#fff;font-weight:700;margin-bottom:4px}' +
        '#cch9-panel .ln{color:#8ef0c7}' +
        '#cch9-msg{margin:6px 0;padding:4px 6px;background:#06251b;border-radius:4px;color:#ffd479;min-height:16px;word-break:break-word}' +
        '#cch9-panel .row{margin:5px 0}' +
        '#cch9-panel input{background:#06251b;color:#e6e6e6;border:1px solid #2f6b57;border-radius:3px;padding:1px 4px}' +
        '#cch9-panel button{background:#123c30;color:#e6e6e6;border:1px solid #3c7a63;border-radius:4px;' +
        'padding:3px 7px;margin:2px 3px 2px 0;cursor:pointer}' +
        '#cch9-panel button:hover{background:#1a5442}' +
        '#cch9-panel label{margin-right:6px;white-space:nowrap}' +
        '#cch9-stats{color:#8ee08e;margin-top:6px}' +
        '#cch9-gaps{color:#ffd479;margin-top:4px;white-space:pre-wrap;word-break:break-word;max-height:60px;overflow:auto}' +
        '#cch9-errs{color:#ff8f8f;margin-top:4px;white-space:pre-wrap;word-break:break-word;max-height:96px;overflow:auto}';
      document.head.appendChild(css);
      const p = document.createElement('div');
      p.id = 'cch9-panel';
      p.innerHTML =
        '<div class="hd">Currency Harvester v' + VERSION + '</div>' +
        '<div class="ln" id="cch9-slice"></div>' +
        '<div class="ln" id="cch9-mode"></div>' +
        '<div id="cch9-msg"></div>' +
        '<div class="row">SWEEP cats <input id="cch9-cats" size="18" placeholder="3101, 3102, ..."> pg <input id="cch9-ps" size="3" value="' + PER_PAGE_DEFAULT + '" title="Rows per page. 50 is verified; try 72 or 100 - if Heritage ignores it the harvester auto-corrects on page 1"></div>' +
        '<div class="row"><label title="Read one oldest-first page per category to learn its true end date before harvesting newest-first">' +
        '<input type="checkbox" id="cch9-probe" checked>probe end date</label>' +
        ' old sb <input id="cch9-ascsb" size="2" value="' + SORT_ASC_DEFAULT + '" ' +
        'title="Heritage sort code for oldest-first. Verify: pick End Date - Oldest in Heritage&#39;s sort dropdown and read sb= from the URL"></div>' +
        '<div class="row"><button id="cch9-build">Build + Start Sweep</button> ' +
        '<label title="v9.8.0: probe each category by auction year and build slices that fit under Heritage\'s 5,000-result cap; off = legacy probe/harvest slices"><input type="checkbox" id="cch9-auto" checked>auto-slice by year</label></div>' +
        '<div class="row">TOP UP stop at <input id="cch9-cut" size="10" placeholder="YYYY-MM-DD"> ' +
        ' delay s <input id="cch9-delay" size="3" value="' + PAGE_DELAY_S + '" title="Pause before each page load (+/-25% jitter). Raise if Heritage challenges."></div>' +
        '<div class="row"><button id="cch9-topup">Start Top Up</button></div>' +
        '<div class="row"><button id="cch9-dry">Dry Run</button><button id="cch9-page">Page</button>' +
        '<button id="cch9-resume">Resume</button><button id="cch9-stop">Stop</button>' +
        '<button id="cch9-reset">Reset</button></div>' +
        '<div id="cch9-stats"></div>' +
        '<div id="cch9-gaps"></div>' +
        '<div id="cch9-errs"></div>';
      document.body.appendChild(p);
      el('cch9-cats').value = currentCurrencyCategory() || '';
      el('cch9-build').onclick  = buildSweep;
      el('cch9-topup').onclick  = startTopUp;
      el('cch9-dry').onclick    = function(){ onePage(true); };
      el('cch9-page').onclick   = function(){ onePage(false); };
      el('cch9-resume').onclick = function(){ claimRun(); st.running = true; st.msg = 'resumed'; save(); paint();
        if (st.mode === 'plan') planLoop(); else tick(); };
      el('cch9-stop').onclick   = function(){ st.running = false; st.msg = 'stopped by user'; save(); paint(); };
      // v9.7.4: persist the delay on edit so Resume / auto-resume honor it
      if (st.delay) el('cch9-delay').value = st.delay;
      el('cch9-delay').addEventListener('input', function(){ const v = parseFloat(this.value); if (v >= 1){ st.delay = v; save(); paint(); } });
      el('cch9-reset').onclick  = function(){ localStorage.removeItem(LS_KEY); st = FRESH();
                                              st.msg = 'state cleared'; paint(); };
    }
    /* ---------- boot ---------- */
    function boot(){
      buildPanel(); paint();
      const tf = seriesSelfTest('cch9.6');
      if (tf){ st.msg = 'SERIES SELF-TEST FAILED (' + tf + ') - see console. Do not sweep.'; paint(); }
      else if (keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not sweep.'; paint(); }
      if (st.running && st.mode === 'plan'){ paint(); planLoop(); }                     // v9.8.0
      else if (st.running){ waitForRows().then(function(){ paint(); tick(); }); }
      else { waitForRows().then(paint); setTimeout(paint, 1200); setTimeout(paint, 3000); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
/* =====================================================================
 * COMPANION SERVER-SIDE GUARD - NOT APPLIED, recommended.
 *
 * A harvester bug should not be able to write a value the database can
 * plainly see is wrong. Add to ingest_heritage_lot (and the Stack's and
 * eBay RPCs) before the INSERT:
 *
 *   IF p_series_year IS NOT NULL
 *      AND p_friedberg_number IS NOT NULL
 *      AND p_series_year::text = public.fr_base_canon(p_friedberg_number) THEN
 *     RAISE EXCEPTION 'reject: series_year (%) equals friedberg base number, probable parse error', p_series_year;
 *   END IF;
 *
 * This would have caught the original bug on day one, and it caps the
 * residual ~506 title-unparseable cases at zero. Rejects surface in this
 * harvester's own error panel, so they are visible rather than silent.
 *
 * STILL OUTSTANDING (separate work):
 *   * The Stack's Bowers harvester has the SAME class of bug but a
 *     different regex - it is the only source producing series letters
 *     past E (480 rows) and years in the 1600-1799 range (421 rows),
 *     neither of which this Heritage pattern can emit. 3,084 corrupt rows.
 *   * lots_currency.series_year / series_letter still hold the 42,548
 *     historical bad rows. This release stops new ones; it repairs none.
 *     See sql/PROPOSED_backfill_series_year_letter.sql.
 * ===================================================================== */
