// ==UserScript==
// @name         Heritage Coin Harvester
// @namespace    jdmstrategy.coins
// @version      1.4.10
// @description  Sweep + Top Up harvester for Heritage sold coin lots -> Supabase
// @match        https://coins.ha.com/c/search/results.zx*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

// v1.4.4 (2026-07-29), pairs with RPC v2.1:
//   * Strike TYPE and strike DESIGNATION are now separate fields.
//     pickStrikeType()  -> p_strike_type ('PROOF' | 'SPECIMEN' | 'BUSINESS')
//     pickStrikeDesig() -> p_strike_designation (FB/FBL/FH/FT/5FS only; bare 'FS' on a
//     cent is a Fivaz-Stanton variety number, never Full Steps, so it is never sent).
//     v1.4.3 sent 'PR' as p_strike_designation, which the RPC rejected, so every proof
//     lot 400'd and was silently lost (1,248 in one sweep).
//   * Surface designations are sent canonical (CAM / DCAM / PL) rather than Heritage's
//     CA / DC short codes.
//   * New PR chip: unchecking it skips proof and specimen lots. Heritage exposes no
//     proof facet, so unlike the other chips this filters client-side.
//   * RPC 'reject:' responses now count as rej instead of err.
// v1.4.7 (2026-07-29), pairs with RPC v2.2:
//   * Sends p_ha_category: the numeric Heritage coin_category this page was swept
//     against, taken from CUR_CAT. lots_coins.category holds Heritage's series name,
//     which is not one-to-one with a category id, so reconciliation could not tell
//     Small Cents 3862 from Large Cents 2755 -- both land as denomination '1C'.
// v1.4.6 (2026-07-29):
//   * Denomination is now anchored on Heritage's own denomination token instead of
//     keyword-scanning the whole title. The old scan matched attribution wording:
//     'Eagle Eye Photo Seal' on an Indian cent landed as $10 and 'Flying Eagle' as
//     $20. 2,117 rows in lots_coins carry a gold denomination while their title's
//     own token is a minor coin, 1,276 of them from 'eagle eye' alone.
//   * The keyword scan is kept, but only as a fallback for titles with no token at
//     all -- mainly colonials, whose denominations are words (SHILNG, FARTH, SOU,
//     2PENCE, 9DEN, TOKEN) rather than tokens.
//   * Tokens are stored verbatim, so three cent nickels now land as 3CN rather than
//     being folded into 3CS, and dimes will land as 10C / H10C.
// v1.4.5 (2026-07-29):
//   * DESIG is now per coin_category. Every category exposes a different designation
//     set and the facet counts sum exactly to the category total, so any id missing
//     from the map is silently skipped rather than raising: sweeping dimes on v1.4.4
//     would have dropped all 43,065 Full Bands lots (29% of the category) while the
//     panel reported zero rejects the whole way.
//   * Added FB 2250 (dimes) and 5F 1353 (large cents), each re-verified live against
//     the category sold count before being trusted.
//   * Large Cents caveat: its facets sum to 49,591 against a 49,599 category total,
//     so an 8 lot delta there is Heritage's own arithmetic, not a harvester miss.
//   * Bare '5F' is NOT an accepted p_strike_designation, so expect
//     'reject: strike_designation 5F' if the large cent path ever emits it.

(function () {
'use strict';

const SB_URL  = 'https://wqizwluccqqfkedpgvve.supabase.co';
// Paste your Supabase publishable key here after installing. Do NOT commit a live key.
const SB_KEY  = 'PASTE_PUBLISHABLE_KEY_HERE';
const RPC_URL = SB_URL + '/rest/v1/rpc/ingest_heritage_coin_lot';
const LS_KEY = 'chq14';

// ROW_PAUSE must stay 0: Chrome clamps setTimeout to 1000ms in hidden tabs,
// which stretched a 50 row page from 6s to 50s. See sleep() below.
const PER_PAGE = 50, ROW_PAUSE = 0, ROW_WAIT = 20000, POLL_MS = 250;

// verified live 2026-07-29: Heritage coin_designation facet ids. Counts sum EXACTLY to
// the category total, so a designation missing from the active category's list is
// silently skipped -- lost lots, never an error. Each id below was confirmed by
// re-querying it against that category's sold count:
//   dimes 2078: FB 2250 = 43,065, ND 3172 = 95,730   large cents 2755: 5F 1353 = 131
//   colonials 1915: BN 20,573 RB 537 RD 174 CA 5 DC 1 ND 4,881       = 26,171
//   half cents 2512: BN 19,303 RB 1,307 RD 357 CA 3 ND 6             = 20,976
//   two+three cents 4148: BN 4,624 RB 4,281 RD 1,810 PL 5 CA 4,469
//                         DC 452 ND 24,973                           = 40,614
//   each read live 2026-07-29 and each sums EXACTLY to its category total
const DESIG_IDS = { RD:'3596', RB:'3595', BN:'1682', ND:'3172', CA:'1776', DC:'2053',
                    PL:'3416', FB:'2250', '5F':'1353' };
const DESIG_BY_CAT = {
  '3862': ['RD','RB','BN','ND','CA','DC','PL'],   // Small Cents
  '2755': ['BN','RB','RD','5F','ND'],             // Large Cents
  '2078': ['FB','ND','DC','CA','PL','BN','RD'],    // Dimes
  '1915': ['BN','RB','RD','CA','DC','ND'],        // Colonials
  '2512': ['BN','RB','RD','CA','ND'],             // Half Cents
  '4148': ['BN','RB','RD','PL','CA','DC','ND']    // Two and Three Cents
};
const DESIG_FALLBACK = ['RD','RB','BN','ND','CA','DC','PL'];
const CUR_CAT = (function(){
  try { return new URL(location.href).searchParams.get('coin_category') || ''; }
  catch (e) { return ''; }
})();
if (!DESIG_BY_CAT[CUR_CAT]) console.warn('[harvester] no designation map for ' +
  'coin_category ' + (CUR_CAT || '(none)') + '; using the small cent set. Verify that ' +
  'category\'s facets sum to its total before sweeping it.');
// ORDER drives both the chip row and the facet sweep, so it must be category specific.
const ORDER = (DESIG_BY_CAT[CUR_CAT] || DESIG_FALLBACK).slice();
const DESIG = {}; ORDER.forEach(function(k){ DESIG[k] = DESIG_IDS[k]; });
const BY_CODE = {}; Object.keys(DESIG).forEach(function(k){ BY_CODE[DESIG[k]] = k; });

// MessageChannel is NOT subject to background tab timer clamping
const sleep = ms => new Promise(function(r){
  if (!ms){ const c = new MessageChannel(); c.port1.onmessage = function(){ r(); }; c.port2.postMessage(0); return; }
  setTimeout(r, ms);
});
const el = id => document.getElementById(id);

function FRESH(){ return { mode:'idle', running:false, i:0, slices:[], cutoff:'', expect:0,
  total:null, msg:'', errs:[], stats:{pages:0,seen:0,new:0,upd:0,rej:0,skip:0,err:0} }; }

let st = load();
function load(){ try { const o = Object.assign(FRESH(), JSON.parse(localStorage.getItem(LS_KEY)));
                       if (!o.errs) o.errs = []; return o; }
                catch(e){ return FRESH(); } }
function save(){ try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch(e){} }
function logErr(m){
  st.errs.unshift(m.slice(0,180));
  if (st.errs.length > 5) st.errs.length = 5;
}

/* ---------- URL ---------- */
function P(n){ return new URL(location.href).searchParams.get(n) || ''; }
function curPage(){ const m = /^50~(\d+)$/.exec(P('page')); return m ? parseInt(m[1],10) : 1; }
function withPage(n){ const u = new URL(location.href); u.searchParams.set('page','50~'+n); return u.toString(); }
function sliceUrl(year, code, page){
  const u = new URL(location.href);
  u.searchParams.set('us_coin_year', year);
  if (code) u.searchParams.set('coin_designation', code); else u.searchParams.delete('coin_designation');
  if (!u.searchParams.get('sb')) u.searchParams.set('sb','5');
  u.searchParams.set('layout','list');
  u.searchParams.set('page','50~'+page);
  return u.toString();
}
function curDesig(){ return BY_CODE[P('coin_designation')] || null; }
function sliceLabel(){ return (P('us_coin_year')||'?') + ' ' + (curDesig()||'ALL'); }
function category(){
  const t = (document.title || '').split(',').slice(1).join(',').trim();
  if (t) return t;
  const a = document.querySelector('.selected-facet, .facet-selected');
  return a ? a.textContent.trim() : '';
}

/* ---------- field pickers ---------- */
// Denomination. Heritage writes the denomination as its own token in the lot title,
// after the date and after any variety text:
//   1859 1C MS64 PCGS          1909-S VDB 1C MS65 RD
//   1793 1/2 C AU50            1918-D 10C MS64 Full Bands
// Take the FIRST token that is a denomination and stop at the grade, so descriptive
// wording can never win. Anything with no token falls back to the keyword scan.
const DENOM_TOKEN = /^(?:1C|2C|3CS|3CN|5C|H10C|10C|20C|25C|50C|1\/2C|G\$1|\$1|\$2\.50|\$3|\$4|\$5|\$10|\$20|\$25|\$50)$/;
// Colonial / early-American face values sit in the same slot Heritage uses for
// the federal tokens above, but with their own vocabulary. Normalised to match
// the SHILLING / 2P / 3P / 6P convention already in lots_coins.denomination.
const COLONIAL_TOKEN = {
  '1/2P':'1/2P', 'FARTH':'1/4P', 'PENNY':'1P',
  'SHILNG':'SHILLING', 'SHILLING':'SHILLING',
  '2PENCE':'2P', '3PENCE':'3P', '4PENCE':'4P', '6PENCE':'6P',
  'SOU':'SOU', 'SOL':'SOL', 'LIARD':'LIARD',
  '1/24RL':'1/24RL', '1/2RL':'1/2RL'
};
// Two-token halves, e.g. '1740-P 1/2 SOU M ...' -> 1/2SOU (mirrors the 1/2 C rule).
const COLONIAL_HALF = { 'P':'1/2P', 'SOU':'1/2SOU', 'SOL':'1/2SOL', 'RL':'1/2RL' };
function colonialToken(tk, nx){
  if (COLONIAL_TOKEN[tk]) return COLONIAL_TOKEN[tk];
  if (tk === '1/2' && COLONIAL_HALF[nx]) return COLONIAL_HALF[nx];
  if (/^(?:6|9|12|15|24|30)DEN$/.test(tk)) return tk;
  if (/^(?:5|20)SOL$/.test(tk)) return tk;
  if (/^\d{1,2}$/.test(tk) && /^DENIERS?$/.test(nx)) return tk + 'DEN';
  if (/^\d{1,2}$/.test(tk) && /^SOLS?$/.test(nx)) return tk + 'SOL';
  return null;
}
// Letter+number grades (MS64, G4, F12) and holder/adjectival grade words. Tested
// after DENOM_TOKEN so the gold dollar token G$1 is never read as grade 'G'.
const GRADE_TOKEN = /^(?:(?:MS|PR|PF|SP|SMS|AU|XF|EF|VF|VG|AG|FR|PO|G|F)-?\d|(?:Good|Fine|Very|Extremely|About|Choice|Gem|Genuine|Proof|Unc|BU|NGC|PCGS|ANACS|Details)$)/i;
function pickDenom(t){
  const toks = String(t || '').trim().split(/\s+/);
  for (let i = 0; i < toks.length && i < 12; i++){
    const tk = toks[i].replace(/[.,;:]+$/, '');
    if (DENOM_TOKEN.test(tk)) return tk;
    // half cents are written as two tokens: '1793 1/2 C AU50'
    if (tk === '1/2' && (toks[i+1] || '').replace(/[.,;:]+$/, '') === 'C') return '1/2C';
    // colonial face values occupy the same post-date slot; keep the window tight
    if (i < 3){
      const nx = (toks[i+1] || '').replace(/[.,;:]+$/, '').toUpperCase();
      const cd = colonialToken(tk.toUpperCase(), nx);
      if (cd) return cd;
    }
    if (GRADE_TOKEN.test(tk)) break;
  }
  return null;
}
function isColonial(cat){ return /colonial/i.test(String(cat || '')); }
// Keyword fallback for colonials only, and only over the head of the title
// (everything before the grade), so description prose can never win.
function colonialDenom(title, cat){
  if (!isColonial(cat)) return null;
  const ut = String(title || '').toUpperCase();
  const m = /^([\s\S]*?)\s(?:MS|PR|PF|SP|SMS|AU|XF|EF|VF|VG|AG|FR|PO|G|F)-?\d/.exec(ut);
  const hd = m ? m[1] : ut.trim().split(/\s+/).slice(0, 10).join(' ');
  if (/HALF SOU|1\/2 ?SOU/.test(hd)) return '1/2SOU';
  if (/HALF SOL|1\/2 ?SOL/.test(hd)) return '1/2SOL';
  if (/\bSOUS?\b/.test(hd)) return 'SOU';
  if (/HALF ?PENNY|HALFPENNY/.test(hd)) return '1/2P';
  if (/\bPENNY\b/.test(hd)) return '1P';
  if (/\bFARTHING\b/.test(hd)) return '1/4P';
  if (/\bSHILLING\b/.test(hd)) return 'SHILLING';
  if (/\bTWO ?PENCE\b/.test(hd)) return '2P';
  if (/\bTHREE ?PENCE\b/.test(hd)) return '3P';
  if (/\bSIX ?PENCE\b/.test(hd)) return '6P';
  if (/1\/24 (?:PART )?REAL/.test(hd)) return '1/24RL';
  const dn = /\b(\d{1,2}) DENIERS?\b/.exec(hd);
  if (dn) return dn[1] + 'DEN';
  if (/\bLIARD\b/.test(hd)) return 'LIARD';
  return null;
}
function isCopper(cat){
  if (/flying eagle/i.test(cat)) return false;
  return /(cent|two cent|half cent)/i.test(cat);
}
function pickColor(cat, title, d){
  if (!isCopper(cat)) return null;
  if (/\b(steel|zinc[- ]?coated)\b/i.test(title)) return null;
  if (d === 'RD' || d === 'RB' || d === 'BN') return d;
  if (/\bred\s+and\s+brown\b/i.test(title)) return 'RB';
  if (/\bred\b/i.test(title)) return 'RD';
  if (/\bbrown\b/i.test(title)) return 'BN';
  return null;
}

// Strike TYPE = method of manufacture. Mirrors RPC v2.1 derivation exactly:
// certified grade wins, category is the fallback. Title text is deliberately NOT
// used ("...from the proof set" on an MS coin would mislabel it).
function pickStrikeType(cat, title, g){
  if (/^\s*(PR|PF)/i.test(g || '')) return 'PROOF';
  if (/^\s*SP/i.test(g || ''))      return 'SPECIMEN';
  if (/^proof/i.test(cat || ''))    return 'PROOF';
  if (/\bsms\b/i.test(cat || ''))   return 'SPECIMEN';
  return 'BUSINESS';
}

// Strike DESIGNATION = full-strike award. RPC vocab is FS/FB/FBL/FH/FT/5FS, but bare
// 'FS' on a cent is a Fivaz-Stanton variety number, so it is never emitted here.
// Heritage spells the strike designation out in the lot title ("Full Bands"),
// never as the FB/FBL/FH/FT/5FS abbreviation the RPC expects, so v1.4.8 and
// earlier sent NULL for every one of them -- a dimes sweep would have filed all
// 43,065 Full Bands lots under ND. Match both spellings, but only over the head
// of the title (up to and including the grading service) so description prose
// such as "lacks full bands" can never win.
function desigHead(t){
  const s = String(t || '');
  const m = /^([\s\S]*?\b(?:PCGS|NGC|CACG|ANACS|ICG|SEGS)\b)/.exec(s);
  return m ? m[1] : s.trim().split(/\s+/).slice(0, 12).join(' ');
}
function pickStrikeDesig(title){
  const hd = desigHead(title);
  const m = /\b(5FS|FBL|FB|FH|FT)\b/.exec(hd);
  if (m) return m[1];
  if (/\bfull\s+bell\s+lines\b/i.test(hd))       return 'FBL';
  if (/\bfull\s+(?:split\s+)?bands\b/i.test(hd)) return 'FB';
  if (/\bfull\s+head\b/i.test(hd))               return 'FH';
  if (/\bfull\s+torch\b/i.test(hd))              return 'FT';
  if (/\bfull\s+steps\b/i.test(hd))              return '5FS';
  return null;
}

// Canonical surface vocabulary (CAM / DCAM / PL), not Heritage's CA / DC codes.
function pickSurface(title, d){
  if (d === 'CA') return 'CAM';
  if (d === 'DC') return 'DCAM';
  if (d === 'PL') return 'PL';
  if (/\b(ultra|deep)\s*cameo\b/i.test(title)) return 'DCAM';
  if (/\bcameo\b/i.test(title)) return 'CAM';
  if (/\bproof-?like\b/i.test(title)) return 'PL';
  return null;
}

function toISO(s){
  s = (s || '').replace(/\s+/g,' ').trim(); if (!s) return null;
  const d = new Date(s); if (isNaN(d)) return null;
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

/* ---------- row parser ---------- */
function parseRow(li){
  const a = li.querySelector('a.item-title');
  if (!a) return { reject:'no title' };
  const href = a.href || '';
  const b = a.querySelector('b');
  const title = (b ? b.textContent : a.textContent).replace(/\s+/g,' ').trim();
  const idm = /\/a\/(\d+)-(\d+)/.exec(href);
  if (!idm) return { reject:'no lot id' };
  const pEl = li.querySelector('div.item-value span.bot-price-data') || li.querySelector('.bot-price-data');
  const pTxt = pEl ? pEl.textContent.trim() : '';
  if (!pEl || /sign/i.test(pTxt) || !/\d/.test(pTxt)) return { reject:'no price' };
  const price = Number(pTxt.replace(/[^0-9.]/g,''));
  if (!(price > 0)) return { reject:'no price' };
  let service = '', grade = '';
  li.querySelectorAll('.data-block').forEach(function(bl){
    const k = ((bl.querySelector('span.title') || {}).textContent || '');
    const v = ((bl.querySelector('strong')     || {}).textContent || '').trim();
    if (/service/i.test(k)) service = v;
    if (/grade/i.test(k))   grade   = v;
  });
  const dEl = li.querySelector('strong.time-remaining');
  const sold_on = toISO(dEl ? dEl.textContent : '');
  if (!sold_on) return { reject:'no date' };
  const gm = /(\d{1,3})/.exec(grade);
  const cat = category();
  const d   = curDesig();
  const pcgsEl = li.querySelector('span.pcgs');
  const dm = /(1\/2 C|1C|2C|3CS|3CN|5C|10C|20C|25C|50C|\$1|\$2 1\/2|\$3|\$4|\$5|\$10|\$20|\$50)\b/.exec(title);
  const ym = /\b(1[6-9]\d{2}|20\d{2})\b/.exec(title);
  const vm = /\b(FS-\d{3,4}[A-Za-z]?)\b/.exec(title);
  const img = li.querySelector('img.thumbnail');
  // Anchored token wins; dm is the old keyword scan, now only a fallback.
  var denomTok = pickDenom(title);
  return { sold_on: sold_on, title: title, payload: {
    p_source_lot_id: idm[1] + '-' + idm[2],
    p_lot_url: href,
    p_title: title,
    p_sold_on: sold_on,
    p_price_realized: price,
    p_category: cat,
    p_ha_category: CUR_CAT || null,
    p_denomination: denomTok || colonialDenom(title, cat) || (dm ? dm[0] : null),
    p_denomination_raw: denomTok || colonialDenom(title, cat) || (dm ? dm[0] : null),
    p_grading_company: mapService(service),
    p_grade_raw: grade || null,
    p_grade_numeric: gm ? parseInt(gm[1],10) : null,
    p_has_cac: /\bCAC\b/.test(title),
    p_has_plus: /\+/.test(grade) || /\d\+/.test(title),
    p_pcgs_number: pcgsEl ? ((/(\d{3,7})/.exec(pcgsEl.textContent) || [])[1] || null) : null,
    p_designation: d,
    p_variety: vm ? vm[1] : null,
    p_die_state: null,
    p_rarity: null,
    p_auction_event_id: idm[1],
    p_raw: { src:'ha', title: title, url: href, service: service, grade: grade,
             sold: pTxt, desig: d, page: curPage(), cat: cat, v:'1.4.4' },
    p_series_year: ym ? parseInt(ym[1],10) : null,
    p_thumbnail_url: img ? img.src : null,
    p_color: pickColor(cat, title, d),
    p_strike_type: pickStrikeType(cat, title, grade),
    p_strike_designation: pickStrikeDesig(title),
    p_surface_designation: pickSurface(title, d)
  }};
}

/* ---------- RPC ---------- */
async function post(payload){
  const r = await fetch(RPC_URL, { method:'POST',
    headers:{ 'Content-Type':'application/json', 'apikey':SB_KEY, 'Authorization':'Bearer '+SB_KEY },
    body: JSON.stringify(payload) });
  const t = await r.text();
  if (!r.ok) throw new Error(r.status + ' ' + t.slice(0,180));
  return t.replace(/^"|"$/g, '');
}

/* ---------- grader mapping (prefix based, matches Heritage facet labels) ---------- */
function mapService(s){
  const t = (s || '').trim().toUpperCase();
  if (!t) return 'raw';
  if (t.indexOf('CACG')  === 0) return 'CACG';
  if (t.indexOf('PCGS')  === 0) return 'PCGS';   // PCGS, PCGS Genuine
  if (t.indexOf('NGC')   === 0) return 'NGC';    // NGC, NGC Details
  if (t.indexOf('NCS')   === 0) return 'NGC';    // NGC Conservation Services
  if (t.indexOf('ANACS') === 0) return 'ANACS';  // ANACS, ANACS Details
  if (t.indexOf('ICG')   === 0) return 'ICG';
  if (t.indexOf('SEGS')  === 0) return 'SEGS';
  if (t.indexOf('PCI')   === 0) return 'PCI';
  if (t.indexOf('PMG')   === 0) return 'PMG';
  if (t.indexOf('CGA')   === 0) return 'CGA';
  if (t.indexOf('CGC')   === 0) return 'CGC';
  if (t.indexOf('IPG')   === 0) return 'IPG';
  if (/UNCERTIFIED|^RAW|^NONE/.test(t)) return 'raw';
  return 'unknown';                              // Green CAC sticker, anything new
}

/* ---------- wait for rows instead of a fixed delay ---------- */
function waitForRows(){
  return new Promise(function(res){
    const t0 = Date.now();
    (function poll(){
      if (document.querySelectorAll('li.item-block').length) return res(true);
      if (Date.now() - t0 > ROW_WAIT) return res(false);
      setTimeout(poll, POLL_MS);
    })();
  });
}

/* ---------- one page ---------- */
async function processPage(dry){
  const rows = Array.prototype.slice.call(document.querySelectorAll('li.item-block'));
  const r = { seen:0, ins:0, upd:0, rej:0, skip:0, err:0, noPrice:0, newest:null, oldest:null };
  // PR chip: Heritage exposes no proof facet, so proofs are filtered client-side.
  const wantPR = !el('chq14-d-PR') || el('chq14-d-PR').checked;
  for (let i = 0; i < rows.length; i++){
    r.seen++;
    const p = parseRow(rows[i]);
    if (p.reject){
      r.rej++;
      if (p.reject === 'no price') r.noPrice++;
      else logErr('REJ ' + p.reject + ' :: ' + (p.title || '').slice(0,70));
      continue;
    }
    if (p.sold_on){
      if (!r.newest || p.sold_on > r.newest) r.newest = p.sold_on;
      if (!r.oldest || p.sold_on < r.oldest) r.oldest = p.sold_on;
    }
    if (!wantPR && p.payload.p_strike_type !== 'BUSINESS'){ r.skip++; continue; }
    if (dry){ r.skip++; continue; }
    try {
      const out = await post(p.payload);
      if (/^upd/.test(out)) r.upd++; else r.ins++;
    } catch(e){
      const msg = String(e.message || e);
      const isReject = /reject:/.test(msg);
      if (isReject) r.rej++; else r.err++;
      logErr((isReject ? 'REJ ' : 'ERR ') + msg + ' :: lot ' + p.payload.p_source_lot_id +
             ' svc ' + p.payload.p_grading_company + ' gr ' + p.payload.p_grade_raw);
    }
    await sleep(ROW_PAUSE);
  }
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

function nextSlice(reason){
  st.i++;
  if (st.i >= st.slices.length) return finish('sweep finished all ' + st.slices.length + ' slices');
  const s = st.slices[st.i];
  st.expect = 1; st.total = (s.n == null ? null : s.n);
  st.msg = 'slice ' + (st.i+1) + '/' + st.slices.length + ' -> ' + s.year + ' ' + s.desig + '  (' + reason + ')';
  save();
  location.href = sliceUrl(s.year, DESIG[s.desig], 1);
}

async function tick(){
  if (!st.running) return;
  const got = await waitForRows();
  const page = curPage();
  if (st.expect && page < st.expect){
    return st.mode === 'sweep'
      ? nextSlice('page did not advance (' + page + ' < ' + st.expect + ')')
      : finish('page did not advance (' + page + ' < ' + st.expect + ')');
  }
  if (st.total == null) await getTotal();
  st.msg = 'working page ' + page + ' ... ' + sliceLabel(); paint();
  const r = await processPage(false);
  tally(r); save(); paint();
  if (r.seen && r.noPrice === r.seen)
    return finish('prices hidden - sign in to Heritage again');
  if (!r.seen){
    if (!got) return st.mode === 'sweep'
      ? nextSlice('rows never rendered on page ' + page)
      : finish('rows never rendered on page ' + page);
    return st.mode === 'sweep'
      ? nextSlice('empty slice ' + sliceLabel())
      : finish('no rows on page ' + page);
  }
  if (st.mode === 'topup'){
    if (r.upd === r.seen) return finish('whole page already harvested');
    if (st.cutoff && r.newest && r.newest <= st.cutoff) return finish('reached cutoff ' + st.cutoff);
  }
  if (r.seen < PER_PAGE)
    return st.mode === 'sweep' ? nextSlice('slice complete') : finish('last page');
  if (st.total && page >= Math.ceil(st.total / PER_PAGE))
    return st.mode === 'sweep' ? nextSlice('slice complete') : finish('last page');
  st.expect = page + 1; save();
  location.href = withPage(page + 1);
}

/* ---------- facets ---------- */
async function facetCounts(year){
  const u = new URL('https://coins.ha.com/c/webservices/search/guided-navigation-archive.zx');
  ['archive_state','sold_status','coin_category','coin_category_child','coin_category_grandchild',
   'dept','service','mint_mark','coin_finish'].forEach(function(k){
    const v = P(k); if (v) u.searchParams.set(k, v);
  });
  u.searchParams.set('us_coin_year', year);
  u.searchParams.set('layout','list');
  u.searchParams.set('mode','archive');
  u.searchParams.set('si','2');
  const j = await fetch(u.toString(), { credentials:'include' }).then(function(x){ return x.json(); });
  const f = (j.facets || []).filter(function(x){ return x.field === 'coin_designation'; })[0];
  const out = {};
  ((f && f.data) || []).forEach(function(d){
    const k = BY_CODE[String(d.value)]; if (k) out[k] = d.count;
  });
  return out;
}

async function getTotal(){
  try {
    const c = await facetCounts(P('us_coin_year'));
    const d = curDesig();
    st.total = d ? (c[d] || 0) : Object.keys(c).reduce(function(a,k){ return a + c[k]; }, 0);
  } catch(e){ st.total = null; }
  save(); paint();
}

/* ---------- start modes ---------- */
async function buildSweep(){
  const y1 = parseInt(el('chq14-y1').value, 10), y2 = parseInt(el('chq14-y2').value, 10);
  const ds = ORDER.filter(function(d){ return el('chq14-d-' + d).checked; });
  if (!y1 || !y2 || !ds.length){ st.msg = 'need both years and at least one designation'; return paint(); }
  const lo = Math.min(y1,y2), hi = Math.max(y1,y2);
  st.msg = 'building queue, checking facets ' + lo + '-' + hi + ' ...'; paint();
  const slices = [];
  for (let y = lo; y <= hi; y++){
    let c = null;
    try { c = await facetCounts(y); } catch(e){ c = null; }
    ds.forEach(function(d){
      if (c && !c[d]) return;                       // prefilter zero-count slices
      slices.push({ year:y, desig:d, n: c ? (c[d] || null) : null });
    });
    st.msg = 'building queue ... ' + y + '  (' + slices.length + ' slices)'; paint();
  }
  if (!slices.length){ st.msg = 'no non-empty slices in that range'; return paint(); }
  const lots = slices.reduce(function(a,s){ return a + (s.n || 0); }, 0);
  st = Object.assign(FRESH(), { mode:'sweep', running:true, i:0, slices:slices, expect:1,
        total: slices[0].n || null,
        msg:'sweep armed: ' + slices.length + ' slices - ~' + lots + ' lots - ~' +
            Math.ceil(lots/PER_PAGE) + ' pages' });
  save(); paint();
  location.href = sliceUrl(slices[0].year, DESIG[slices[0].desig], 1);
}

function startTopUp(){
  const cut = el('chq14-cut').value.trim();
  if (cut && !/^\d{4}-\d{2}-\d{2}$/.test(cut)){ st.msg = 'cutoff must be YYYY-MM-DD'; return paint(); }
  const u = new URL(location.href);
  if (u.searchParams.get('sb') !== '5'){
    u.searchParams.set('sb','5'); u.searchParams.set('page','50~1');
    st = Object.assign(FRESH(), { mode:'topup', running:true, cutoff:cut, expect:1,
          msg:'top up: forcing newest-first' });
    save(); return (location.href = u.toString());
  }
  st = Object.assign(FRESH(), { mode:'topup', running:true, cutoff:cut, expect:curPage(),
        msg:'top up started' + (cut ? ' - stop at ' + cut : ' - stop on a known page') });
  save(); paint(); tick();
}

async function onePage(dry){
  st.msg = dry ? 'dry run ...' : 'single page ...'; paint();
  await waitForRows();
  if (st.total == null) await getTotal();
  const r = await processPage(dry);
  tally(r); st.msg = (dry ? 'DRY RUN' : 'PAGE') + ' page ' + curPage() +
    ' - seen ' + r.seen + ' - new ' + r.ins + ' - upd ' + r.upd + ' - rej ' + r.rej +
    ' - err ' + r.err + (r.newest ? ' - newest ' + r.newest + ' oldest ' + r.oldest : '');
  save(); paint();
}

/* ---------- panel ---------- */
function paint(){
  if (!el('chq14-panel')) return;
  const s = st.stats;
  el('chq14-slice').textContent = 'cat ' + (P('coin_category')||'-') + '/' + (P('coin_category_child')||'-') +
    '  year ' + (P('us_coin_year')||'ALL') + '  desig ' + (P('coin_designation')||'-') +
    ' -> ' + (curDesig()||'-') + '  color ' + (pickColor(category(), '', curDesig())||'-') +
    '  PR ' + ((!el('chq14-d-PR') || el('chq14-d-PR').checked) ? 'on' : 'off');
  el('chq14-mode').textContent = 'mode ' + st.mode + ' ' + (st.running ? 'RUNNING' : 'idle') +
    '  page ' + curPage() + '/' + (st.total ? Math.ceil(st.total/PER_PAGE) : '?') +
    '  sold ' + (st.total == null ? '?' : st.total) +
    '  rows ' + document.querySelectorAll('li.item-block').length +
    (st.mode === 'sweep' && st.slices.length ? '  slice ' + (st.i+1) + '/' + st.slices.length : '');
  el('chq14-msg').textContent = st.msg || '';
  el('chq14-stats').textContent = 'pages ' + s.pages + ' - seen ' + s.seen + ' - new ' + s.new +
    ' - upd ' + s.upd + ' - rej ' + s.rej + ' - skip ' + s.skip + ' - err ' + s.err;
  el('chq14-errs').textContent = (st.errs && st.errs.length) ? st.errs.join('\n') : '';
}

function buildPanel(){
  if (el('chq14-panel')) return;
  const css = document.createElement('style');
  css.textContent = '#chq14-panel{position:fixed;right:10px;bottom:10px;z-index:2147483647;' +
    'background:#14161a;color:#e6e6e6;font:12px/1.45 Menlo,Consolas,monospace;padding:10px 12px;' +
    'border:1px solid #3a3f47;border-radius:8px;width:330px;box-shadow:0 6px 20px rgba(0,0,0,.5)}' +
    '#chq14-panel .hd{color:#fff;font-weight:700;margin-bottom:4px}' +
    '#chq14-panel .ln{color:#8ec7ff}' +
    '#chq14-msg{margin:6px 0;padding:4px 6px;background:#0b0d10;border-radius:4px;color:#ffd479;min-height:16px;word-break:break-word}' +
    '#chq14-panel .row{margin:5px 0}' +
    '#chq14-panel input{background:#0b0d10;color:#e6e6e6;border:1px solid #3a3f47;border-radius:3px;padding:1px 4px}' +
    '#chq14-panel button{background:#22262c;color:#e6e6e6;border:1px solid #4a505a;border-radius:4px;' +
    'padding:3px 7px;margin:2px 3px 2px 0;cursor:pointer}' +
    '#chq14-panel button:hover{background:#2e343c}' +
    '#chq14-panel label{margin-right:6px;white-space:nowrap}' +
    '#chq14-panel .sep{color:#4a505a;margin-right:6px}' +
    '#chq14-stats{color:#8ee08e;margin-top:6px}' +
    '#chq14-errs{color:#ff8f8f;margin-top:4px;white-space:pre-wrap;word-break:break-word;max-height:96px;overflow:auto}';
  document.head.appendChild(css);

  const p = document.createElement('div');
  p.id = 'chq14-panel';
  p.innerHTML =
    '<div class="hd">Coin Harvester v1.4.4</div>' +
    '<div class="ln" id="chq14-slice"></div>' +
    '<div class="ln" id="chq14-mode"></div>' +
    '<div id="chq14-msg"></div>' +
    '<div class="row">SWEEP years <input id="chq14-y1" size="4"> to <input id="chq14-y2" size="4"></div>' +
    '<div class="row" id="chq14-desigs"></div>' +
    '<div class="row"><button id="chq14-build">Build + Start Sweep</button></div>' +
    '<div class="row">TOP UP stop at <input id="chq14-cut" size="10" placeholder="YYYY-MM-DD"></div>' +
    '<div class="row"><button id="chq14-topup">Start Top Up</button></div>' +
    '<div class="row"><button id="chq14-dry">Dry Run</button><button id="chq14-page">Page</button>' +
    '<button id="chq14-resume">Resume</button><button id="chq14-stop">Stop</button>' +
    '<button id="chq14-reset">Reset</button></div>' +
    '<div id="chq14-stats"></div>' +
    '<div id="chq14-errs"></div>';
  document.body.appendChild(p);

  // The Heritage facet chips build sweep slices; the PR chip is a client-side
  // strike-type filter (Heritage has no proof designation facet).
  el('chq14-desigs').innerHTML = ORDER.map(function(d){
      return '<label><input type="checkbox" id="chq14-d-' + d + '" checked>' + d + '</label>';
    }).join('') +
    '<span class="sep">|</span>' +
    '<label title="Include proof and specimen lots (client-side filter, not a Heritage facet)">' +
    '<input type="checkbox" id="chq14-d-PR" checked>PR</label>';

  el('chq14-y1').value = P('us_coin_year') || '';
  el('chq14-y2').value = P('us_coin_year') || '';
  el('chq14-build').onclick  = buildSweep;
  el('chq14-topup').onclick  = startTopUp;
  el('chq14-dry').onclick    = function(){ onePage(true); };
  el('chq14-page').onclick   = function(){ onePage(false); };
  el('chq14-resume').onclick = function(){ st.running = true; st.msg = 'resumed'; save(); paint(); tick(); };
  el('chq14-stop').onclick   = function(){ st.running = false; st.msg = 'stopped by user'; save(); paint(); };
  el('chq14-reset').onclick  = function(){ localStorage.removeItem(LS_KEY); st = FRESH();
                                           st.msg = 'state cleared'; paint(); };
  el('chq14-d-PR').onchange  = paint;
}

/* ---------- boot ---------- */
function boot(){
  buildPanel(); paint();
  if (SB_KEY.indexOf('PASTE_') === 0){ st.msg = 'SB_KEY not set - paste your publishable key'; paint(); }
  if (st.running){ waitForRows().then(function(){ paint(); tick(); }); }
  else { waitForRows().then(paint); setTimeout(paint, 1200); setTimeout(paint, 3000); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
