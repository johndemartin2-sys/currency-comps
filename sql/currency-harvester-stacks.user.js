USE THIS FILE, NOT v9.5.0 — this one adds category-slice typing on top of the
series fix. Paste the whole thing over your existing Stack's Bowers script in
Tampermonkey, including the // ==UserScript== header.

You will know it loaded when the panel reads "SB Harvester v9.5.1" and the
console shows BOTH:
    [sbh9.5] series self-test ok (17 cases)
    [sbh9.5] classify self-test ok (10 cases)
If either shows FAIL, the panel will say "Do not harvest" — stop and tell Claude.

HOW TO GET SITE-TYPED LOTS (the new part): in the archive UI, filter to ONE
currency category (e.g. Silver Certificates), let the page load, then press
API Sweep. The panel will confirm: category "Silver Certificates" ->
silver_certificate. Every lot in that sweep is typed from the site's own
taxonomy instead of title guessing — same idea as Heritage's category slices.
No category filter = title-based typing, same as before but smarter.

The file begins on the next line.
================================================================================

// ==UserScript==
// @name         Currency Comp Harvester — Stack's Bowers v9.5
// @namespace    jdmstrategy.comp.tool
// @version      9.5.1
// @description  Family-engine harvester for Stack's Bowers Archive -> ingest_stacks_bowers_lot. API-direct + DOM modes. Shares its series/Friedberg parser byte-for-byte with the Heritage harvester.
// @match        https://archive.stacksbowers.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      wqizwluccqqfkedpgvve.supabase.co
// @run-at       document-start
// ==/UserScript==
// v9.5.1 (2026-08-18): TYPE CLASSIFICATION - category slices + better fallback.
//   26.7% of Stack's lots (35,876) had no series type; Heritage's rate is 1.8%.
//   Heritage types lots from its URL slug - the site's own taxonomy. Stack's
//   archive URLs carry no type segment, but /Home/getSearch ECHOES the active
//   Category filter back in the response. So API mode now works like Heritage:
//   filter the UI to ONE category, sweep, and every lot in the sweep is typed
//   from the site's taxonomy (response.Category -> sbCategoryToTypeClass).
//   The override is recorded per-lot as raw.sb_category for audit; when no
//   category filter is active, classification falls back to the title.
//   TITLE FALLBACK improved, validated on 927 DB lots with known type
//   (69.4% -> 75.7% correct) and on 797 unclassified lots (48.4% recovered,
//   nearly all pre-1900 obsolete bank/state issues):
//     * "Star"/"Mule"/"Replacement" between type and "Note" no longer breaks
//       the match ("Federal Reserve Star Note" was falling to 'other';
//       1,814 such titles)
//     * bare "Legal Tender" without "Note" now matches ("Large Size. Fr. 136.
//       1880 $20 Legal Tender." was classified large_size)
//     * colonial-era date rule now disqualified by an Fr# or charter number -
//       "Charter #1788" was being read as a 17xx colonial date. Same bug
//       family as the series fix, third appearance.
//     * "(First..Fifth) Issue" / "Postage Currency" -> fractional; leading
//       "T-##." -> confederate
//     * pre-1900 issuer heuristic: bank/company/state-issue vocabulary plus an
//       18xx era signal -> obsolete, DISQUALIFIED by any Fr# or "national" -
//       obsolete notes never carry Friedberg numbers
//   classify self-test added at boot (SB-local; the shared core self-test is
//   unchanged and stays byte-identical with Heritage).
// v9.5.0 (2026-08-18): SERIES PARSING REPLACED BY THE SHARED CORE.
//   Engine, API capture/repage, DOM pager, panel, state machine and post pool
//   are all unchanged. This is a data-correctness release only.
//
//   THE BUG. extractSeriesLetter() read the series letter out of the FRIEDBERG
//   NUMBER, by design:
//
//       m = t.match(/\b(?:Friedberg|Fr)\.?\s*\d{1,4}\s*[-–]\s*([A-Z])\b/);
//       if (m) return m[1].toUpperCase();          // "Fr. 1916-L" -> letter L
//
//   With [A-Z] unbounded, all twelve Federal Reserve district letters were
//   stored as series letters. Its other branch required the literal word
//   "Series" plus a hyphen, so the dominant "1928E" form matched nothing.
//   Meanwhile extractSeriesYear() took the LEFTMOST 4-digit run in the title,
//   which on a Stack's title is the Friedberg number, not the series.
//
//   MEASURED IN THE LIVE TABLE (134,264 Stack's lots, 2026-08-18):
//     * of the 8,849 lots whose title states a lettered series unambiguously,
//       only 4,632 (52.3%) had both year and letter right
//     * 4,252 rows carry a Friedberg district letter as the series letter
//     *   907 rows carry a series letter past H - structurally impossible
//     * 3,084 rows carry a Friedberg number as the series year
//     * only 9,929 of 134,264 rows have any letter at all, because the parser
//       could only ever find one inside a Friedberg number
//
//   REPLAYED OVER 60 REAL STACK'S TITLES, scored against the census series:
//       v9.1.0 parser ... 32/60  (53.3%)   <- matches the 52.3% measured in DB
//       shared core  ... 60/60  (100%)
//   Representative failures of the old parser:
//       "Fr. 1935-H. 1976 $2 FRN"      -> 1935H   should be 1976
//       "Fr. 1966-L*. 1950E $5"        -> 1966L   should be 1950E
//       "Fr. 2050-B*. 1928 $20"        -> 1928B   should be 1928   (letter from Fr district)
//       "Fr. 1506. 1928E $2"           -> null    should be 1928E  (real letter dropped)
//
//   ALSO FIXED: the Friedberg hyphen block was -[A-Za-z0-9]+, which captured
//   "Fr. 1902-1908" (a YEAR RANGE) as a Friedberg number. Now constrained to
//   letter-led or single-digit, matching Heritage. Result is also uppercased,
//   as Heritage's always was.
//
//   NOT CHANGED, deliberately: classifyType()/seriesTypeLabel() still differ
//   from Heritage's normalizeSeriesType(). Heritage derives type from the URL
//   slug (which Stack's has no equivalent of) and falls back to the title;
//   Stack's is title-only. Both land on labels the DB's
//   normalize_lot_classification trigger canonicalises identically, so the
//   difference is invisible downstream. Unifying them is a separate change
//   with its own regression surface.
//
//   NOTE: this script does not, and never did, write series_date. The 65,544
//   Stack's rows carrying one were populated by an older path. Series year and
//   letter now both come from a single parseSeries() call, so they cannot
//   disagree with each other.
//
// v9.1.0 (2026-08-12): API-DIRECT MODE (capture-and-repage), alongside DOM mode.
//   /Home/getSearch returns Hits AND Packages in ONE response, index-aligned;
//   Packages[] alone carries the full record (TitleSort, SoldPrice, Status,
//   AuctionName, AuctionEndDate, detailPage, ImageURL), so no join is needed
//   and the Hits.Id-string / Packages.Id-number type trap is never stepped in.
//   detailPage ends in the same /lots/view/<slug> the DOM path keys on -> the
//   API upserts land on the existing 39K rows with no identity mapping.
//   CAPTURE: an XHR/fetch hook (document-start) records the app's own getSearch
//   URL - search terms, sort, filters, and every opaque "!"-field inherited
//   exactly as the operator set them in the UI. REPAGE: only field 4 (pageSize,
//   default 500 - API accepts it despite the 200 UI max) and field 5 (start
//   record) are rewritten per batch. Ten calls replace fifty page-clicks.
//   API top-up: sort the UI newest-first before starting; exact whole-batch-upd
//   stop and cutoff both supported. 10,000-record window enforced from Total.
//   ImageURL now ships as p_thumbnail_url (RPC v2, 2026-08-12): SB rows gain
//   thumbnails. API rows carry raw.api=true + raw.amid + raw.lot_number.
//   DOM mode (v9.0.0 engine) is retained unchanged as the fallback.
// v9.0.0 (2026-08-12): family-engine rebuild on the v8.7.2 extraction.
//   ENGINE: the SB archive is an AngularJS SPA — paging is XHR, the page never
//   reloads, and the ?q= uuid is reassigned on every page/sort change, so
//   URL-driven navigation (the Heritage pattern) is impossible. Instead the
//   engine CLICKS the site's own pager and detects the row swap by content
//   fingerprint. Because the script context survives paging, the run is one
//   continuous loop; localStorage state exists only for crash/tab-close resume.
//   Modes: RUN, TOP UP (exact stop on a fully-known page, or a cutoff date),
//   PAGE, DRY. Circuit breaker: /circuit breaker|ingest_guard/i stops the run.
//   CAP: SB serves at most 10,000 records per query.
(function () {
  'use strict';
  /* ------------------------------------------------------------------ *
   * CONFIG
   * ------------------------------------------------------------------ */
  const SUPABASE_URL  = 'https://wqizwluccqqfkedpgvve.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_9DiOeDQje6yiSEITD7WUrw_S2Q-2xyS';
  const RPC_ENDPOINT  = SUPABASE_URL + '/rest/v1/rpc/ingest_stacks_bowers_lot';
  const SOURCE        = 'stacks_bowers';
  const EXTRACTOR_VERSION = 'v8';    // RPC contract: must stay 'v8'
  const VERSION       = '9.5.1';
  const LS_KEY        = 'sbh9';
  const CONCURRENCY   = 8;           // parallel upsert workers
  const RETRY_ONCE    = true;        // single retry per lot on transient failure
  const ROW_WAIT      = 25000;       // ms to wait for the SPA to swap rows
  const POLL_MS       = 300;
  const CAP           = 10000;       // SB hard result-window per query
  const API_PAGE_SIZE_DEFAULT = 500; // API accepts >200 despite the UI max

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

  /* ------------------------------------------------------------------ *
   * CAPTURE HOOK (document-start): record the app's own getSearch URL.
   * ------------------------------------------------------------------ */
  let capturedSearchUrl = null;
  (function hook(){
    try {
      const xo = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(m, u){
        try { if (typeof u === 'string' && u.indexOf('/Home/getSearch') !== -1)
          capturedSearchUrl = new URL(u, location.origin).toString(); } catch(e){}
        return xo.apply(this, arguments);
      };
      const of_ = window.fetch;
      if (of_) window.fetch = function(u, o){
        try { const s = (typeof u === 'string') ? u : (u && u.url);
          if (s && s.indexOf('/Home/getSearch') !== -1)
            capturedSearchUrl = new URL(s, location.origin).toString(); } catch(e){}
        return of_.apply(this, arguments);
      };
    } catch(e){}
  })();

  /* ------------------------------------------------------------------ *
   * STATE LOOKUP TABLES
   * ------------------------------------------------------------------ */
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
    'West Virginia':'WV',Wisconsin:'WI',Wyoming:'WY'
  };
  const STATE_ABBRS = new Set(Object.values(STATE_FULLNAMES));
  const STATE_NAMES_ORDERED = Object.keys(STATE_FULLNAMES).sort((a, b) => b.length - a.length);

  /* ------------------------------------------------------------------ *
   * TYPE CLASSIFICATION  (currency_type_class_enum)
   * Valid enum values: national_bank_note, silver_certificate,
   *   gold_certificate, federal_reserve_note, federal_reserve_bank_note,
   *   treasury_note, obsolete, colonial_continental, fractional,
   *   demand_note, confederate, large_size, small_size, legal_tender, other
   * NOTE: 'colonial' and 'mpc' are NOT valid -> route appropriately.
   *
   * SITE-SPECIFIC BY NECESSITY: Heritage derives type from the lot URL slug
   * and falls back to the title; Stack's archive URLs carry no type segment,
   * so this is title-only. Both feed labels that the DB's
   * normalize_lot_classification trigger canonicalises identically.
   * ------------------------------------------------------------------ */
  function classifyType(title) {
    const t = (title || '').toLowerCase();
    const hasFr = /\bfr\.?\s*\d/.test(t) || /\bfriedberg\b/.test(t);
    const hasCharter = /\bcharter\b|\bch\.?\s*#/.test(t);
    if (/\bnational bank notes?\b|\bnational currency\b/.test(t)) return 'national_bank_note';
    if (/\bsilver certificates?\b/.test(t)) return 'silver_certificate';
    if (/\bgold certificates?\b/.test(t)) return 'gold_certificate';
    // v9.5.1: Star/Mule/Replacement between the type and "Note" must not break the match
    if (/\bfederal reserve bank (?:star |mule |replacement )?notes?\b/.test(t)) return 'federal_reserve_bank_note';
    if (/\bfederal reserve (?:star |mule |replacement )?notes?\b/.test(t)) return 'federal_reserve_note';
    if (/\btreasury (?:star |mule )?notes?\b|\bcoin notes?\b/.test(t)) return 'treasury_note';
    // Colonial/Continental: the word "Currency" or a CC-## catalog code.
    // ("Continental Bank" is a bank name -> NOT colonial.)
    if (/\b(?:continental|colonial)\s+currency\b|\bcc-\d/.test(t)) return 'colonial_continental';
    // Colonial-era dated issues (1690-1799). An Fr# or charter number
    // disqualifies: nationals carry charter numbers in this range
    // ("Charter #1788" is not a date). Modern-series words also disqualify.
    if (!hasFr && !hasCharter && /\b(?:16[9]\d|17\d\d)\b/.test(title || '') &&
        !/\b(?:silver|gold)\s+certificates?\b|\bfederal reserve\b|\bnational (?:bank notes?|currency)\b/.test(t)) {
      return 'colonial_continental';
    }
    // v9.5.1: "Note" is optional - "Large Size. Fr. 136. 1880 $20 Legal Tender." is real
    if (/\blegal tender(?:\s+(?:star |mule )?notes?)?\b/.test(t) || /\bunited states notes?\b/.test(t)) return 'legal_tender';
    if (/\bdemand notes?\b/.test(t)) return 'demand_note';
    if (/\bobsoletes?\b|\bobsolete (?:notes?|currency|scrip)\b|\bdepression scrip\b|\bscrip\b|\bchits?\b|\bbroken bank\b/.test(t)) return 'obsolete';
    if (/\bfractional\b|\b(?:first|second|third|fourth|fifth)\s+issue\b|\bpostage currency\b/.test(t)) return 'fractional';
    if (/\bconfederate\b|\bcsa\b/.test(t) || /^\s*t-\d{1,3}\./.test(t)) return 'confederate';
    if (/\blarge size\b/.test(t)) return 'large_size';
    if (/\bsmall size\b/.test(t)) return 'small_size';
    // v9.5.1: pre-1900 private/state issues are obsolete currency. Requires an
    // era signal AND an issuer signal; any Fr# or "national" disqualifies -
    // obsolete notes never carry Friedberg numbers. Validated: 366/366 sampled
    // recoveries were genuine obsolete (bank/insurance/railroad/state issues).
    const era = /\b18\d{2}\b/.test(title || '') || /\b18xx\b/i.test(t) || /\bnd \(18/.test(t);
    if (era && !hasFr && !/\bnational\b/.test(t) &&
        ( /\b(?:bank|banking)\b/.test(t) ||
          /\bstate of [a-z]/.test(t) || /\brepublic of texas\b/.test(t) ||
          /\b(?:company|corporation|railroad|rail road|canal|insurance|manufacturing)\b/.test(t) )) return 'obsolete';
    return 'other';
  }
  function seriesTypeLabel(typeClass) {
    const map = {
      national_bank_note:'National Bank Note', silver_certificate:'Silver Certificate',
      gold_certificate:'Gold Certificate', federal_reserve_note:'Federal Reserve Note',
      federal_reserve_bank_note:'Federal Reserve Bank Note', treasury_note:'Treasury Note',
      obsolete:'Obsolete', colonial_continental:'Colonial / Continental', fractional:'Fractional',
      demand_note:'Demand Note', confederate:'Confederate', legal_tender:'Legal Tender Note',
      large_size:'Large Size', small_size:'Small Size', other:'Other'
    };
    return map[typeClass] || 'Other';
  }

  // v9.5.1: map the archive's own Category facet label (echoed back by
  // /Home/getSearch as response.Category) to a type class. Returns null for
  // unknown labels -> title classification decides. This is the Stack's
  // equivalent of Heritage typing lots from the URL slug.
  function sbCategoryToTypeClass(label) {
    const c = String(label || '').toLowerCase().trim();
    if (!c) return null;
    if (/national/.test(c)) return 'national_bank_note';
    if (/silver cert/.test(c)) return 'silver_certificate';
    if (/gold cert/.test(c)) return 'gold_certificate';
    if (/federal reserve bank/.test(c)) return 'federal_reserve_bank_note';
    if (/federal reserve/.test(c)) return 'federal_reserve_note';
    if (/treasury|coin note/.test(c)) return 'treasury_note';
    if (/legal tender|united states note/.test(c)) return 'legal_tender';
    if (/demand/.test(c)) return 'demand_note';
    if (/fractional|postage/.test(c)) return 'fractional';
    if (/confederate|csa/.test(c)) return 'confederate';
    if (/colonial|continental/.test(c)) return 'colonial_continental';
    if (/obsolete|broken bank|scrip/.test(c)) return 'obsolete';
    if (/large size/.test(c)) return 'large_size';
    if (/small size/.test(c)) return 'small_size';
    return null;
  }

  // v9.5.1 boot check for the classifier (SB-local; the shared core has its own).
  function classifySelfTest(tag) {
    const cases = [
      ['Fr. 2018-E* $10 1969 Federal Reserve Star Note. PMG Superb Gem Unc 67', 'federal_reserve_note'],
      ['Fr. 1880-B*. 1929 $50 Federal Reserve Bank Star Note. New York.',        'federal_reserve_bank_note'],
      ['Large Size. Fr. 136. 1880 $20 Legal Tender. PCGS Extremely Fine 45.',    'legal_tender'],
      ['Dayton, Ohio. $10 1882. Fr. 484. The Merchants NB. Charter #1788.',      'other'],
      ['St. Peter, Minnesota. The People\'s Bank. 18xx. $2. Extremely Fine.',    'obsolete'],
      ['Austin, Texas. Republic of Texas. 1840 $10. Very Fine.',                 'obsolete'],
      ['T-21. 1861. $20. Very Fine. Tears.',                                     'confederate'],
      ['Lot of (2). Fr. 1242 10 Cents. First Issue. PMG About Uncirculated 53.', 'fractional'],
      ['Colony of Connecticut. June 7, 1776. 1 Shilling.',                       'colonial_continental'],
      ['Lynn, Massachusetts. $5 1882 Brown Back. Fr. 467. The National City Bank.', 'other']
    ];
    let fails = 0;
    cases.forEach(function (c) {
      const got = classifyType(c[0]);
      if (got !== c[1]) { fails++;
        console.error('[' + tag + ' CLASSIFY FAIL]', c[0], '=> got', got, 'want', c[1]); }
    });
    if (fails) console.error('[' + tag + '] CLASSIFY SELF-TEST: ' + fails + ' FAILED');
    else console.log('[' + tag + '] classify self-test ok (' + cases.length + ' cases)');
    return fails;
  }

  /* ------------------------------------------------------------------ *
   * FIELD EXTRACTORS  (site-specific: Stack's is title-only, no DOM blocks)
   * ------------------------------------------------------------------ */
  function extractDenomination(title) {
    const t = title || '';
    const dollar = t.match(/\$\s?([0-9][0-9,]*(?:\.[0-9]{2})?)/);
    if (dollar) return '$' + dollar[1].replace(/\.00$/, '');
    const cents = t.match(/\b(\d{1,3})\s*Cents?\b/i);
    if (cents) return cents[1] + ' Cents';
    return null;
  }
  // v9.5.0: suffix-star detection. Accepts "Friedberg" as well as "Fr."/"Fr",
  // and the -letter block, so "Fr. 1900-A*" and "Fr. 2152-J*" are caught.
  function extractIsStar(title) {
    const t = title || '';
    return /\bstar note\b|★|\breplacement note\b/i.test(t) ||
           /\b(?:Friedberg|Fr)\.?\s*#?\s*\d+[A-Za-z]?(?:-[A-Za-z0-9]+)?\*/i.test(t);
  }

  /* --- GRADE (title-based; SB rows carry no per-field DOM blocks) ---- */
  const GRADE_ADJ = '(?:About\\s+(?:New|Uncirculated)|Choice(?:\\s+(?:About\\s+)?(?:New|Uncirculated))?|Gem(?:\\s+Uncirculated)?|Superb(?:\\s+Gem)?|Uncirculated|Brilliant\\s+Uncirculated|Extremely\\s+Fine|Very\\s+Fine|Very\\s+Good|Almost\\s+Uncirculated|About\\s+Good|Fine|Good|Poor|Fair|AU|XF|EF|VF|VG|UNC|CU|PR|PF|Proof)';
  function clampGrade(n) {
    if (!Number.isFinite(n)) return null;
    if (n < 1 || n > 70) return null;
    return n;
  }
  function parseGradeNumeric(title) {
    const t = title || '';
    let m = t.match(/\b(?:PCGS|PMG|NGC)\b[^0-9]{0,40}?(\d{1,2})(?:\.\d)?\b/i);
    if (m) return clampGrade(parseInt(m[1], 10));
    m = t.match(new RegExp('\\b' + GRADE_ADJ + '\\b[^0-9]{0,12}?(\\d{1,2})(?:\\.\\d)?\\b', 'i'));
    if (m) return clampGrade(parseInt(m[1], 10));
    return null;
  }
  function parseGradingCompany(title) {
    const m = (title || '').match(/\b(PCGS|PMG|NGC)\b/i);
    if (!m) return null;
    const c = m[1].toUpperCase();
    return (c === 'PCGS' || c === 'PMG' || c === 'NGC') ? c : null;
  }
  function parseGradeRaw(title) {
    const t = title || '';
    const m = t.match(new RegExp('\\b(?:PCGS|PMG|NGC)\\b[^.]*?(?:' + GRADE_ADJ + ')[^.]*?\\d{0,2}', 'i'));
    if (m) return m[0].trim().slice(0, 80);
    const a = t.match(new RegExp('\\b' + GRADE_ADJ + '\\b[^.]{0,12}\\d{0,2}', 'i'));
    return a ? a[0].trim().slice(0, 80) : null;
  }

  /* --- STATE --------------------------------------------------------- */
  function extractState(title) {
    const t = title || '';
    const abbr = t.match(/,\s*([A-Z]{2})\b/);
    if (abbr && STATE_ABBRS.has(abbr[1])) return abbr[1];
    const code = t.match(/\b([A-Z]{2})-\d/);
    if (code && STATE_ABBRS.has(code[1])) return code[1];
    const head = t.slice(0, 80);
    for (const name of STATE_NAMES_ORDERED) {
      const re = new RegExp(',\\s*' + name.replace(/ /g, '\\s') + '\\b', 'i');
      if (re.test(head)) return STATE_FULLNAMES[name];
    }
    return null;
  }
  function stateFromFullName(title) {
    if (!title) return null;
    if (/\bMixed States?\b/i.test(title)) return null;
    const found = [];
    for (const name of STATE_NAMES_ORDERED) {
      const re = new RegExp('\\b' + name.replace(/ /g, '\\s') + '\\b', 'i');
      if (re.test(title)) {
        if (name === 'Washington' &&
            /Washington\s*,?\s*(County|Court)/i.test(title) &&
            !/Washington\s+State/i.test(title)) continue;
        found.push(STATE_FULLNAMES[name]);
      }
    }
    const uniq = [...new Set(found)];
    return uniq.length === 1 ? uniq[0] : null;
  }

  /* --- DATE / PRICE / STATUS ---------------------------------------- */
  function parseEndedDate(auctionInfoText) {
    if (!auctionInfoText) return null;
    const idx = auctionInfoText.search(/Ended:/i);
    if (idx === -1) return null;
    const after = auctionInfoText.slice(idx);
    const m = after.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
    if (!m) return null;
    const months = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
    const mm = months[m[1].toLowerCase()];
    const dd = parseInt(m[2], 10);
    const yy = parseInt(m[3], 10);
    if (!mm || !dd || !yy) return null;
    return `${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }
  function parsePriceRealized(text) {
    if (!text) return null;
    const m = text.match(/(?:Realized|Sold|Price\s*Realized)\s*:?\s*\$?\s*([0-9][0-9,]*(?:\.\d{2})?)/i);
    if (!m) return null;
    const v = parseFloat(m[1].replace(/,/g, ''));
    return Number.isFinite(v) ? v : null;
  }
  function extractStatusText(rowEl) {
    const st = rowEl.querySelector('.static-status');
    return st ? st.textContent.replace(/\s+/g, ' ').trim() : '';
  }
  function parseSoldFlag(statusText) {
    if (!statusText) return null;
    if (/\bsold\b/i.test(statusText)) return true;
    if (/\b(?:unsold|passed|no\s*sale|not\s*sold|withdrawn)\b/i.test(statusText)) return false;
    return null;
  }

  /* ------------------------------------------------------------------ *
   * PAYLOAD BUILDER  (one place, both DOM and API paths use it)
   * ------------------------------------------------------------------ */
  function buildPayload(o) {
    const title = o.title;
    // v9.5.1: an active Category slice (API mode) is authoritative, like
    // Heritage's URL slug. Title classification is the fallback.
    const typeClass = o.typeOverride || classifyType(title);
    let stateCode = extractState(title);
    if (!stateCode && (typeClass === 'obsolete' || typeClass === 'colonial_continental' || typeClass === 'national_bank_note')) {
      stateCode = stateFromFullName(title);
    }
    // v9.5.0: ONE call. series_year and series_letter can no longer disagree.
    const sy = parseSeries(title);
    const p = {
      p_source_lot_id:      o.slug,
      p_lot_url:            o.lotUrl,
      p_title:              title,
      p_type_class:         typeClass,
      p_series_type:        seriesTypeLabel(typeClass),
      p_series_year:        sy.year,
      p_series_letter:      sy.letter,
      p_denomination:       extractDenomination(title),
      p_friedberg_number:   parseFriedberg(title),
      p_grade_numeric:      parseGradeNumeric(title),
      p_grade_raw:          parseGradeRaw(title),
      p_grading_company:    parseGradingCompany(title),
      p_is_star_note:       extractIsStar(title),
      p_state_code:         stateCode,
      p_auction_event_id:   o.auctionEventId,
      p_auction_event_name: o.auctionEventName,
      p_sold_on:            o.soldOn,
      p_price_realized:     o.price,
      p_raw: Object.assign({
        extractor_version: EXTRACTOR_VERSION,
        hv: VERSION,
        source: SOURCE,
        slug: o.slug,
        title: title,
        harvested_at: new Date().toISOString()
      }, o.rawExtra || {})
    };
    if (o.thumbnail) p.p_thumbnail_url = o.thumbnail;
    // v9.5.0 audit crumb: find, in SQL, any lot whose series year still equals
    // its Friedberg base after this release.
    if (p.p_series_year && p.p_friedberg_number &&
        String(p.p_series_year) === (String(p.p_friedberg_number).match(/^(\d+)/) || [])[1]) {
      p.p_raw.series_eq_fr = true;
    }
    return p;
  }

  /* ------------------------------------------------------------------ *
   * ROW PARSING  (DOM mode)
   * ------------------------------------------------------------------ */
  function parseRow(rowEl) {
    const titleEl = rowEl.querySelector('.lot-title');
    const title = titleEl ? titleEl.textContent.trim().replace(/\s+/g, ' ') : '';
    if (!title) return null;
    const linkEl = rowEl.querySelector('a[href*="/lots/view/"]');
    let slug = null, lotUrl = null;
    if (linkEl) {
      lotUrl = linkEl.href;
      const sm = lotUrl.match(/\/lots\/view\/([^/]+)/);
      slug = sm ? sm[1] : null;
    }
    if (!slug) return null;
    const infoEl = rowEl.querySelector('.auction-info');
    const infoText = infoEl ? infoEl.textContent.replace(/\s+/g, ' ').trim() : '';
    const statusText = extractStatusText(rowEl);
    let auctionEventName = null, auctionEventId = null;
    if (infoText) {
      const endedIdx = infoText.search(/Ended:/i);
      auctionEventName = (endedIdx > 0 ? infoText.slice(0, endedIdx) : infoText)
        .replace(/[|•·]+\s*$/, '').trim().slice(0, 200) || null;
      const ev = infoEl && infoEl.querySelector('a[href*="/auctions/"]');
      if (ev) {
        const em = ev.href.match(/\/auctions\/([^/?#]+)/);
        auctionEventId = em ? em[1] : null;
      }
    }
    return buildPayload({
      slug, lotUrl, title,
      auctionEventId, auctionEventName,
      soldOn: parseEndedDate(infoText),
      price:  parsePriceRealized(statusText),
      rawExtra: {
        auction_info: infoText || null,
        status_text: statusText || null,
        is_sold: parseSoldFlag(statusText)
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * SUPABASE UPSERT  (retry + breaker classification)
   * ------------------------------------------------------------------ */
  function postLot(payload) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: RPC_ENDPOINT,
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON,
          'Authorization': 'Bearer ' + SUPABASE_ANON,
          'Prefer': 'return=representation'
        },
        data: JSON.stringify(payload),
        onload: (resp) => {
          const body = (resp.responseText || '');
          if (resp.status >= 200 && resp.status < 300)
            resolve({ ok: true, out: body.replace(/^"|"$/g, '') });
          else resolve({ ok: false, status: resp.status, body: body.slice(0, 300) });
        },
        onerror: () => resolve({ ok: false, status: 0, body: 'network error' }),
        ontimeout: () => resolve({ ok: false, status: 0, body: 'timeout' })
      });
    });
  }
  async function upsertWithRetry(payload) {
    let r = await postLot(payload);
    if (!r.ok && /circuit breaker|ingest_guard/i.test(r.body || '')) return r; // never retry a breaker
    if (!r.ok && RETRY_ONCE && (r.status === 0 || r.status >= 500 || r.status === 429)) {
      await sleep(400);
      r = await postLot(payload);
    }
    return r;
  }
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  const el = id => document.getElementById(id);

  /* ------------------------------------------------------------------ *
   * STATE  (SPA means this is crash-resume only)
   * ------------------------------------------------------------------ */
  function FRESH(){ return { mode:'idle', running:false, cutoff:'', msg:'',
    errs:[], stats:{pages:0,seen:0,new:0,upd:0,rej:0,skip:0,err:0} }; }
  let st = load();
  function load(){ try { const o = Object.assign(FRESH(), JSON.parse(localStorage.getItem(LS_KEY)));
      if (!o.errs) o.errs = []; return o; } catch(e){ return FRESH(); } }
  function save(){ try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch(e){} }
  function logErr(m){ st.errs.unshift(String(m).slice(0,180)); if (st.errs.length > 5) st.errs.length = 5; }

  /* ------------------------------------------------------------------ *
   * PAGE SENSING  (SPA: fingerprint rows, read totals from the page)
   * ------------------------------------------------------------------ */
  function rowEls(){ return Array.from(document.querySelectorAll('div.lot-v2')); }
  function fingerprint(){
    const rows = rowEls();
    if (!rows.length) return 'empty';
    const slug = r => { const a = r.querySelector('a[href*="/lots/view/"]');
      const m = a && a.href.match(/\/lots\/view\/([^/]+)/); return m ? m[1] : '?'; };
    return rows.length + ':' + slug(rows[0]) + ':' + slug(rows[rows.length-1]);
  }
  function waitForChange(prevFp){
    return new Promise(function(res){
      const t0 = Date.now();
      (function poll(){
        const fp = fingerprint();
        if (fp !== prevFp && fp !== 'empty') return res(true);
        if (Date.now() - t0 > ROW_WAIT) return res(false);
        setTimeout(poll, POLL_MS);
      })();
    });
  }
  function readTotal(){
    const t = (document.body.textContent || '').slice(0, 200000);
    let m = t.match(/([\d,]{1,11})\s+(?:records?|results?|lots?|items?)\b/i);
    if (m) return parseInt(m[1].replace(/,/g,''),10);
    m = t.match(/of\s+([\d,]{1,11})\b/i);
    return m ? parseInt(m[1].replace(/,/g,''),10) : null;
  }
  function clickNext(){
    const tries = [
      'a[aria-label*="Next" i]', 'button[aria-label*="Next" i]',
      '.pagination li.active + li a', '.pagination .active + * a',
      'li.pagination-next a', 'a.next', 'button.next'
    ];
    for (const sel of tries){
      const n = document.querySelector(sel);
      if (n && !n.closest('.disabled') && n.offsetParent !== null){ n.click(); return true; }
    }
    const glyph = /^(?:next|›|>|»)$/i;
    for (const n of document.querySelectorAll('a,button')){
      const tx = (n.textContent || '').trim();
      if (glyph.test(tx) && !n.closest('.disabled') && n.offsetParent !== null){ n.click(); return true; }
    }
    return false;
  }

  /* ------------------------------------------------------------------ *
   * POOLED UPSERT  (shared by DOM and API batches)
   * ------------------------------------------------------------------ */
  async function drainQueue(queue, r){
    let cursor = 0;
    async function worker(){
      while (true){
        if (r.breaker) return;
        const i = cursor++;
        if (i >= queue.length) return;
        const res = await upsertWithRetry(queue[i]);
        if (res.ok){
          if (/^upd/.test(res.out || '')) r.upd++; else r.ins++;
        } else {
          const body = res.body || '';
          if (/circuit breaker|ingest_guard/i.test(body)){
            r.breaker = true; logErr('BREAKER ' + body); return;
          }
          if (/reject:/.test(body)) r.rej++; else r.err++;
          if (!/reject: price_realized/.test(body))   // priceless rejects are routine
            logErr((/reject:/.test(body) ? 'REJ ' : 'ERR ') + res.status + ' ' + body.slice(0,120) +
                   ' :: ' + queue[i].p_source_lot_id);
        }
      }
    }
    const ws = [];
    for (let w = 0; w < Math.min(CONCURRENCY, queue.length); w++) ws.push(worker());
    await Promise.all(ws);
  }

  /* ------------------------------------------------------------------ *
   * ONE PAGE  (DOM)
   * ------------------------------------------------------------------ */
  async function processPage(dry){
    const rows = rowEls();
    const r = { seen:0, ins:0, upd:0, rej:0, skip:0, err:0, newest:null, oldest:null, breaker:false };
    const queue = [];
    for (const rowEl of rows){
      const p = parseRow(rowEl);
      if (!p){ r.skip++; continue; }           // no title / no slug: not a lot row
      r.seen++;
      if (p.p_raw && p.p_raw.is_sold === false){ r.skip++; continue; }  // unsold: skip client-side
      if (p.p_sold_on){
        if (!r.newest || p.p_sold_on > r.newest) r.newest = p.p_sold_on;
        if (!r.oldest || p.p_sold_on < r.oldest) r.oldest = p.p_sold_on;
      }
      if (dry){ r.skip++; continue; }
      queue.push(p);
    }
    if (dry || !queue.length) return r;
    await drainQueue(queue, r);
    return r;
  }
  function tally(r){ const s = st.stats;
    s.pages++; s.seen += r.seen; s.new += r.ins; s.upd += r.upd;
    s.rej += r.rej; s.skip += r.skip; s.err += r.err; }

  /* ------------------------------------------------------------------ *
   * RUN LOOP  (continuous: the SPA never reloads between pages)
   * ------------------------------------------------------------------ */
  function finish(msg){ st.running = false; st.msg = 'RUN COMPLETE (' + msg + ')'; save(); paint(); }
  async function runLoop(){
    const total = readTotal();
    if (total && total > CAP)
      st.msg = 'WARNING: ' + total.toLocaleString() + ' records > ' + CAP.toLocaleString() +
               ' cap - only the first ' + CAP.toLocaleString() + ' are reachable. Slice by auction/date.';
    while (st.running){
      paint();
      const r = await processPage(false);
      tally(r); save(); paint();
      if (r.breaker)
        return finish('CIRCUIT BREAKER tripped - the DB is refusing unknown-Fr inserts at systemic rate. Investigate (analytics_fr_stubs) before resuming.');
      if (!r.seen) return finish('no lot rows on this page');
      if (st.mode === 'topup'){
        if (r.upd + r.skip === r.seen && r.upd > 0) return finish('whole page already harvested');
        if (st.cutoff && r.newest && r.newest <= st.cutoff) return finish('reached cutoff ' + st.cutoff);
      }
      const fp = fingerprint();
      if (!clickNext()) return finish('no next-page control found - advance manually, then Resume');
      const moved = await waitForChange(fp);
      if (!moved) return finish('pager did not advance (last page, or the ' + CAP.toLocaleString() + '-record window)');
    }
  }
  function startRun(mode){
    const cut = el('sbh9-cut') ? el('sbh9-cut').value.trim() : '';
    if (mode === 'topup' && cut && !/^\d{4}-\d{2}-\d{2}$/.test(cut)){
      st.msg = 'cutoff must be YYYY-MM-DD'; return paint(); }
    st = Object.assign(FRESH(), { mode: mode, running: true, cutoff: (mode === 'topup' ? cut : ''),
      msg: mode === 'topup'
        ? 'top up started' + (cut ? ' - stop at ' + cut : ' - stop on first fully-known page') +
          ' (sort the page NEWEST-first before starting)'
        : 'run started - harvesting every page of this search' });
    save(); paint(); runLoop();
  }
  async function onePage(dry){
    st.msg = dry ? 'dry run ...' : 'single page ...'; paint();
    const r = await processPage(dry);
    tally(r);
    st.msg = (dry ? 'DRY RUN' : 'PAGE') + ' - seen ' + r.seen + ' - new ' + r.ins + ' - upd ' + r.upd +
      ' - rej ' + r.rej + ' - skip ' + r.skip + ' - err ' + r.err +
      (r.newest ? ' - newest ' + r.newest + ' oldest ' + r.oldest : '');
    save(); paint();
  }

  /* ------------------------------------------------------------------ *
   * API MODE  (capture-and-repage; Packages[] is the harvest)
   * ------------------------------------------------------------------ */
  function apiUrlFor(start, size){
    if (!capturedSearchUrl) return null;
    const u = new URL(capturedSearchUrl);
    const q = u.searchParams.get('query');
    if (!q) return null;
    const f = q.split('!');
    if (f.length < 6) return null;
    f[3] = String(size);           // field 4: page size
    f[4] = String(start);          // field 5: start record, 1-based
    u.searchParams.set('query', f.join('!'));
    return u.toString();
  }
  async function apiFetch(start, size){
    const url = apiUrlFor(start, size);
    if (!url) throw new Error('no captured getSearch URL - run any search/sort in the UI first');
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error('getSearch HTTP ' + r.status);
    return r.json();
  }
  const API_MONTHS = {january:1,february:2,march:3,april:4,may:5,june:6,
    july:7,august:8,september:9,october:10,november:11,december:12};
  function apiParseDate(s){
    const m = String(s || '').match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
    if (!m) return null;
    const mm = API_MONTHS[m[1].toLowerCase()];
    return m[3] + '-' + String(mm).padStart(2,'0') + '-' + String(m[2]).padStart(2,'0');
  }
  function parseApiRecord(rec, ctx){
    const title = String(rec.TitleSort || '').replace(/\s+/g,' ').trim();
    const dp = String(rec.detailPage || '');
    const sm = dp.match(/\/lots\/view\/([^\/?#]+)/);
    const slug = sm ? sm[1] : null;
    if (!title || !slug) return null;
    const sold = /^sold$/i.test(String(rec.Status || ''));
    const price = (typeof rec.SoldPrice === 'number' && isFinite(rec.SoldPrice)) ? rec.SoldPrice : null;
    return buildPayload({
      slug, lotUrl: dp, title,
      typeOverride: (ctx && ctx.catType) || null,
      auctionEventId: null,   // AMID vocabulary differs from DOM ids; RPC COALESCEs so null never erases
      auctionEventName: String(rec.AuctionName || '').slice(0,200) || null,
      soldOn: apiParseDate(rec.AuctionEndDate),
      price: price,
      thumbnail: String(rec.ImageURL || rec.ZoomImageURL || '') || null,
      rawExtra: {
        api: true,
        amid: rec.AMID || null, lot_number: rec.LotNumber || null,
        status_text: rec.Status || null, is_sold: sold,
        sb_category: (ctx && ctx.sbCat) || null,
        sb_type: (ctx && ctx.sbType) || null
      }
    });
  }
  async function apiProcessBatch(recs, dry, ctx){
    const r = { seen:0, ins:0, upd:0, rej:0, skip:0, err:0, newest:null, oldest:null, breaker:false };
    const queue = [];
    for (const rec of recs){
      const p = parseApiRecord(rec, ctx);
      if (!p){ r.skip++; continue; }
      r.seen++;
      if (p.p_raw.is_sold === false){ r.skip++; continue; }
      if (p.p_sold_on){
        if (!r.newest || p.p_sold_on > r.newest) r.newest = p.p_sold_on;
        if (!r.oldest || p.p_sold_on < r.oldest) r.oldest = p.p_sold_on;
      }
      if (dry){ r.skip++; continue; }
      queue.push(p);
    }
    if (dry || !queue.length) return r;
    await drainQueue(queue, r);
    return r;
  }
  async function apiRunLoop(){
    const size = parseInt((el('sbh9-apisize') && el('sbh9-apisize').value) || API_PAGE_SIZE_DEFAULT, 10) || API_PAGE_SIZE_DEFAULT;
    let start = 1, total = null, ctx = null;
    while (st.running){
      let j;
      try { j = await apiFetch(start, size); }
      catch(e){ return finish('API error: ' + (e.message || e)); }
      if (total == null){
        total = j.Total || 0;
        // v9.5.1: the response echoes the ACTIVE Category filter. When the
        // operator sliced the UI by category, that slice types every lot.
        const sbCat  = String(j.Category || '').trim();
        const sbType = String(j.Type || '').trim();
        const catType = sbCategoryToTypeClass(sbCat);
        ctx = { sbCat: sbCat || null, sbType: sbType || null, catType: catType };
        st.msg = 'API run: ' + total.toLocaleString() + ' records' +
          (total > CAP ? ' - CAP! only first ' + CAP.toLocaleString() + ' reachable, slice by auction/date' : '') +
          ' - batches of ' + size +
          (sbCat ? ' - category "' + sbCat + '" -> ' + (catType || 'title-based') : ' - no category filter (title-based typing)');
        paint();
      }
      const recs = j.Packages || [];
      if (!recs.length) return finish('empty batch at record ' + start + ' (end of window)');
      const r = await apiProcessBatch(recs, false, ctx);
      tally(r); save(); paint();
      if (r.breaker)
        return finish('CIRCUIT BREAKER tripped - the DB is refusing unknown-Fr inserts at systemic rate. Investigate (analytics_fr_stubs) before resuming.');
      if (st.mode === 'apitopup'){
        if (r.upd + r.skip === r.seen && r.upd > 0) return finish('whole batch already harvested');
        if (st.cutoff && r.newest && r.newest <= st.cutoff) return finish('reached cutoff ' + st.cutoff);
      }
      start += size;
      if (start > Math.min(total || CAP, CAP)) return finish('all ' + Math.min(total, CAP).toLocaleString() + ' reachable records done');
    }
  }
  function startApi(mode){
    if (!capturedSearchUrl){
      st.msg = 'no getSearch captured yet - run any search or change sort/page in the UI, then retry';
      return paint();
    }
    const cut = el('sbh9-cut') ? el('sbh9-cut').value.trim() : '';
    if (mode === 'apitopup' && cut && !/^\d{4}-\d{2}-\d{2}$/.test(cut)){
      st.msg = 'cutoff must be YYYY-MM-DD'; return paint(); }
    st = Object.assign(FRESH(), { mode: mode, running: true, cutoff: (mode === 'apitopup' ? cut : ''),
      msg: mode === 'apitopup'
        ? 'API top up' + (cut ? ' - stop at ' + cut : '') + ' (UI sort must be NEWEST-first)'
        : 'API sweep started' });
    save(); paint(); apiRunLoop();
  }

  /* ------------------------------------------------------------------ *
   * PANEL
   * ------------------------------------------------------------------ */
  function paint(){
    if (!el('sbh9-panel')) return;
    const s = st.stats;
    const total = readTotal();
    el('sbh9-mode').textContent = 'mode ' + st.mode + ' ' + (st.running ? 'RUNNING' : 'idle') +
      '  rows ' + rowEls().length + (total ? '  total ' + total.toLocaleString() +
      (total > CAP ? ' [CAP!]' : '') : '') +
      '  api:' + (capturedSearchUrl ? 'captured' : 'waiting');
    el('sbh9-msg').textContent = st.msg || '';
    el('sbh9-stats').textContent = 'pages ' + s.pages + ' - seen ' + s.seen + ' - new ' + s.new +
      ' - upd ' + s.upd + ' - rej ' + s.rej + ' - skip ' + s.skip + ' - err ' + s.err;
    el('sbh9-errs').textContent = (st.errs && st.errs.length) ? st.errs.join('\n') : '';
  }
  function buildPanel(){
    if (el('sbh9-panel')) return;
    const css = document.createElement('style');
    css.textContent = '#sbh9-panel{position:fixed;top:90px;right:16px;z-index:2147483647;' +
      'background:#1a1206;color:#e6e6e6;font:12px/1.45 Menlo,Consolas,monospace;padding:10px 12px;' +
      'border:1px solid #7a5a1e;border-radius:8px;width:300px;box-shadow:0 6px 20px rgba(0,0,0,.5)}' +
      '#sbh9-panel .hd{color:#fff;font-weight:700;margin-bottom:4px}' +
      '#sbh9-panel .ln{color:#ffce7a}' +
      '#sbh9-msg{margin:6px 0;padding:4px 6px;background:#0d0903;border-radius:4px;color:#ffd479;min-height:16px;word-break:break-word}' +
      '#sbh9-panel .row{margin:5px 0}' +
      '#sbh9-panel input{background:#0d0903;color:#e6e6e6;border:1px solid #7a5a1e;border-radius:3px;padding:1px 4px}' +
      '#sbh9-panel button{background:#3a2c10;color:#e6e6e6;border:1px solid #8a6a2a;border-radius:4px;' +
      'padding:3px 7px;margin:2px 3px 2px 0;cursor:pointer}' +
      '#sbh9-panel button:hover{background:#4d3b17}' +
      '#sbh9-stats{color:#8ee08e;margin-top:6px}' +
      '#sbh9-errs{color:#ff8f8f;margin-top:4px;white-space:pre-wrap;word-break:break-word;max-height:96px;overflow:auto}';
    document.head.appendChild(css);
    const p = document.createElement('div');
    p.id = 'sbh9-panel';
    p.innerHTML =
      '<div class="hd">SB Harvester v' + VERSION + '</div>' +
      '<div class="ln" id="sbh9-mode"></div>' +
      '<div id="sbh9-msg"></div>' +
      '<div class="row"><b>API</b> size <input id="sbh9-apisize" size="4" value="' + API_PAGE_SIZE_DEFAULT + '"> ' +
      '<button id="sbh9-apirun" title="Repage the captured getSearch call - no clicking, batches of the size at left">API Sweep</button>' +
      '<button id="sbh9-apitopup" title="Sort UI newest-first FIRST. Exact stop on first fully-known batch or cutoff">API Top Up</button></div>' +
      '<div class="row"><b>DOM</b> <button id="sbh9-run" title="Fallback: harvest every page by clicking the pager">Run All Pages</button></div>' +
      '<div class="row">TOP UP stop at <input id="sbh9-cut" size="10" placeholder="YYYY-MM-DD"> ' +
      '<button id="sbh9-topup" title="Sort newest-first FIRST. Stops when a whole page is already known, or at the cutoff">Top Up</button></div>' +
      '<div class="row"><button id="sbh9-dry">Dry Run</button><button id="sbh9-page">Page</button>' +
      '<button id="sbh9-resume">Resume</button><button id="sbh9-stop">Stop</button>' +
      '<button id="sbh9-reset">Reset</button></div>' +
      '<div id="sbh9-stats"></div>' +
      '<div id="sbh9-errs"></div>';
    document.body.appendChild(p);
    el('sbh9-apirun').onclick   = function(){ startApi('apirun'); };
    el('sbh9-apitopup').onclick = function(){ startApi('apitopup'); };
    el('sbh9-run').onclick    = function(){ startRun('run'); };
    el('sbh9-topup').onclick  = function(){ startRun('topup'); };
    el('sbh9-dry').onclick    = function(){ onePage(true); };
    el('sbh9-page').onclick   = function(){ onePage(false); };
    el('sbh9-resume').onclick = function(){ st.running = true; st.msg = 'resumed'; save(); paint(); runLoop(); };
    el('sbh9-stop').onclick   = function(){ st.running = false; st.msg = 'stopped by user'; save(); paint(); };
    el('sbh9-reset').onclick  = function(){ localStorage.removeItem(LS_KEY); st = FRESH();
      st.msg = 'state cleared'; paint(); };
  }

  /* ------------------------------------------------------------------ *
   * BOOT
   * ------------------------------------------------------------------ */
  function boot(){
    if (!document.body) return setTimeout(boot, 300);
    buildPanel();
    const tf = seriesSelfTest('sbh9.5') + classifySelfTest('sbh9.5');
    if (tf){ st.msg = 'SELF-TEST FAILED (' + tf + ') - see console. Do not harvest.'; }
    paint();
    if (st.running){ st.msg = 'resuming after reload ...'; save();
      if (st.mode === 'apirun' || st.mode === 'apitopup'){
        st.msg = 'API run interrupted by reload - press API Sweep / API Top Up to restart (progress is safe: re-posts are exact upserts)';
        st.running = false; save();
      } else { waitForChange('__never__'); runLoop(); } }
  }
  boot();
  setInterval(function(){ if (!document.getElementById('sbh9-panel')) buildPanel(); }, 3000);
})();
