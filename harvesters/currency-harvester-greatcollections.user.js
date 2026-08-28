// ==UserScript==
// @name         Currency Comp Harvester — GreatCollections v1.0.13
// @namespace    jdmstrategy.currency-comps
// @version      1.0.13
// @description  Family-engine harvester for the GreatCollections Auction Archive -> ingest_greatcollections_lot via ingest-proxy. Leaf-category sweep + recent-sales top-up. Shares its series/Friedberg parser byte-for-byte with the Heritage and Stack's harvesters.
// @match        https://www.greatcollections.com/Auction-Archive/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
// v1.0.13 (2026-08-28): AUDIT MODE - read-only coverage check. NO writes,
//   no key required. Answers "how many sold lots does GC list for each
//   leaf vs. how many we've saved" precisely, by LOT ID rather than a
//   fuzzy count/classifier match.
//   HOW: click Audit from a category root (e.g. National Banknotes). It
//   walks the same leaf tree a Full Sweep would (collectChildLinks), but on
//   each leaf it WAITS for the async history grid, then records into a
//   separate localStorage key (gch1_audit): GC's printed "has sold N"
//   count, the count of sold rows the grid actually rendered, and EVERY
//   sold /Coin/<id> on the leaf. It never posts to the ingest proxy. The
//   ledger is ignored (every leaf is visited). A per-leaf mismatch between
//   GC's printed N and the rendered grid count is flagged in the error
//   panel (usually means the grid was still loading - raise delay).
//   EXPORT: "Export audit" copies the collected JSON (leaves + per-leaf
//   sold ids) to the clipboard; paste it back and the DB diff reports
//   exactly which GC lot ids are NOT yet in source_lot_id, grouped by leaf
//   - i.e. the real coverage gap and a re-harvest worklist. "clear audit"
//   drops the recorded data only (harvested rows + leaf ledger untouched).
//   Nothing in the harvest/sweep/top-up path changed; audit is a sibling
//   mode gated on st.mode==='audit'.
// v1.0.12 (2026-08-28): NATIONALS SWEEP GAP - main-pane leaves + parent
//   grids. Two fixes, both additive (upserts dedupe, so worst case is a
//   re-touch that returns 'upd', never a wrong write or a double count).
//   * MAIN-PANE LEAVES. The National tree renders its leaves in TWO places:
//     a sidebar navigation tree AND the main content list (National Gold
//     Bank, First Charter, Red Seals - each with a (N) count). The old
//     collectChildLinks() EXCLUDED the sidebar and returned the rest, but
//     when sidebarEl() mis-scoped the container it excluded the main-pane
//     leaves too - so a Full Sweep queued only the already-swept sidebar
//     tree (Third Charter, 1,036 rows) and silently dropped Gold Bank (7
//     rows in DB), First Charter (~117), Red Seals (4): the ~1,470-lot
//     National gap between our 2,096 and GC's 3,568. Now it collects EVERY
//     counted archive link once (deduped by path), PREFERS the main-pane
//     (non-sidebar) set, and falls back to the full set only if the main
//     pane is empty - so other categories that relied on the old behavior
//     are unaffected.
//   * PARENT GRIDS. A series-list page can ALSO carry a capped sold grid -
//     the National root Dry Run showed 138 sold lots on a page the sweep
//     treated as navigation-only and skipped. The sweep now enqueues
//     children AND harvests the grid whenever gridHasSold() is true (any
//     page). Parent grids are capped (~150) so they are NOT ledger-stamped
//     (only leaf pages are) - the per-leaf sweep still owns full history.
//   No harvest-logic, parser, or write-path change beyond the above; the
//   138-row parent grid and the missing main-pane leaves both flow through
//   the existing RPC. Install and re-run Full Sweep from the National root.
// v1.0.11 (2026-08-28): PANEL LEGIBILITY + STALE-ERROR CLEARING + CUTOFF
//   PERSISTENCE. Three small UI fixes, no harvest-logic change.
//   * LABEL COLOR. The plain-text labels in the panel rows ("delay s",
//     "skip leaves done within ... days", "skip sold before", "details")
//     had no explicit color, so GC's page CSS bled through and rendered
//     them nearly invisible against the dark panel. .row and label now
//     carry an explicit light-blue (#9db8ff, the mode-line color).
//   * STALE ERRORS. The error panel kept showing the last run's rejects /
//     403s indefinitely - five old Cloudflare 403s looked like current
//     problems long after the run moved on. Errors now CLEAR at the start
//     of each new page/leaf (processCurrentPage) and at the start of every
//     Sweep / Top Up / Page / Dry run, so the panel only ever shows the
//     current page's issues. (finish() leaves them up so a stop reason
//     stays visible.)
//   * CUTOFF FIELD PERSISTS. "skip sold before" (YYYY-MM) now saves to run
//     state on edit and is repainted on reload, same as delay / skip-days
//     got in v1.0.10 - so a reload mid-run no longer blanks it.
// v1.0.10 (2026-08-26): RESUME HONORS THE PANEL + RUN LOCK.
//   * "delay s" and "skip leaves done within" were only read by Full Sweep /
//     Top Up / Page. Resume used the value saved at sweep start and the
//     reload repainted the field from it - so editing the delay to 12 and
//     pressing Resume silently ran at 6. Both fields now persist to run
//     state on every edit; the mode line shows the EFFECTIVE delay.
//   * RUN LOCK. After a reload with running:true the script auto-resumes;
//     pressing Resume on top started a SECOND loop on the same leaf: detail
//     counters hopped, every lot detail-fetched twice (doubling request
//     rate under a Cloudflare challenge), and advance() ran twice per page,
//     skipping a leaf each time. Resume / auto-resume now refuse to start
//     while a loop is active ("already running"). Leaves skipped by a
//     double-run were never ledger-stamped, so the next Full Sweep with
//     skip-days on revisits exactly those.
// v1.0.9 (2026-08-26): BOT-CHECK TOLERANCE. GC fronts the site with a
//   Cloudflare "verifying website traffic" interstitial when it sees too
//   much traffic from one IP. Behind it, detail fetches return HTTP 403 and
//   the page has no Sign Out / prices, which the login guard read as
//   "logged out" while the loop kept firing 403s (five in a row on the
//   Small Size sweep) - and continuing is what escalates the block.
//   Now: a 403 (or the interstitial HTML) on a detail fetch backs off
//   DETAIL_403_BACKOFF_MS before the next attempt; DETAIL_403_LIMIT
//   CONSECUTIVE failures PAUSE the run in place with a "GC BOT CHECK"
//   message (pass the verification in this tab, then Resume - same leaf,
//   nothing lost, the failed lots are updn: rows that heal next pass). A
//   successful fetch resets the counter, so a single blip never stops a
//   run. DETAIL_DELAY_MS raised 1500 -> 3000 (+/-25% jitter). Page delay is
//   still the panel field - raise it to 10-15 if GC keeps challenging.
// v1.0.8 (2026-08-25): LEAF LEDGER - never re-harvest a finished leaf by
//   accident. Every leaf that completes cleanly (no price rejects, not
//   paused for login) is stamped with its completion time in a SEPARATE
//   localStorage key (gch1_leaves) that Full Sweep / Reset do NOT clear.
//   Full Sweep gets a "skip leaves done within N days" field (default 30,
//   0 = off): when the queue reaches a leaf stamped inside that window the
//   sweep skips it WITHOUT loading the page (no delay, no navigation) and
//   counts it under "lskip". Why: the Large Size re-sweep visited 744 leaves
//   to find 8 new lots because the crashed run had no record of what it had
//   finished. Now a crash, an accidental Full Sweep, or a partial re-run only
//   costs the leaves that were not recently completed. Top Up is unaffected
//   (its capped recent-sales grids are the point). The ledger is browser-
//   local: a Chrome profile wipe just means one normal sweep to rebuild it.
//   Panel: "clear ledger" button (confirm) for a deliberate full re-harvest.
// v1.0.7 (2026-08-20): SELF-HEALING DETAILS + breadcrumb fix.
//   * The v1/v2 RPC's blanket update clobbered detail data (exact dates,
//     certs) whenever a listing sweep re-touched an already-detailed row -
//     the Large Size re-sweep downgraded 2,904 rows back to month precision.
//     RPC v3 (2026-08-20) now preserves day-precision sold_on and carries
//     cert_number/pedigree/date_precision forward, and returns 'updn:' for
//     updated rows that still lack detail. This script detail-fetches on
//     BOTH 'ins:' and 'updn:', so damaged or never-detailed rows heal
//     organically during any sweep or top-up.
//   * breadcrumbCategory: on leaf pages, exclude the final crumb (the leaf's
//     own Fr title) from the category walk - "Fr. CC-21 ... Continental
//     Currency" was matching itself and polluting raw.gc_category.
// v1.0.6 (2026-08-20): LOGIN GUARD FALSE-POSITIVE FIX. v1.0.5 tested only
//   innerText for "Welcome," - innerText excludes HIDDEN elements, so a
//   collapsed header paused a run even while prices were plainly rendering.
//   loggedOut() now needs ALL THREE to be absent before pausing: a Sign Out
//   link anywhere in the DOM (hidden or not), "Welcome," in textContent, and
//   any price <path> in the sold grid. Prices rendering = logged in, always.
// v1.0.5 (2026-08-20): LOGIN GUARD. The Large Size sweep lost 2,952 of 5,856
//   lots because the GC session EXPIRED mid-run - logged out, GC renders NO
//   price SVGs, and every sold lot rejected "price missing". The harvester
//   now checks for the signed-in header ("Welcome, ...") before harvesting
//   every page: if logged out, the run PAUSES in place with an explicit
//   message - sign back in to GC in the same tab, then press Resume; the
//   queue continues exactly where it stopped. Rejected lots from an
//   affected sweep never reached the DB - re-run the sweep (already-caught
//   lots just come back as upd).
// v1.0.4 (2026-08-19): UNICODE DASH NORMALIZATION at capture. GC titles use
//   U+2011 NON-BREAKING HYPHEN (and friends) instead of ASCII '-':
//   "Fr. 1938‑J", "RI‑286", "Hawaii ‑ WWII". Two consequences before this fix:
//   (1) titles were unsearchable for users typing ASCII hyphens (547 of the
//   first 614 harvested rows carried U+2011 - DB backfill run separately);
//   (2) worse, the SHARED CORE Friedberg regex only knows ASCII '-', so a
//   Small Size sweep would have stored "1938" and silently DROPPED the "-J"
//   district suffix. cleanText() now maps U+2010..U+2015 and U+2212 to '-'
//   and NBSP to space on every captured title BEFORE any parsing or upsert.
//   MUST be installed before sweeping Small Size / Large Size / Nationals.
// v1.0.3 (2026-08-19): PACING. GC warned about pages opening too quickly, so
//   sweeps now PAUSE between page navigations: default 6s with a random
//   +/-25% jitter (never metronomic), adjustable in the panel ("delay s",
//   persisted across the run). The pause happens before every queue
//   navigation; the panel counts it down. DETAIL_DELAY_MS raised 800 -> 1500.
//   At the defaults a full category sweep paces at ~8-10 pages/minute
//   worst-case, well under any human-browsing threshold. If GC warns again,
//   raise the panel delay to 10-15s - no reinstall needed.
// v1.0.2 (2026-08-19): TYPE CLASSIFICATION fixes, found in the first live rows.
//   * breadcrumbCategory() took the LAST breadcrumb, which on a leaf page is
//     the leaf's own Fr# title, so the category fallback never fired and
//     title-silent lots landed as 'other'. Now walks breadcrumbs right-to-left
//     and returns the first one that maps to a type class ("Small Size Notes"
//     on a Fr. 2303 leaf).
//   * WWII EMERGENCY notes (Hawaii / North Africa): classified exactly like
//     Heritage does - type_class 'other' with series_type 'World War II
//     Emergency Note' - so cross-source comps line up. (Fr. 2303-page rows
//     ingested by v1.0.1 self-heal on the next Page/Top Up: upserts overwrite
//     type_class and series_type.)
// v1.0.1 (2026-08-19): SVG PRICE DECODER. v1.0.0's dry run rejected every lot
//   ("price hidden/missing") because GC renders prices as anti-scrape SVG:
//   one <path> whose subpaths draw the digit glyphs, with a small random
//   uniform SCALE jitter (~0.2%) applied per render so raw path data never
//   repeats. The decoder fingerprints each glyph subpath by its COMMAND
//   LETTER SEQUENCE + coordinate count - both invariant under scale jitter -
//   and maps fingerprints to characters via GLYPH_MAP, calibrated 2026-08-19
//   against 14 known prices and validated on 192 live lots across two pages
//   (0 failures; includes all digits 0-9, '$' and ','). An unknown
//   fingerprint (font change, cents glyph) decodes to null -> the lot is
//   REJECTED with "price undecodable" and surfaces in the error panel, so a
//   GC font rotation can never write a wrong price - re-calibrate GLYPH_MAP
//   and re-harvest. Detail pages draw the price the same way, so the hybrid
//   detail fetch no longer tries to read an exact price there (exact DATE,
//   cert number, pedigree and og:image still come from the detail page).
// v1.0.0 (2026-08-19): FIRST RELEASE. Built from live recon of the GC archive.
//   SITE MODEL. The archive is a server-rendered tree: category pages
//   (Large Size, Small Size, ...) list LEAF series pages - one per exact
//   Friedberg number + signature/seal variety - and every page carries a
//   "Sold" grid (div.histTableGrid) grouped by grade. Category-page grids are
//   CAPPED (~150 sold rows, updateNoItemsMsg), so completeness comes from
//   visiting leaves; leaf grids render fully. Sold rows have a Month-Year
//   date cell; Upcoming rows have none - that cell is the sold/upcoming
//   discriminator. Prices in the grid are HAMMER and render only when signed
//   in to GC - sign in before harvesting.
//   MODES.
//     SWEEP  - recursive: on pages with a series list, enqueue unseen child
//              series; harvest only leaf grids. Run once per top category
//              (or from US-Paper-Money root for everything).
//     TOP UP - one level: enqueue the current page's direct children, harvest
//              each page's capped recent-sales grid (sort=Recent Sales is
//              forced via af_c_sortdate=true). From the US-Paper-Money root
//              that is ~12 page loads covering the newest ~150 sales per
//              category - the weekly refresh.
//     PAGE / DRY - current page only.
//   PRICE BASIS (per John, 2026-08-19): price_realized = hammer + GC's 10%
//   buyer's fee ($5 minimum), so GC comps sit on the same all-in basis as
//   Heritage/SB prices realized. raw.hammer + raw.buyers_fee keep the parts.
//   HYBRID DETAIL FETCH (per John, 2026-08-19): the grid date is month-only.
//   Every lot the RPC reports as NEW (ins:) gets one throttled same-origin
//   detail-page fetch for the exact end date, PMG/PCGS certification number,
//   pedigree and og:image thumbnail, then a second upsert with
//   raw.date_precision='day'. Already-known lots (upd:) cost nothing.
//   FRIEDBERG comes from the title via the SHARED CORE parser (GC titles are
//   Fr-led like Stack's); the leaf taxonomy is Fr-keyed so coverage is high.
//   PMG STAR designations ("67 EPQ*") are NOT star notes - is_star_note is
//   computed from Fr# stars and "star/replacement note" wording only.
//   WRITE PATH: POST /functions/v1/ingest-proxy/ingest_greatcollections_lot
//   with the private x-harvest-key. No Supabase API key in this script.
//   A 401 stops the run like a breaker.
(function () {
'use strict';
const VERSION = '1.0.13';
// ===================== CONFIG =====================
const SUPABASE_REF = 'wqizwluccqqfkedpgvve';
// PRIVATE harvest key (hk_...). NOT the publishable key. Paste once, here.
const HARVEST_KEY = 'PASTE_HARVEST_KEY_HERE';
const RPC_URL = 'https://' + SUPABASE_REF + '.supabase.co/functions/v1/ingest-proxy/ingest_greatcollections_lot';
const EXTRACTOR_VERSION = 'v8';
const LS_KEY = 'gch1';
const LEDGER_KEY = 'gch1_leaves';   // v1.0.8: leaf completion ledger (survives Reset / Full Sweep)
const SKIP_DAYS_DEFAULT = 30;
const SOURCE = 'greatcollections';
const POST_WORKERS = 4;        // pooled upserts per page
const DETAIL_DELAY_MS = 3000;  // base throttle between detail-page fetches (+/-25% jitter) - v1.0.9: was 1500
const DETAIL_403_LIMIT = 3;    // v1.0.9: consecutive 403/bot-check detail failures before pausing
const DETAIL_403_BACKOFF_MS = 20000; // v1.0.9: wait after each 403 before the next detail attempt
const PAGE_DELAY_S = 6;        // default pause between page navigations (panel-adjustable)
const BUYERS_FEE_PCT = 0.10;   // GC buyer's fee
const BUYERS_FEE_MIN = 5;      // ...with a $5 minimum per lot
const MAX_PAGES = 4000;        // sweep runaway backstop
const NAV_PARAMS = { af_c_sortdate: 'true', af_c_ungraded: 'true' };
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
 *  GC-LOCAL EXTRACTION
 * ===================================================================== */
const MONTHS3 = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const MONTHS_FULL = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,
  september:9,october:10,november:11,december:12};
const STATE_FULLNAMES = {
  Alabama:'AL',Alaska:'AK',Arizona:'AZ',Arkansas:'AR',California:'CA',Colorado:'CO',
  Connecticut:'CT',Delaware:'DE',Florida:'FL',Georgia:'GA',Hawaii:'HI',Idaho:'ID',
  Illinois:'IL',Indiana:'IN',Iowa:'IA',Kansas:'KS',Kentucky:'KY',Louisiana:'LA',
  Maine:'ME',Maryland:'MD',Massachusetts:'MA',Michigan:'MI',Minnesota:'MN',
  Mississippi:'MS',Missouri:'MO',Montana:'MT',Nebraska:'NE',Nevada:'NV',
  'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY',
  'North Carolina':'NC','North Dakota':'ND',Ohio:'OH',Oklahoma:'OK',Oregon:'OR',
  Pennsylvania:'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',
  Tennessee:'TN',Texas:'TX',Utah:'UT',Vermont:'VT',Virginia:'VA',Washington:'WA',
  'West Virginia':'WV',Wisconsin:'WI',Wyoming:'WY',
  'District of Columbia':'DC','Puerto Rico':'PR','Porto Rico':'PR'
};
const STATE_ABBRS = new Set(Object.values(STATE_FULLNAMES));
const STATE_NAMES_ORDERED = Object.keys(STATE_FULLNAMES).sort((a,b)=>b.length-a.length);
// Category (breadcrumb) -> type class fallback. Title classification wins
// when it lands on a specific type; these fill in for plain size buckets.
function categoryTypeClass(cat) {
  const c = (cat || '').toLowerCase();
  if (/colonial|continental/.test(c)) return 'colonial_continental';
  if (/large size/.test(c)) return 'large_size';
  if (/small size/.test(c)) return 'small_size';
  if (/national/.test(c)) return 'national_bank_note';
  if (/fractional/.test(c)) return 'fractional';
  if (/obsolete/.test(c)) return 'obsolete';
  if (/military payment/.test(c)) return 'mpc_military';
  if (/confederate/.test(c)) return 'confederate';
  if (/error/.test(c)) return 'error_note';
  if (/treasury notes of war/.test(c)) return 'treasury_note';
  return null;
}
// Title-first classification (GC titles are rich); falls back to category.
function classifyType(title, catClass) {
  const t = (title || '').toLowerCase();
  if (/\bnational bank notes?\b|\bnational currency\b|\bnational gold bank\b/.test(t)) return 'national_bank_note';
  if (/\bsilver certificates?\b/.test(t)) return 'silver_certificate';
  if (/\bgold certificates?\b/.test(t)) return 'gold_certificate';
  if (/\bfederal reserve bank (?:star |mule |replacement )?notes?\b/.test(t)) return 'federal_reserve_bank_note';
  if (/\bfederal reserve (?:star |mule |replacement )?notes?\b/.test(t)) return 'federal_reserve_note';
  if (/\btreasury (?:star |mule )?notes?\b|\bcoin notes?\b/.test(t)) return 'treasury_note';
  if (/\blegal tender(?:\s+(?:star |mule )?notes?)?\b/.test(t) || /\bunited states notes?\b/.test(t)) return 'legal_tender';
  if (/\bdemand notes?\b/.test(t)) return 'demand_note';
  if (/\bfractional\b|\b(?:first|second|third|fourth|fifth)\s+issue\b|\bpostage currency\b/.test(t)) return 'fractional';
  if (/\bconfederate\b|\bcsa\b/.test(t) || /^\s*t-\d{1,3}\b/i.test(title || '')) return 'confederate';
  if (/\bmilitary payment\b|\bmpc\b/.test(t)) return 'mpc_military';
  if (/\berror\b|\bmis-?match(ed)?\b|\binverted\b|\boffset printing\b|\bfold ?over\b/.test(t) && catClass === 'error_note') return 'error_note';
  if (/\b(?:continental|colonial)\s+currency\b|\bcolony of\b|\bcc-\d/.test(t)) return 'colonial_continental';
  if (/\bobsoletes?\b|\bbroken bank\b|\bscrip\b/.test(t)) return 'obsolete';
  return catClass || 'other';
}
function seriesTypeLabel(tc) {
  const map = {
    national_bank_note:'National Bank Note', silver_certificate:'Silver Certificate',
    gold_certificate:'Gold Certificate', federal_reserve_note:'Federal Reserve Note',
    federal_reserve_bank_note:'Federal Reserve Bank Note', treasury_note:'Treasury Note',
    obsolete:'Obsolete', colonial_continental:'Colonial / Continental', fractional:'Fractional',
    demand_note:'Demand Note', confederate:'Confederate', legal_tender:'Legal Tender Note',
    large_size:'Large Size', small_size:'Small Size',
    mpc_military:'Military Payment Certificate', error_note:'Error Note', other:'Other'
  };
  return map[tc] || 'Other';
}
/* --- grading. GC verbiage: "PMG Superb Gem Unc 68 EPQ", "PCGS Banknote
 * Very Fine 25 Details", "PCGS Currency Gem New 66 PPQ", "Legacy ...".
 * A trailing star after the grade/EPQ/PPQ is PMG's STAR DESIGNATION,
 * not a star note. ------------------------------------------------- */
function parseGradingCompany(title) {
  const t = title || '';
  if (/\bPMG\b/i.test(t)) return 'PMG';
  if (/\bPCGS(?:\s+(?:Banknote|Currency))?\b/i.test(t)) return 'PCGS';
  if (/\bNGC\b|\bNGCX\b/i.test(t)) return 'NGC';
  if (/\bCACG\b/i.test(t)) return 'CACG';
  if (/\bANACS\b/i.test(t)) return 'ANACS';
  if (/\bLegacy\b/i.test(t)) return 'unknown';   // Legacy Currency Grading: enum has no value
  return null;
}
const GRADE_WORDS = '(?:Superb\\s+Gem|Gem|Choice|Very\\s+Choice|About|Almost)?\\s*(?:New|Uncirculated|Unc|About\\s+Unc|Extremely\\s+Fine|Very\\s+Fine|Fine|Very\\s+Good|Good|Fair|Poor|AU|XF|EF|VF|VG|CU)';
function parseGradeNumeric(title) {
  const t = title || '';
  let m = t.match(/\b(?:PMG|PCGS(?:\s+(?:Banknote|Currency))?|NGCX?|CACG|ANACS|Legacy)\b[^0-9]{0,50}?(\d{1,2})(?:\.\d)?\b/i);
  if (m) { const n = parseInt(m[1],10); if (n>=1 && n<=70) return n; }
  m = t.match(new RegExp(GRADE_WORDS + '\\s+(\\d{1,2})\\b','i'));
  if (m) { const n = parseInt(m[1],10); if (n>=1 && n<=70) return n; }
  return null;
}
function parseGradeRaw(title) {
  const t = title || '';
  const m = t.match(/\b(?:PMG|PCGS(?:\s+(?:Banknote|Currency))?|NGCX?|CACG|ANACS|Legacy)\b[^,]*?\d{1,2}(?:\s*(?:PPQ|EPQ))?(?:\s*Details)?(?:\s*[★*])?/i);
  return m ? m[0].trim().slice(0,80) : null;
}
function parsePpqEpq(title) {
  const m = (title || '').match(/\b(PPQ|EPQ)\b/i);
  return m ? m[1].toUpperCase() : null;
}
// Star NOTES only. A star glued to a grade / EPQ / PPQ is a PMG Star
// designation and must NOT count.
function extractIsStar(title) {
  const t = title || '';
  if (/\bstar\s+note\b|\breplacement\s+note\b/i.test(t)) return true;
  if (/\b(?:Friedberg|Fr)\.?\s*#?\s*\d+[A-Za-z]?(?:-[A-Za-z0-9]+)?\s?[*★]/i.test(t)) return true;
  return false;
}
function extractDenomination(title) {
  const t = title || '';
  let m = t.match(/\$\s?([\d,]+)(?!\d)/);
  if (m) return m[1].replace(/,/g, '');
  m = t.match(/(\d{1,3})\s?(?:¢|(?:cents?|c)\b)/i);
  if (m) return m[1] + ' Cents';
  m = t.match(/(\d{1,3})\s?s\.?\s?[/ ]?\s?(\d{1,2})\s?d\b/i);
  if (m) return m[1] + 's ' + m[2] + 'd';
  m = t.match(/(\d{1,3})\s?(?:s\b|shillings?\b)/i);
  if (m) return m[1] + 's';
  m = t.match(/(\d{1,3})\s?(?:d\b|pence\b|penny\b)/i);
  if (m) return m[1] + 'd';
  m = t.match(/£\s?([\d,]+)(?!\d)/);
  if (m) return '£' + m[1].replace(/,/g, '');
  m = t.match(/(\d{1,3})\s?pounds?\b/i);
  if (m) return '£' + m[1];
  m = t.match(/(\d{1,4})\s?dollars?\b/i);
  if (m) return m[1];
  return null;
}
function parseCharter(title) {
  if (!title) return null;
  let m = title.match(/\bCh\.?\s*#?\s*\(?[A-Za-z]?\)?\s*([0-9]+)\b/i);
  if (m) return m[1];
  m = title.match(/\bCharter\s*#?\s*([0-9]+)\b/i);
  if (m) return m[1];
  return null;
}
function extractState(title, typeClass) {
  if (!/^(national_bank_note|obsolete|colonial_continental)$/.test(typeClass || '')) return null;
  const t = title || '';
  const abbr = t.match(/,\s*([A-Z]{2})\b/);
  if (abbr && STATE_ABBRS.has(abbr[1])) return abbr[1];
  if (/\bMixed States?\b/i.test(t)) return null;
  const found = [];
  for (const name of STATE_NAMES_ORDERED) {
    const re = new RegExp('\\b' + name.replace(/ /g, '\\s') + '\\b', 'i');
    if (re.test(t)) {
      if (name === 'Washington' && /Washington\s*,?\s*(County|Court)/i.test(t)) continue;
      found.push(STATE_FULLNAMES[name]);
    }
  }
  const uniq = [...new Set(found)];
  return uniq.length === 1 ? uniq[0] : null;
}
function allInPrice(hammer) {
  if (hammer == null || !isFinite(hammer)) return null;
  const fee = Math.max(hammer * BUYERS_FEE_PCT, BUYERS_FEE_MIN);
  return Math.round((hammer + fee) * 100) / 100;
}
// GC-local boot self-test on real GC title shapes.
function gcSelfTest(tag) {
  const cases = [
    // [title, isStar, gradeNum, company, ppqepq]
    ['Fr. 84 1907 $5 Legal Tender Note Vernon / McClung PMG Superb Gem Unc 68 EPQ', false, 68, 'PMG', 'EPQ'],
    ['Fr. 237 1923 $1 Silver Certificate Note Speelman / White PMG Superb Gem Unc 67 EPQ★', false, 67, 'PMG', 'EPQ'],
    ['Fr. 1901-D* $1 1963A Federal Reserve Star Note PMG Gem Uncirculated 66 EPQ', true, 66, 'PMG', 'EPQ'],
    ['ND $1 Mechanic\'s Art Union Lottery Ticket PCGS Banknote Very Fine 25 Details', false, 25, 'PCGS', null],
    ['Fr. 116 1901 $10 Legal Tender Note PCGS Currency Superb Gem New 68 PPQ', false, 68, 'PCGS', 'PPQ'],
    ['1861 Charlottesville, Virginia $1 Monticello Bank Note PCGS Banknote Fine 12', false, 12, 'PCGS', null]
  ];
  let fails = 0;
  cases.forEach(function (c) {
    const star = extractIsStar(c[0]), g = parseGradeNumeric(c[0]),
          co = parseGradingCompany(c[0]), pe = parsePpqEpq(c[0]);
    if (star !== c[1] || g !== c[2] || co !== c[3] || pe !== c[4]) {
      fails++;
      console.error('[' + tag + ' GC-TEST FAIL]', c[0], '=> got', star, g, co, pe,
                    'want', c[1], c[2], c[3], c[4]);
    }
  });
  if (fails) console.error('[' + tag + '] GC SELF-TEST: ' + fails + ' FAILED');
  else console.log('[' + tag + '] gc self-test ok (' + cases.length + ' cases)');
  return fails;
}
/* =====================================================================
 *  PAGE PARSING
 * ===================================================================== */
function breadcrumbCategory() {
  // v1.0.2: on a LEAF page the last breadcrumb is the leaf's own title, so
  // walk right-to-left and return the first crumb that maps to a type class.
  const bc = document.querySelector('.bc-outer');
  const parts = bc ? bc.innerText.split('›').map(s=>s.trim()).filter(Boolean) : [];
  // v1.0.7: on a leaf page the final crumb is the leaf's own title - exclude
  // it from the walk so "Fr. CC-21 ... Continental Currency" can't match itself.
  const start = pageHasSeriesList() ? parts.length - 1 : parts.length - 2;
  for (let i = start; i >= 0; i--) {
    if (parts[i] && categoryTypeClass(parts[i])) return parts[i];
  }
  return parts.length ? parts[parts.length-1] : null;
}
function pageHasSeriesList() {
  return /select an item from|Choose a Coin Series/i.test(document.body.innerText);
}
function sidebarEl() {
  const cands = [...document.querySelectorAll('div,td,aside')].filter(e => {
    const t = e.innerText || '';
    return t.indexOf('U.S. Coin Prices') !== -1 && t.indexOf('World Coin Prices') !== -1 && t.length < 30000;
  });
  cands.sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length);
  return cands[0] || null;
}
// v1.0.12: cheap gate - does this page have a sold grid worth harvesting?
// True when a .histTableGrid exists AND at least one cell reads as a
// "Mon YYYY" sold date (upcoming-only grids have none). Lets the sweep
// harvest category pages that carry a capped recent-sales grid while
// skipping pure navigation pages (no grid, or a grid with no sold rows) so
// they don't burn a harvest pass or a ledger stamp.
function gridHasSold() {
  const grid = document.querySelector('.histTableGrid');
  if (!grid) return false;
  for (const cell of grid.children) {
    const tx = (cell.innerText || '').replace(/\s+/g, ' ').trim();
    if (monthToISO(tx)) return true;
  }
  return false;
}
// Child series links: archive links with a "(N)" count, excluding
// breadcrumbs and self.
// v1.0.12: the National tree splits its leaves across TWO panes - a
// sidebar navigation tree AND the main content list (National Gold Bank,
// First Charter, ... each with a (N) count). The old logic EXCLUDED the
// sidebar and returned the rest; when sidebarEl() mis-scoped the container
// it swallowed the main-pane leaves too, so only the already-swept sidebar
// tree got queued and the Gold Bank / First Charter / Red Seal leaves were
// silently dropped (the ~1,470-lot National gap). New approach: collect
// EVERY counted archive link once (deduped by path), tag each as in-sidebar
// or not, and PREFER the main-pane (non-sidebar) set. Fall back to the full
// set only if the main pane yielded nothing, so pages whose layout differs
// keep working. Dedup by path means a leaf that appears in both panes is
// queued once. Nothing is written here - queued paths get harvested per
// leaf, and upserts dedupe, so an over-broad queue can only add coverage.
function collectChildLinks() {
  const side = sidebarEl();
  const here = location.pathname.replace(/\/$/, '');
  const seen = new Set();
  const main = [], all = [];
  for (const a of document.querySelectorAll('a[href*="/Auction-Archive/"]')) {
    if (a.closest('.bc-outer')) continue;                 // never the breadcrumb
    const txt = (a.textContent || '').trim();
    if (!/\(\d[\d,]*\)\s*$/.test(txt)) continue;          // must carry a (N) count
    let u; try { u = new URL(a.getAttribute('href'), location.origin); } catch(e){ continue; }
    if (u.origin !== location.origin) continue;
    const path = u.pathname.replace(/\/$/, '');
    if (path === here || seen.has(path)) continue;         // dedupe by path, skip self
    seen.add(path);
    all.push(path);
    if (!(side && side.contains(a))) main.push(path);      // main pane = not inside the sidebar
  }
  // prefer the main-pane leaves; fall back to the full set if empty
  return main.length ? main : all;
}
/* --- SVG price decoder (v1.0.1) ------------------------------------
 * GC draws prices as a single SVG <path>: absolute M per glyph subpath,
 * all-relative body, with a per-render uniform scale jitter. Fingerprint =
 * djb2(command letters + ':' + number count) - jitter-invariant.
 * GLYPH_MAP calibrated 2026-08-19 (14 known prices, 192 lots, 0 failures).
 * '#' entries are the inner/secondary subpaths of $, 0, 4, 6, 8, 9 - they
 * identify the glyph but add no character. Unknown fingerprint -> null. */
const GLYPH_MAP = {
  '5bunri':'$', '76upd8':'#', 'r3ulbw':'9', '28fb9f':'#', '1mzm1eq':'8',
  'k1uyd1':'#', '19vwxhl':'4', 'njjc67':'#', 'otd5tw':'2', '1d5mgiv':'0',
  '14583c3':'#', 'isjui1':',', '1na8yv0':'5', '147d37h':'3', 'ntluuh':'1',
  '1bucaqy':'6', 'j0mecm':'7'
};
function djb2(s){ let h=5381; for (let i=0;i<s.length;i++){ h=((h*33)^s.charCodeAt(i))>>>0; } return h.toString(36); }
function decodeSvgPrice(d) {
  if (!d) return null;
  const ps = d.split(/(?=M)/).filter(s=>s.trim());
  if (!ps.length) return null;
  let out = '';
  for (const p of ps) {
    const m = p.match(/^M[-\d.]+[, ][-\d.]+/);
    const body = m ? p.slice(m[0].length) : p;
    const sig = djb2(((body.match(/[A-Za-z]/g)||[]).join('')) + ':' + ((body.match(/-?\d*\.?\d+/g)||[]).length));
    const v = GLYPH_MAP[sig];
    if (v === undefined) return null;      // unknown glyph: font changed, or cents
    if (v !== '#') out += v;
  }
  if (!/^\$[\d,]+$/.test(out)) return null;
  const n = parseFloat(out.replace(/[$,]/g, ''));
  return (isFinite(n) && n > 0) ? n : null;
}
// v1.0.4: GC uses U+2011 non-breaking hyphens (and other Unicode dashes) in
// titles. Normalize BEFORE any parsing/upsert - the shared-core Friedberg
// regex and the app's search both expect ASCII.
function cleanText(s) {
  return (s || '')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/ /g, ' ');
}
function monthToISO(txt) {
  const m = (txt || '').match(/^([A-Z][a-z]{2})[a-z]*\.?\s+(\d{4})$/);
  if (!m || !MONTHS3[m[1]]) return null;
  return m[2] + '-' + String(MONTHS3[m[1]]).padStart(2,'0') + '-01';
}
// Walk the grid cells and build sold-lot records. A record starts at a cell
// holding a /Coin/ link with real title text; following non-title cells feed
// it. A "Mon YYYY" date cell marks it SOLD; upcoming rows never get one.
function parseGrid() {
  const grid = document.querySelector('.histTableGrid');
  if (!grid) return [];
  const cells = [...grid.children];
  const lots = [];
  let cur = null;
  function closeRec(){ if (cur) lots.push(cur); cur = null; }
  for (const cell of cells) {
    const link = cell.querySelector && cell.querySelector('a[href*="/Coin/"]');
    const isTitle = link && (link.textContent || '').trim().length > 12;
    if (isTitle) {
      closeRec();
      let u; try { u = new URL(link.getAttribute('href'), location.origin); } catch(e){ u = null; }
      const idm = u ? u.pathname.match(/\/Coin\/(\d+)\//) : null;
      cur = { title: cleanText((link.textContent||'')).replace(/\s+/g,' ').trim(),
              url: u ? (u.origin + u.pathname) : null,
              id: idm ? idm[1] : null,
              hammer: null, bids: null, soldMonth: null };
      continue;
    }
    if (!cur) continue;
    const tx = (cell.innerText || '').replace(/\s+/g,' ').trim();
    if ((cell.className||'').indexOf('hist_grade') !== -1) { closeRec(); continue; }
    // v1.0.1: the price cell has NO text - it is an anti-scrape SVG. Decode it.
    if (cur.hammer == null) {
      const path = cell.querySelector && cell.querySelector('path');
      if (path) {
        cur.hammer = decodeSvgPrice(path.getAttribute('d'));
        if (cur.hammer == null) cur.undecodable = true;
        continue;
      }
      const pm = tx.match(/^\$\s?([\d,]+(?:\.\d{2})?)$/);   // text fallback, if GC ever reverts
      if (pm) { cur.hammer = parseFloat(pm[1].replace(/,/g,'')); continue; }
    }
    if (!tx) continue;
    const bm = tx.match(/^(\d+)\s+bids?$/i);
    if (bm) { cur.bids = parseInt(bm[1],10); continue; }
    const iso = monthToISO(tx);
    if (iso) { cur.soldMonth = iso; closeRec(); continue; }
  }
  closeRec();
  return lots.filter(l => l.id && l.title);
}
function buildPayload(lot, catClass, extra) {
  const title = lot.title;
  let typeClass = classifyType(title, catClass);
  let typeLabel = null;
  // v1.0.2: WWII Emergency notes, exactly as Heritage classifies them.
  if (/\b(?:hawaii|north africa)\b/i.test(title) && /\bemergency\b/i.test(title)) {
    typeClass = 'other';
    typeLabel = 'World War II Emergency Note';
  }
  const sy = parseSeries(title);
  const hammer = lot.hammer;
  const price = allInPrice(hammer);
  const e = extra || {};
  const p = {
    p_source_lot_id: lot.id,
    p_lot_url: lot.url,
    p_title: title,
    p_series_type: typeLabel || seriesTypeLabel(typeClass),
    p_sold_on: e.exactDate || lot.soldMonth,
    p_price_realized: price,
    p_denomination: extractDenomination(title),
    p_is_star_note: extractIsStar(title),
    p_grading_company: parseGradingCompany(title),
    p_grade_raw: parseGradeRaw(title),
    p_grade_numeric: parseGradeNumeric(title),
    p_friedberg_number: parseFriedberg(title),
    p_type_class: typeClass,
    p_series_year: sy.year,
    p_series_letter: sy.letter,
    p_state_code: extractState(title, typeClass),
    p_charter_number: parseCharter(title),
    p_ppq_epq: parsePpqEpq(title),
    p_raw: {
      extractor_version: EXTRACTOR_VERSION, hv: VERSION, source: SOURCE,
      item_id: lot.id, title: title,
      gc_category: breadcrumbCategory(),
      hammer: hammer,
      buyers_fee_pct: BUYERS_FEE_PCT, buyers_fee_min: BUYERS_FEE_MIN,
      price_basis: 'hammer_plus_fee', price_decode: 'svg_glyph_v1',
      bids: lot.bids,
      date_precision: e.exactDate ? 'day' : 'month',
      harvested_at: new Date().toISOString()
    }
  };
  if (e.cert) p.p_raw.cert_number = e.cert;
  if (e.pedigree) p.p_raw.pedigree = e.pedigree;
  if (e.thumb) p.p_thumbnail_url = e.thumb;
  if (p.p_series_year && p.p_friedberg_number &&
      String(p.p_series_year) === (String(p.p_friedberg_number).match(/^(\d+)/) || [])[1]) {
    p.p_raw.series_eq_fr = true;
  }
  return p;
}
/* =====================================================================
 *  DETAIL FETCH (hybrid: only for lots the RPC reported as NEW)
 * ===================================================================== */
async function fetchDetail(url) {
  const r = await fetch(url, { credentials: 'include' });
  if (r.status === 403 || r.status === 429 || r.status === 503) { const e = new Error('detail HTTP ' + r.status); e.botCheck = true; throw e; }
  if (!r.ok) throw new Error('detail HTTP ' + r.status);
  const html = await r.text();
  if (/Verifying Website Traffic|unusual activity from users of your Internet provider|Just a moment/i.test(html)) {
    const e = new Error('detail BOT CHECK page'); e.botCheck = true; throw e;   // v1.0.9
  }
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const out = {};
  let m = text.match(/Ended\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (m) {
    const mm = MONTHS_FULL[m[1].toLowerCase()] || MONTHS3[m[1].slice(0,3)];
    if (mm) out.exactDate = m[3] + '-' + String(mm).padStart(2,'0') + '-' + String(m[2]).padStart(2,'0');
  }
  // NOTE: no price extraction here - the detail page draws it as SVG too.
  m = text.match(/Certification\s*Number:?\s*([A-Za-z0-9][A-Za-z0-9.\/-]{3,29})/i);
  if (m) out.cert = m[1];
  m = text.match(/Collection:\s*([^.]{3,80})/i);
  if (m) out.pedigree = cleanText(m[1]).trim();
  m = html.match(/property="og:image"\s+content="([^"]+)"/i);
  if (m) out.thumb = m[1];
  return out;
}
/* =====================================================================
 *  RPC (through ingest-proxy, private key header)
 * ===================================================================== */
async function postOnce(payload){
  const r = await fetch(RPC_URL, { method:'POST',
    headers:{ 'Content-Type':'application/json', 'x-harvest-key': HARVEST_KEY },
    body: JSON.stringify(payload) });
  const t = await r.text();
  if (!r.ok){ const e = new Error(r.status + ' ' + t.slice(0,180)); e.status = r.status; throw e; }
  return t.replace(/^"|"$/g, '');
}
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const el = id => document.getElementById(id);
/* =====================================================================
 *  STATE MACHINE (Heritage pattern: survives navigation via localStorage)
 * ===================================================================== */
function FRESH(){ return { mode:'idle', running:false, queue:[], i:0, seen:{},
  cutoff:'', detail:true, delay:PAGE_DELAY_S, skipDays:SKIP_DAYS_DEFAULT, msg:'', errs:[],
  stats:{pages:0,seen:0,new:0,upd:0,rej:0,skip:0,err:0,details:0,lskip:0,audited:0,gc_total:0,ids_total:0,mismatch:0} }; }
// v1.0.8: leaf ledger { '/Auction-Archive/...leaf': ISO completion time }
function ledgerLoad(){ try { return JSON.parse(localStorage.getItem(LEDGER_KEY)) || {}; } catch(e){ return {}; } }
function ledgerStamp(path){ try { const L = ledgerLoad(); L[path] = new Date().toISOString(); localStorage.setItem(LEDGER_KEY, JSON.stringify(L)); } catch(e){} }
function ledgerFresh(path){
  const days = parseFloat(st.skipDays); if (!(days > 0)) return false;
  const when = ledgerLoad()[path]; if (!when) return false;
  return (Date.now() - Date.parse(when)) < days * 86400000;
}
function ledgerSize(){ return Object.keys(ledgerLoad()).length; }
let st = load();
function load(){ try { const o = Object.assign(FRESH(), JSON.parse(localStorage.getItem(LS_KEY)));
    if (!o.errs) o.errs = []; if (!o.seen) o.seen = {}; if (!o.queue) o.queue = [];
    if (!o.stats) o.stats = FRESH().stats; if (o.stats.lskip == null) o.stats.lskip = 0; return o; }
  catch(e){ return FRESH(); } }
function save(){ try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch(e){} }
function logErr(m){ st.errs.unshift(String(m).slice(0,180)); if (st.errs.length > 5) st.errs.length = 5; }
function clearErrs(){ st.errs = []; }   // v1.0.11: drop the previous page's rejects/403s
function keyMissing(){ return HARVEST_KEY.indexOf('hk_') !== 0; }
// v1.0.5/1.0.6: logged out = GC renders no price SVGs at all. Never harvest
// blind - but never false-pause either: any ONE of these proves logged-in.
function loggedOut(){
  try {
    for (const e of document.querySelectorAll('a,button')){
      if (/sign\s*out/i.test(e.textContent || '')) return false;   // hidden or not
    }
    if (/Welcome,/i.test((document.body && document.body.textContent) || '')) return false;
    const grid = document.querySelector('.histTableGrid');
    if (grid && grid.querySelector('path')) return false;          // prices rendering
  } catch(e){ return false; }
  return true;
}
function navUrl(path){
  const u = new URL(path, location.origin);
  for (const k in NAV_PARAMS) u.searchParams.set(k, NAV_PARAMS[k]);
  return u.toString();
}
let loopActive = false;   // v1.0.10: run lock - one processCurrentPage chain per tab
function finish(msg){ st.running = false; loopActive = false; st.msg = 'RUN COMPLETE (' + msg + ')'; save(); paint(); }
/* =====================================================================
 *  AUDIT MODE (v1.0.13)  --  read-only coverage check, NO writes
 *  Per leaf, record: GC's printed "has sold N" count + every sold /Coin/
 *  id in the grid + our leaf url. Exported as JSON for an off-browser diff
 *  against source_lot_id in the DB. Never posts to the ingest proxy.
 * ===================================================================== */
const AUDIT_KEY = 'gch1_audit';   // { '<leafPath>': {fr, charter, gc_sold, grid_sold, ids:[...], ts} }
function auditLoad(){ try { return JSON.parse(localStorage.getItem(AUDIT_KEY)) || {}; } catch(e){ return {}; } }
function auditSave(o){ try { localStorage.setItem(AUDIT_KEY, JSON.stringify(o)); } catch(e){} }
function auditSize(){ return Object.keys(auditLoad()).length; }
// Wait for the async "history results" grid to populate before reading it.
// The leaf page shows "Please stand-by while your history results are
// processed..." then injects .histTableGrid rows. Poll up to ~timeoutMs.
async function waitForGrid(timeoutMs){
  const deadline = Date.now() + (timeoutMs || 12000);
  while (Date.now() < deadline){
    const grid = document.querySelector('.histTableGrid');
    if (grid && grid.querySelector('a[href*="/Coin/"]')) return true;   // rows present
    // if GC says explicitly there are no sales, that's a valid "done" state
    if (/no (?:sales|results|items)|has not been sold/i.test(document.body.innerText || '')) return true;
    if (!/stand-?by|processed|processing/i.test(document.body.innerText || '') && grid) return true;
    await sleep(400);
  }
  return !!document.querySelector('.histTableGrid');
}
// GC's own printed sold count for this leaf: "GreatCollections has sold N ..."
function gcSoldCount(){
  const bt = document.body ? document.body.innerText : '';
  const m = bt.match(/GreatCollections has sold\s+([\d,]+)\b/i);
  return m ? parseInt(m[1].replace(/,/g,''), 10) : null;
}
// Every SOLD lot's /Coin/<id>/ in the grid (date-cell discriminator, same as
// parseGrid). Returns { ids:[...], gridSold:int }.
function gridSoldIds(){
  const grid = document.querySelector('.histTableGrid');
  const ids = [];
  if (!grid) return { ids, gridSold: 0 };
  let cur = null;
  for (const cell of grid.children){
    const link = cell.querySelector && cell.querySelector('a[href*="/Coin/"]');
    const isTitle = link && (link.textContent || '').trim().length > 12;
    if (isTitle){
      let u; try { u = new URL(link.getAttribute('href'), location.origin); } catch(e){ u = null; }
      const idm = u ? u.pathname.match(/\/Coin\/(\d+)\//) : null;
      cur = { id: idm ? idm[1] : null, sold: false };
      continue;
    }
    if (!cur) continue;
    if ((cell.className||'').indexOf('hist_grade') !== -1){ if (cur.id && cur.sold) ids.push(cur.id); cur = null; continue; }
    const tx = (cell.innerText || '').replace(/\s+/g,' ').trim();
    if (monthToISO(tx)){ cur.sold = true; if (cur.id) ids.push(cur.id); cur = null; }
  }
  if (cur && cur.id && cur.sold) ids.push(cur.id);
  return { ids: [...new Set(ids)], gridSold: new Set(ids).size };
}
// Record one leaf into the audit log. Pure read - never posts.
function auditLeaf(){
  const here = location.pathname.replace(/\/$/, '');
  const title = (document.querySelector('h1') || {}).innerText || here;
  const fr = parseFriedberg(title);
  const charter = parseCharter(title);
  const gcSold = gcSoldCount();
  const g = gridSoldIds();
  const A = auditLoad();
  A[here] = { fr: fr, charter: charter, gc_sold: gcSold, grid_sold: g.gridSold,
              ids: g.ids, title: (title||'').slice(0,120), ts: new Date().toISOString() };
  auditSave(A);
  return A[here];
}
// Build the export blob the user pastes back for the DB diff.
function auditExport(){
  const A = auditLoad();
  const rows = Object.keys(A).map(function(path){
    const r = A[path]; return { path: path, fr: r.fr, charter: r.charter,
      gc_sold: r.gc_sold, grid_sold: r.grid_sold, ids: r.ids };
  });
  return JSON.stringify({ source:'greatcollections', audit_version:1,
    exported_at: new Date().toISOString(), leaves: rows.length,
    total_grid_ids: rows.reduce((s,r)=>s+(r.ids?r.ids.length:0),0), data: rows }, null, 0);
}
// Clipboard fallback: drop the blob into a textarea and select it so the
// user can Ctrl-C (used when navigator.clipboard is unavailable/denied).
function auditFallbackCopy(blob, n){
  try {
    let ta = document.getElementById('gch1-audit-ta');
    if (!ta){ ta = document.createElement('textarea'); ta.id = 'gch1-audit-ta';
      ta.style.cssText = 'position:fixed;left:8px;bottom:8px;width:360px;height:90px;z-index:2147483647;font:11px monospace';
      document.body.appendChild(ta); }
    ta.value = blob; ta.style.display = 'block'; ta.focus(); ta.select();
    st.msg = 'audit JSON in the box (bottom-left) - Ctrl-C to copy (' + n + ' leaves)';
  } catch(e){ st.msg = 'export failed: ' + (e.message || e); }
  paint();
}
/* =====================================================================
 *  PAGE PROCESSOR
 * ===================================================================== */
async function harvestGrid(dry){
  const catClass = categoryTypeClass(breadcrumbCategory());
  const lots = parseGrid();
  const r = { seen:0, ins:0, upd:0, rej:0, skip:0, err:0, breaker:false, newLots:[] };
  const queue = [];
  for (const lot of lots){
    if (!lot.soldMonth){ r.skip++; continue; }           // upcoming / no date
    r.seen++;
    if (st.cutoff && lot.soldMonth < st.cutoff + '-01'){ r.skip++; continue; }
    if (lot.hammer == null){
      r.rej++;
      logErr(lot.undecodable
        ? 'REJ price UNDECODABLE :: ' + lot.id + ' (GC font changed? GLYPH_MAP needs recalibration - tell Claude)'
        : 'REJ price missing :: ' + lot.id);
      continue;
    }
    if (dry){ r.skip++; continue; }
    queue.push(lot);
  }
  if (dry || !queue.length) return r;
  let cursor = 0;
  async function worker(){
    while (true){
      if (r.breaker) return;
      const i = cursor++;
      if (i >= queue.length) return;
      const lot = queue[i];
      try {
        const out = await post(buildPayload(lot, catClass, null));
        if (/^updn/.test(out)) { r.upd++; r.newLots.push(lot); }   // v1.0.7: known row, detail missing -> heal
        else if (/^upd/.test(out)) r.upd++;
        else { r.ins++; r.newLots.push(lot); }
      } catch(e){
        const msg = String(e.message || e);
        if (/circuit breaker|ingest_guard/i.test(msg)){ r.breaker = true; logErr('BREAKER ' + msg); return; }
        if (e.status === 401){ r.breaker = true; logErr('KEY REJECTED (401) - check HARVEST_KEY. Run stopped.'); return; }
        const isReject = /reject:/.test(msg);
        if (isReject) r.rej++; else r.err++;
        logErr((isReject ? 'REJ ' : 'ERR ') + msg + ' :: item ' + lot.id);
      }
    }
  }
  const ws = [];
  for (let w = 0; w < Math.min(POST_WORKERS, queue.length); w++) ws.push(worker());
  await Promise.all(ws);
  // hybrid detail pass: NEW lots only, throttled, sequential
  if (st.detail && r.newLots.length && !r.breaker){
    let consecutive403 = 0;                                    // v1.0.9
    for (const lot of r.newLots){
      if (!st.running && st.mode !== 'page') break;
      try {
        const extra = await fetchDetail(lot.url);
        await post(buildPayload(lot, catClass, extra));
        st.stats.details++;
        consecutive403 = 0;
      } catch(e){
        logErr('DETAIL ' + String(e.message || e).slice(0,100) + ' :: ' + lot.id);
        if (e.botCheck){
          consecutive403++;
          if (consecutive403 >= DETAIL_403_LIMIT){
            r.botCheck = true;                                   // caller pauses the run in place
            logErr('GC BOT CHECK - ' + consecutive403 + ' consecutive detail 403s. Run paused.');
            break;
          }
          st.msg = 'detail 403 (' + consecutive403 + '/' + DETAIL_403_LIMIT + ') - backing off ' + Math.round(DETAIL_403_BACKOFF_MS/1000) + 's ...'; paint();
          await sleep(DETAIL_403_BACKOFF_MS);
        }
      }
      st.msg = 'detail fetch ' + (r.newLots.indexOf(lot)+1) + '/' + r.newLots.length + ' ...';
      paint();
      await sleep(Math.round(DETAIL_DELAY_MS * (0.75 + Math.random() * 0.5)));
    }
  }
  return r;
}
function tally(r){ const s = st.stats;
  s.pages++; s.seen += r.seen; s.new += r.ins; s.upd += r.upd;
  s.rej += r.rej; s.skip += r.skip; s.err += r.err; }
async function processCurrentPage(){
  if (loopActive){ st.msg = 'already running - one loop per tab (Resume ignored)'; paint(); return; }   // v1.0.10
  loopActive = true;
  // v1.0.5: pause (not finish) on login loss - Resume continues the queue here.
  if (loggedOut()){
    st.running = false; st.i = Math.max(0, st.i - 1);   // requeue this page
    st.msg = 'GC LOGIN EXPIRED - sign in to GreatCollections in this tab, then press Resume.';
    loopActive = false; save(); paint(); return;
  }
  const here = location.pathname.replace(/\/$/, '');
  st.seen[here] = 1;
  clearErrs();   // v1.0.11: only show THIS page's errors
  // v1.0.13: AUDIT MODE - walk the tree like a sweep, but on leaves RECORD
  // GC's sold count + sold lot ids instead of harvesting. Never writes.
  if (st.mode === 'audit'){
    if (pageHasSeriesList()){
      const kids = collectChildLinks().filter(p => !st.seen[p]);
      for (const k of kids){ st.queue.push(k); st.seen[k] = 1; }
      st.msg = 'audit: queued ' + kids.length + ' child series (' + st.queue.length + ' total)';
      save(); paint();
    } else {
      st.msg = 'audit: waiting for grid ...'; paint();
      await waitForGrid(12000);
      const rec = auditLeaf();
      st.stats.audited = (st.stats.audited || 0) + 1;
      if (rec.gc_sold != null) st.stats.gc_total = (st.stats.gc_total || 0) + rec.gc_sold;
      st.stats.ids_total = (st.stats.ids_total || 0) + (rec.ids ? rec.ids.length : 0);
      // flag a mismatch between GC's printed count and what the grid rendered
      if (rec.gc_sold != null && rec.grid_sold !== rec.gc_sold){
        st.stats.mismatch = (st.stats.mismatch || 0) + 1;
        logErr('AUDIT count mismatch :: GC says ' + rec.gc_sold + ' grid shows ' + rec.grid_sold + ' :: ' + (rec.fr || here.split('/').pop()));
      }
      st.msg = 'audit: ' + (rec.fr || 'leaf') + ' - GC ' + (rec.gc_sold==null?'?':rec.gc_sold) + ' / grid ' + rec.grid_sold + ' ids';
      save(); paint();
    }
    save(); paint();
    advance();
    return;
  }
  // v1.0.12: a series-list page ENQUEUES children. It may ALSO carry a
  // (capped) sold grid - the National root Dry Run showed 138 sold lots on
  // a page pageHasSeriesList() reports true for. Old code took an exclusive
  // either/or branch and threw that grid away. Now: on a sweep, always
  // enqueue children when there's a series list, and SEPARATELY harvest the
  // grid whenever one with sold rows is present (any page, list or leaf).
  // Grid upserts dedupe, so harvesting a capped parent grid on top of the
  // per-leaf sweep only adds coverage - never double-writes.
  if (st.mode === 'sweep' && pageHasSeriesList()){
    const kids = collectChildLinks().filter(p => !st.seen[p]);
    for (const k of kids){ st.queue.push(k); st.seen[k] = 1; }
    st.msg = 'category page: queued ' + kids.length + ' child series (' + st.queue.length + ' total)';
    save(); paint();
  }
  // harvest the grid on ANY page that has sold rows (leaf, or a category
  // page that also renders a capped recent-sales grid). gridHasSold() gates
  // this so pure navigation pages skip the (empty) harvest and its ledger
  // stamp entirely.
  if (gridHasSold()){
    if (!pageHasSeriesList()){ st.msg = 'harvesting ' + (breadcrumbCategory() || here) + ' ...'; paint(); }
    const r = await harvestGrid(false);
    tally(r); save(); paint();
    if (r.breaker) return finish('STOPPED - circuit breaker or key rejection. See error panel.');
    if (r.botCheck){                                             // v1.0.9: pause, don't finish; requeue this leaf
      st.running = false; st.i = Math.max(0, st.i - 1);
      st.msg = 'GC BOT CHECK - pass the verification page in this tab (reload it), then press Resume.';
      loopActive = false; save(); paint(); return;
    }
    // v1.0.8: a leaf that finished with no price rejects is DONE - stamp it.
    // v1.0.12: only stamp LEAF pages - a category page's grid is capped, so
    // stamping it would wrongly let the ledger skip the parent on re-sweep.
    if (!pageHasSeriesList() && r.rej === 0 && r.err === 0) ledgerStamp(here);
  }
  save(); paint();
  advance();
}
function advance(){
  if (!st.running){ loopActive = false; return; }
  if (st.stats.pages >= MAX_PAGES) return finish('MAX_PAGES backstop hit');
  // v1.0.8: skip leaves the ledger says were completed within skipDays -
  // no page load, no delay. Category pages are never in the ledger.
  while (st.mode === 'sweep' && st.i < st.queue.length && ledgerFresh(st.queue[st.i])){
    st.i++; st.stats.lskip++;
  }
  if (st.i < st.queue.length){
    const next = st.queue[st.i++];
    save();
    // v1.0.3: polite pacing - pause with +/-25% jitter before every navigation
    const base = Math.max(1, parseFloat(st.delay) || PAGE_DELAY_S);
    const waitMs = Math.round(base * 1000 * (0.75 + Math.random() * 0.5));
    let left = Math.round(waitMs / 1000);
    st.msg = 'next page in ~' + left + 's (' + st.i + '/' + st.queue.length + ') ...'; paint();
    const tick = setInterval(function(){
      if (!st.running){ clearInterval(tick); loopActive = false; st.msg = 'stopped during pause'; save(); paint(); return; }
      left--; st.msg = 'next page in ~' + Math.max(0,left) + 's (' + st.i + '/' + st.queue.length + ') ...'; paint();
    }, 1000);
    setTimeout(function(){
      clearInterval(tick);
      if (!st.running){ loopActive = false; return; }
      location.href = navUrl(next);
    }, waitMs);
    return;
  }
  finish(st.mode + ' finished - ' + st.queue.length + ' pages queued, ' + st.stats.pages + ' harvested');
}
/* =====================================================================
 *  START MODES
 * ===================================================================== */
function startSweep(){
  if (keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not harvest.'; return paint(); }
  clearErrs();   // v1.0.11
  st = Object.assign(FRESH(), { mode:'sweep', running:true,
    detail: el('gch1-detail').checked,
    delay: parseFloat(el('gch1-delay').value) || PAGE_DELAY_S,
    cutoff: (el('gch1-cut').value.trim() || ''),
    skipDays: (function(){ const v = parseFloat(el('gch1-skipdays').value); return isNaN(v) ? SKIP_DAYS_DEFAULT : v; })(),
    msg: 'sweep started from ' + (breadcrumbCategory() || 'here') });
  save(); paint(); processCurrentPage();
}
function startTopUp(){
  if (keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not harvest.'; return paint(); }
  const cut = el('gch1-cut').value.trim();
  if (cut && !/^\d{4}-\d{2}$/.test(cut)){ st.msg = 'cutoff must be YYYY-MM'; return paint(); }
  if (loggedOut()){ st.msg = 'GC LOGIN EXPIRED - sign in to GreatCollections first.'; return paint(); }
  clearErrs();   // v1.0.11
  st = Object.assign(FRESH(), { mode:'topup', running:true, cutoff: cut,
    detail: el('gch1-detail').checked,
    delay: parseFloat(el('gch1-delay').value) || PAGE_DELAY_S,
    queue: collectChildLinks(),
    msg: 'top up: this page + ' + collectChildLinks().length + ' child categories (recent-sales grids)' });
  save(); paint();
  // harvest current page grid first, then the children
  (async function(){
    const r = await harvestGrid(false);
    tally(r); save(); paint();
    if (r.breaker) return finish('STOPPED - circuit breaker or key rejection.');
    advance();
  })();
}
// v1.0.13: AUDIT - read-only coverage pass. No key needed (never writes).
// Walks the leaf tree from HERE (run it from the category root, same as a
// Full Sweep), records GC's sold count + sold lot ids per leaf, ignores the
// ledger (visits every leaf). Export the JSON when it finishes for the DB
// diff. If a leaf is already recorded this pass it is simply overwritten.
function startAudit(){
  if (loggedOut()){ st.msg = 'GC LOGIN EXPIRED - sign in to GreatCollections first (prices/counts need it).'; return paint(); }
  clearErrs();
  st = Object.assign(FRESH(), { mode:'audit', running:true,
    delay: parseFloat(el('gch1-delay').value) || PAGE_DELAY_S,
    skipDays: 0,   // audit never skips
    msg: 'audit started from ' + (breadcrumbCategory() || 'here') + ' (read-only, no writes)' });
  save(); paint(); processCurrentPage();
}
async function onePage(dry){
  if (!dry && keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not harvest.'; return paint(); }
  if (loggedOut()){ st.msg = 'GC LOGIN EXPIRED - sign in to GreatCollections first.'; return paint(); }
  clearErrs();   // v1.0.11
  st.mode = dry ? 'dry' : 'page'; st.cutoff = el('gch1-cut').value.trim();
  st.detail = el('gch1-detail').checked;
  st.msg = dry ? 'dry run ...' : 'single page ...'; paint();
  const r = await harvestGrid(dry);
  tally(r);
  if (r.botCheck){ st.msg = 'GC BOT CHECK during detail fetches - reload this tab, pass the verification, then Page again.'; save(); return paint(); }
  st.msg = (dry ? 'DRY RUN' : 'PAGE') + ' - sold seen ' + r.seen + ' - new ' + r.ins + ' - upd ' + r.upd +
    ' - rej ' + r.rej + ' - skip ' + r.skip + ' - err ' + r.err;
  save(); paint();
}
/* =====================================================================
 *  PANEL
 * ===================================================================== */
function paint(){
  if (!el('gch1-panel')) return;
  const s = st.stats;
  el('gch1-mode').textContent = 'mode ' + st.mode + ' ' + (st.running ? 'RUNNING' : 'idle') +
    '  queue ' + st.i + '/' + st.queue.length +
    '  key:' + (keyMissing() ? 'MISSING' : 'set') +
    '  login:' + (loggedOut() ? 'OUT!' : 'ok') +
    '  delay:' + (parseFloat(st.delay) || PAGE_DELAY_S) + 's' +
    (pageHasSeriesList() ? '  [category]' : '  [leaf]');
  el('gch1-msg').textContent = st.msg || '';
  if (st.mode === 'audit'){
    el('gch1-stats').textContent = 'AUDIT - leaves ' + (s.audited||0) + ' - GC sold total ' + (s.gc_total||0) +
      ' - lot ids ' + (s.ids_total||0) + ' - count mismatches ' + (s.mismatch||0) +
      ' - recorded ' + auditSize();
  } else
  el('gch1-stats').textContent = 'pages ' + s.pages + ' - sold ' + s.seen + ' - new ' + s.new +
    ' - upd ' + s.upd + ' - rej ' + s.rej + ' - skip ' + s.skip + ' - err ' + s.err +
    ' - details ' + s.details + ' - lskip ' + s.lskip + ' - ledger ' + ledgerSize();
  el('gch1-errs').textContent = (st.errs && st.errs.length) ? st.errs.join('\n') : '';
}
function buildPanel(){
  if (el('gch1-panel')) return;
  const css = document.createElement('style');
  css.textContent = '#gch1-panel{position:fixed;right:16px;bottom:14px;z-index:2147483647;' +
    'background:#0d1b3d;color:#e6e6e6;font:12px/1.45 Menlo,Consolas,monospace;padding:10px 12px;' +
    'border:1px solid #33509e;border-radius:8px;width:320px;box-shadow:0 6px 20px rgba(0,0,0,.5)}' +
    '#gch1-panel .hd{color:#fff;font-weight:700;margin-bottom:4px}' +
    '#gch1-panel .ln{color:#9db8ff}' +
    '#gch1-msg{margin:6px 0;padding:4px 6px;background:#060e24;border-radius:4px;color:#ffd479;min-height:16px;word-break:break-word}' +
    '#gch1-panel .row{margin:5px 0;color:#9db8ff}' +
    '#gch1-panel input[type=text]{background:#060e24;color:#e6e6e6;border:1px solid #33509e;border-radius:3px;padding:1px 4px}' +
    '#gch1-panel button{background:#16295e;color:#e6e6e6;border:1px solid #40619e;border-radius:4px;' +
    'padding:3px 7px;margin:2px 3px 2px 0;cursor:pointer}' +
    '#gch1-panel button:hover{background:#1e3a80}' +
    '#gch1-panel label{margin-right:6px;white-space:nowrap;color:#9db8ff}' +
    '#gch1-stats{color:#8ee08e;margin-top:6px}' +
    '#gch1-errs{color:#ff8f8f;margin-top:4px;white-space:pre-wrap;word-break:break-word;max-height:96px;overflow:auto}';
  document.head.appendChild(css);
  const p = document.createElement('div');
  p.id = 'gch1-panel';
  p.innerHTML =
    '<div class="hd">GC Harvester v' + VERSION + '</div>' +
    '<div class="ln" id="gch1-mode"></div>' +
    '<div id="gch1-msg"></div>' +
    '<div class="row"><button id="gch1-sweep" title="Recursive: queue every child series under this page, harvest each leaf grid fully. Run from a top category (or the US Paper Money root for everything).">Full Sweep</button>' +
    '<button id="gch1-topup" title="One level: harvest this page + each direct child category page (capped, recent-sales-sorted grids). Weekly refresh from the US Paper Money root.">Top Up</button></div>' +
    '<div class="row">skip sold before <input type="text" id="gch1-cut" size="8" placeholder="YYYY-MM"> ' +
    '<label title="For each NEW lot, fetch its detail page for exact sold date + cert number (throttled)"><input type="checkbox" id="gch1-detail" checked>details</label></div>' +
    '<div class="row">delay s <input type="text" id="gch1-delay" size="3" value="' + PAGE_DELAY_S + '" title="Pause between page loads (+/-25% jitter). Raise to 10-15 if GC warns about opening pages too quickly."> ' +
    ' skip leaves done within <input type="text" id="gch1-skipdays" size="3" value="' + SKIP_DAYS_DEFAULT + '" title="Full Sweep: skip leaves the ledger shows completed within this many days (0 = off)"> days</div>' +
    '<div class="row"><button id="gch1-dry">Dry Run</button><button id="gch1-page">Page</button>' +
    '<button id="gch1-resume">Resume</button><button id="gch1-stop">Stop</button>' +
    '<button id="gch1-reset">Reset</button>' +
    '<button id="gch1-ledger" title="Forget every leaf completion stamp (forces a true full re-harvest next sweep)">clear ledger</button></div>' +
    '<div class="row"><button id="gch1-audit" title="READ-ONLY coverage pass. Walk every leaf from here (run from a category root), record GC\'s sold count + sold lot ids per leaf. No writes. Export the JSON when done for the DB diff.">Audit</button>' +
    '<button id="gch1-audit-export" title="Copy the audit JSON to the clipboard (paste it back for the DB coverage diff)">Export audit</button>' +
    '<button id="gch1-audit-clear" title="Clear the recorded audit data (does NOT touch harvested rows or the leaf ledger)">clear audit</button></div>' +
    '<div id="gch1-stats"></div>' +
    '<div id="gch1-errs"></div>';
  document.body.appendChild(p);
  el('gch1-sweep').onclick  = startSweep;
  el('gch1-topup').onclick  = startTopUp;
  el('gch1-dry').onclick    = function(){ onePage(true); };
  el('gch1-page').onclick   = function(){ onePage(false); };
  el('gch1-resume').onclick = function(){ st.running = true; st.msg = 'resumed'; save(); paint(); processCurrentPage(); };
  el('gch1-stop').onclick   = function(){ st.running = false; st.msg = 'stopped by user'; save(); paint(); };
  el('gch1-reset').onclick  = function(){ localStorage.removeItem(LS_KEY); st = FRESH();
    st.msg = 'state cleared (leaf ledger kept)'; paint(); };
  el('gch1-ledger').onclick = function(){ if (!confirm('Clear the leaf ledger (' + ledgerSize() + ' leaves)? Next Full Sweep re-harvests everything.')) return;
    localStorage.removeItem(LEDGER_KEY); st.msg = 'leaf ledger cleared'; paint(); };
  // v1.0.13: audit controls
  el('gch1-audit').onclick = startAudit;
  el('gch1-audit-export').onclick = function(){
    const blob = auditExport();
    const n = auditSize();
    if (!n){ st.msg = 'audit is empty - run Audit from a category root first'; return paint(); }
    (navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(blob).then(function(){ st.msg = 'audit JSON copied (' + n + ' leaves) - paste it back for the diff'; paint(); },
          function(){ auditFallbackCopy(blob, n); })
      : Promise.resolve(auditFallbackCopy(blob, n)));
  };
  el('gch1-audit-clear').onclick = function(){ if (!confirm('Clear recorded audit data (' + auditSize() + ' leaves)? Harvested rows and the leaf ledger are NOT affected.')) return;
    localStorage.removeItem(AUDIT_KEY); st.msg = 'audit data cleared'; paint(); };
  if (st.skipDays != null) el('gch1-skipdays').value = st.skipDays;
  // v1.0.10: persist edits immediately so Resume / auto-resume honor them
  el('gch1-delay').addEventListener('input', function(){ const v = parseFloat(this.value); if (v >= 1){ st.delay = v; save(); paint(); } });
  el('gch1-skipdays').addEventListener('input', function(){ const v = parseFloat(this.value); if (!isNaN(v) && v >= 0){ st.skipDays = v; save(); paint(); } });
  el('gch1-cut').addEventListener('input', function(){ st.cutoff = this.value.trim(); save(); });   // v1.0.11: persist cutoff
  if (st.cutoff) el('gch1-cut').value = st.cutoff;
  el('gch1-detail').checked = st.detail !== false;
  if (st.delay) el('gch1-delay').value = st.delay;
}
/* =====================================================================
 *  BOOT
 * ===================================================================== */
function boot(){
  if (!document.body) return setTimeout(boot, 300);
  buildPanel();
  const tf = seriesSelfTest('gch1.0') + gcSelfTest('gch1.0');
  if (tf){ st.msg = 'SELF-TEST FAILED (' + tf + ') - see console. Do not harvest.'; }
  else if (keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not harvest.'; }
  paint();
  if (st.running){ st.msg = 'resuming ...'; save(); processCurrentPage(); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
