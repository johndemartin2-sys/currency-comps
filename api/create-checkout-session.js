// api/create-checkout-session.js
// Vercel serverless function: creates a Stripe Checkout Session in subscription mode.
// Secrets come from Vercel environment variables, never hard-coded.
//
// Product-aware: supports "currency", "coins", and "bundle" (currency + coins).
// One login, separate subscriptions. The webhook reads subscription metadata
// ("products") to grant the right entitlement rows.

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map each product+plan to its Stripe Price env var, and to the list of
// entitlement products that subscription grants.
// NOTE: you set these env vars in Vercel; this file only references their names.
const PRODUCTS = {
  currency: {
    grants: ["currency"],
    monthly: "STRIPE_PRICE_ID",            // existing currency monthly (unchanged)
    annual:  "STRIPE_PRICE_ID_ANNUAL",     // existing currency annual (unchanged)
  },
  coins: {
    grants: ["coins"],
    monthly: "STRIPE_PRICE_ID_COINS",
    annual:  "STRIPE_PRICE_ID_COINS_ANNUAL",
  },
  bundle: {
    grants: ["currency", "coins"],
    monthly: "STRIPE_PRICE_ID_BUNDLE",
    annual:  "STRIPE_PRICE_ID_BUNDLE_ANNUAL",
  },
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Vercel parses JSON bodies automatically for this runtime.
    const body = req.body || {};
    const { userId, email, plan } = body;
    // Default to "currency" so existing callers keep working unchanged.
    const product = body.product || "currency";

    if (!userId || !email) {
      return res.status(400).json({ error: "Missing userId or email" });
    }

    const cfg = PRODUCTS[product];
    if (!cfg) {
      return res.status(400).json({ error: "Unknown product: " + product });
    }

    // Reuse an existing Stripe customer for this email, or create one.
    let customer;
    const existing = await stripe.customers.list({ email: email, limit: 1 });
    if (existing.data.length > 0) {
      customer = existing.data[0];
    } else {
      customer = await stripe.customers.create({
        email: email,
        metadata: { supabase_user_id: userId },
      });
    }

    // Choose monthly (default) or annual price for the selected product.
    const priceEnvName = plan === "annual" ? cfg.annual : cfg.monthly;
    const selectedPrice = process.env[priceEnvName];
    if (!selectedPrice) {
      return res.status(500).json({ error: "Missing price config: " + priceEnvName });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      allow_promotion_codes: true,
      customer: customer.id,
      client_reference_id: userId,
      line_items: [{ price: selectedPrice, quantity: 1 }],
      subscription_data: {
        metadata: {
          supabase_user_id: userId,
          // Comma-separated list of entitlement products this sub grants.
          products: cfg.grants.join(","),
        },
      },
      success_url: "https://comps.jdmstrategy.com/currency_app.html?checkout=success",
      cancel_url: "https://comps.jdmstrategy.com/currency_app.html?checkout=cancel",
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return res.status(500).json({ error: err.message || "Checkout failed" });
  }
};
