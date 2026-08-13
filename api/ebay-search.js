// /api/ebay-search.js  — Vercel serverless function (Node runtime)
// Requires env vars: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  // Reuse token if still valid (60s safety margin)
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;

  const creds = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${creds}`,
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });
  if (!res.ok) throw new Error('eBay token error ' + res.status);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

// eBay category ids
const CATEGORY_PAPER_MONEY_US = '3412';   // Paper Money: US
const CATEGORY_COINS = '11975';           // Coins: US

// eBay Browse API allows up to 200 results per page.
const MAX_LIMIT = 200;

export default async function handler(req, res) {
  try {
    const {
      q = '',
      limit = 50,
      offset = 0,
      priceMin,
      priceMax,
      mode,
      category,
    } = req.query;
    if (!q.trim()) return res.status(400).json({ error: 'Missing query' });

    const categoryId =
      (category && String(category).trim()) ||
      (mode === 'coins' ? CATEGORY_COINS : CATEGORY_PAPER_MONEY_US);

    const token = await getToken();
    const filters = ['buyingOptions:{AUCTION|FIXED_PRICE}'];
    if (priceMin || priceMax) {
      const lo = priceMin ? Number(priceMin) : 0;
      const hi = priceMax ? Number(priceMax) : '';
      filters.push(`price:[${lo}..${hi}]`);
      filters.push('priceCurrency:USD');
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), MAX_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const url =
      'https://api.ebay.com/buy/browse/v1/item_summary/search' +
      `?q=${encodeURIComponent(q)}` +
      `&category_ids=${encodeURIComponent(categoryId)}` +
      `&filter=${encodeURIComponent(filters.join(','))}` +
      `&limit=${safeLimit}` +
      `&offset=${safeOffset}`;

    const ebayRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });
    if (!ebayRes.ok) {
      // Surface eBay's own error payload; a bare status code hides which
      // parameter it rejected.
      let detail = null;
      try {
        detail = await ebayRes.text();
      } catch (_) {}
      return res.status(502).json({
        error: 'eBay search ' + ebayRes.status,
        detail: detail ? detail.slice(0, 1000) : null,
        requestUrl: url,
      });
    }
    const data = await ebayRes.json();

    const items = (data.itemSummaries || []).map((it) => ({
      title: it.title,
      price: it.price ? it.price.value + ' ' + it.price.currency : null,
      buyingOptions: it.buyingOptions || [],
      bidCount: it.bidCount ?? null,
      condition: it.condition || null,
      image: (it.image && it.image.imageUrl) || null,
      url: it.itemWebUrl,
    }));

    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json({
      count: data.total || items.length,
      total: data.total ?? null,
      limit: safeLimit,
      offset: safeOffset,
      items,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}
