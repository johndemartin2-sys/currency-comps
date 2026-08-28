// ==UserScript==
// @name         Currency Comp Harvester — eBay v2.0.4
// @namespace    jdmstrategy.currency-comps
// @version      2.0.4
// @description  Terapeak-driven eBay sold-lot harvester for Currency Comps -> ingest_ebay_lot via ingest-proxy. Category x keyword x date-window query grid over Terapeak's 3-year sold history, title/item-specifics classifier (TPG / raw / reject), true sale prices (accepted Best Offers included). Shares its series/Friedberg parser byte-for-byte with the other harvesters.
// @match        https://www.ebay.com/sh/research*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      wqizwluccqqfkedpgvve.supabase.co
// ==/UserScript==
// v2.0.4 (2026-08-27): + dgsm / lgsm (green-seal mules) and sp (specimen)
//   suffixes, found in 400+ existing SB/GC rows during the DB suffix audit
//   (443K Fr rows, 0 truncations, 0.2% unlisted suffixes).
// v2.0.3 (2026-08-27): FR SUFFIX SET. 2.0.2 allowed two letters after the
//   hyphen; Friedberg's real small-size suffixes are district A-L plus an
//   optional variety tag: lgs / dgs (light / dark green seal), m (mule),
//   w (wide), mw - e.g. 1957-Blgs, 2008-Gw, 1957-Bm - and the 1929 National
//   type digit (1801-1). Suffix = [A-L](lgs|dgs|gs|mw|m|w)? or a digit.
// v2.0.2 (2026-08-27): FR STRICTNESS + Legacy grading. eBay titles glue
//   things onto the Fr number ("Fr.380-APMG", "Fr.472-CH# 4645", "Fr#1860-N
//   BA Block") and the shared regex accepted them, auto-stubbing junk into
//   catalog_master until the fr-stub circuit breaker halted EVERY harvester.
//   validFr(): base 1-2450 (or 3000-3099 for 2009+ $1), suffix at most two
//   letters (+ optional star), and the token must be followed by a non-word
//   character - no glued words. Anything else -> friedberg_number null (the
//   title is kept, so a later parser pass can revisit). "Legacy" graded
//   notes map to grading_company 'unknown' (enum has no LEGACY), tier raw.
// v2.0.1 (2026-08-27): CSP FIX. eBay's Content-Security-Policy blocks page
//   fetch() to supabase.co ("Failed to fetch" on every write in the first
//   sweep - 0 rows landed). RPC posts now go through GM_xmlhttpRequest,
//   which runs in the extension context outside the page CSP (@grant +
//   @connect above). Terapeak reads are same-origin and still use fetch().
//   Falls back to fetch() if GM_xmlhttpRequest is unavailable.
// v2.0.0 (2026-08-27): FIRST RELEASE (clean rebuild; the 2026-06 v1.1.0
//   search-card scraper is retired).
//   SOURCE. eBay Seller Hub > Research (Terapeak), operator signed in as the
//   store owner. The page's own JSON API:
//     GET /sh/research/api/search?marketplace=EBAY-US&keywords=K&categoryId=C
//         &startDate=<ms>&endDate=<ms>&offset=N&limit=50&tabName=SOLD
//         &modules=searchResults
//   returns newline-delimited JSON; the SearchResultsModule row carries
//   itemId, title, extendedTitle (title + the listing's ITEM SPECIFICS: year,
//   type, certification, grade, country), image, format (Auction / Fixed
//   price), avg sold price (the ACTUAL transaction price - accepted Best
//   Offers included, verified 2026-08-27 against a $142 ask that sold for
//   $122), items sold, bids, date last sold. 3-year depth via startDate/
//   endDate (dayRange is ignored by the API).
//   GRID. category (9 allowed US Paper Money leaves) x keyword group x
//   3-month window, newest window first. Keyword groups keep each query well
//   under the result cap and pre-sort the classifier. Offset paging to the
//   short page.
//   CLASSIFIER (title + specifics). REJECT first: replica/copy/reproduction,
//   Goldback, novelty/fantasy/foil, checks/drafts/stock/bond/coupon, lot of/
//   set of/group/bundle, uncut sheet, foreign issuers, "dollar bill" with no
//   type. Then TPG (PMG/PCGS/NGC/CGA + numeric grade) -> data_quality
//   'ebay_tpg'; else RAW when type + year + denomination + a grade word are
//   all present -> 'ebay_raw'; else reject 'unclassified'. Multi-quantity
//   fixed-price listings (items sold > 1) are skipped - one avg price for N
//   notes is not a comp. Rejects are COUNTED, never written.
//   WRITE PATH: ingest-proxy + private x-harvest-key; RPC ingest_ebay_lot v2
//   returns ins:/upd:. 401 stops the run. State in localStorage (grid index,
//   offset, stats) - survives reloads; Resume continues at the same query.
(function () {
'use strict';
const VERSION = '2.0.4';
// ===================== CONFIG =====================
const SUPABASE_REF = 'wqizwluccqqfkedpgvve';
const HARVEST_KEY = 'PASTE_HARVEST_KEY_HERE';   // hk_... - never commit a real key
const RPC_URL = 'https://' + SUPABASE_REF + '.supabase.co/functions/v1/ingest-proxy/ingest_ebay_lot';
const EXTRACTOR_VERSION = 'v2';
const LS_KEY = 'ebh2';
const SOURCE = 'ebay';
const POST_WORKERS = 4;
const PAGE_DELAY_S = 6;          // pause between Terapeak API pages (+/-25% jitter)
const PAGE_SIZE = 50;
const MAX_OFFSET = 10000;        // safety cap per query
const WINDOW_MONTHS = 3;
const YEARS_BACK = 3;
const CATEGORIES = {             // eBay leaf id -> [label, type_class fallback]
  '149942': ['Large Size Notes', 'large_size'],
  '40028':  ['Small Size Notes', 'small_size'],
  '3419':   ['National Banknotes', 'national_bank_note'],
  '3416':   ['Fractional Currency', 'fractional'],
  '3413':   ['Colonial Currency', 'colonial_continental'],
  '3414':   ['Confederate Currency', 'confederate'],
  '3418':   ['Military Payment Certificates', 'mpc_military'],
  '3415':   ['Errors', 'other'],
  '3420':   ['Obsolete Currency', 'obsolete']
};
const KEYWORD_GROUPS = ['PMG', 'PCGS', 'Fr', 'national', 'silver certificate', 'gold certificate',
  'legal tender', 'federal reserve', 'star', 'fractional', 'colonial', 'confederate', 'MPC', 'error'];
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
 *  REUSED LOCAL PARSERS (GC / LK lineage)
 * ===================================================================== */
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
  if (/\bfractional\b|\bpostage currency\b/.test(t)) return 'fractional';
  if (/\bconfederate\b|\bcsa\b/.test(t)) return 'confederate';
  if (/\bmilitary payment\b|\bmpc\b/.test(t)) return 'mpc_military';
  if (/\b(?:continental|colonial)\s+currency\b|\bcolony of\b/.test(t)) return 'colonial_continental';
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
/* =====================================================================
 *  EBAY-LOCAL: reject list, grading, tiering
 * ===================================================================== */
const REJECT_RE = /\b(replica|reproduction|repro|copy|copies|facsimile|fantasy|novelty|gold ?back|goldback|foil|24k|million dollar|play money|prop|souvenir|check|cheque|draft|stock certificate|bond|coupon|scrip book|ration|lot of|set of|group of|bundle|collection of|uncut sheet|sheet of|sealed pack|brick|(?:\d+|two|three|four|five|six|ten) (?:x |pcs?\b|pieces|notes\b|bills\b)|consecutive|sequential|canada|canadian|mexico|mexican|bahamas|philippines|japan|china|germany|world|foreign|magnet|ornament|keychain|wallet|frame|display case)\b/i;
const SELF_GRADED_RE = /\b(?:self[- ]graded|as pictured|see photos?)\b/i;
// eBay titles lean on abbreviations and seal colours the shared classifier doesn't know.
function ebClassifyType(title, catClass) {
  const t = title || '';
  if (/\bFRBN\b/i.test(t)) return 'federal_reserve_bank_note';
  if (/\bFRN\b/i.test(t)) return 'federal_reserve_note';
  if (/\b(?:USN|U\.S\. Note|red seal)\b/i.test(t) && !/\bnational\b/i.test(t)) return 'legal_tender';
  if (/\bblue seal\b/i.test(t) && !/\bnational\b/i.test(t)) return 'silver_certificate';
  if (/\b(?:gold seal|gold cert)\b/i.test(t)) return 'gold_certificate';
  if (/\b(?:national currency|national bank|\bch\.? ?#|charter)\b/i.test(t)) return 'national_bank_note';
  return classifyType(t, catClass);
}
const BUCKET_TYPES = { large_size: 1, small_size: 1, other: 1 };
function parseGradingCompany(t) {
  if (/\bPMG\b/i.test(t)) return 'PMG';
  if (/\bPCGS\b/i.test(t)) return 'PCGS';
  if (/\bNGC\b/i.test(t)) return 'NGC';
  if (/\bCGA\b/i.test(t)) return 'CGA';
  if (/\bLegacy\b/i.test(t)) return 'unknown';
  return null;
}
// TPG numeric grade: the number that follows the service name or a grade word
function parseTpgGrade(t) {
  let m = t.match(/\b(?:PMG|PCGS(?:\s+(?:Banknote|Currency))?|NGC|CGA|Legacy)\b[^0-9]{0,40}?\b(\d{1,2})(?:\s?(?:PPQ|EPQ))?\b/i);
  if (m) { const n = parseInt(m[1], 10); if (n >= 1 && n <= 70) return n; }
  m = t.match(/\b(?:Gem|Choice|Superb|Very|Extremely|About|Crisp)?\s*(?:Uncirculated|Unc|New|CU|AU|XF|EF|VF|Fine|VG|Good)\s?[- ]?(\d{2})\b/i);
  if (m) { const n = parseInt(m[1], 10); if (n >= 1 && n <= 70) return n; }
  return null;
}
const GRADE_WORD_RE = /\b(Superb Gem|Gem|Choice|Crisp|Uncirculated|Unc\b|CU\b|AU\b|About Uncirculated|XF\b|EF\b|Extremely Fine|VF\b|Very Fine|Fine\b|VG\b|Very Good|Good\b|Fair\b|Poor\b|Circulated|Lightly Circulated|Nice)\b/i;
function parseGradeRaw(t) {
  const co = parseGradingCompany(t);
  if (co) {
    const m = t.match(/\b(?:PMG|PCGS(?:\s+(?:Banknote|Currency))?|NGC|CGA|Legacy)\b[^,]{0,60}?\d{1,2}(?:\s?(?:PPQ|EPQ))?(?:\s?[★*])?/i);
    if (m) return m[0].replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  const g = t.match(GRADE_WORD_RE);
  return g ? g[0] : null;
}
function parsePpqEpq(t) { const m = t.match(/\b(PPQ|EPQ)\b/i); return m ? m[1].toUpperCase() : null; }
// Small-size serial in the title (L########L, with star), or large-size #s
function parseSerial(t) {
  let m = t.match(/\b([A-L]\d{8}[A-L*★])\b/);
  if (m) return m[1].replace('★', '*');
  m = t.match(/\b([A-L]\d{8})\b/);
  return m ? m[1] : null;
}
// v2.0.2: Fr numbers that could plausibly exist and are not glued to another word
function validFr(fr, t) {
  if (!fr) return null;
  const m = String(fr).toUpperCase().match(/^(\d{1,4})([A-Z]{0,2})(?:-([A-L](?:LGSM|DGSM|LGS|DGS|GS|MW|M|W|SP)?|SP|\d))?(\*?)$/);   // district A-L + lgs/dgs/(l|d)gsm/m/w/sp, bare sp, or 1929 type digit
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!((n >= 1 && n <= 2450) || (n >= 3000 && n <= 3099))) return null;
  // the raw title token must end at a non-word char (rejects "380-APMG", "472-CH#")
  const re = new RegExp('(?:Fr|Friedberg)\\.?\\s*#?\\s*' + String(fr).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9#])', 'i');
  return re.test(t) ? m[1] + m[2] + (m[3] ? '-' + m[3] : '') + (m[4] ? '*' : '') : null;
}
function parseCert(t) {
  const m = t.match(/\b(?:cert(?:ification)?\.?\s?#?\s?|#)\s?(\d{7,10}(?:-\d{3})?)\b/i);
  return m ? m[1] : null;
}
function cleanText(s) {
  return (s || '').replace(/[‐‑‒–—―−]/g, '-').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}
/* --- item specifics appended in extendedTitle: "... 2013 Banknotes PCGS Banknote Grading Ungraded United States" --- */
function parseSpecifics(extended, title) {
  const tail = (extended || '').slice((title || '').length).trim();
  const out = { raw: tail || null, year: null, cert: null, grade: null, ungraded: false };
  if (!tail) return out;
  const y = tail.match(/\b(1[7-9]\d{2}|20[0-2]\d)\b/); if (y) out.year = parseInt(y[1], 10);
  const c = tail.match(/\b(PMG|PCGS|NGC|CGA|Legacy)\b/i); if (c) out.cert = c[1].toUpperCase();
  if (/\b(Ungraded|Uncertified|Not Graded)\b/i.test(tail)) out.ungraded = true;
  const g = tail.match(/(?:^|\s)(\d{1,2})(?:\s|$)/); if (g) { const n = parseInt(g[1], 10); if (n >= 1 && n <= 70) out.grade = n; }
  return out;
}
/* =====================================================================
 *  ROW -> PAYLOAD
 * ===================================================================== */
function usDateToISO(s) {
  const m = (s || '').match(/([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/);
  if (!m) return null;
  const mm = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12}[m[1]];
  return mm ? m[3] + '-' + String(mm).padStart(2, '0') + '-' + m[2].padStart(2, '0') : null;
}
function money(s) { const m = (s || '').match(/\$\s?([\d,]+(?:\.\d{1,2})?)/); if (!m) return null; const n = parseFloat(m[1].replace(/,/g, '')); return isFinite(n) && n > 0 ? n : null; }
function txt(o) { try { return (o && o.textSpans && o.textSpans[0] && o.textSpans[0].text) || (o && o.value) || ''; } catch (e) { return ''; } }
// Normalize one Terapeak result row into a flat record.
function parseResult(r) {
  const L = r.listing || {};
  const id = (L.itemId && (L.itemId.value || txt(L.itemId))) || null;
  const title = cleanText(txt(L.title));
  const extended = cleanText((L.extendedTitle && (L.extendedTitle.value || txt(L.extendedTitle))) || '');
  const img = (L.image && L.image.URL) || (L.moreImages && L.moreImages[0] && L.moreImages[0].URL) || null;
  const price = money(txt(r.avgsalesprice && r.avgsalesprice.avgsalesprice) || txt(r.avgsalesprice));
  const format = txt(r.avgsalesprice && r.avgsalesprice.format) || txt(L.formatList && L.formatList[0]) || '';
  const sold = parseInt(txt(r.itemssold).replace(/,/g, ''), 10) || 0;
  const bids = parseInt(txt(r.bids).replace(/,/g, ''), 10) || 0;
  const date = usDateToISO(txt(r.datelastsold));
  return { id, title, extended, img: img ? ('https:' + img).replace(/^https:https:/, 'https:') : null, price, format, sold, bids, date };
}
// Classify: returns { tier:'tpg'|'raw'|'reject', reason }
function classify(rec, catId) {
  const t = rec.title;
  if (!rec.id || !t) return { tier: 'reject', reason: 'no id/title' };
  if (REJECT_RE.test(t)) return { tier: 'reject', reason: 'junk:' + (t.match(REJECT_RE) || [''])[0].toLowerCase() };
  if (!rec.price || !rec.date) return { tier: 'reject', reason: 'no price/date' };
  if (rec.sold > 1 && !/auction/i.test(rec.format)) return { tier: 'reject', reason: 'multi-qty listing' };
  const sp = parseSpecifics(rec.extended, t);
  let co = parseGradingCompany(t) || sp.cert;
  if (co === 'LEGACY') co = 'unknown';                          // v2.0.2: enum has no Legacy
  const gn = parseTpgGrade(t) || (co ? sp.grade : null);
  if (co && co !== 'unknown' && gn) return { tier: 'tpg', reason: co + ' ' + gn };
  if (co === 'unknown' && gn) return { tier: 'raw', reason: 'legacy ' + gn };   // v2.0.2: Legacy-graded -> raw tier
  const catClass = (CATEGORIES[catId] || [])[1] || null;
  const tc = ebClassifyType(t, catClass);
  const year = parseSeries(t).year || sp.year;
  const denom = extractDenomination(t);
  const gw = t.match(GRADE_WORD_RE);
  // raw tier needs a SPECIFIC type (buckets like small_size are not a type), a year, a denomination and a grade word
  if (tc && !BUCKET_TYPES[tc] && year && denom && gw && !SELF_GRADED_RE.test(t)) return { tier: 'raw', reason: 'raw ' + gw[0] };
  return { tier: 'reject', reason: 'unclassified' };
}
function buildPayload(rec, catId, cls, ctx) {
  const t = rec.title;
  const sp = parseSpecifics(rec.extended, t);
  const catClass = (CATEGORIES[catId] || [])[1] || null;
  let typeClass = ebClassifyType(t, catClass);
  if (/\b(hawaii|north africa)\b/i.test(t) && /\b(emergency|brown seal|yellow seal|wwii|ww2)\b/i.test(t)) typeClass = 'other';
  const sy = parseSeries(t);
  const year = sy.year || sp.year;
  let co = parseGradingCompany(t) || sp.cert;
  if (co === 'LEGACY') co = 'unknown';
  const gn = parseTpgGrade(t) || (co ? sp.grade : null);
  const fr = validFr(parseFriedberg(t), t);                     // v2.0.2
  const is29nat = typeClass === 'national_bank_note' && year === 1929;
  const p = {
    p_source_lot_id: String(rec.id),
    p_lot_url: 'https://www.ebay.com/itm/' + rec.id,
    p_title: t,
    p_sold_on: rec.date,
    p_price_realized: rec.price,
    p_type_class: typeClass,
    p_series_type: (/\b(hawaii|north africa)\b/i.test(t) && typeClass === 'other') ? 'World War II Emergency Note' : seriesTypeLabel(typeClass),
    p_series_year: year,
    p_series_letter: sy.letter,
    p_denomination: extractDenomination(t),
    p_friedberg_number: is29nat ? null : fr,
    p_grade_numeric: cls.tier === 'tpg' ? gn : null,
    p_grade_raw: parseGradeRaw(t),
    p_grading_company: cls.tier === 'tpg' ? co : null,
    p_ppq_epq: parsePpqEpq(t),
    p_is_star_note: /\bstar\s+note\b|\breplacement\b/i.test(t) || /[*★]/.test(fr || ''),
    p_state_code: extractState(t, typeClass),
    p_charter_number: parseCharter(t),
    p_tier: cls.tier,
    p_thumbnail_url: rec.img,
    p_serial_text: parseSerial(t),
    p_cert_number: parseCert(t),
    p_raw: {
      extractor_version: EXTRACTOR_VERSION, hv: VERSION, source: SOURCE,
      item_id: String(rec.id), ebay_category_id: catId, ebay_category: (CATEGORIES[catId] || [])[0] || null,
      ebay_format: rec.format || null, ebay_bids: rec.bids, ebay_items_sold: rec.sold,
      ebay_specifics: sp.raw, ebay_specifics_ungraded: sp.ungraded || undefined,
      terapeak_keyword: ctx.keyword, terapeak_window: ctx.window,
      tier_reason: cls.reason, price_basis: 'terapeak_avg_sold',
      harvested_at: new Date().toISOString()
    }
  };
  return p;
}
/* =====================================================================
 *  TERAPEAK API
 * ===================================================================== */
function apiUrl(catId, keyword, startMs, endMs, offset) {
  const q = new URLSearchParams({ marketplace: 'EBAY-US', keywords: keyword, categoryId: String(catId),
    startDate: String(startMs), endDate: String(endMs), offset: String(offset), limit: String(PAGE_SIZE),
    tabName: 'SOLD', modules: 'searchResults' });
  return '/sh/research/api/search?' + q.toString();
}
async function fetchPage(catId, keyword, startMs, endMs, offset) {
  const r = await fetch(apiUrl(catId, keyword, startMs, endMs, offset), { credentials: 'include', headers: { 'Accept': 'application/json' } });
  if (r.status === 401 || r.status === 403 || r.status === 429 || r.status === 503) { const e = new Error('terapeak HTTP ' + r.status); e.botCheck = true; throw e; }
  const text = await r.text();
  if (/<html|signin|Sign in to/i.test(text.slice(0, 400))) { const e = new Error('LOGIN'); e.login = true; throw e; }
  const parts = text.split(/\n(?=\{)/).map(function (p) { try { return JSON.parse(p); } catch (e) { return null; } }).filter(Boolean);
  const sr = parts.find(function (p) { return p._type === 'SearchResultsModule'; });
  if (!sr) { const err = parts.find(function (p) { return p._type === 'PageErrorModule' && p.severity === 'ERROR' && p.message; }); throw new Error(err ? 'terapeak: ' + String(err.message).slice(0, 80) : 'terapeak: no results module'); }
  return (sr.results || []).map(parseResult);
}
/* =====================================================================
 *  RPC
 * ===================================================================== */
// v2.0.1: GM_xmlhttpRequest escapes eBay's CSP; fetch() is the fallback.
function gmPost(url, headers, body){
  return new Promise(function(resolve, reject){
    try {
      GM_xmlhttpRequest({ method:'POST', url:url, headers:headers, data:body, timeout:30000,
        onload: function(r){ resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: r.responseText || '' }); },
        onerror: function(){ reject(new Error('GM network error')); },
        ontimeout: function(){ reject(new Error('GM timeout')); } });
    } catch(e){ reject(e); }
  });
}
async function postOnce(payload){
  const headers = { 'Content-Type':'application/json', 'x-harvest-key': HARVEST_KEY };
  const body = JSON.stringify(payload);
  let r;
  if (typeof GM_xmlhttpRequest === 'function') r = await gmPost(RPC_URL, headers, body);
  else { const f = await fetch(RPC_URL, { method:'POST', headers:headers, body:body }); r = { ok:f.ok, status:f.status, text: await f.text() }; }
  if (!r.ok){ const e = new Error(r.status + ' ' + r.text.slice(0,180)); e.status = r.status; throw e; }
  return r.text.replace(/^"|"$/g, '');
}
async function post(payload){
  try { return await postOnce(payload); }
  catch(e){ const transient = !e.status || e.status >= 500 || e.status === 429; if (!transient || e.status === 401 || /circuit breaker|ingest_guard/i.test(String(e.message||e))) throw e; await sleep(400); return await postOnce(payload); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = ms => Math.round(ms * (0.75 + Math.random() * 0.5));
const el = id => document.getElementById(id);
/* =====================================================================
 *  PLAN + STATE
 * ===================================================================== */
function buildGrid(cats, keywords){
  const grid = [];
  const now = new Date(); now.setHours(23, 59, 59, 999);
  const start = new Date(now); start.setFullYear(start.getFullYear() - YEARS_BACK);
  // newest window first
  let wEnd = new Date(now);
  while (wEnd > start) {
    const wStart = new Date(wEnd); wStart.setMonth(wStart.getMonth() - WINDOW_MONTHS); wStart.setDate(wStart.getDate() + 1); wStart.setHours(0,0,0,0);
    const s = wStart < start ? start : wStart;
    cats.forEach(function (c) { keywords.forEach(function (k) { grid.push({ cat: c, kw: k, start: s.getTime(), end: wEnd.getTime(), label: s.toISOString().slice(0,10) + '..' + wEnd.toISOString().slice(0,10) }); }); });
    wEnd = new Date(s); wEnd.setDate(wEnd.getDate() - 1); wEnd.setHours(23,59,59,999);
  }
  return grid;
}
function FRESH(){ return { mode:'idle', running:false, grid:[], g:0, offset:0, delay:PAGE_DELAY_S, msg:'', errs:[], runId:0,
  stats:{queries:0,pages:0,rows:0,tpg:0,raw:0,upd:0,rej:0,err:0}, rejReasons:{} }; }
let st = load();
function load(){ try { const o = Object.assign(FRESH(), JSON.parse(localStorage.getItem(LS_KEY))); if (!o.errs) o.errs = []; if (!o.stats) o.stats = FRESH().stats; if (!o.rejReasons) o.rejReasons = {}; return o; } catch(e){ return FRESH(); } }
function save(){ try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch(e){} }
function logErr(m){ st.errs.unshift(String(m).slice(0,180)); if (st.errs.length > 6) st.errs.length = 6; }
function keyMissing(){ return HARVEST_KEY.indexOf('hk_') !== 0; }
function finish(msg){ st.running = false; st.msg = 'RUN COMPLETE (' + msg + ')'; save(); paint(); }
function noteReject(reason){ const k = reason.replace(/:.*$/, '').replace(/\s.*$/, ''); st.rejReasons[k] = (st.rejReasons[k] || 0) + 1; }
/* =====================================================================
 *  PROCESSORS
 * ===================================================================== */
async function processPage(q, offset, dry){
  const recs = await fetchPage(q.cat, q.kw, q.start, q.end, offset);
  const r = { rows: recs.length, tpg: 0, raw: 0, upd: 0, rej: 0, err: 0, breaker: false, samples: [] };
  const queue = [];
  for (const rec of recs){
    const cls = classify(rec, q.cat);
    if (cls.tier === 'reject'){ r.rej++; noteReject(cls.reason); if (dry && r.samples.length < 12) r.samples.push({ verdict:'REJECT ' + cls.reason, title: rec.title.slice(0,90) }); continue; }
    if (dry){ if (r.samples.length < 12) r.samples.push({ verdict: cls.tier.toUpperCase() + ' ' + cls.reason, title: rec.title.slice(0,90), price: rec.price, date: rec.date }); continue; }
    queue.push({ rec, cls });
  }
  if (dry || !queue.length) return r;
  let cursor = 0;
  async function worker(){
    while (true){
      if (r.breaker || !st.running) return;
      const i = cursor++; if (i >= queue.length) return;
      const { rec, cls } = queue[i];
      try {
        const out = await post(buildPayload(rec, q.cat, cls, { keyword: q.kw, window: q.label }));
        if (/^upd/.test(out)) r.upd++; else if (cls.tier === 'tpg') r.tpg++; else r.raw++;
      } catch(e){
        const msg = String(e.message || e);
        if (/circuit breaker|ingest_guard/i.test(msg) || e.status === 401){ r.breaker = true; logErr((e.status === 401 ? 'KEY REJECTED (401)' : 'BREAKER') + ' ' + msg.slice(0,100)); return; }
        if (/reject:/.test(msg)){ r.rej++; noteReject('rpc:' + msg.replace(/.*reject:\s*/, '').slice(0,30)); }
        else { r.err++; logErr('ERR ' + msg.slice(0,120) + ' :: ' + rec.id); }
      }
    }
  }
  const ws = []; for (let w = 0; w < Math.min(POST_WORKERS, queue.length); w++) ws.push(worker());
  await Promise.all(ws);
  return r;
}
let loopBusy = false;
async function sweepLoop(){
  if (loopBusy) return; loopBusy = true;
  const myRun = st.runId;
  try {
    while (st.running && st.runId === myRun){
      if (st.g >= st.grid.length) return finish('grid done - ' + st.grid.length + ' queries, ' + st.stats.rows + ' rows');
      const q = st.grid[st.g];
      st.msg = 'query ' + (st.g+1) + '/' + st.grid.length + ' ' + (CATEGORIES[q.cat]||[q.cat])[0] + ' "' + q.kw + '" ' + q.label + ' offset ' + st.offset + ' ...'; paint();
      let r;
      try { r = await processPage(q, st.offset, false); }
      catch(e){
        if (e.login){ st.running = false; st.msg = 'EBAY LOGIN NEEDED - sign in to Seller Hub in this tab, then press Resume.'; save(); paint(); return; }
        if (e.botCheck){ st.running = false; st.msg = 'EBAY CHECK (' + e.message + ') - reload this tab, pass any verification, raise delay, then press Resume.'; save(); paint(); return; }
        logErr('PAGE ' + String(e.message||e).slice(0,120)); st.stats.err++; save(); paint(); await sleep(8000); continue;
      }
      const s = st.stats; s.pages++; s.rows += r.rows; s.tpg += r.tpg; s.raw += r.raw; s.upd += r.upd; s.rej += r.rej; s.err += r.err;
      if (r.breaker) return finish('STOPPED - key rejected or circuit breaker. See error panel.');
      if (!st.running) { save(); paint(); return; }
      if (r.rows < PAGE_SIZE || st.offset + PAGE_SIZE >= MAX_OFFSET){ st.g++; st.offset = 0; s.queries++; }
      else st.offset += PAGE_SIZE;
      save(); paint();
      await sleep(jitter(Math.max(1, parseFloat(st.delay) || PAGE_DELAY_S) * 1000));
    }
  } finally { loopBusy = false; save(); paint(); }
}
/* =====================================================================
 *  START MODES
 * ===================================================================== */
function selectedCats(){ return [...el('ebh2-cats').selectedOptions].map(function(o){ return o.value; }); }
function selectedKws(){ const v = el('ebh2-kws').value.trim(); return v ? v.split(/\s*,\s*/).filter(Boolean) : KEYWORD_GROUPS.slice(); }
function startSweep(){
  if (keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not harvest.'; return paint(); }
  const cats = selectedCats(); if (!cats.length){ st.msg = 'select at least one category'; return paint(); }
  const grid = buildGrid(cats, selectedKws());
  st = Object.assign(FRESH(), { mode:'sweep', running:true, grid, g:0, offset:0, runId:Date.now(), delay: parseFloat(el('ebh2-delay').value) || PAGE_DELAY_S,
    msg:'sweep: ' + grid.length + ' queries (' + cats.length + ' cats x ' + selectedKws().length + ' keywords x ' + Math.ceil(12 * YEARS_BACK / WINDOW_MONTHS) + ' windows)' });
  save(); paint(); sweepLoop();
}
async function dryRun(){
  const cats = selectedCats(); if (!cats.length){ st.msg = 'select at least one category'; return paint(); }
  const q = buildGrid([cats[0]], [selectedKws()[0]])[0];
  st.mode = 'dry'; st.running = false; st.msg = 'dry run: ' + (CATEGORIES[q.cat]||[])[0] + ' "' + q.kw + '" ' + q.label + ' ...'; paint();
  try {
    const r = await processPage(q, 0, true);
    st.msg = 'DRY RUN - rows ' + r.rows + ' - rejects ' + r.rej + ' - would write ' + (r.rows - r.rej) + ' (see console for verdicts)';
    console.log('[ebh2] dry-run verdicts', r.samples);
    st.dry = r.samples;
  } catch(e){ st.msg = 'DRY RUN failed: ' + String(e.message || e).slice(0,120); }
  save(); paint();
}
/* =====================================================================
 *  PANEL
 * ===================================================================== */
function paint(){
  if (!el('ebh2-panel')) return;
  const s = st.stats;
  el('ebh2-mode').textContent = 'mode ' + st.mode + ' ' + (st.running ? 'RUNNING' : 'idle') + '  query ' + Math.min(st.g+1, st.grid.length) + '/' + st.grid.length + ' offset ' + st.offset + '  delay:' + (parseFloat(st.delay)||PAGE_DELAY_S) + 's  key:' + (keyMissing() ? 'MISSING' : 'set');
  el('ebh2-msg').textContent = st.msg || '';
  el('ebh2-stats').textContent = 'queries ' + s.queries + ' - pages ' + s.pages + ' - rows ' + s.rows + ' - tpg ' + s.tpg + ' - raw ' + s.raw + ' - upd ' + s.upd + ' - rej ' + s.rej + ' - err ' + s.err;
  const rr = Object.entries(st.rejReasons || {}).sort(function(a,b){ return b[1]-a[1]; }).slice(0,8).map(function(x){ return x[0] + ' ' + x[1]; }).join(' · ');
  el('ebh2-rej').textContent = rr ? 'rejects: ' + rr : '';
  el('ebh2-errs').textContent = (st.dry && st.dry.length ? st.dry.map(function(d){ return d.verdict + ' | ' + d.title; }).join('\n') + '\n' : '') + ((st.errs && st.errs.length) ? st.errs.join('\n') : '');
}
function buildPanel(){
  if (el('ebh2-panel')) return;
  const css = document.createElement('style');
  css.textContent = '#ebh2-panel{position:fixed;right:16px;bottom:14px;z-index:2147483647;background:#0d2a1f;color:#e6e6e6;font:12px/1.45 Menlo,Consolas,monospace;padding:10px 12px;border:1px solid #2f7d5a;border-radius:8px;width:360px;box-shadow:0 6px 20px rgba(0,0,0,.5)}' +
    '#ebh2-panel .hd{color:#fff;font-weight:700;margin-bottom:4px}#ebh2-panel .ln{color:#9fe3c2}#ebh2-panel .row{margin:5px 0;color:#cfe9dc}#ebh2-panel label{color:#cfe9dc}' +
    '#ebh2-msg{margin:6px 0;padding:4px 6px;background:#061a12;border-radius:4px;color:#ffd479;min-height:16px;word-break:break-word}' +
    '#ebh2-panel input[type=text],#ebh2-panel select{background:#061a12;color:#e6e6e6;border:1px solid #2f7d5a;border-radius:3px;padding:1px 4px;font:inherit}' +
    '#ebh2-panel button{background:#1c5a3f;color:#e6e6e6;border:1px solid #2f7d5a;border-radius:4px;padding:3px 7px;margin:2px 3px 2px 0;cursor:pointer}#ebh2-panel button:hover{background:#25795a}' +
    '#ebh2-stats{color:#8ee08e;margin-top:6px}#ebh2-rej{color:#ffc99d;margin-top:2px;word-break:break-word}#ebh2-errs{color:#ff8f8f;margin-top:4px;white-space:pre-wrap;word-break:break-word;max-height:140px;overflow:auto}';
  document.head.appendChild(css);
  const p = document.createElement('div'); p.id = 'ebh2-panel';
  const opts = Object.keys(CATEGORIES).map(function(k){ return '<option value="' + k + '"' + (k === '3419' ? ' selected' : '') + '>' + CATEGORIES[k][0] + '</option>'; }).join('');
  p.innerHTML = '<div class="hd">eBay Harvester v' + VERSION + ' (Terapeak)</div><div class="ln" id="ebh2-mode"></div><div id="ebh2-msg"></div>' +
    '<div class="row">categories (ctrl-click)<br><select id="ebh2-cats" multiple size="5" style="width:100%">' + opts + '</select></div>' +
    '<div class="row">keywords <input type="text" id="ebh2-kws" style="width:78%" placeholder="blank = all ' + KEYWORD_GROUPS.length + ' groups"></div>' +
    '<div class="row">delay s <input type="text" id="ebh2-delay" size="3" value="' + PAGE_DELAY_S + '"> <span style="color:#9fe3c2">' + YEARS_BACK + ' years, ' + WINDOW_MONTHS + '-month windows, newest first</span></div>' +
    '<div class="row"><button id="ebh2-sweep">Sweep</button><button id="ebh2-dry">Dry Run</button><button id="ebh2-resume">Resume</button><button id="ebh2-stop">Stop</button><button id="ebh2-reset">Reset</button></div>' +
    '<div id="ebh2-stats"></div><div id="ebh2-rej"></div><div id="ebh2-errs"></div>';
  document.body.appendChild(p);
  el('ebh2-sweep').onclick = startSweep;
  el('ebh2-dry').onclick = dryRun;
  el('ebh2-resume').onclick = function(){ if (!st.grid.length){ st.msg = 'nothing to resume'; return paint(); } st.running = true; st.runId = Date.now(); st.dry = null; st.msg = 'resumed'; save(); paint(); sweepLoop(); };
  el('ebh2-stop').onclick = function(){ st.running = false; st.msg = 'stopped by user (position saved)'; save(); paint(); };
  el('ebh2-reset').onclick = function(){ if (!confirm('Clear saved sweep position and stats?')) return; localStorage.removeItem(LS_KEY); st = FRESH(); st.msg = 'state cleared'; paint(); };
  el('ebh2-delay').addEventListener('input', function(){ const v = parseFloat(this.value); if (v >= 1){ st.delay = v; save(); paint(); } });
  if (st.delay) el('ebh2-delay').value = st.delay;
}
/* =====================================================================
 *  SELF-TEST + BOOT
 * ===================================================================== */
function ebSelfTest(tag){
  let fails = 0;
  const eq = function(a,b,w){ if (JSON.stringify(a) !== JSON.stringify(b)){ fails++; console.error('[' + tag + ' EB-TEST FAIL]', w, 'got', a, 'want', b); } };
  const mk = function(title, price, date, format, sold, ext){ return { id:'1', title, extended: ext || title, img:null, price, format: format||'Fixed price', sold: sold||1, bids:0, date }; };
  eq(classify(mk('1923 $1 Silver Certificate Fr. 238 Woods White PMG 25 VF Horse Blanket Note', 139, '2026-08-27'), '149942').tier, 'tpg', 'tpg pmg');
  eq(classify(mk('$2 1928 G Red Seal United States Note VF', 11, '2026-08-27'), '40028').tier, 'raw', 'raw legal tender');
  eq(classify(mk('1977 A 1 Dollar Bill Old Note Collectable Piece $1 One Dollar Philadelphia PA', 3.99, '2026-08-27'), '40028').tier, 'reject', 'reject vague');
  eq(classify(mk('Reproduction $2 National Bank Note 1875 Lazy Deuce Emporia, Kansas Copy', 3.93, '2026-08-27'), '3419').tier, 'reject', 'reject repro');
  eq(classify(mk('1 California Goldback (Alpha)', 9.43, '2026-08-27'), '376').tier, 'reject', 'reject goldback');
  eq(classify(mk('Lot of 5 1957 $1 Silver Certificates VF', 40, '2026-08-27'), '40028').tier, 'reject', 'reject lot');
  eq(classify(mk('1957 $1 Silver Certificate CU', 6, '2026-08-27', 'Fixed price', 12), '40028').tier, 'reject', 'reject multi-qty');
  eq(classify(mk('1957-B $1 Silver Certificate PMG Superb Gem Unc 67 EPQ Fr#1621', 54, '2026-08-22'), '40028').tier, 'tpg', 'tpg epq');
  eq(classify(mk('USA Uncirculated Sequential Two Dollar Bill $2 Banknote - One note UNC', 3.68, '2026-08-20', 'Fixed price', 1, 'USA Uncirculated Sequential Two Dollar Bill $2 Banknote - One note UNC 2013 Banknotes PCGS Banknote Grading Ungraded United States'), '40028').tier, 'reject', 'specifics ungraded vague');
  const sp = parseSpecifics('X 1923 Banknotes PMG 25 United States', 'X'); eq([sp.year, sp.cert, sp.grade], [1923, 'PMG', 25], 'specifics');
  eq(validFr(parseFriedberg('1865-$1 Kingston, RI-Original Series Ace-CH#1158, Fr.380-APMG 25'), '1865-$1 Kingston, RI-Original Series Ace-CH#1158, Fr.380-APMG 25'), null, 'fr glued PMG');
  eq(validFr(parseFriedberg('New York, NY-$5 1882 Brown Back Fr.472-CH# 4645- PMG 20'), 'New York, NY-$5 1882 Brown Back Fr.472-CH# 4645- PMG 20'), null, 'fr glued CH#');
  eq(validFr(parseFriedberg('1929 $10 FRBN New York PMG VF25 Fr#1860-N BA Block'), '1929 $10 FRBN New York PMG VF25 Fr#1860-N BA Block'), null, 'fr block letter');
  eq(validFr(parseFriedberg('Fr. 2150-C $100 1928 FRN PMG 35'), 'Fr. 2150-C $100 1928 FRN PMG 35'), '2150-C', 'fr valid');
  eq(validFr(parseFriedberg('Fr. 1601* $1 1928A Silver Certificate Star PMG 64'), 'Fr. 1601* $1 1928A Silver Certificate Star PMG 64'), '1601', 'fr star (star carried by is_star_note)');
  eq(validFr(parseFriedberg('Fr. 7001-A $1 2017 FRN PMG 66'), 'Fr. 7001-A $1 2017 FRN PMG 66'), null, 'fr out of range');
  eq(validFr(parseFriedberg('Fr. 1957-Blgs $5 1934 New York Light Green Seal PMG 64'), 'Fr. 1957-Blgs $5 1934 New York Light Green Seal PMG 64'), '1957-BLGS', 'fr lgs');
  eq(validFr(parseFriedberg('Fr. 2008-Gw $10 1934-C Wide Chicago PMG 35'), 'Fr. 2008-Gw $10 1934-C Wide Chicago PMG 35'), '2008-GW', 'fr wide');
  eq(validFr(parseFriedberg('Fr. 1957-Bm $5 1934 Mule PMG 58'), 'Fr. 1957-Bm $5 1934 Mule PMG 58'), '1957-BM', 'fr mule');
  eq(validFr(parseFriedberg('Fr. 1801-1 $10 1929 Ty. 1 National PMG 30'), 'Fr. 1801-1 $10 1929 Ty. 1 National PMG 30'), '1801-1', 'fr 1929 type');
  eq(validFr(parseFriedberg('Fr. 1957-Gdgsm $5 1934 Dark Green Seal Mule PMG 58'), 'Fr. 1957-Gdgsm $5 1934 Dark Green Seal Mule PMG 58'), '1957-GDGSM', 'fr dgsm');
  eq(validFr(parseFriedberg('Fr. 3004-L $1 2017 FRN Radar PMG 67'), 'Fr. 3004-L $1 2017 FRN Radar PMG 67'), '3004-L', 'fr 3000 series');
  eq(classify(mk('1935-E $1 Silver Certificate Legacy Currency Grading 65 PPQ', 30, '2026-08-20', 'Fixed price', 1, '1935-E $1 Silver Certificate Legacy Currency Grading 65 PPQ 1935 Banknotes Legacy 65 United States'), '40028').tier, 'raw', 'legacy -> raw');
  const pl = buildPayload(mk('DBR 1934-C $10 FRN Wide Chicago Fr. 2008-Gw PMG 35 EPQ Serial G94862553C', 79.5, '2026-06-01'), '40028', {tier:'tpg', reason:'PMG 35'}, {keyword:'PMG', window:'w'});
  eq([pl.p_type_class, pl.p_friedberg_number, pl.p_series_year, pl.p_series_letter, pl.p_grade_numeric, pl.p_grading_company, pl.p_ppq_epq, pl.p_serial_text, pl.p_denomination, pl.p_tier],
     ['federal_reserve_note', '2008-GW', 1934, 'C', 35, 'PMG', 'EPQ', 'G94862553C', '10', 'tpg'], 'payload tpg');
  const pn = buildPayload(mk('$20 1929 T2 National MOUNT VERNON New York NY "Mega Rare" PMG 30', 295, '2026-08-26'), '3419', {tier:'tpg', reason:'PMG 30'}, {keyword:'PMG', window:'w'});
  eq([pn.p_type_class, pn.p_state_code, pn.p_series_year, pn.p_friedberg_number], ['national_bank_note', 'NY', 1929, null], 'payload national');
  if (fails) console.error('[' + tag + '] EB SELF-TEST: ' + fails + ' FAILED'); else console.log('[' + tag + '] eb self-test ok');
  return fails;
}
function boot(){
  if (!document.body) return setTimeout(boot, 300);
  buildPanel();
  const tf = seriesSelfTest('ebh2.0') + ebSelfTest('ebh2.0');
  if (tf){ st.msg = 'SELF-TEST FAILED (' + tf + ') - see console. Do not harvest.'; st.running = false; }
  else if (keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not harvest.'; }
  paint();
  if (!tf && st.running && st.mode === 'sweep'){ st.msg = 'resuming query ' + (st.g+1) + ' ...'; st.runId = Date.now(); save(); sweepLoop(); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
