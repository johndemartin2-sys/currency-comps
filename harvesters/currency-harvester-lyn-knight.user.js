// ==UserScript==
// @name         Currency Comp Harvester — Lyn Knight Archive v1.0.3
// @namespace    jdmstrategy.currency-comps
// @version      1.0.3
// @description  Family-engine harvester for the Lyn Knight Currency Auctions archive (lkcaarchives.com) -> ingest_lyn_knight_lot via ingest-proxy. Category sweep with per-lot detail fetch (structured SERIAL NUMBER field). Shares its series/Friedberg parser byte-for-byte with the Heritage / Stack's / GC harvesters.
// @match        http://www.lkcaarchives.com/*
// @match        https://www.lkcaarchives.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
// v1.0.3 (2026-08-26): FIXES FROM THE FIRST SMALL SIZE PAGE.
//   * YEAR = FR NUMBER. The series-year token scan walked right-to-left and,
//     when the series token was lettered ("1935-E"), kept going and accepted
//     the Fr number itself ("1616") as the year -> RPC reject "series_year
//     equals friedberg base". The scan now runs on the text with the catalog
//     reference removed (SHARED CORE CATALOG_REF_RE), exactly as parseSeries
//     does. Any Fr 1600-1999 with a lettered series was exposed.
//   * TYPE-ROW TITLES keep LK's Fr text VERBATIM ("Fr. 1602* $1 1928-B* *-A",
//     "Fr. 1653* & 1654* $5 1934-C* & 1934-D* *-A") followed by the type
//     label and grade, so series letters, stars, blocks and second Fr
//     numbers (multi-Fr detection) all survive into the title.
//   * PAGE now uses the panel's cat select (it read the tab URL's category,
//     which harvested NBN page 1 when the tab was still on the NBN list).
// v1.0.2 (2026-08-26): ALL US PAPER MONEY CATEGORIES + charset + type rows.
//   Recon of the US Paper Money tree (lkcaarchives.com search_category p=):
//   Large Size is a parent with typed children (LTNI 4,571, SC 4,696, FRN
//   5,641, FRBN 2,040, GC 1,787, TCN 659, DN 96, CITN 38, IBN 38, RC 26,
//   NGBN 0); plus SS 29,101, FC 3,417, CFC 2,547, CC 2,351, MPC 1,783, COC
//   560, TN1812 2. All in the panel's cat select, each with its type class.
//   * CHARSET: pages are windows-1252, not UTF-8 - fetch().text() turned
//     "50¢" into replacement chars. List and detail fetches now decode
//     via TextDecoder('windows-1252').
//   * TYPE ROWS (no Bank: segment, so the row reads "Fr. 1602* $1 1928-B*
//     *-A - Fine - - 06/14/2017 - $35.40 est. ..."): the empty bank slot
//     left a dangling "-" on the grade; stripped. Year/letter now fall back
//     to the SHARED CORE parseSeries on the Fr text ("1928-B*" -> 1928 B);
//     the district/block tail ("New York B-B", "Chicago") goes to
//     raw.lk_district and into the synthesized title.
//   * CATALOG NUMBERS: colonial state-prefix ("VA-212", "CC-88"), Confederate
//     ("T-40") and Fr. numbers all land in p_friedberg_number, matching the
//     Heritage/GC convention. MPC "M50/MPC 871r" and Giori/test notes send
//     no Fr (kept in raw.lk_fr). Denominations: $, cents, shillings/pence.
//   * MPC list rows put "Series 611" in the Bank slot - captured as
//     raw.mpc_series, never treated as a charter.
//   * Synthesized titles carry the category's type label ("Silver
//     Certificate", "Confederate Currency") so title-driven DB logic and
//     series_canonical resolve without guessing.
// v1.0.1 (2026-08-25): CHARTER ANNOTATION FIX, from the first live page.
//   LK appends notes to the charter part of the Bank field - "Grundy County
//   NB, 531 #1" (a serial-number-1 note) - and the charter regex demanded a
//   bare number, so charter_number came through NULL. The regex now takes
//   the leading number and keeps the remainder in raw.lk_charter_note.
//   Rows already written heal on the next list-stage upsert (charter_number
//   = coalesce(new, old)) - re-run Page on any affected page.
//   Server side the same page exposed letter-less Original Series Treasury
//   serials ("1 A - 609384") - fixed in lk_parse_serial v2, not here.
// v1.0.0 (2026-08-25): FIRST RELEASE. Built from live recon of lkcaarchives.com.
//   SITE MODEL. Archive of 237,368 lots, Nov 2003 -> Jun 2017 (post-2017
//   sales are on lynknight.com, a different site - separate harvester later).
//   Plain server-rendered HTML, no JS, no anti-scrape. LOGIN REQUIRED: logged
//   out, every page is a ~1 KB stub with no rows and no fields (verified with
//   credentials:'omit'). The harvester detects the stub and PAUSES.
//   LIST: searchresults.html?mainCategoryId=<CAT>&stateId=&sortBy=&currentRec=0
//   &goPageNum=<N> - 50 rows/page, newest itemId first, header "<n> matches".
//   Each row: div.search_result_container > div.result_text > a[href=
//   showitem.html?itemId=N] with text
//     "Fr. 474 $5 1882BB - PMG XF 40 - Bank: Attleboro, First NB, 2232 -
//      06/10/2017 - $3,835.00 est. $900.00 - $1,500.00"
//   (no "$x est." price = UNSOLD; the row still carries date + estimate).
//   DETAIL: showitem.html?itemId=N is "Label: value<br>" text:
//     Sale Price / Category / Auctioned at (event > session) / Lot Number /
//     Sale Date / Fr # / Grade / Bank / Serial Number / Est / description /
//     one image (printfile.html?...).
//   PRICE BASIS: LK "Sale Price" is ALL-IN (hammer + buyer's premium; 15%
//   through ~2013, 18% by 2016 - verified against round hammers), so it maps
//   straight onto price_realized with no fee math. raw.price_basis='all_in_lk'.
//   SERIAL NUMBERS: the structured field is the reason this source matters.
//   The RPC splits it server-side (lk_parse_serial) into serial_number /
//   serial_plate_position / treasury_serial - this script sends it VERBATIM
//   as p_serial_text and never pre-parses.
//   TWO-STAGE UPSERT (GC v1.0.7 pattern): every list row is upserted first
//   (lk_stage='list'). The RPC answers 'ins:' (new) or 'updn:' (known, no
//   detail yet) -> the lot gets one throttled detail fetch + a second upsert
//   (lk_stage='detail', serial text, lot#, session, description, image).
//   'upd:' (already detail-complete) costs nothing, so re-sweeps are cheap
//   and rows missing detail self-heal on any pass. The RPC never lets a
//   list-stage upsert downgrade a detail row.
//   MODES. SWEEP - all pages of the chosen category (Nationals = 944 pages /
//   47,172 lots), page N -> N+1 via fetch(), NO navigation; state (category,
//   page, row index, stats) lives in localStorage and survives reboots -
//   press Resume on any lkcaarchives.com page. HEAL - pull the DB worklist
//   (get_lk_detail_worklist) of rows without detail and detail-fetch them.
//   PAGE - the list page open in the tab. DRY - parse-only, no writes.
//   1929 NATIONALS: friedberg_number is NOT sent (charter-number convention,
//   matching Heritage rows); Fr text stays in the title and raw.lk_fr.
//   WRITE PATH: POST /functions/v1/ingest-proxy/ingest_lyn_knight_lot with
//   the private x-harvest-key. No Supabase API key in this script. A 401
//   stops the run like a breaker.
(function () {
'use strict';
const VERSION = '1.0.3';
// ===================== CONFIG =====================
const SUPABASE_REF = 'wqizwluccqqfkedpgvve';
// PRIVATE harvest key (hk_...). NOT the publishable key. Paste once, here.
// NEVER commit a real key to the public repo - keep the placeholder there.
const HARVEST_KEY = 'PASTE_HARVEST_KEY_HERE';
const PROXY_BASE = 'https://' + SUPABASE_REF + '.supabase.co/functions/v1/ingest-proxy/';
const RPC_URL = PROXY_BASE + 'ingest_lyn_knight_lot';
const WORKLIST_URL = PROXY_BASE + 'get_lk_detail_worklist';
const EXTRACTOR_VERSION = 'v8';
const LS_KEY = 'lkh1';
const SOURCE = 'lyn_knight';
const POST_WORKERS = 4;          // pooled list-stage upserts per page
const DETAIL_DELAY_MS = 1200;    // base throttle between detail fetches (+/-25% jitter)
const PAGE_DELAY_S = 3;          // pause between list-page fetches (panel-adjustable)
const PAGE_SIZE = 50;
const MAX_PAGES = 6000;          // runaway backstop (all US categories < 4,000 pages)
const CATEGORIES = {             // mainCategoryId -> [label, type_class fallback, series_type label]
  NBN:    ['National Bank Notes (47K)',        'national_bank_note',        'National Bank Note'],
  SS:     ['Small Size Type Notes (29K)',       'small_size',                'Small Size'],
  FRN:    ['Federal Reserve Notes - large (5.6K)', 'federal_reserve_note',   'Federal Reserve Note'],
  SC:     ['Silver Certificates - large (4.7K)', 'silver_certificate',      'Silver Certificate'],
  LTNI:   ['Legal Tender / US Notes (4.6K)',    'legal_tender',              'Legal Tender Note'],
  FC:     ['Fractional Currency (3.4K)',        'fractional',                'Fractional Currency'],
  CFC:    ['Confederate Currency (2.5K)',       'confederate',               'Confederate Currency'],
  CC:     ['Colonial Currency (2.4K)',          'colonial_continental',      'Colonial / Continental Currency'],
  FRBN:   ['Federal Reserve Bank Notes (2K)',   'federal_reserve_bank_note', 'Federal Reserve Bank Note'],
  GC:     ['Gold Certificates (1.8K)',          'gold_certificate',          'Gold Certificate'],
  MPC:    ['Military Payment Certificates (1.8K)', 'mpc_military',           'Military Payment Certificate'],
  TCN:    ['Treasury or Coin Notes (659)',      'treasury_note',             'Treasury Note'],
  COC:    ['Continental Currency (560)',        'colonial_continental',      'Colonial / Continental Currency'],
  DN:     ['Demand Notes (96)',                 'demand_note',               'Demand Note'],
  CITN:   ['Compound Interest Treasury Notes (38)', 'other',                 'Compound Interest Notes'],
  IBN:    ['Interest Bearing Notes (38)',       'other',                     'Interest Bearing Notes'],
  RC:     ['Refunding Certificates (26)',       'other',                     'Refunding Certificate'],
  TN1812: ['Treasury Notes of the War of 1812 (2)', 'other',                'Other'],
  NGBN:   ['National Gold Bank Notes (0)',      'national_bank_note',        'National Gold Bank Note']
};
// v1.0.2: LK pages are windows-1252 - decode explicitly.
async function fetchText(url) {
  const r = await fetch(url, { credentials: 'include' });
  const buf = await r.arrayBuffer();
  let text;
  try { text = new TextDecoder('windows-1252').decode(buf); } catch (e) { text = new TextDecoder('utf-8').decode(buf); }
  return { ok: r.ok, status: r.status, text };
}
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
 *  LK-LOCAL EXTRACTION
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
function typeClassForCategory(cat, mainCat) {
  const c = (cat || '').toLowerCase();
  if (/national/.test(c)) return 'national_bank_note';
  if (/large/.test(c)) return 'large_size';
  if (/small/.test(c)) return 'small_size';
  if (/fractional/.test(c)) return 'fractional';
  if (/colonial|continental/.test(c)) return 'colonial_continental';
  if (/obsolete|broken bank/.test(c)) return 'obsolete';
  if (/confederate/.test(c)) return 'confederate';
  if (/military payment|mpc/.test(c)) return 'mpc_military';
  if (/error/.test(c)) return 'error_note';
  return (CATEGORIES[mainCat] || [])[1] || 'other';
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
 *  PAGE PARSING - list rows
 * ===================================================================== */
function listUrl(cat, page) {
  return '/searchresults.html?mainCategoryId=' + encodeURIComponent(cat) +
    '&stateId=&sortBy=&currentRec=0&goPageNum=' + page;
}
// Logged-out stub: no result rows, no "matches" header, tiny body.
function looksLoggedOut(doc) {
  const txt = (doc.body && doc.body.textContent) || '';
  if (doc.querySelector('.search_result_container')) return false;
  if (/[\d,]+\s+matches/i.test(txt)) return false;
  if (/Sale Price:|Serial Number:/.test(txt)) return false;
  return true;
}
function parseListDoc(doc) {
  const hdr = ((doc.body && doc.body.textContent) || '').match(/([\d,]+)\s+matches/i);
  const total = hdr ? parseInt(hdr[1].replace(/,/g, ''), 10) : null;
  const rows = [];
  for (const c of doc.querySelectorAll('.search_result_container')) {
    const a = c.querySelector('a[href*="showitem.html"]');
    if (!a) continue;
    const idm = (a.getAttribute('href') || '').match(/itemId=(\d+)/);
    if (!idm) continue;
    const text = cleanText(c.textContent || '').replace(/\s+/g, ' ').trim();
    rows.push(parseListRowText(idm[1], text));
  }
  return { total, pages: total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null, rows };
}
// "Fr. 474 $5 1882BB - PMG XF 40 - Bank: Attleboro, First NB, 2232 - 06/10/2017 - $3,835.00 est. $900.00 - $1,500.00"
// Non-national rows: "Fr. 224 $1 1896 - PMG Gem UNC 65 EPQ - 06/10/2017 - $2,400.00 est. ..."
function parseListRowText(id, text) {
  const r = { id, url: 'http://www.lkcaarchives.com/showitem.html?itemId=' + id, text,
              fr: null, grade: null, bank: null, date: null, price: null, est: [null, null], unsold: false };
  let t = text;
  const em = t.match(/\best\.\s*(\$[\d,\.]+\s*-\s*\$[\d,\.]+)\s*$/i);
  if (em) { r.est = parseEstimate(em[1]); t = t.slice(0, em.index).replace(/\s*-\s*$/, '').trim(); }
  const pm = t.match(/-\s*(\$[\d,]+(?:\.\d{2})?)\s*$/);
  if (pm) { r.price = money(pm[1]); t = t.slice(0, pm.index).trim(); }
  const dm = t.match(/-\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*$/);
  if (dm) { r.date = usDateToISO(dm[1]); t = t.slice(0, dm.index).trim(); }
  const bm = t.match(/-\s*Bank:\s*(.+)$/);
  if (bm) { r.bank = bm[1].trim(); t = t.slice(0, bm.index).trim(); }
  t = t.replace(/(\s+-)+\s*$/, '').trim();                    // v1.0.2: empty bank slot leaves "- -"
  const parts = t.split(/\s+-\s+/);
  r.fr = (parts.shift() || '').trim() || null;
  r.grade = parts.join(' - ').replace(/(\s+-)+\s*$/, '').trim() || null;
  r.unsold = r.price == null;
  return r;
}
/* =====================================================================
 *  PAGE PARSING - detail page ("Label: value<br>" text)
 * ===================================================================== */
function parseDetailHtml(html) {
  const out = { fields: {}, description: null, image: null };
  const m0 = html.match(/Sale Price:[\s\S]*?(?=<\/div>|<\/td>|<\/p>|$)/i);
  const block = m0 ? m0[0] : html;
  const lines = block.split(/<br\s*\/?>/i).map(s => cleanText(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim());
  const labels = ['Sale Price', 'Category', 'Auctioned at', 'Lot Number', 'Sale Date', 'Fr #', 'Grade', 'Bank', 'Serial Number', 'Est'];
  const desc = [];
  for (const ln of lines) {
    if (!ln) { continue; }
    let hit = false;
    for (const L of labels) {
      if (ln.indexOf(L + ':') === 0) { out.fields[L] = ln.slice(L.length + 1).trim(); hit = true; break; }
    }
    if (!hit && Object.keys(out.fields).length) desc.push(ln);
  }
  if (desc.length) out.description = desc.join(' ').slice(0, 4000);
  const im = html.match(/<img[^>]+src=["']([^"']*printfile[^"']*)["']/i);
  if (im) out.image = new URL(cleanText(im[1]), 'http://www.lkcaarchives.com/').toString();
  return out;
}
async function fetchDetail(id) {
  const r = await fetchText('/showitem.html?itemId=' + id);   // v1.0.2: windows-1252
  if (!r.ok) throw new Error('detail HTTP ' + r.status);
  const html = r.text;
  if (!/Sale Date:/.test(html)) {
    if (html.length < 1500) throw new Error('LOGIN_STUB');
    throw new Error('detail page has no fields');
  }
  return parseDetailHtml(html);
}
/* =====================================================================
 *  PAYLOAD
 * ===================================================================== */
// `lot` = list row (id, fr, grade, bank, date, price, est, unsold);
// `d`   = detail (fields, description, image) or null for list stage.
function buildPayload(lot, mainCat, d) {
  const f = d ? d.fields : {};
  const frText   = f['Fr #'] || lot.fr || '';
  const gradeTxt = (f['Grade'] || lot.grade || '').trim();
  const bankTxt  = f['Bank'] || lot.bank || '';
  const dateISO  = usDateToISO(f['Sale Date']) || lot.date;
  const price    = d ? (money(f['Sale Price']) || lot.price) : lot.price;
  const est      = f['Est'] ? parseEstimate(f['Est']) : lot.est;
  const category = f['Category'] || null;
  const fr = parseFrField(frText);
  const catDef = CATEGORIES[mainCat] || null;
  const mpcSeries = (mainCat === 'MPC' && /^Series\s+\d+/i.test(bankTxt)) ? bankTxt.trim() : null;   // v1.0.2
  const bank = mpcSeries ? parseBankField('') : parseBankField(bankTxt);
  let catClass = typeClassForCategory(category, mainCat);
  let ssLabel = null;
  if (mainCat === 'SS' && fr.fr) {                               // v1.0.2: type from the Fr range
    const t = smallSizeTypeFromFr(fr.fr);
    if (t === 'other') { catClass = 'other'; ssLabel = 'World War II Emergency Note'; }
    else if (t) { catClass = t; ssLabel = seriesTypeLabel(t); }
  }
  const stateCode = category ? stateFromCategory(category) : null;
  const isNational = catClass === 'national_bank_note' || (!!bank.charter && mainCat === 'NBN');
  // Synthesized title in the Heritage/Stack's shape so title-driven logic
  // (star detection, grade estimation, multi-Fr guard, search) works.
  const titleParts = [];
  if (isNational) {
    if (fr.fr) titleParts.push('Fr. ' + fr.fr);
    if (fr.denom) titleParts.push(fr.denom);
    if (fr.year) titleParts.push(String(fr.year) + (fr.variant && LK_VARIANT_WORDS[fr.variant] ? ' ' + LK_VARIANT_WORDS[fr.variant] : ''));
    else if (fr.variant === 'ORIGINAL') titleParts.push('Original Series');
  } else if (fr.raw) {
    titleParts.push(fr.raw);                                    // v1.0.3: verbatim LK Fr text
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
    // v1.0.2: type rows - category label (district/block already in the verbatim text)
    const label = ssLabel || (catDef && catDef[2] && catDef[2] !== 'Small Size' && catDef[2] !== 'Other' ? catDef[2] : null);
    if (label) title += (fr.star ? ' ' + label.replace(/ Note$/, '') + ' Star Note.' : ' ' + label + '.');
    else if (fr.raw) title += '.';
    if (mpcSeries) title += ' ' + mpcSeries + '.';
  }
  if (gradeTxt) title += ' ' + gradeTxt + '.';
  title = title.replace(/\s+/g, ' ').trim();
  let typeClass = isNational ? 'national_bank_note' : classifyType(title, catClass);
  const is1929 = fr.year === 1929 && isNational;
  const p = {
    p_source_lot_id: String(lot.id),
    p_lot_url: lot.url,
    p_title: title,
    p_series_type: ssLabel || seriesTypeLabel(typeClass),
    p_sold_on: dateISO,
    p_price_realized: price,
    p_denomination: fr.denom,
    p_is_star_note: extractIsStar(title, fr.fr) || !!fr.star,
    p_grading_company: parseGradingCompany(gradeTxt),
    p_grade_raw: gradeTxt ? gradeTxt.slice(0, 80) : null,
    p_grade_numeric: parseGradeNumeric(gradeTxt),
    p_friedberg_number: is1929 ? null : fr.fr,
    p_type_class: typeClass,
    p_series_year: fr.year,
    p_series_letter: isNational ? null : (fr.letter || parseSeries(title).letter),
    p_state_code: stateCode,
    p_charter_number: bank.charter,
    p_ppq_epq: parsePpqEpq(gradeTxt),
    p_estimate_low: est[0], p_estimate_high: est[1],
    p_raw: {
      extractor_version: EXTRACTOR_VERSION, hv: VERSION, source: SOURCE,
      item_id: String(lot.id), lk_category_id: mainCat,
      lk_stage: d ? 'detail' : 'list',
      lk_fr: fr.raw || null, lk_series_variant: fr.variant,
      lk_grade: gradeTxt || null,
      lk_bank_town: bank.town, lk_bank_name: bank.name, lk_charter_region: bank.region,
      lk_district: fr.district || null, mpc_series: mpcSeries,
      lk_charter_note: bank.note,
      price_basis: 'all_in_lk',
      harvested_at: new Date().toISOString()
    }
  };
  if (price == null) p.p_raw.lot_status = 'unsold';
  if (d) {
    p.p_raw.lk_detail_at = new Date().toISOString();
    if (category) p.p_raw.lk_category_text = category;
    if (category && !stateCode) p.p_raw.lk_state_text = category.split('>').pop().trim();
    if (f['Auctioned at']) {
      const ev = f['Auctioned at'].split('>').map(s => s.trim());
      p.p_auction_event_name = ev[0] || null;
      if (ev[1]) p.p_raw.session = ev[1];
    }
    if (f['Lot Number']) p.p_raw.lot_number = f['Lot Number'];
    if (f['Serial Number']) { p.p_raw.serial_text = f['Serial Number']; p.p_serial_text = f['Serial Number']; }
    if (d.description) p.p_raw.description = d.description;
    if (d.image) { p.p_raw.image_url = d.image; p.p_thumbnail_url = d.image; }
  }
  return p;
}
/* =====================================================================
 *  LK boot self-test on real LK shapes
 * ===================================================================== */
function lkSelfTest(tag) {
  let fails = 0;
  function eq(a, b, what) { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.error('[' + tag + ' LK-TEST FAIL]', what, 'got', a, 'want', b); } }
  const r1 = parseListRowText('1', 'Fr. 474 $5 1882BB - PMG XF 40 - Bank: Attleboro, First NB, 2232 - 06/10/2017 - $3,835.00 est. $900.00 - $1,500.00');
  eq([r1.fr, r1.grade, r1.bank, r1.date, r1.price, r1.est, r1.unsold],
     ['Fr. 474 $5 1882BB', 'PMG XF 40', 'Attleboro, First NB, 2232', '2017-06-10', 3835, [900, 1500], false], 'list row sold');
  const r2 = parseListRowText('2', 'Fr. 635 $10 1902ND - VG/Fine - Bank: Los Angeles, Pacific NB, 12454 - 11/22/2003 - est. $100.00 - $200.00');
  eq([r2.grade, r2.bank, r2.date, r2.price, r2.unsold], ['VG/Fine', 'Los Angeles, Pacific NB, 12454', '2003-11-22', null, true], 'list row unsold');
  const r3 = parseListRowText('3', 'Fr. 1801-2 $10 1929T2 - Ch. AU - Bank: Hegins, First NB, 13994 - 06/10/2017 - $560.50 est. $400.00 - $800.00');
  eq([r3.fr, r3.grade, r3.price], ['Fr. 1801-2 $10 1929T2', 'Ch. AU', 560.5], 'list row 1929');
  const f1 = parseFrField('Fr. 474 $5 1882BB');   eq([f1.fr, f1.denom, f1.year, f1.variant], ['474', '$5', 1882, 'BB'], 'fr 1882BB');
  const f2 = parseFrField('Fr. 1801-2 $10 1929T2'); eq([f2.fr, f2.denom, f2.year, f2.variant], ['1801-2', '$10', 1929, 'T2'], 'fr 1929T2');
  const f3 = parseFrField('Fr. 224 $1 1896');       eq([f3.fr, f3.year, f3.variant], ['224', 1896, null], 'fr type note');
  const b1 = parseBankField('Nantucket, Pacific NB, 714');  eq([b1.town, b1.name, b1.charter, b1.region], ['Nantucket', 'Pacific NB', '714', null], 'bank plain');
  const b2 = parseBankField('King City, First NB, M4373');  eq([b2.town, b2.charter, b2.region], ['King City', '4373', 'M'], 'bank region letter');
  const b3 = parseBankField('Morris, Grundy County NB, 531 #1'); eq([b3.town, b3.name, b3.charter, b3.note], ['Morris', 'Grundy County NB', '531', '#1'], 'bank charter annotation');
  eq([parseGradingCompany('PMG Ch. UNC 63 EPQ'), parseGradeNumeric('PMG Ch. UNC 63 EPQ'), parsePpqEpq('PMG Ch. UNC 63 EPQ')], ['PMG', 63, 'EPQ'], 'grade PMG');
  eq([parseGradingCompany('VF ++'), parseGradeNumeric('VF ++')], [null, null], 'grade raw');
  eq(parseGradeNumeric('PCGS VF 30 PPQ'), 30, 'grade PCGS');
  eq(stateFromCategory('National Bank Notes > Massachusetts'), 'MA', 'state');
  eq(stateFromCategory('National Bank Notes > Indian Territory'), null, 'territory');
  const lot = Object.assign(r1, {});
  const pl = buildPayload(lot, 'NBN', null);
  eq([pl.p_type_class, pl.p_charter_number, pl.p_friedberg_number, pl.p_series_year, pl.p_series_letter, pl.p_price_realized, pl.p_raw.lk_stage, pl.p_serial_text],
     ['national_bank_note', '2232', '474', 1882, null, 3835, 'list', undefined], 'payload list');
  eq(pl.p_title, 'Fr. 474 $5 1882 Brown Back National Bank Note. Attleboro, First NB, Ch. 2232. PMG XF 40.', 'title list');
  const f11 = parseFrField('Fr. 1616 $1 1935-E A-A'); eq([f11.fr, f11.year, f11.letter], ['1616', 1935, 'E'], 'fr 1616 not a year');
  const f12 = parseFrField('Fr. 1935-I $2 1976 I-A'); eq([f12.fr, f12.year, f12.letter], ['1935-I', 1976, null], 'fr 1935-I not a year');
  eq(buildPayload(parseListRowText('13', 'Fr. 1653* & 1654* $5 1934-C* & 1934-D* *-A - Ch. CU - - 06/14/2017 - $50.00 est. $50.00 - $100.00'), 'SS', null).p_title,
     'Fr. 1653* & 1654* $5 1934-C* & 1934-D* *-A Silver Certificate Star Note. Ch. CU.', 'verbatim pair title');
  const det = parseDetailHtml('<div class="x">Nantucket, Pacific NB, 714<br>Sale Price: $3,835.00<br>Category: National Bank Notes &gt; Massachusetts<br>Auctioned at: 2017 IPMS Auction - Kansas City, MO &gt; Session 4 - June 10 @ 5 PM - US Large Type &amp; Nationals<br>Lot Number: 2580<br>Sale Date: 06/10/2017<br>Fr #: Fr. 480 $10 1882BB<br>Grade: PMG Ch. UNC 63 EPQ<br>Bank: Nantucket, Pacific NB, 714<br>Serial Number: 166 B - B2282<br>Est: $4,000.00 - $6,000.00<br><br>A beautiful $10 Brown back from this beach town bank. PMG notes: great embossing.</div><img src="/printfile.html?a=1&amp;b=2">');
  eq([det.fields['Serial Number'], det.fields['Lot Number'], det.fields['Fr #'], det.fields['Category']],
     ['166 B - B2282', '2580', 'Fr. 480 $10 1882BB', 'National Bank Notes > Massachusetts'], 'detail fields');
  eq(det.description, 'A beautiful $10 Brown back from this beach town bank. PMG notes: great embossing.', 'detail description');
  eq(det.image, 'http://www.lkcaarchives.com/printfile.html?a=1&b=2', 'detail image');
  const pd = buildPayload({ id: '289967', url: 'u', fr: null, grade: null, bank: null, date: null, price: null, est: [null, null] }, 'NBN', det);
  eq([pd.p_serial_text, pd.p_state_code, pd.p_charter_number, pd.p_price_realized, pd.p_sold_on, pd.p_auction_event_name, pd.p_raw.session, pd.p_raw.lk_stage, pd.p_raw.lot_status, pd.p_estimate_low],
     ['166 B - B2282', 'MA', '714', 3835, '2017-06-10', '2017 IPMS Auction - Kansas City, MO', 'Session 4 - June 10 @ 5 PM - US Large Type & Nationals', 'detail', undefined, 4000], 'payload detail');
  eq(pd.p_title, 'Fr. 480 $10 1882 Brown Back National Bank Note. Nantucket, MA, Pacific NB, Ch. 714. PMG Ch. UNC 63 EPQ.', 'title detail');
  const p29 = buildPayload(r3, 'NBN', null);
  eq([p29.p_friedberg_number, p29.p_series_year, p29.p_raw.lk_fr], [null, 1929, 'Fr. 1801-2 $10 1929T2'], '1929 no fr');
  // v1.0.2 type-row shapes
  const s1 = parseListRowText('9', 'Fr. 1602* $1 1928-B* *-A - Fine - - 06/14/2017 - $35.40 est. $50.00 - $100.00');
  eq([s1.fr, s1.grade, s1.bank, s1.date, s1.price], ['Fr. 1602* $1 1928-B* *-A', 'Fine', null, '2017-06-14', 35.4], 'type row');
  const s2 = parseListRowText('10', 'VA-208b $500 March 1, 1781 - PCGS Apparent VF 30 - - 06/14/2017 - est. $225.00 - $375.00');
  eq([s2.fr, s2.grade, s2.unsold], ['VA-208b $500 March 1, 1781', 'PCGS Apparent VF 30', true], 'colonial unsold row');
  const f4 = parseFrField('Fr. 1602* $1 1928-B* *-A'); eq([f4.fr, f4.denom, f4.year, f4.letter, f4.district], ['1602', '$1', 1928, 'B', '*-A'], 'fr star block');
  const f5 = parseFrField('Fr. 2056-B $20 1934-B New York B-B'); eq([f5.fr, f5.year, f5.letter, f5.district], ['2056-B', 1934, 'B', 'New York B-B'], 'fr district');
  const f6 = parseFrField('VA-212 $25 May 7, 1781'); eq([f6.fr, f6.denom, f6.year], ['VA-212', '$25', 1781], 'colonial');
  const f7 = parseFrField('T-40 $100 1862'); eq([f7.fr, f7.denom, f7.year], ['T-40', '$100', 1862], 'confederate');
  const f8 = parseFrField('Fr. 1374 50\u00a2 Fourth Issue'); eq([f8.fr, f8.denom, f8.district], ['1374', '50 Cents', 'Fourth Issue'], 'fractional');
  const f9 = parseFrField('20 Shillings Sept. 29, 1776'); eq([f9.fr, f9.denom, f9.year], [null, '20s', 1776], 'shillings');
  const f10 = parseFrField('Fr. 871 $5 1914BS Chicago'); eq([f10.fr, f10.year, f10.district], ['871', 1914, 'Chicago'], 'frn 1914');
  const pt = buildPayload(s1, 'SS', null);
  eq([pt.p_type_class, pt.p_friedberg_number, pt.p_series_year, pt.p_series_letter, pt.p_is_star_note, pt.p_charter_number, pt.p_raw.lk_district], ['silver_certificate', '1602', 1928, 'B', true, null, '*-A'], 'payload type row');
  const pm = buildPayload(parseListRowText('11', 'M50?/MPC 871r 5 Cents January 6, 1964-April 28, 1969 - Gem CU - Bank: Series 611 - 12/30/2005 - $97.75 est. $100.00 - $200.00'), 'MPC', null);
  eq([pm.p_type_class, pm.p_charter_number, pm.p_raw.mpc_series, pm.p_denomination, pm.p_friedberg_number], ['mpc_military', null, 'Series 611', '5 Cents', null], 'payload mpc');
  const pc = buildPayload(parseListRowText('12', 'T-40 $100 1862 - PCGS VF 20 - - 06/14/2017 - $59.00 est. $50.00 - $100.00'), 'CFC', null);
  eq([pc.p_type_class, pc.p_friedberg_number, pc.p_series_year, pc.p_grading_company, pc.p_grade_numeric], ['confederate', 'T-40', 1862, 'PCGS', 20], 'payload confederate');
  if (fails) console.error('[' + tag + '] LK SELF-TEST: ' + fails + ' FAILED');
  else console.log('[' + tag + '] lk self-test ok');
  return fails;
}
/* =====================================================================
 *  RPC (through ingest-proxy, private key header)
 * ===================================================================== */
async function postOnce(url, payload){
  const r = await fetch(url, { method:'POST',
    headers:{ 'Content-Type':'application/json', 'x-harvest-key': HARVEST_KEY },
    body: JSON.stringify(payload) });
  const t = await r.text();
  if (!r.ok){ const e = new Error(r.status + ' ' + t.slice(0,180)); e.status = r.status; throw e; }
  return t;
}
async function post(payload){
  try { return (await postOnce(RPC_URL, payload)).replace(/^"|"$/g, ''); }
  catch(e){
    const transient = !e.status || e.status >= 500 || e.status === 429;
    const breaker = /circuit breaker|ingest_guard/i.test(String(e.message || e));
    if (!transient || breaker || e.status === 401) throw e;
    await sleep(400);
    return (await postOnce(RPC_URL, payload)).replace(/^"|"$/g, '');
  }
}
async function worklist(limit){
  const t = await postOnce(WORKLIST_URL, { p_limit: limit });
  const j = JSON.parse(t);
  return Array.isArray(j) ? j : [];
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = ms => Math.round(ms * (0.75 + Math.random() * 0.5));
const el = id => document.getElementById(id);
/* =====================================================================
 *  STATE MACHINE (localStorage; survives reload/reboot)
 * ===================================================================== */
function FRESH(){ return { mode:'idle', running:false, cat:'NBN', page:1, pages:null, row:0,
  delay:PAGE_DELAY_S, detail:true, msg:'', errs:[], runId:0,
  stats:{pages:0,seen:0,new:0,upd:0,rej:0,skip:0,err:0,details:0,unsold:0} }; }
let st = load();
function load(){ try { const o = Object.assign(FRESH(), JSON.parse(localStorage.getItem(LS_KEY)));
    if (!o.errs) o.errs = []; if (!o.stats) o.stats = FRESH().stats; return o; }
  catch(e){ return FRESH(); } }
function save(){ try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch(e){} }
function logErr(m){ st.errs.unshift(String(m).slice(0,180)); if (st.errs.length > 5) st.errs.length = 5; }
function keyMissing(){ return HARVEST_KEY.indexOf('hk_') !== 0; }
function finish(msg){ st.running = false; st.msg = 'RUN COMPLETE (' + msg + ')'; save(); paint(); }
function pauseLogin(){
  st.running = false;
  st.msg = 'LK LOGIN EXPIRED - sign in to lkcaarchives.com in this tab, then press Resume.';
  save(); paint();
}
/* =====================================================================
 *  PROCESSORS
 * ===================================================================== */
// Upsert one list row; returns 'ins' | 'updn' | 'upd' | 'rej' | 'err' | 'breaker'
async function upsertList(lot, cat, r){
  try {
    const out = await post(buildPayload(lot, cat, null));
    if (/^updn/.test(out)) return 'updn';
    if (/^upd/.test(out))  return 'upd';
    return 'ins';
  } catch(e){
    const msg = String(e.message || e);
    if (/circuit breaker|ingest_guard/i.test(msg)){ logErr('BREAKER ' + msg); return 'breaker'; }
    if (e.status === 401){ logErr('KEY REJECTED (401) - check HARVEST_KEY. Run stopped.'); return 'breaker'; }
    if (/reject:/.test(msg)){ logErr('REJ ' + msg + ' :: item ' + lot.id); return 'rej'; }
    logErr('ERR ' + msg + ' :: item ' + lot.id); return 'err';
  }
}
async function detailOne(lot, cat){
  const d = await fetchDetail(lot.id);
  const out = await post(buildPayload(lot, cat, d));
  return out;
}
// One list page: upsert all rows (pooled), then detail-fetch the ins/updn ones.
// st.row is the resume cursor inside the page.
async function processPage(cat, page, dry){
  const res = await fetchText(listUrl(cat, page));             // v1.0.2: windows-1252
  if (!res.ok) throw new Error('list HTTP ' + res.status);
  const doc = new DOMParser().parseFromString(res.text, 'text/html');
  if (looksLoggedOut(doc)) return { loggedOut:true };
  const L = parseListDoc(doc);
  if (L.pages && !st.pages) st.pages = L.pages;
  const r = { seen:L.rows.length, ins:0, upd:0, rej:0, skip:0, err:0, unsold:0, details:0, breaker:false, need:[] };
  if (dry) { r.skip = L.rows.length; r.sample = L.rows.slice(0,3).map(x => buildPayload(x, cat, null)); return r; }
  const rows = L.rows.slice(st.row);
  r.skip = st.row;
  let cursor = 0;
  async function worker(){
    while (true){
      if (r.breaker || !st.running) return;
      const i = cursor++;
      if (i >= rows.length) return;
      const lot = rows[i];
      if (lot.unsold) r.unsold++;
      const o = await upsertList(lot, cat, r);
      if (o === 'breaker'){ r.breaker = true; return; }
      if (o === 'ins'){ r.ins++; r.need.push(lot); }
      else if (o === 'updn'){ r.upd++; r.need.push(lot); }
      else if (o === 'upd') r.upd++;
      else if (o === 'rej') r.rej++;
      else r.err++;
    }
  }
  const ws = []; for (let w = 0; w < Math.min(POST_WORKERS, rows.length); w++) ws.push(worker());
  await Promise.all(ws);
  if (r.breaker || !st.running) return r;
  if (st.detail && r.need.length){
    for (let k = 0; k < r.need.length; k++){
      if (!st.running) break;
      const lot = r.need[k];
      st.msg = 'page ' + page + '/' + (st.pages || '?') + ' detail ' + (k+1) + '/' + r.need.length + ' (item ' + lot.id + ')'; paint();
      try {
        await detailOne(lot, cat);
        r.details++; st.stats.details++;
      } catch(e){
        const msg = String(e.message || e);
        if (msg === 'LOGIN_STUB') return { loggedOut:true, partial:r };
        if (e.status === 401){ logErr('KEY REJECTED (401). Run stopped.'); r.breaker = true; return r; }
        if (/reject:/.test(msg)) r.rej++; else r.err++;
        logErr('DETAIL ' + msg.slice(0,120) + ' :: item ' + lot.id);
      }
      await sleep(jitter(DETAIL_DELAY_MS));
    }
  }
  return r;
}
function tally(r){ const s = st.stats;
  s.pages++; s.seen += r.seen||0; s.new += r.ins||0; s.upd += r.upd||0;
  s.rej += r.rej||0; s.skip += r.skip||0; s.err += r.err||0; s.unsold += r.unsold||0; }
let loopBusy = false;
async function sweepLoop(){
  if (loopBusy) return; loopBusy = true;
  const myRun = st.runId;
  try {
    while (st.running && st.runId === myRun){
      if (st.stats.pages >= MAX_PAGES) return finish('MAX_PAGES backstop hit');
      if (st.pages && st.page > st.pages) return finish('sweep finished - ' + st.pages + ' pages, ' + st.stats.seen + ' lots seen');
      st.msg = 'page ' + st.page + '/' + (st.pages || '?') + ' loading ...'; paint();
      let r;
      try { r = await processPage(st.cat, st.page, false); }
      catch(e){ logErr('PAGE ' + st.page + ' ' + String(e.message||e).slice(0,120)); st.stats.err++; save(); paint(); await sleep(5000); continue; }
      if (r.loggedOut){ if (r.partial) tally(r.partial); return pauseLogin(); }
      tally(r);
      if (r.breaker) return finish('STOPPED - circuit breaker or key rejection. See error panel.');
      if (!st.running) { save(); paint(); return; }
      st.page++; st.row = 0; save(); paint();
      const base = Math.max(1, parseFloat(st.delay) || PAGE_DELAY_S);
      await sleep(jitter(base * 1000));
    }
  } finally { loopBusy = false; save(); paint(); }
}
async function healLoop(){
  if (loopBusy) return; loopBusy = true;
  const myRun = st.runId;
  try {
    while (st.running && st.runId === myRun){
      let list;
      try { list = await worklist(100); }
      catch(e){ if (e.status === 401){ logErr('KEY REJECTED (401).'); return finish('STOPPED - key rejected'); }
                logErr('WORKLIST ' + String(e.message||e).slice(0,120)); await sleep(5000); continue; }
      if (!list.length) return finish('heal finished - worklist empty');
      for (let k = 0; k < list.length; k++){
        if (!st.running || st.runId !== myRun) break;
        const w = list[k];
        const lot = { id: String(w.source_lot_id), url: w.lot_url || ('http://www.lkcaarchives.com/showitem.html?itemId=' + w.source_lot_id),
                      fr:null, grade:null, bank:null, date:null, price:null, est:[null,null], unsold:false };
        st.msg = 'heal ' + (k+1) + '/' + list.length + ' (item ' + lot.id + ')'; paint();
        try { await detailOne(lot, st.cat); st.stats.details++; st.stats.upd++; }
        catch(e){
          const msg = String(e.message || e);
          if (msg === 'LOGIN_STUB') return pauseLogin();
          if (e.status === 401){ logErr('KEY REJECTED (401).'); return finish('STOPPED - key rejected'); }
          if (/reject:/.test(msg)) st.stats.rej++; else st.stats.err++;
          logErr('HEAL ' + msg.slice(0,120) + ' :: item ' + lot.id);
        }
        save();
        await sleep(jitter(DETAIL_DELAY_MS));
      }
      st.stats.pages++; save(); paint();
    }
  } finally { loopBusy = false; save(); paint(); }
}
function resumeRun(){
  if (st.mode === 'sweep') sweepLoop();
  else if (st.mode === 'heal') healLoop();
  else { st.running = false; st.msg = 'nothing to resume (mode ' + st.mode + ')'; save(); paint(); }
}
/* =====================================================================
 *  START MODES
 * ===================================================================== */
function readPanel(){
  st.cat = el('lkh1-cat').value || 'NBN';
  st.delay = parseFloat(el('lkh1-delay').value) || PAGE_DELAY_S;
  st.detail = el('lkh1-detail').checked;
}
function startSweep(){
  if (keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not harvest.'; return paint(); }
  const cat = el('lkh1-cat').value || 'NBN';
  const from = parseInt(el('lkh1-from').value, 10) || 1;
  st = Object.assign(FRESH(), { mode:'sweep', running:true, cat, page:from, row:0, runId:Date.now(),
    delay: parseFloat(el('lkh1-delay').value) || PAGE_DELAY_S, detail: el('lkh1-detail').checked,
    msg: 'sweep started: ' + (CATEGORIES[cat] ? CATEGORIES[cat][0] : cat) + ' from page ' + from });
  save(); paint(); sweepLoop();
}
function startHeal(){
  if (keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not harvest.'; return paint(); }
  st = Object.assign(FRESH(), { mode:'heal', running:true, cat: el('lkh1-cat').value || 'NBN', runId:Date.now(),
    detail:true, msg:'heal started (DB worklist of rows without detail)' });
  save(); paint(); healLoop();
}
async function onePage(dry){
  if (!dry && keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not harvest.'; return paint(); }
  readPanel();
  const u = new URL(location.href);
  const cat = st.cat;                                            // v1.0.3: the panel decides
  const page = (u.searchParams.get('mainCategoryId') === cat && parseInt(u.searchParams.get('goPageNum'), 10)) || 1;
  st.mode = dry ? 'dry' : 'page'; st.running = !dry; st.runId = Date.now(); st.row = 0; st.pages = null;
  st.msg = (dry ? 'dry run ' : 'single page ') + cat + ' p' + page + ' ...'; paint();
  try {
    const r = await processPage(cat, page, dry);
    if (r.loggedOut) return pauseLogin();
    tally(r);
    st.msg = (dry ? 'DRY RUN' : 'PAGE') + ' - rows ' + r.seen + ' - new ' + r.ins + ' - upd ' + r.upd +
      ' - rej ' + r.rej + ' - skip ' + r.skip + ' - err ' + r.err + ' - unsold ' + r.unsold + ' - details ' + (r.details||0);
    if (dry && r.sample) console.log('[lkh1] dry-run sample payloads', r.sample);
  } catch(e){ logErr('PAGE ' + String(e.message||e).slice(0,120)); }
  st.running = false; save(); paint();
}
/* =====================================================================
 *  PANEL
 * ===================================================================== */
function paint(){
  if (!el('lkh1-panel')) return;
  const s = st.stats;
  el('lkh1-mode').textContent = 'mode ' + st.mode + ' ' + (st.running ? 'RUNNING' : 'idle') +
    '  ' + st.cat + ' page ' + st.page + '/' + (st.pages || '?') + ' row ' + st.row +
    '  key:' + (keyMissing() ? 'MISSING' : 'set');
  el('lkh1-msg').textContent = st.msg || '';
  el('lkh1-stats').textContent = 'pages ' + s.pages + ' - rows ' + s.seen + ' - new ' + s.new +
    ' - upd ' + s.upd + ' - rej ' + s.rej + ' - skip ' + s.skip + ' - err ' + s.err +
    ' - unsold ' + s.unsold + ' - details ' + s.details;
  el('lkh1-errs').textContent = (st.errs && st.errs.length) ? st.errs.join('\n') : '';
}
function buildPanel(){
  if (el('lkh1-panel')) return;
  const css = document.createElement('style');
  css.textContent = '#lkh1-panel{position:fixed;right:16px;bottom:14px;z-index:2147483647;' +
    'background:#2a1a0d;color:#e6e6e6;font:12px/1.45 Menlo,Consolas,monospace;padding:10px 12px;' +
    'border:1px solid #9e6a33;border-radius:8px;width:330px;box-shadow:0 6px 20px rgba(0,0,0,.5)}' +
    '#lkh1-panel .hd{color:#fff;font-weight:700;margin-bottom:4px}' +
    '#lkh1-panel .ln{color:#ffc99d}' +
    '#lkh1-msg{margin:6px 0;padding:4px 6px;background:#1a0f06;border-radius:4px;color:#ffd479;min-height:16px;word-break:break-word}' +
    '#lkh1-panel .row{margin:5px 0}' +
    '#lkh1-panel input[type=text],#lkh1-panel select{background:#1a0f06;color:#e6e6e6;border:1px solid #9e6a33;border-radius:3px;padding:1px 4px}' +
    '#lkh1-panel button{background:#5e3a16;color:#e6e6e6;border:1px solid #9e6a33;border-radius:4px;' +
    'padding:3px 7px;margin:2px 3px 2px 0;cursor:pointer}' +
    '#lkh1-panel button:hover{background:#80511e}' +
    '#lkh1-panel label{margin-right:6px;white-space:nowrap}' +
    '#lkh1-stats{color:#8ee08e;margin-top:6px}' +
    '#lkh1-errs{color:#ff8f8f;margin-top:4px;white-space:pre-wrap;word-break:break-word;max-height:96px;overflow:auto}';
  document.head.appendChild(css);
  const p = document.createElement('div');
  p.id = 'lkh1-panel';
  const catOpts = Object.keys(CATEGORIES).map(k => '<option value="' + k + '">' + k + ' - ' + CATEGORIES[k][0] + '</option>').join('');
  p.innerHTML =
    '<div class="hd">LK Harvester v' + VERSION + '</div>' +
    '<div class="ln" id="lkh1-mode"></div>' +
    '<div id="lkh1-msg"></div>' +
    '<div class="row">cat <select id="lkh1-cat">' + catOpts + '</select> from page <input type="text" id="lkh1-from" size="4" value="1"></div>' +
    '<div class="row">delay s <input type="text" id="lkh1-delay" size="3" value="' + PAGE_DELAY_S + '" title="Pause between list pages (+/-25% jitter)"> ' +
    '<label title="Detail-fetch every new/undetailed lot (serial number, lot#, session, description, image)"><input type="checkbox" id="lkh1-detail" checked>details</label></div>' +
    '<div class="row"><button id="lkh1-sweep" title="All pages of the category, newest first. Resumable.">Sweep</button>' +
    '<button id="lkh1-heal" title="DB worklist: detail-fetch rows that have no detail yet">Heal</button>' +
    '<button id="lkh1-dry">Dry Run</button><button id="lkh1-page" title="The list page open in this tab">Page</button></div>' +
    '<div class="row"><button id="lkh1-resume">Resume</button><button id="lkh1-stop">Stop</button>' +
    '<button id="lkh1-reset">Reset</button></div>' +
    '<div id="lkh1-stats"></div>' +
    '<div id="lkh1-errs"></div>';
  document.body.appendChild(p);
  el('lkh1-sweep').onclick  = startSweep;
  el('lkh1-heal').onclick   = startHeal;
  el('lkh1-dry').onclick    = function(){ onePage(true); };
  el('lkh1-page').onclick   = function(){ onePage(false); };
  el('lkh1-resume').onclick = function(){ st.running = true; st.runId = Date.now(); st.msg = 'resumed'; save(); paint(); resumeRun(); };
  el('lkh1-stop').onclick   = function(){ st.running = false; st.msg = 'stopped by user (position saved)'; save(); paint(); };
  el('lkh1-reset').onclick  = function(){ if (!confirm('Clear saved sweep position?')) return;
    localStorage.removeItem(LS_KEY); st = FRESH(); st.msg = 'state cleared'; paint(); };
  if (st.cat && el('lkh1-cat').querySelector('option[value="' + st.cat + '"]')) el('lkh1-cat').value = st.cat;
  el('lkh1-detail').checked = st.detail !== false;
  if (st.delay) el('lkh1-delay').value = st.delay;
}
/* =====================================================================
 *  BOOT
 * ===================================================================== */
function boot(){
  if (!document.body) return setTimeout(boot, 300);
  buildPanel();
  const tf = seriesSelfTest('lkh1.0') + lkSelfTest('lkh1.0');
  if (tf){ st.msg = 'SELF-TEST FAILED (' + tf + ') - see console. Do not harvest.'; st.running = false; }
  else if (keyMissing()){ st.msg = 'HARVEST KEY NOT SET - edit the CONFIG block. Do not harvest.'; }
  paint();
  if (!tf && st.running){ st.msg = 'resuming ' + st.mode + ' at page ' + st.page + ' ...'; st.runId = Date.now(); save(); resumeRun(); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
