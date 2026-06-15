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
    const s = title || '';
    if (/\b1\/2\s?C\b/i.test(s)) return '1/2 C';
    if (/\$2[.\s]?50\b/.test(s) || /\$2\.5\b/.test(s) || /\$2\s?1\/2\b/.test(s)) return '$2.5';
    if (/\$20\b/.test(s)) return '$20';
    if (/\$10\b/.test(s)) return '$10';
    if (/\$5\b/.test(s))  return '$5';
    if (/\$1\b/.test(s))  return '$1';
    const cm = s.match(/\b(50|25|20|10|5|3|2|1)\s?C[SN]?\b/i);
    if (cm) return cm[1] + 'C';
    const t = s.toLowerCase();
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
    const denomRaw = denomFromTitle(title);
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
