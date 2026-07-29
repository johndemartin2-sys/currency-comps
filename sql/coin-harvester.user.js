// ==UserScript==
// @name         Heritage Coin Harvester
// @namespace    jdmstrategy.coins
// @version      1.4.4
// @description  Sweep + Top Up harvester for Heritage sold coin lots -> Supabase
// @match        https://coins.ha.com/c/search/results.zx*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
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

// verified live: Heritage coin_designation facet values
const DESIG = { RD:'3596', RB:'3595', BN:'1682', ND:'3172', CA:'1776', DC:'2053', PL:'3416' };
const BY_CODE = {}; Object.keys(DESIG).forEach(k => BY_CODE[DESIG[k]] = k);
const ORDER = ['RD','RB','BN','ND','CA','DC','PL'];

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

/* v1.4.4 ---------- strike TYPE vs strike DESIGNATION ----------
   Strike TYPE is the method of manufacture (PROOF / BUSINESS / SPECIMEN) and belongs in
   p_strike_type. The strike_designation column is reserved for the full-strike family
   (FB/FBL/FH/FT/5FS); sending 'PR' there is rejected by the RPC, which is what silently
   dropped every proof lot up to v1.4.3. */
function pickStrikeType(cat, title, g){
  if (/^\s*(PR|PF)/i.test(g) || /\bproof\b/i.test(cat) || /\bproof\b/i.test(title)) return 'PROOF';
  if (/^\s*SP/i.test(g) || /\bspecimen\b/i.test(title) || /\bsms\b/i.test(cat)) return 'SPECIMEN';
  return 'BUSINESS';
}
// 'FS' is deliberately absent: on a cent FS-### is a Fivaz-Stanton variety, never Full Steps.
function pickStrikeDesig(title){
  const m = /\b(FBL|FB|FH|FT|5FS)\b/.exec(title || '');
  return m ? m[1] : null;
}
// Heritage short codes -> canonical surface vocabulary (PL / DPL / CAM / DCAM / SP).
function pickSurface(title, d){
  if (d === 'CA') return 'CAM';
  if (d === 'DC') return 'DCAM';
  if (d === 'PL') return 'PL';
  if (/\b(ultra|deep)\s*cameo\b/i.test(title)) return 'DCAM';
  if (/\bcameo\b/i.test(title)) return 'CAM';
  if (/\bproof-?like\b/i.test(title)) return 'PL';
  return null;
}
// The PR chip is NOT a Heritage facet (Heritage has no proof designation value; proofs live in
// their own categories). It is a local include/exclude filter: checked = include proof lots.
function proofsIncluded(){ const c = el('chq14-d-PR'); return !c || c.checked; }

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

  return { sold_on: sold_on, title: title, payload: {
    p_source_lot_id: idm[1] + '-' + idm[2],
    p_lot_url: href,
    p_title: title,
    p_sold_on: sold_on,
    p_price_realized: price,
    p_category: cat,
    p_denomination: dm ? dm[0] : null,
    p_denomination_raw: dm ? dm[0] : null,
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
    p_strike_designation: pickStrikeDesig(title),
    p_surface_designation: pickSurface(title, d),
    p_strike_type: pickStrikeType(cat, title, grade)
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
    // v1.4.4: PR chip unchecked = skip proof lots locally.
    if (!proofsIncluded() && p.payload.p_strike_type === 'PROOF'){ r.skip++; continue; }
    if (dry){ r.skip++; continue; }
    try {
      const out = await post(p.payload);
      if (/^upd/.test(out)) r.upd++; else r.ins++;
    } catch(e){
      // v1.4.4: an RPC 'reject:' is a data rule, not a transport failure. Count it as rej so the
      // err counter only ever means something is actually broken.
      const msg = String(e.message || e);
      const tag = /reject:/i.test(msg) ? 'REJ' : 'ERR';
      if (tag === 'REJ') r.rej++; else r.err++;
      logErr(tag + ' ' + msg + ' :: lot ' + p.payload.p_source_lot_id +
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
  const ds = ORDER.filter(function(d){ return el('chq14-d-' + d).checked; });   // PR is not a facet
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
    '  proof ' + (proofsIncluded() ? 'on' : 'off');
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
    '#chq14-panel .prchip{margin-left:6px;padding-left:8px;border-left:1px solid #3a3f47;color:#ffd479}' +
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

  // Heritage designation facets, then the local PR (proof) include/exclude chip.
  el('chq14-desigs').innerHTML = ORDER.map(function(d){
    return '<label><input type="checkbox" id="chq14-d-' + d + '" checked>' + d + '</label>';
  }).join('') +
    '<label class="prchip" title="include proof lots (local filter, not a Heritage facet)">' +
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
// ==UserScript==
// @name         Heritage Coin Comp Harvester — HA v1.0
// @namespace    jdmstrategy.comp-tool
// @version      1.0.0
// @description  Harvest Heritage coin sold-lot comps from search results into lots_coins
// @match        https://coins.ha.com/c/search/results.zx*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function () {
  'use strict';

  /* ---------- CONFIG ---------- */
  const SUPABASE_URL = 'https://wqizwluccqqfkedpgvve.supabase.co';
  const SUPABASE_ANON_KEY = 'PASTE_PUBLISHABLE_ANON_KEY_HERE'; // paste your anon/publishable key; do not commit a secret
  const RPC = 'ingest_heritage_coin_lot';

  /* ---------- MAPS / NORMALIZERS ---------- */
  const FACE = {
    'half cent':'1/2C','large cent':'1C','cent':'1C','two cent':'2C','three cent':'3CS',
    'half dime':'H10C','dime':'10C','twenty cent':'20C','quarter eagle':'$2.50',
    'quarter':'25C','half dollar':'50C','gold dollar':'G$1','trade dollar':'$1',
    'morgan dollar':'$1','peace dollar':'$1','silver dollar':'$1','dollar':'$1',
    'three dollar':'$3','half eagle':'$5','double eagle':'$20','eagle':'$10',
    'shilling':'SHILLING','sixpence':'6P','threepence':'3P','twopence':'2P'
  };
  function denomFromTitle(title) {
        const raw = (title || '').trim();
        // Heritage format is "YEAR TOKEN Description"; the token right after the year is the denomination.
        const POST_YEAR = {
                '1/2C':'1/2C','1C':'1C','2C':'2C','3CS':'3CS','3CN':'3CN','5C':'5C','H10C':'H10C','10C':'10C',
                '20C':'20C','25C':'25C','50C':'50C','$1':'$1','$2.50':'$2.50','$3':'$3','$4':'$4','$5':'$5','$10':'$10','$20':'$20',
                '1/2P':'1/2P','1P':'1P','2P':'2P','2PENCE':'2P','TWOPENCE':'2P','3P':'3P','THREEPENCE':'3P',
                '6P':'6P','6PENCE':'6P','SIXPENCE':'6P','SHILLING':'SHILLING','SHILNG':'SHILLING','SHILLNG':'SHILLING',
                'PENNY':'1P','HALFPENNY':'1/2P','FARTHING':'1/4P','DENIER':'DEN','DEN':'DEN','SOL':'SOL','REAL':'REAL',
                'ESCUDO':'ESCUDO','COPPER':'COPPER','TOKEN':'TOKEN','MEDAL':'MEDAL'
        };
        // grab the first whitespace-delimited token following a 4-digit year (optionally with a mint letter)
        const ym = raw.match(/\b(?:1[6-9]|20)\d{2}(?:-[A-Za-z0-9]+)?\s+([0-9]*\/?[0-9]*[A-Za-z][A-Za-z0-9.\/]*)/);
        if (ym) {
                const tok = ym[1].toUpperCase();
                if (POST_YEAR[tok]) return POST_YEAR[tok];
        }
        // fallback: scan for a denomination word anywhere in the title
        const t = raw.toLowerCase();
        let best = null;
        for (const k of Object.keys(FACE)) if (t.includes(k) && (!best || k.length > best.length)) best = k;
        return best ? FACE[best] : null;
  }

  function normGrade(rawIn) {
    if (!rawIn) return { grade_raw: null, grade_numeric: null, has_plus: false };
    const raw = rawIn.trim().toUpperCase().replace(/\s+/g, '');
    const plus = /\+/.test(raw);
    const nm = raw.match(/(\d{1,2})/);
    const num = nm ? nm[1] : null;
    let desc = (raw.match(/^([A-Z]{1,3})/) || [])[1] || '';
    if (!desc && num) {
      const n = +num;
      desc = n >= 60 ? 'MS' : n >= 50 ? 'AU' : n >= 40 ? 'XF' : n >= 20 ? 'VF' : n >= 12 ? 'F' : n >= 8 ? 'VG' : n >= 4 ? 'G' : 'AG';
    }
    const grade_raw = num ? (desc + num + (plus ? '+' : '')) : ((desc + (plus ? '+' : '')) || null);
    return { grade_raw: grade_raw || null, grade_numeric: num ? parseInt(num, 10) : null, has_plus: plus };
  }

  function mapService(s) {
    const m = { PCGS:'PCGS', NGC:'NGC', ANACS:'ANACS', CGC:'CGC', CACG:'CACG', CAC:'CACG', ICG:'unknown' };
    return s ? (m[s] || 'unknown') : '';
  }
  function money(s) { if (!s) return null; const n = parseFloat(s.replace(/[^0-9.]/g, '')); return isNaN(n) ? null : n; }
  function dateISO(s) { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
  function titleCase(s) { return s ? s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null; }

  function categoryFromLot(li, lot_url) {
    const slug = (lot_url.match(/\/itm\/([^/]+)\//) || [])[1];
    if (slug) return titleCase(slug);
    const full = (li.innerText || '').replace(/\s+/g, ' ').trim();
    return (full.match(/»\s*([A-Za-z'&./\- ]+?)(?=\s*(?:\(|\d|No |IN |Small |Large |Pellets|H\.))/) || [])[1] || null;
  }

  /* ---------- ROW PARSER ---------- */
  function parseRow(li) {
    const txt = li.innerText || '';
    const g = re => { const m = txt.match(re); return m ? m[1].trim() : null; };
    const titleEl = li.querySelector('a.item-title');
    const title = titleEl ? titleEl.textContent.trim() : '';
    const lot_url = titleEl ? titleEl.href : '';
    const service = g(/SERVICE\s+([A-Z]+)/);
    const grade = normGrade(g(/GRADE\s+([A-Za-z0-9+]+)/));
    const denomRaw = (title.match(/(Double Eagle|Half Eagle|Quarter Eagle|Eagle|Gold Dollar|Trade Dollar|Morgan Dollar|Peace Dollar|Silver Dollar|Dollar|Half Dollar|Quarter|Dime|Half Dime|Half Cent|Cent|Shilling|Sixpence|Threepence|Twopence)/i) || [])[1] || null;
    const yr = (title.match(/\b(1[6-9]\d{2}|20[0-2]\d)\b/) || [])[1];
    const priceEl = li.querySelector('.bot-price-data') || li.querySelector('.item-value');
    return {
      p_source_lot_id: li.id,
      p_lot_url: lot_url,
      p_title: title,
      p_sold_on: dateISO(g(/AUCTION ENDED\s+([A-Za-z]+ \d+, \d{4})/)),
      p_price_realized: money(priceEl ? priceEl.textContent : null),
      p_category: categoryFromLot(li, lot_url),
      p_denomination: denomFromTitle(title),
      p_denomination_raw: denomRaw,
      p_grading_company: mapService(service),
      p_grade_raw: grade.grade_raw,
      p_grade_numeric: grade.grade_numeric,
      p_has_cac: /\bCAC\b/.test(txt),
      p_has_plus: !!grade.has_plus,
      p_pcgs_number: g(/PCGS#\s*([0-9]+)/) || g(/NGC#\s*([0-9]+)/),
      p_designation: (title.match(/\b(DCAM|CAM|PL|DMPL|FB|FBL|FS|RD|RB|BN)\b/) || [])[0] || null,
      p_variety: (title.match(/(Breen-[\w.]+|Noe-[\w.]+|W-[\w.]+|FS-[\w.]+|VP-[\w.]+|Salmon [\w.\-]+)/) || [])[0] || null,
      p_die_state: null,
      p_rarity: (title.match(/\bR\.?\s?(\d(?:\.\d)?)\b/) || [])[0] || null,
      p_auction_event_id: g(/Auction (\d+)/),
      p_series_year: yr ? parseInt(yr, 10) : null,
      p_thumbnail_url: li.querySelector('img') ? (li.querySelector('img').src || null) : null,
      p_raw: { v: 'coin1', service: service, id: li.id, category_slug: (lot_url.match(/\/itm\/([^/]+)\//) || [])[1] || null }
    };
  }

  /* ---------- HARVEST ---------- */
  async function harvest(dryRun) {
    const rows = Array.from(document.querySelectorAll('li.item-block')).map(parseRow);
    if (dryRun) {
      console.log('[CoinHarvester] DRY RUN — parsed', rows.length, 'rows');
      console.table(rows.map(r => ({ id:r.p_source_lot_id, cat:r.p_category, denom:r.p_denomination, grade:r.p_grade_raw, svc:r.p_grading_company, cac:r.p_has_cac, price:r.p_price_realized, sold:r.p_sold_on })));
      alert('Dry run: parsed ' + rows.length + ' rows — see console (F12).');
      return;
    }
    let ok = 0, rej = 0; const errs = [];
    for (const r of rows) {
      try {
        const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
          body: JSON.stringify(r)
        });
        if (res.ok) { ok++; } else { rej++; errs.push(r.p_source_lot_id + ': ' + (await res.text()).slice(0, 120)); }
      } catch (e) { rej++; errs.push(r.p_source_lot_id + ': ' + e.message); }
    }
    if (errs.length) console.warn('[CoinHarvester] rejects:\n' + errs.join('\n'));
    alert('Coin harvest: ' + ok + ' ok, ' + rej + ' rejected of ' + rows.length + (errs.length ? '\n(see console for reasons)' : ''));
  }

  /* ---------- UI ---------- */
  function addBtn(label, bottom, dry) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'position:fixed;right:16px;bottom:' + bottom + 'px;z-index:99999;background:' + (dry ? '#555' : '#b8860b') + ';color:#fff;border:0;padding:10px 14px;border-radius:6px;font:600 13px sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    b.onclick = () => harvest(dry);
    document.body.appendChild(b);
  }
  addBtn('⛏ Harvest Coins (HA)', 16, false);
  addBtn('🔍 Dry Run', 60, true);
})();
