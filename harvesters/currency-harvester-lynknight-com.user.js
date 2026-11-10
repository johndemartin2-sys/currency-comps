// ==UserScript==
// @name         Currency Comp Harvester — Lyn Knight (lynknight.com) v2.0.0
// @namespace    jdmstrategy.currency-comps
// @version      2.0.0
// @description  Session harvester for lynknight.com (sales after June 2017) -> ingest_lyn_knight_lot via ingest-proxy. Two pages per sale session: the print page (every lot: category, estimate, title, bank, description, grade) and the prices-realized page (lot -> hammer). Optional browse pass adds each lot's own link and thumbnail.
// @match        https://www.lynknight.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      wqizwluccqqfkedpgvve.supabase.co
// ==/UserScript==
// v2.0.0 (2026-11-10): FIRST RELEASE. Companion to the lkcaarchives.com
//   harvester (v1.0.3), which stops at June 2017 because that archive does.
//   SOURCE (scouted 2026-11-10, signed in). lynknight.com keeps every sale
//   session, old and new, under a numeric id:
//     /catalog_sessions/<id>/print            the WHOLE session on one page.
//         body > ... <hr> <strong>Lot #N</strong> " - <category path> -
//         ($ lo - $ hi)" <br> title <br> [bank <br>] description <br>
//         "Grade: X [Bank Name: ...]" <hr> ...
//     /catalog_sessions/<id>/prices_realized  "lot# - $ hammer" for SOLD lots.
//     /items/search.js?search[catalog_session_id]=<id>&page=N
//         20 lots a page as a jQuery .html("...") payload: item id (the
//         lot's own /items/<id> page) and the S3 thumbnail.
//   The title and bank lines use the SAME shorthand as the old archive
//   ("Fr. 1804-1 $100 1929T1", "Burlington, Merchants NB, 1744"), so the
//   v1.0.3 field parsers and the SHARED CORE are reused unchanged.
//   PRICE BASIS. The site lists HAMMER prices. The database standard is
//   all-in (hammer + buyer's premium), so the operator enters the premium
//   % for the sale in the panel; the harvester stores
//   price_realized = hammer x (1 + premium) and keeps raw.hammer,
//   raw.bp_rate and raw.price_basis = 'lk_hammer_plus_bp' on every lot so
//   a wrong rate can be corrected later in one statement. No rate is
//   hardcoded. No premium entered = no writes.
//   SALE DATE. Not on the lot pages. Suggested from the US Currency home
//   page ("pre-bidding ended on ...") or from the session name ("Session 3
//   - June 15 @ 6 PM CT - US" + the catalog's year). A date RANGE in the
//   name is never guessed. No date = no writes.
//   SCOPE. Sold US lots only. Unsold lots are counted and skipped. A lot
//   whose category is not a recognised US type (world, postcards, anything
//   new) is counted, listed in the panel and skipped - never guessed.
//   IDS. source_lot_id = 'lk2-<session id>-<lot number>' so nothing can
//   collide with the archive rows (item ids, no prefix).
//   WRITE PATH: POST /functions/v1/ingest-proxy/ingest_lyn_knight_lot with
//   the private x-harvest-key, through GM_xmlhttpRequest (outside the page
//   CSP). A 401 or a circuit breaker stops the run.
//   MODES: DRY RUN (parse + preview, no writes), HARVEST (one session),
//   DISCOVER (walk a range of session ids and list the ones that exist).
(function () {
'use strict';
const VERSION = '2.0.0';
// ===================== CONFIG =====================
const SUPABASE_REF = 'wqizwluccqqfkedpgvve';
// PRIVATE harvest key (hk_...). NOT the publishable key. Paste once, here.
// NEVER commit a real key to the public repo - keep the placeholder there.
const HARVEST_KEY = 'PASTE_HARVEST_KEY_HERE';
const PROXY_BASE = 'https://' + SUPABASE_REF + '.supabase.co/functions/v1/ingest-proxy/';
const RPC_URL = PROXY_BASE + 'ingest_lyn_knight_lot';
const EXTRACTOR_VERSION = 'lk2-v1';
const LS_KEY = 'lkh2';
const LS_PREVIEW = 'lkh2_preview';
const SOURCE = 'lyn_knight';
const ID_PREFIX = 'lk2-';
const ORIGIN = 'https://www.lynknight.com';
const POST_WORKERS = 3;          // pooled upserts
const PAGE_DELAY_S = 20;         // pause between lynknight.com requests (+/-25% jitter, panel-adjustable)
const PROBE_DELAY_S = 4;         // pause between DISCOVER probes
const BROWSE_PAGE_SIZE = 20;
const MAX_BROWSE_PAGES = 400;    // runaway backstop
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
// "Territory" categories (Indian Territory, Dakota Territory, ...) carry no
// state_code; the category text is kept in raw.lk_state_text.
function stateFromCategory(cat) {
  const last = (cat || '').split('>').pop().trim();
  if (!last) return null;
  if (STATE_FULLNAMES[last]) return STATE_FULLNAMES[last];
  const m = last.match(/^(?:Territory of\s+)?(.+?)(?:\s+Territory)?$/i);
  if (m && STATE_FULLNAMES[m[1]] && /Territory/i.test(last)) return STATE_FULLNAMES[m[1]]; // "Hawaii Territory" -> HI
  return null;
}
// Title-first classification for non-national categories (same rules as GC).
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
// v1.0.2: small-size Friedberg ranges -> type (LK's SS category carries no type word)
function smallSizeTypeFromFr(fr) {
  const n = parseInt(String(fr || '').match(/^\d{1,4}/) || '', 10);
  if (!n) return null;
  if (n >= 1500 && n <= 1551) return 'legal_tender';
  if (n >= 1600 && n <= 1621) return 'silver_certificate';
  if (n >= 1650 && n <= 1658) return 'silver_certificate';
  if (n >= 1700 && n <= 1708) return 'silver_certificate';
  if (n >= 1800 && n <= 1804) return 'national_bank_note';
  if (n >= 1850 && n <= 1880) return 'federal_reserve_bank_note';
  if (n >= 1900 && n <= 1937) return 'federal_reserve_note';
  if (n >= 1950 && n <= 2235) return 'federal_reserve_note';
  if (n >= 2300 && n <= 2309) return 'other';                 // WWII Emergency (Hawaii / North Africa)
  if (n >= 2400 && n <= 2413) return 'gold_certificate';
  return null;
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
/* --- LK "Fr #" field: "Fr. 474 $5 1882BB", "Fr. 1801-2 $10 1929T2",
 * "Fr. 635 $10 1902ND", "Fr. 224 $1 1896". The series token is LK's own
 * shorthand (BB/DB/VB/RS/ND/T1/T2 = Brown Back, Date Back, Value Back, Red
 * Seal, Plain/No Date, 1929 Type 1/2) - NOT a series letter. Year comes
 * from the leading 4 digits; the shorthand goes to raw.lk_series_variant. */
const LK_VARIANT_WORDS = { BB:'Brown Back', DB:'Date Back', VB:'Value Back', RS:'Red Seal',
  ND:'Plain Back', T1:'Type 1', T2:'Type 2' };
function parseFrField(frText) {
  const f = cleanText(frText || '').replace(/\s+/g, ' ').trim();
  const out = { fr: null, denom: null, year: null, variant: null, raw: f };
  if (!f) return out;
  out.fr = parseFriedberg(f);                                  // SHARED CORE
  // v1.0.2: colonial state-prefix and Confederate Criswell/Thian ids, Heritage/GC convention
  if (!out.fr) {
    const cm2 = f.match(/^((?:CC|CT|DE|GA|MA|MD|ME|NC|NH|NJ|NY|PA|RI|SC|VA|VT)-\d{1,3}[a-z]?)\b/i);
    if (cm2) out.fr = cm2[1].toUpperCase();
    else { const tm = f.match(/^(T-\d{1,3})\b/i); if (tm) out.fr = tm[1].toUpperCase(); }
  }
  const dm = f.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
  if (dm) out.denom = '$' + dm[1].replace(/,/g, '');
  else {
    let cm = f.match(/(\d{1,3})\s?(?:¢|cents?\b|c\b)/i); if (cm) out.denom = cm[1] + ' Cents';
    else { cm = f.match(/(\d{1,3})\s?(?:s\b|shillings?\b)/i); if (cm) out.denom = cm[1] + 's';
      else { cm = f.match(/(\d{1,3})\s?(?:d\b|pence\b)/i); if (cm) out.denom = cm[1] + 'd';
        else { cm = f.match(/(\d{1,4})\s?dollars?\b/i); if (cm) out.denom = '$' + cm[1]; } } }
  }
  // series token = last whitespace-delimited token that starts with a year,
  // scanned with the catalog reference removed (v1.0.3: "Fr. 1616" is not a year)
  const toks = f.replace(CATALOG_REF_RE, ' ').replace(/\s+/g, ' ').trim().split(' ');
  for (let i = toks.length - 1; i >= 0; i--) {
    const m = toks[i].match(/^(1[6-9]\d{2}|20[0-2]\d)([A-Z]{0,2}\d?)$/i);
    if (m) { out.year = parseInt(m[1], 10); out.variant = m[2] ? m[2].toUpperCase() : null; break; }
  }
  if (out.year == null) {                                       // v1.0.2: "1928-B*", "May 7, 1781", "1914BS"
    const sy = parseSeries(f);                                  // SHARED CORE
    if (sy.year) { out.year = sy.year; out.letter = sy.letter; }
  }
  if (out.year == null && /\bOriginal\b/i.test(f)) out.variant = 'ORIGINAL';
  // district / block tail after the series token: "New York B-B", "Chicago", "Philadelphia C-*"
  const tail = f.replace(/^(?:Fr\.?\s*[0-9]{1,4}[A-Za-z]*(?:-[A-Za-z0-9*★]+)?\*?|[A-Z]{2}-\d+[a-z]?|T-\d+)\s*/i, '')
                .replace(/\$\s?[\d,]+(?:\.\d{2})?/, '')
                .replace(/(?<![A-Za-z0-9])(1[6-9]\d{2}|20[0-2]\d)(?:-?[A-Z]{0,2}\d?\*?)?(?![A-Za-z0-9])/i, '')
                .replace(/(?<![A-Za-z0-9])\d{1,3}\s?(?:¢|cents?|c|s|d|shillings?|pence)(?![A-Za-z0-9])/i, '')
                .replace(/^[\s,.]+|[\s,.]+$/g, '').replace(/\s+/g, ' ').trim();
  if (tail && !/^\d/.test(tail) && tail.length <= 40) out.district = tail;
  out.star = /^Fr\.?\s*[0-9]{1,4}[A-Za-z]*(?:-[A-Za-z0-9]+)?\s?[*★]/i.test(f);   // star on the Fr number itself
  return out;
}
/* --- LK "Bank" field: "Attleboro, First NB, 2232" / "Nantucket, Pacific NB,
 * 714" / "Palmer, NB, N2324" / "King City, First NB, M4373". Last comma part
 * is the charter, optionally prefixed by the regional letter. ------------ */
function parseBankField(bankText) {
  const b = cleanText(bankText || '').replace(/\s+/g, ' ').trim();
  const out = { town: null, name: null, charter: null, region: null, note: null, raw: b };
  if (!b) return out;
  const parts = b.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const cm = last.match(/^([A-Z])?\s*(\d{1,5})\b\s*(.*)$/i);
    if (cm) { out.charter = cm[2]; out.region = cm[1] ? cm[1].toUpperCase() : null;
              out.note = (cm[3] || '').trim() || null; parts.pop(); }
    out.town = parts.shift() || null;
    out.name = parts.join(', ') || null;
  } else out.name = b;
  return out;
}
/* --- grading. LK shapes: "PMG XF 40", "PMG Ch. UNC 63 EPQ", "PCGS VF 30
 * PPQ", "VF ++", "Ch. AU", "VG/Fine", "Apparent VF", "Net Fine". ---------- */
function parseGradingCompany(g) {
  const t = g || '';
  if (/\bPMG\b/i.test(t)) return 'PMG';
  if (/\bPCGS\b/i.test(t)) return 'PCGS';
  if (/\bNGC\b/i.test(t)) return 'NGC';
  if (/\bCGA\b/i.test(t)) return 'CGA';
  if (/\bLegacy\b/i.test(t)) return 'unknown';
  return null;
}
function parseGradeNumeric(g) {
  const t = g || '';
  if (!parseGradingCompany(t)) return null;          // raw grades: DB estimates (grade_numeric_est)
  const m = t.match(/\b(\d{1,2})(?:\.\d)?\b/);
  if (m) { const n = parseInt(m[1], 10); if (n >= 1 && n <= 70) return n; }
  return null;
}
function parsePpqEpq(g) {
  const m = (g || '').match(/\b(PPQ|EPQ)\b/i);
  return m ? m[1].toUpperCase() : null;
}
function extractIsStar(title, fr) {
  const t = title || '';
  if (/\bstar\s+note\b|\breplacement\s+note\b/i.test(t)) return true;
  if (/[*★]/.test(fr || '')) return true;
  return false;
}
function usDateToISO(s) {
  const m = (s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
}
function money(s) {
  if (s == null) return null;
  const m = String(s).match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return isFinite(n) && n > 0 ? n : null;
}
function parseEstimate(s) {
  const m = (s || '').match(/\$\s?([\d,]+(?:\.\d{2})?)\s*-\s*\$\s?([\d,]+(?:\.\d{2})?)/);
  return m ? [parseFloat(m[1].replace(/,/g, '')), parseFloat(m[2].replace(/,/g, ''))] : [null, null];
}
function cleanText(s) {
  return (s || '')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
/* =====================================================================
 *  LK2 - lynknight.com category path -> type class
 *  Paths seen 2026-11-10: "Small Size Type Notes > Legal Tender",
 *  "Large Size Type Notes > Silver Certificates", "National Bank Notes >
 *  Iowa", "Error Notes > Federal Reserve Notes", "Fractional Currency".
 *  Returns null for anything that is not a recognised US type - the lot is
 *  then counted and skipped, never guessed.
 * ===================================================================== */
function lk2SubType(s) {
  if (/federal reserve bank/.test(s)) return 'federal_reserve_bank_note';
  if (/federal reserve/.test(s)) return 'federal_reserve_note';
  if (/silver cert/.test(s)) return 'silver_certificate';
  if (/gold cert/.test(s)) return 'gold_certificate';
  if (/national/.test(s)) return 'national_bank_note';
  if (/legal tender|united states notes?/.test(s)) return 'legal_tender';
  if (/interest bearing|compound interest/.test(s)) return 'interest_bearing_note';
  if (/refunding/.test(s)) return 'refunding_certificate';
  if (/demand/.test(s)) return 'demand_note';
  if (/treasury|coin notes?/.test(s)) return 'treasury_note';
  return null;
}
function lk2Type(cat, fr) {
  const c = cleanText(cat || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!c) return null;
  const parts = c.split('>').map(function (s) { return s.trim(); });
  const top = parts[0] || '';
  const sub = parts.slice(1).join(' > ');
  if (/world|foreign|postcard|poster|canad|mexic|stocks?\b|bonds?\b|checks?\b|books?\b|coins?\b|tokens?\b|medals?\b|stamps?\b|e-?shop/.test(top) && !/coin notes/.test(top)) return null;
  if (/error/.test(top)) return { tc: 'error_note', label: null };
  if (/^national/.test(top)) return { tc: 'national_bank_note', label: null };
  if (/small size/.test(top)) {
    if (/hawaii|north africa|emergency/.test(sub)) return { tc: 'other', label: 'World War II Emergency Note' };
    const s = lk2SubType(sub);
    if (s) return { tc: s, label: null };
    const t = fr ? smallSizeTypeFromFr(fr) : null;
    if (t === 'other') return { tc: 'other', label: 'World War II Emergency Note' };
    return { tc: t || 'small_size', label: null };
  }
  if (/large size/.test(top)) return { tc: lk2SubType(sub) || 'large_size', label: null };
  if (/encased postage/.test(c)) return { tc: 'encased_postage', label: null };
  if (/fractional|postage currency/.test(top)) return { tc: 'fractional', label: null };
  if (/confederate/.test(top)) return /confederate (?:notes?|currency)/.test(top) ? { tc: 'confederate', label: null } : null;   // "Confederate Items" (bonds, documents) are skipped
  if (/colonial|continental/.test(top)) return { tc: 'colonial_continental', label: null };
  if (/obsolete|broken bank|scrip/.test(top)) return { tc: 'obsolete', label: null };
  if (/military payment|\bmpc\b/.test(top)) return { tc: 'mpc_military', label: null };
  const direct = lk2SubType(top);
  if (direct) return { tc: direct, label: null };
  return null;
}
function lk2SeriesLabel(tc) {
  if (tc === 'interest_bearing_note') return 'Interest Bearing Note';
  if (tc === 'refunding_certificate') return 'Refunding Certificate';
  if (tc === 'encased_postage') return 'Encased Postage';
  return seriesTypeLabel(tc);
}
/* =====================================================================
 *  LK2 - page parsing
 * ===================================================================== */
function oneLine(s) { return cleanText(s || '').replace(/\s+/g, ' ').trim(); }
// Print page: a flat run of nodes; each lot starts at <strong>Lot #N</strong>
// and ends at the next <hr>.
function parsePrintDoc(doc) {
  const h3 = doc.querySelector('h3');
  const name = oneLine(h3 ? h3.textContent : '');
  const strongs = Array.prototype.slice.call(doc.querySelectorAll('strong'));
  const first = strongs.find(function (s) { return /^\s*Lot\s*#\s*\d/i.test(s.textContent || ''); });
  if (!first) return { name: name, lots: [] };
  const raw = []; let cur = null;
  const nodes = first.parentNode.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.nodeType === 1) {
      const tag = n.tagName;
      if (tag === 'HR') { if (cur) { raw.push(cur); cur = null; } continue; }
      if (tag === 'BR') continue;
      const m = tag === 'STRONG' ? (n.textContent || '').match(/^\s*Lot\s*#\s*(\d+[A-Za-z]?)\s*$/i) : null;
      if (m) { if (cur) raw.push(cur); cur = { lot: m[1], lines: [] }; continue; }
      if (cur) { const t = oneLine(n.textContent); if (t) cur.lines.push(t); }
    } else if (n.nodeType === 3 && cur) {
      const t = oneLine(n.textContent); if (t) cur.lines.push(t);
    }
  }
  if (cur) raw.push(cur);
  return { name: name, lots: raw.map(finishPrintLot) };
}
function finishPrintLot(r) {
  const L = { lot: r.lot, category: null, est: [null, null], frText: null, bankText: null, grade: null, description: null };
  const lines = r.lines.slice();
  let head = lines.shift() || '';
  const em = head.match(/-\s*\(\s*(\$\s?[\d,]+(?:\.\d{2})?\s*-\s*\$\s?[\d,]+(?:\.\d{2})?)\s*\)\s*$/);
  if (em) { L.est = parseEstimate(em[1]); head = head.slice(0, em.index); }
  L.category = head.replace(/^\s*-\s*/, '').replace(/\s*-\s*$/, '').trim() || null;
  // "Grade: VF Bank Name: Burlington, Merchants NB, 1744" (grade last; bank name optional)
  for (let i = lines.length - 1; i >= 0; i--) {
    const gm = lines[i].match(/^(.*?)\bGrade:\s*(.*)$/);
    if (!gm) continue;
    let g = gm[2];
    const bm = g.match(/\bBank Name:\s*(.*)$/);
    if (bm) { L.bankText = bm[1].trim() || null; g = g.slice(0, bm.index); }
    L.grade = g.trim() || null;
    const before = gm[1].trim();
    if (before) lines[i] = before; else lines.splice(i, 1);
    break;
  }
  if (!L.bankText) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const bm = lines[i].match(/^Bank Name:\s*(.+)$/);
      if (bm) { L.bankText = bm[1].trim(); lines.splice(i, 1); break; }
    }
  }
  let title = lines.shift() || '';
  const dash = title.indexOf(' --- ');                      // older sessions: "<title> --- <title again> <description>"
  if (dash > 0) { const rest = title.slice(dash + 5).trim(); title = title.slice(0, dash).trim(); if (rest) lines.unshift(rest); }
  if (L.bankText && title.length > L.bankText.length && title.slice(-L.bankText.length) === L.bankText)
    title = title.slice(0, -L.bankText.length).trim();      // older sessions put the bank on the title line
  L.frText = title || null;
  if (L.bankText && lines.length && lines[0] === L.bankText) lines.shift();   // the bank line repeats the Bank Name field
  L.description = lines.join(' ').trim() || null;
  return L;
}
// Prices realized: "144301 - $ 12,000.00 144302 - $ 1,300.00 ..."
function parsePricesDoc(doc) {
  const tx = oneLine(doc.body ? doc.body.textContent : '');
  const map = {}; let n = 0;
  const re = /(?:^|\s)(\d{1,7}[A-Za-z]?)\s*-\s*\$\s?([\d,]+(?:\.\d{1,2})?)(?=\s|$)/g;
  let m;
  while ((m = re.exec(tx))) {
    const v = parseFloat(m[2].replace(/,/g, ''));
    if (isFinite(v) && v > 0 && map[m[1]] == null) { map[m[1]] = v; n++; }
  }
  return { map: map, count: n, isPricesPage: /Prices Realized/i.test(tx), preliminary: /preliminary/i.test(tx) };
}
// Browse rows: $('#item_rows').html("<escaped html>");
function parseBrowseJs(text) {
  const m = String(text || '').match(/\$\('#item_rows'\)\.html\("([\s\S]*?)"\);/);
  if (!m) return null;
  let html;
  try { html = JSON.parse('"' + m[1].replace(/\\'/g, "'") + '"'); } catch (e) { return null; }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [];
  const els = doc.querySelectorAll('[id^="item_row_"]');
  for (let i = 0; i < els.length; i++) {
    const e = els[i];
    const idm = (e.id || '').match(/^item_row_(\d+)$/);
    const lm = (e.textContent || '').match(/Lot\s*#\s*(\d+[A-Za-z]?)/i);
    if (!idm || !lm) continue;
    const img = e.querySelector('img');
    let src = img ? (img.getAttribute('src') || '') : '';
    src = /^https?:\/\//i.test(src) ? src.split('?')[0] : '';      // the query is only a cache-buster
    rows.push({ lot: lm[1], itemId: idm[1], img: src || null });
  }
  return rows;
}
// Session page: "... x <Catalog> > <Session> Search in <Session> (Browse View) ..."
function parseSessionName(doc) {
  const tx = oneLine(doc.body ? doc.body.textContent : '');
  const m = tx.match(/(?:×|Log-out)\s*(?:×\s*)?(.{3,200}?)\s+Search in /);
  return m ? m[1].replace(/^×\s*/, '').trim() : null;
}
const LK2_MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
function isoDate(y, mo, d) {
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
// "pre-bidding ended on September 09, 2026 @ 11:55 AM EDT"
function parseEndedOn(text) {
  const m = oneLine(text).match(/ended on\s+([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+((?:19|20)\d{2})/i);
  if (!m) return null;
  return isoDate(parseInt(m[3], 10), LK2_MONTHS[m[1].slice(0, 3).toLowerCase()], parseInt(m[2], 10));
}
// "June 2019 IPMS Floor Auction > Session 3 - June 15 @ 6 PM CT - US" -> 2019-06-15
// "December 2008 Auction > Session 2 - Dec. 10, 2008" -> 2008-12-10
// A range ("June 14-17") or a name with no single year is NOT guessed.
function parseNameDate(name) {
  const n = oneLine(name);
  const re = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?!\d)(?:,?\s*((?:19|20)\d{2}))?/ig;
  const hits = []; let m;
  while ((m = re.exec(n))) hits.push({ mo: LK2_MONTHS[m[1].toLowerCase()], d: parseInt(m[2], 10), y: m[3] ? parseInt(m[3], 10) : null, after: n.slice(m.index + m[0].length) });
  if (hits.length !== 1) return null;
  const h = hits[0];
  if (/^\s*(?:-|&|and|to|thru|through)\s*\d/i.test(h.after)) return null;
  let y = h.y;
  if (!y) {
    const ys = n.match(/\b(?:19|20)\d{2}\b/g) || [];
    const uniq = ys.filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (uniq.length !== 1) return null;
    y = parseInt(uniq[0], 10);
  }
  return isoDate(y, h.mo, h.d);
}
/* =====================================================================
 *  LK2 - payload
 * ===================================================================== */
function round2(n) { return Math.round(n * 100 + 1e-7) / 100; }
function buildPayload2(L, sess) {
  const fr = parseFrField(L.frText || '');
  const T = lk2Type(L.category, fr.fr);
  if (!T) return null;
  const isNational = T.tc === 'national_bank_note';
  const isMpc = T.tc === 'mpc_military';
  const mpcSeries = (isMpc && /^Series\s+\d+/i.test(L.bankText || '')) ? L.bankText.trim() : null;
  const bank = (isNational && !mpcSeries) ? parseBankField(L.bankText || '') : parseBankField('');
  const stateCode = (isNational || T.tc === 'obsolete' || T.tc === 'colonial_continental') ? stateFromCategory(L.category) : null;
  const gradeTxt = (L.grade || '').trim();
  const titleParts = [];
  if (isNational && bank.charter) {
    if (fr.fr) titleParts.push('Fr. ' + fr.fr);
    if (fr.denom) titleParts.push(fr.denom);
    if (fr.year) titleParts.push(String(fr.year) + (fr.variant && LK_VARIANT_WORDS[fr.variant] ? ' ' + LK_VARIANT_WORDS[fr.variant] : ''));
    else if (fr.variant === 'ORIGINAL') titleParts.push('Original Series');
  } else if (fr.raw) {
    titleParts.push(fr.raw);                                 // verbatim LK title text
  }
  let title = titleParts.join(' ');
  if (isNational) {
    title += ' National Bank Note.';
    const loc = [bank.town, stateCode].filter(Boolean).join(', ');
    if (loc) title += ' ' + loc + ',';
    if (bank.name) title += ' ' + bank.name + ',';
    if (bank.charter) title += ' Ch. ' + bank.charter + '.';
    title = title.replace(/,$/, '.');
  } else {
    const base = T.label || lk2SeriesLabel(T.tc);
    const label = (T.tc === 'small_size' || T.tc === 'large_size' || (T.tc === 'other' && !T.label)) ? null : base;
    if (label) title += (fr.star ? ' ' + label.replace(/ Note$/, '') + ' Star Note.' : ' ' + label + '.');
    else if (fr.raw) title += '.';
    if (mpcSeries) title += ' ' + mpcSeries + '.';
  }
  if (gradeTxt) title += ' ' + gradeTxt + '.';
  title = title.replace(/\s+/g, ' ').trim();
  const typeClass = T.tc;
  const is1929 = fr.year === 1929 && isNational;
  const hammer = L.hammer != null ? L.hammer : null;
  const price = (hammer != null && sess.rate != null) ? round2(hammer * (1 + sess.rate)) : null;
  const ev = (sess.name || '').split('>').map(function (s) { return s.trim(); });
  const p = {
    p_source_lot_id: ID_PREFIX + sess.id + '-' + L.lot,
    p_lot_url: L.itemId ? ORIGIN + '/items/' + L.itemId : ORIGIN + '/catalog_sessions/' + sess.id + '/browse',
    p_title: title,
    p_series_type: T.label || lk2SeriesLabel(typeClass),
    p_sold_on: sess.date || null,
    p_price_realized: price,
    p_denomination: fr.denom,
    p_is_star_note: extractIsStar(title, fr.fr) || !!fr.star,
    p_grading_company: parseGradingCompany(gradeTxt),
    p_grade_raw: gradeTxt ? gradeTxt.slice(0, 80) : null,
    p_grade_numeric: parseGradeNumeric(gradeTxt),
    p_friedberg_number: is1929 ? null : fr.fr,
    p_type_class: typeClass,
    p_series_year: fr.year,
    // letter only from LK's own series token ("1928-B*" via parseSeries, or a
    // glued "1934A"); never from a block like "1928 A-B" further along the title
    p_series_letter: isNational ? null : (fr.letter !== undefined ? fr.letter : ((fr.variant && /^[A-H]$/.test(fr.variant)) ? fr.variant : null)),
    p_state_code: stateCode,
    p_charter_number: bank.charter,
    p_ppq_epq: parsePpqEpq(gradeTxt),
    p_estimate_low: L.est[0], p_estimate_high: L.est[1],
    p_auction_event_name: (ev[0] || '').slice(0, 200) || null,
    p_thumbnail_url: L.img || null,
    p_raw: {
      extractor_version: EXTRACTOR_VERSION, hv: VERSION, source: SOURCE, lk_site: 'lynknight.com',
      lk_stage: 'print',
      catalog_session_id: String(sess.id), lot_number: String(L.lot), item_id: L.itemId || null,
      session: ev.slice(1).join(' > ') || null,
      lk_category_text: L.category,
      lk_fr: fr.raw || null, lk_series_variant: fr.variant,
      lk_grade: gradeTxt || null,
      lk_bank_town: bank.town, lk_bank_name: bank.name, lk_charter_region: bank.region,
      lk_charter_note: bank.note, lk_district: fr.district || null, mpc_series: mpcSeries,
      description: L.description ? L.description.slice(0, 4000) : null,
      image_url: L.img || null,
      hammer: hammer, bp_rate: sess.rate != null ? sess.rate : null,
      price_basis: 'lk_hammer_plus_bp',
      sale_date_source: sess.dateSource || null,
      harvested_at: new Date().toISOString()
    }
  };
  if (isNational && L.category && !stateCode) p.p_raw.lk_state_text = L.category.split('>').pop().trim();
  return p;
}
/* =====================================================================
 *  LK2 boot self-test on the real shapes scouted 2026-11-10
 * ===================================================================== */
function lk2SelfTest(tag) {
  let fails = 0;
  function eq(a, b, what) { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.error('[' + tag + ' LK2-TEST FAIL]', what, 'got', a, 'want', b); } }
  const html = '<html><body class="popup"><div class="hidden-print">Print Back to Session Home</div>' +
    '<h3 class="text-center">Celebration of Stars - US Currency &gt; Celebration of Stars - US Currency</h3><hr>' +
    '<strong>Lot #144301</strong> - Small Size Type Notes &gt; Legal Tender - ($ 20,000.00 - $ 40,000.00)<br>Fr. 1500* $1 1928 *00000621A<br>' +
    'The $1 red seal legal tender note is a two note set.<br>Grade: AU/CU<hr>' +
    '<strong>Lot #144668</strong> - National Bank Notes &gt; Iowa - ($ 4,000.00 - $ 8,000.00)<br>Fr. 1804-1 $100 1929T1<br>Burlington, Merchants NB, 1744<br>' +
    'Believed lost in the flood years ago.<br>Second line of text.<br>Grade: VF Bank Name: Burlington, Merchants NB, 1744<hr>' +
    '<strong>Lot #144700</strong> - World Paper Money &gt; Iraq - ($ 100.00 - $ 200.00)<br>P-4 5 Dinars 1931<br>Grade: PMG VF 25<hr>' +
    '<strong>Lot #144701</strong> - Large Size Type Notes &gt; Silver Certificates - ($ 900.00 - $ 1,500.00)<br>Fr. 224 $1 1896<br>Grade: PMG Ch. UNC 63 EPQ<hr>' +
    '</body></html>';
  const P = parsePrintDoc(new DOMParser().parseFromString(html, 'text/html'));
  eq(P.name, 'Celebration of Stars - US Currency > Celebration of Stars - US Currency', 'session name');
  eq(P.lots.length, 4, 'lot count');
  const a = P.lots[0], b = P.lots[1];
  eq([a.lot, a.category, a.est, a.frText, a.bankText, a.grade, a.description],
     ['144301', 'Small Size Type Notes > Legal Tender', [20000, 40000], 'Fr. 1500* $1 1928 *00000621A', null, 'AU/CU', 'The $1 red seal legal tender note is a two note set.'], 'print lot type note');
  eq([b.lot, b.category, b.est, b.frText, b.bankText, b.grade, b.description],
     ['144668', 'National Bank Notes > Iowa', [4000, 8000], 'Fr. 1804-1 $100 1929T1', 'Burlington, Merchants NB, 1744', 'VF', 'Believed lost in the flood years ago. Second line of text.'], 'print lot national');
  const pr = parsePricesDoc(new DOMParser().parseFromString('<body>Prices Realized for X &gt; X As for November 10, 2026 @ 10:50 AM EST (Please note - this is a preliminary prices realized) 144301 - $ 12,000.00 144302 - $ 1,300.00 144668 - $ 950.00</body>', 'text/html'));
  eq([pr.count, pr.map['144301'], pr.map['144302'], pr.map['144668'], pr.isPricesPage, pr.preliminary], [3, 12000, 1300, 950, true, true], 'prices');
  const br = parseBrowseJs("$('#item_rows').html(\"<div class=\\'row\\'>\\n<div class=\\'col-md-3\\' id=\\'item_row_1223437\\'><a href=\\\"\\/items\\/1223437?x=1\\\"><img src=\\\"https:\\/\\/s3.amazonaws.com\\/lynknightprod\\/uploaded_files\\/77\\/thumb\\/77.jpg?1780080323\\\"><\\/a>Lot #144301 Fr. 1500* $1 1928<\\/div><\\/div>\");\n$('html,body').animate({scrollTop: 0});");
  eq(br, [{ lot: '144301', itemId: '1223437', img: 'https://s3.amazonaws.com/lynknightprod/uploaded_files/77/thumb/77.jpg' }], 'browse rows');
  eq(parseEndedOn('Wednesday September 9th @ 11 AM CDT - pre-bidding ended on September 09, 2026 @ 11:55 AM EDT'), '2026-09-09', 'ended on');
  eq(parseNameDate('June 2019 IPMS Floor Auction > Session 3 - June 15 @ 6 PM CT - US'), '2019-06-15', 'name date');
  eq(parseNameDate('December 2008 Auction > Session 2 - Dec. 10, 2008'), '2008-12-10', 'name date with year');
  eq(parseNameDate('2016 Memphis Knight Live Auction - June 14-17 > Session 7 - 2016 US'), null, 'name date range not guessed');
  eq(parseNameDate('Celebration of Stars - US Currency > Celebration of Stars - US Currency'), null, 'name without date');
  eq([lk2Type('Small Size Type Notes > Legal Tender', '1500'), lk2Type('Large Size Type Notes > Federal Reserve Bank Notes', null), lk2Type('Large Size Type Notes > Treasury Notes', null),
      lk2Type('Error Notes > Federal Reserve Notes', null), lk2Type('Fractional Currency', null), lk2Type('World Paper Money > Iraq', null), lk2Type('Something New', null)].map(function (t) { return t && t.tc; }),
     ['legal_tender', 'federal_reserve_bank_note', 'treasury_note', 'error_note', 'fractional', null, null], 'category types');
  eq(lk2Type('Large Size Type Notes > Compound Interest Treasury Notes', null).tc, 'interest_bearing_note', 'compound interest is not a treasury note');
  // every category on the three 2026 US sessions (2068, 2066, 2030)
  eq(['Obsolete Notes & Miscellaneous Items > Colorado', 'Confederate Notes', 'Confederate Items', 'Military Payment Certificates', 'Colonial Currency > Maryland',
      'Small Size Type Notes > Hawaii Issue', 'Small Size Type Notes > North Africa Issue', 'Small Size Type Notes > Miscellaneous', 'Error Notes > Large Size Legal Tender Issues',
      'Books > Currency', 'Checks', 'Disney Dollars', 'World Paper Money > Canada', 'Small Size Type Notes > Gold Certificates', 'Large Size Type Notes > Gold Certificates',
      'Small Size Type Notes > Federal Reserve Bank Notes', 'National Bank Notes > Hawaii'].map(function (c) { const t = lk2Type(c, null); return t && t.tc; }),
     ['obsolete', 'confederate', null, 'mpc_military', 'colonial_continental', 'other', 'other', 'small_size', 'error_note',
      null, null, null, null, 'gold_certificate', 'gold_certificate', 'federal_reserve_bank_note', 'national_bank_note'], '2026 session categories');
  eq(lk2Type('Small Size Type Notes > Miscellaneous', '1600').tc, 'silver_certificate', 'small size misc typed from the Fr number');
  const po = buildPayload2({ lot: '9', category: 'Obsolete Notes & Miscellaneous Items > Colorado', est: [100, 200], frText: '$5 1862 Denver, Clark Gruber & Co.', bankText: null, grade: 'Fine', description: null, hammer: 500 }, { id: 5, name: 'S > S', date: '2026-06-03', rate: 0.23 });
  eq([po.p_type_class, po.p_state_code, po.p_denomination, po.p_series_year, po.p_friedberg_number, po.p_title, po.p_price_realized], ['obsolete', 'CO', '$5', 1862, null, '$5 1862 Denver, Clark Gruber & Co. Obsolete. Fine.', 615], 'payload obsolete');
  const sess = { id: 2068, name: P.name, date: '2026-09-09', rate: 0.23, dateSource: 'home' };
  const pa = buildPayload2(Object.assign({}, a, { hammer: 12000, itemId: '1223437', img: 'https://s3.amazonaws.com/x/thumb/1.jpg' }), sess);
  eq([pa.p_source_lot_id, pa.p_lot_url, pa.p_title, pa.p_type_class, pa.p_series_type, pa.p_friedberg_number, pa.p_series_year, pa.p_denomination, pa.p_is_star_note, pa.p_price_realized, pa.p_sold_on, pa.p_estimate_low, pa.p_auction_event_name, pa.p_raw.hammer, pa.p_raw.bp_rate, pa.p_raw.price_basis, pa.p_raw.lk_stage],
     ['lk2-2068-144301', 'https://www.lynknight.com/items/1223437', 'Fr. 1500* $1 1928 *00000621A Legal Tender Star Note. AU/CU.', 'legal_tender', 'Legal Tender Note', '1500', 1928, '$1', true, 14760, '2026-09-09', 20000, 'Celebration of Stars - US Currency', 12000, 0.23, 'lk_hammer_plus_bp', 'print'], 'payload type note');
  const pb = buildPayload2(Object.assign({}, b, { hammer: 950 }), sess);
  eq([pb.p_source_lot_id, pb.p_lot_url, pb.p_title, pb.p_type_class, pb.p_friedberg_number, pb.p_series_year, pb.p_state_code, pb.p_charter_number, pb.p_price_realized, pb.p_raw.lk_series_variant],
     ['lk2-2068-144668', 'https://www.lynknight.com/catalog_sessions/2068/browse', 'Fr. 1804-1 $100 1929 Type 1 National Bank Note. Burlington, IA, Merchants NB, Ch. 1744. VF.', 'national_bank_note', null, 1929, 'IA', '1744', 1168.5, 'T1'], 'payload national 1929');
  eq(buildPayload2(Object.assign({}, P.lots[2], { hammer: 100 }), sess), null, 'world lot skipped');
  const pd = buildPayload2(Object.assign({}, P.lots[3], { hammer: 1000 }), { id: 9, name: 'A > B', date: '2019-06-15', rate: 0.2 });
  eq([pd.p_title, pd.p_type_class, pd.p_grading_company, pd.p_grade_numeric, pd.p_ppq_epq, pd.p_price_realized, pd.p_raw.session],
     ['Fr. 224 $1 1896 Silver Certificate. PMG Ch. UNC 63 EPQ.', 'silver_certificate', 'PMG', 63, 'EPQ', 1200, 'B'], 'payload large silver');
  eq(round2(425 * 1.23), 522.75, 'rounding');
  if (fails) console.error('[' + tag + '] LK2 SELF-TEST: ' + fails + ' FAILED');
  else console.log('[' + tag + '] lk2 self-test ok');
  return fails;
}
/* =====================================================================
 *  RPC (through ingest-proxy, private key header)
 * ===================================================================== */
function postOnce(url, payload) {
  return new Promise(function (resolve, reject) {
    const fail = function (status, body) { const e = new Error(status + ' ' + String(body || '').slice(0, 180)); e.status = status; reject(e); };
    if (typeof GM_xmlhttpRequest === 'function') {
      GM_xmlhttpRequest({
        method: 'POST', url: url,
        headers: { 'Content-Type': 'application/json', 'x-harvest-key': HARVEST_KEY },
        data: JSON.stringify(payload), timeout: 45000,
        onload: function (resp) { if (resp.status >= 200 && resp.status < 300) resolve(resp.responseText || ''); else fail(resp.status, resp.responseText); },
        onerror: function () { fail(0, 'network error'); },
        ontimeout: function () { fail(0, 'timeout'); }
      });
    } else {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-harvest-key': HARVEST_KEY }, body: JSON.stringify(payload) })
        .then(function (r) { return r.text().then(function (t) { if (r.ok) resolve(t); else fail(r.status, t); }); })
        .catch(function (e) { fail(0, String(e && e.message || e)); });
    }
  });
}
async function post(payload) {
  try { return (await postOnce(RPC_URL, payload)).replace(/^"|"$/g, ''); }
  catch (e) {
    const transient = !e.status || e.status >= 500 || e.status === 429;
    const breaker = /circuit breaker|ingest_guard/i.test(String(e.message || e));
    if (!transient || breaker || e.status === 401) throw e;
    await sleep(800);
    return (await postOnce(RPC_URL, payload)).replace(/^"|"$/g, '');
  }
}
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
const jitter = function (ms) { return Math.round(ms * (0.75 + Math.random() * 0.5)); };
const el = function (id) { return document.getElementById(id); };
/* =====================================================================
 *  STATE (localStorage; survives reload)
 * ===================================================================== */
function FRESH() { return { mode: 'idle', running: false, sid: '', date: '', bp: '', links: true, delay: PAGE_DELAY_S,
  from: '', to: '', cur: null, found: [], msg: '', errs: [], runId: 0, selftest: 0,
  stats: { lots: 0, sold: 0, unsold: 0, skipcat: 0, linked: 0, 'new': 0, upd: 0, rej: 0, err: 0, reqs: 0 }, unknownCats: {} }; }
let st = load();
function load() { try { const o = Object.assign(FRESH(), JSON.parse(localStorage.getItem(LS_KEY)));
    if (!o.errs) o.errs = []; if (!o.stats) o.stats = FRESH().stats; if (!o.found) o.found = []; if (!o.unknownCats) o.unknownCats = {};
    o.running = false; return o; }                              // a reload never auto-resumes: one session per press
  catch (e) { return FRESH(); } }
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch (e) {} }
function logErr(m) { st.errs.unshift(String(m).slice(0, 200)); if (st.errs.length > 6) st.errs.length = 6; }
function keyMissing() { return HARVEST_KEY.indexOf('hk_') !== 0; }
function finish(msg) { st.running = false; st.msg = 'RUN COMPLETE (' + msg + ')'; save(); paint(); }
function setMsg(m) { st.msg = m; save(); paint(); }
async function pause(mine) { const ms = jitter(Math.max(1, parseFloat(st.delay) || PAGE_DELAY_S) * 1000); const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (!st.running || st.runId !== mine) return false; await sleep(Math.min(500, ms)); } return true; }
async function getPage(path, asJs) {
  st.stats.reqs++;
  const r = await fetch(ORIGIN + path, { credentials: 'include',
    headers: asJs ? { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'text/javascript' } : {} });
  const text = await r.text();
  let finalPath = path;
  try { finalPath = new URL(r.url || (ORIGIN + path)).pathname; } catch (e) {}
  const wantPath = path.split('?')[0];
  const out = { status: r.status, text: text, moved: !!r.redirected && finalPath !== wantPath, finalPath: finalPath };
  if (!asJs) out.doc = new DOMParser().parseFromString(text, 'text/html');
  return out;
}
function blocked(pg) { return /captcha|verify you are human|unusual activity|too many requests/i.test(pg.text.slice(0, 4000)) || pg.status === 429 || pg.status === 403; }
/* =====================================================================
 *  HARVEST / DRY RUN - one session
 * ===================================================================== */
async function runSession(dry) {
  const mine = st.runId;
  const alive = function () { return st.running && st.runId === mine; };
  const sid = String(st.sid).trim();
  try {
    setMsg('session ' + sid + ': reading the print page ...');
    const pp = await getPage('/catalog_sessions/' + sid + '/print');
    if (blocked(pp)) return finish('LYN KNIGHT CHECK? status ' + pp.status + ' on the print page - open the site in this tab, pass any check, then run again');
    if (pp.status === 404) return finish('session ' + sid + ' does not exist (404)');
    if (pp.moved) return finish('session ' + sid + ' redirected to ' + pp.finalPath + ' - signed out, or the session is not public');
    const P = parsePrintDoc(pp.doc);
    if (!P.lots.length) return finish('no lots parsed on the print page of session ' + sid);
    if (!(await pause(mine))) return;
    setMsg('session ' + sid + ': ' + P.lots.length + ' lots - reading prices realized ...');
    const rz = await getPage('/catalog_sessions/' + sid + '/prices_realized');
    if (blocked(rz)) return finish('LYN KNIGHT CHECK? status ' + rz.status + ' on prices realized');
    const prices = (rz.status === 200 && !rz.moved) ? parsePricesDoc(rz.doc) : { map: {}, count: 0, isPricesPage: false, preliminary: false };
    if (!prices.isPricesPage || !prices.count) return finish('session ' + sid + ' has no prices realized yet (' + P.lots.length + ' lots, 0 prices) - nothing written');
    // sale date: panel value wins; else home page; else session name
    let date = /^\d{4}-\d{2}-\d{2}$/.test(String(st.date).trim()) ? String(st.date).trim() : '';
    let dateSource = date ? 'operator' : null;
    if (!date) {
      if (!(await pause(mine))) return;
      try {
        const hp = await getPage('/uscurrency/home');
        const a = hp.doc && hp.doc.querySelector('a[href*="/catalog_sessions/' + sid + '/"], a[href$="/catalog_sessions/' + sid + '"]');
        let e = a;
        for (let k = 0; e && k < 5; k++) { e = e.parentElement;
          if (e && (oneLine(e.textContent).match(/ended on/gi) || []).length === 1) { date = parseEndedOn(e.textContent) || ''; break; }
          if (e && (oneLine(e.textContent).match(/ended on/gi) || []).length > 1) break; }
        if (date) dateSource = 'home';
      } catch (e2) {}
      if (!date) { date = parseNameDate(P.name) || ''; if (date) dateSource = 'name'; }
    }
    const bpNum = parseFloat(String(st.bp).replace('%', ''));
    const rate = (isFinite(bpNum) && bpNum > 0 && bpNum < 50) ? Math.round(bpNum * 100) / 10000 : null;
    // optional browse pass: each lot's own link + thumbnail
    const links = {};
    if (st.links) {
      const want = Math.ceil(P.lots.length / BROWSE_PAGE_SIZE);
      for (let page = 1; page <= Math.min(want + 2, MAX_BROWSE_PAGES); page++) {
        if (!(await pause(mine))) return;
        setMsg('session ' + sid + ': lot links page ' + page + ' of about ' + want + ' ...');
        const bp = await getPage('/items/search.js?search%5Bcatalog_session_id%5D=' + encodeURIComponent(sid) + '&page=' + page, true);
        if (blocked(bp)) return finish('LYN KNIGHT CHECK? status ' + bp.status + ' on lot links page ' + page + ' - nothing written');
        const rows = parseBrowseJs(bp.text);
        if (rows == null) { logErr('lot links page ' + page + ': unexpected response (status ' + bp.status + ') - continuing without links'); break; }
        if (!rows.length) break;
        rows.forEach(function (r) { links[r.lot] = r; });
      }
    }
    if (!alive()) return;
    const sess = { id: sid, name: P.name, date: date || null, rate: rate, dateSource: dateSource };
    const queue = []; const s = st.stats; const unknown = {};
    s.lots += P.lots.length;
    P.lots.forEach(function (L) {
      L.hammer = prices.map[L.lot] != null ? prices.map[L.lot] : null;
      const lk = links[L.lot]; if (lk) { L.itemId = lk.itemId; L.img = lk.img; s.linked++; }
      if (L.hammer == null) { s.unsold++; return; }
      const p = buildPayload2(L, sess);
      if (!p) { s.skipcat++; const c = L.category || '(none)'; unknown[c] = (unknown[c] || 0) + 1; st.unknownCats[c] = (st.unknownCats[c] || 0) + 1; return; }
      s.sold++; queue.push(p);
    });
    try { localStorage.setItem(LS_PREVIEW, JSON.stringify({ at: new Date().toISOString(), session: sid, name: P.name, date: date || null, dateSource: dateSource,
      rate: rate, lots: P.lots.length, prices: prices.count, preliminary: prices.preliminary, toWrite: queue.length,
      unsold: P.lots.filter(function (L) { return L.hammer == null; }).length, linked: Object.keys(links).length, unknownCats: unknown,
      pricesWithoutLot: Object.keys(prices.map).filter(function (k) { return !P.lots.some(function (L) { return L.lot === k; }); }).length,
      sample: queue.slice(0, 3).concat(queue.slice(-2)) })); } catch (e3) {}
    const summary = 'session ' + sid + ' "' + P.name.slice(0, 60) + '": ' + P.lots.length + ' lots, ' + prices.count + ' prices' + (prices.preliminary ? ' (PRELIMINARY)' : '') +
      ', ' + queue.length + ' sold US lots to write, date ' + (date || 'MISSING') + (dateSource ? ' (' + dateSource + ')' : '') + ', premium ' + (rate != null ? (rate * 100).toFixed(2) + '%' : 'MISSING');
    if (dry) return finish('DRY RUN - ' + summary + ' - nothing written');
    if (!date) return finish('NEED SALE DATE - ' + summary + ' - nothing written');
    if (rate == null) return finish('NEED PREMIUM % - ' + summary + ' - nothing written');
    setMsg('writing ' + queue.length + ' lots ...');
    let cursor = 0, stop = null;
    async function worker() {
      while (alive() && !stop) {
        const i = cursor++; if (i >= queue.length) return;
        try {
          const out = await post(queue[i]);
          if (/^upd/.test(out)) s.upd++; else s['new']++;
        } catch (e) {
          const body = String(e.message || e);
          if (/circuit breaker|ingest_guard/i.test(body)) { stop = 'STOPPED - circuit breaker. See error panel before running anything else.'; logErr('BREAKER ' + body); return; }
          if (e.status === 401) { stop = 'STOPPED - key rejected (401). Check HARVEST_KEY.'; logErr('KEY REJECTED (401)'); return; }
          if (/reject:/.test(body)) s.rej++; else s.err++;
          logErr((/reject:/.test(body) ? 'REJ ' : 'ERR ') + body.slice(0, 140) + ' :: ' + queue[i].p_source_lot_id);
        }
        if ((s['new'] + s.upd + s.rej + s.err) % 10 === 0) { save(); paint(); }
      }
    }
    const ws = []; for (let w = 0; w < Math.min(POST_WORKERS, queue.length); w++) ws.push(worker());
    await Promise.all(ws);
    if (stop) return finish(stop);
    if (!alive()) return;
    finish('HARVESTED - ' + summary);
  } catch (e) {
    logErr('RUN ERROR ' + String(e && e.message || e));
    finish('STOPPED - error: ' + String(e && e.message || e).slice(0, 120));
  }
}
/* =====================================================================
 *  DISCOVER - which session ids exist
 * ===================================================================== */
async function runDiscover() {
  const mine = st.runId;
  const to = parseInt(st.to, 10);
  let id = st.cur != null ? st.cur : parseInt(st.from, 10);
  try {
    while (st.running && st.runId === mine && id <= to) {
      setMsg('discover: checking session ' + id + ' of ' + st.from + '-' + to + ' (' + st.found.length + ' found)');
      const pg = await getPage('/catalog_sessions/' + id);
      if (blocked(pg)) return finish('LYN KNIGHT CHECK? status ' + pg.status + ' at session ' + id + ' - press Discover to continue from here');
      if (pg.status === 200 && !pg.moved) { const nm = parseSessionName(pg.doc); st.found.push([id, nm || '(name not read)']); }
      else if (pg.status === 200 && pg.moved) st.found.push([id, '(redirected to ' + pg.finalPath + ')']);
      id++; st.cur = id; save();
      const ms = jitter(PROBE_DELAY_S * 1000); const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (!st.running || st.runId !== mine) return; await sleep(400); }
    }
    if (id > to) { st.cur = null; finish('DISCOVER done ' + st.from + '-' + to + ': ' + st.found.length + ' sessions found'); }
  } catch (e) { logErr('DISCOVER ERROR ' + String(e && e.message || e)); finish('STOPPED - discover error at session ' + id); }
}
/* =====================================================================
 *  PANEL
 * ===================================================================== */
function readPanel() {
  st.sid = el('lkh2-sid').value.trim(); st.date = el('lkh2-date').value.trim(); st.bp = el('lkh2-bp').value.trim();
  st.delay = el('lkh2-delay').value.trim() || PAGE_DELAY_S; st.links = !!el('lkh2-links').checked;
  st.from = el('lkh2-from').value.trim(); st.to = el('lkh2-to').value.trim();
}
function begin(mode) {
  if (st.running) return;
  readPanel();
  if (st.selftest) { st.msg = 'SELF-TEST FAILED (' + st.selftest + ') - do not harvest. See the console.'; return paint(); }
  if (mode === 'discover') {
    const a = parseInt(st.from, 10), b = parseInt(st.to, 10);
    if (!(a > 0) || !(b >= a) || b - a > 1500) { st.msg = 'discover needs a from-to range of session ids (at most 1,500 wide)'; return paint(); }
    if (st.cur == null || st.cur < a || st.cur > b) { st.cur = a; st.found = []; }
  } else {
    if (!/^\d{1,6}$/.test(st.sid)) { st.msg = 'enter one numeric session id'; return paint(); }
    if (mode === 'harvest' && keyMissing()) { st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not harvest.'; return paint(); }
    if (st.date && !/^\d{4}-\d{2}-\d{2}$/.test(st.date)) { st.msg = 'sale date must be YYYY-MM-DD (or blank to look it up)'; return paint(); }
    st.stats = FRESH().stats; st.errs = [];
  }
  st.mode = mode; st.running = true; st.runId = (st.runId || 0) + 1; st.msg = mode + ' started'; save(); paint();
  if (mode === 'discover') runDiscover(); else runSession(mode === 'dry');
}
function paint() {
  const p = el('lkh2-panel'); if (!p) return;
  const s = st.stats;
  el('lkh2-mode').textContent = 'mode ' + st.mode + (st.running ? ' RUNNING' : ' idle') + '  key:' + (keyMissing() ? 'MISSING' : 'set') + '  delay:' + st.delay + 's';
  el('lkh2-msg').textContent = st.msg || '';
  el('lkh2-stats').textContent = 'lots ' + s.lots + ' - sold ' + s.sold + ' - unsold ' + s.unsold + ' - other-cat ' + s.skipcat + ' - linked ' + s.linked +
    ' - new ' + s['new'] + ' - upd ' + s.upd + ' - rej ' + s.rej + ' - err ' + s.err + ' - site requests ' + s.reqs;
  const uc = Object.keys(st.unknownCats);
  el('lkh2-cats').textContent = uc.length ? 'skipped categories: ' + uc.map(function (k) { return k + ' (' + st.unknownCats[k] + ')'; }).join(' · ').slice(0, 600) : '';
  el('lkh2-found').textContent = st.found.length ? 'found: ' + st.found.slice(-12).map(function (f) { return f[0] + ' ' + String(f[1]).slice(0, 50); }).join(' | ') : '';
  el('lkh2-errs').textContent = st.errs.join('\n');
}
function buildPanel() {
  if (el('lkh2-panel')) return;
  const p = document.createElement('div');
  p.id = 'lkh2-panel';
  p.style.cssText = 'position:fixed;top:70px;right:12px;z-index:2147483000;width:330px;background:#1d1608;color:#f3e7c8;font:12px/1.45 Menlo,Consolas,monospace;padding:10px 12px;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.45)';
  const inp = 'background:#2c220f;color:#f3e7c8;border:1px solid #6b5a2e;border-radius:3px;padding:1px 4px;font:inherit';
  const btn = 'background:#3a2e14;color:#f3e7c8;border:1px solid #8a7a45;border-radius:3px;padding:2px 7px;margin:2px 4px 2px 0;font:inherit;cursor:pointer';
  p.innerHTML = '<div style="font-weight:bold">LK Harvester v' + VERSION + ' (lynknight.com)</div><div id="lkh2-mode"></div>' +
    '<div id="lkh2-msg" style="color:#ffd27a;margin:4px 0;white-space:pre-wrap"></div>' +
    '<div>session id <input id="lkh2-sid" size="6" style="' + inp + '"> delay s <input id="lkh2-delay" size="3" style="' + inp + '"></div>' +
    '<div>sale date <input id="lkh2-date" size="10" placeholder="YYYY-MM-DD" style="' + inp + '"> premium % <input id="lkh2-bp" size="4" style="' + inp + '"></div>' +
    '<div><label><input type="checkbox" id="lkh2-links"> lot links + thumbnails (20 lots a page)</label></div>' +
    '<div><button id="lkh2-dry" style="' + btn + '">Dry Run</button><button id="lkh2-run" style="' + btn + '">Harvest</button><button id="lkh2-stop" style="' + btn + '">Stop</button><button id="lkh2-reset" style="' + btn + '">Reset</button></div>' +
    '<div>ids <input id="lkh2-from" size="5" style="' + inp + '"> to <input id="lkh2-to" size="5" style="' + inp + '"> <button id="lkh2-disc" style="' + btn + '">Discover</button></div>' +
    '<div id="lkh2-stats" style="color:#bfe3a6;margin-top:4px"></div><div id="lkh2-cats" style="color:#e7b98a"></div><div id="lkh2-found" style="color:#a9c9e8"></div>' +
    '<div id="lkh2-errs" style="color:#ff9d8a;white-space:pre-wrap;max-height:90px;overflow:auto"></div>';
  document.body.appendChild(p);
  el('lkh2-sid').value = st.sid || ''; el('lkh2-date').value = st.date || ''; el('lkh2-bp').value = st.bp || '';
  el('lkh2-delay').value = st.delay || PAGE_DELAY_S; el('lkh2-links').checked = st.links !== false;
  el('lkh2-from').value = st.from || ''; el('lkh2-to').value = st.to || '';
  el('lkh2-dry').onclick = function () { begin('dry'); };
  el('lkh2-run').onclick = function () { begin('harvest'); };
  el('lkh2-disc').onclick = function () { begin('discover'); };
  el('lkh2-stop').onclick = function () { st.running = false; st.msg = 'stopped by user'; save(); paint(); };
  el('lkh2-reset').onclick = function () { if (st.running) return; const keep = st.selftest; st = FRESH(); st.selftest = keep; save();
    try { localStorage.removeItem(LS_PREVIEW); } catch (e) {} el('lkh2-sid').value = ''; el('lkh2-date').value = ''; el('lkh2-bp').value = ''; el('lkh2-from').value = ''; el('lkh2-to').value = ''; paint(); };
}
function boot() {
  if (window.top !== window.self) return;
  let tf = 0;
  try { tf = seriesSelfTest('lkh2') + lk2SelfTest('lkh2'); } catch (e) { tf = 99; console.error('[lkh2] self-test crashed', e); }
  st.selftest = tf;
  if (tf) st.msg = 'SELF-TEST FAILED (' + tf + ') - do not harvest. See the console.';
  buildPanel(); save(); paint();
}
boot();
})();
