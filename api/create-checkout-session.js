// api/create-checkout-session.js
// Vercel serverless function: creates a Stripe Checkout Session in subscription mode.
// Secrets come from Vercel environment variables, never hard-coded.
//
// Product-aware: supports "currency", "coins", and "bundle" (currency + coins).
// Pay-first flow: userId/email are OPTIONAL. When absent, checkout starts
// anonymously and Stripe collects the email; the account is created afterward
// and reconciled by the webhook (by email or stripe_customer_id).

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map each product+plan to its Stripe Price env var, and to the list of
// entitlement products that subscription grants.
const PRODUCTS = {
  currency: {
    grants: ["currency"],
    monthly: "STRIPE_PRICE_ID",
    annual: "STRIPE_PRICE_ID_ANNUAL",
  },
  coins: {
    grants: ["coins"],
    monthly: "STRIPE_PRICE_ID_COINS",
    annual: "STRIPE_PRICE_ID_COINS_ANNUAL",
  },
  bundle: {
    grants: ["currency", "coins"],
    monthly: "STRIPE_PRICE_ID_BUNDLE",
    annual: "STRIPE_PRICE_ID_BUNDLE_ANNUAL",
  },
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const { userId, email, plan } = body;
    // Default to "currency" so existing callers keep working unchanged.
    const product = body.product || "currency";

    const cfg = PRODUCTS[product];
    if (!cfg) {
      return res.status(400).json({ error: "Unknown product: " + product });
    }

    // Build the customer param. If we have an email, reuse/create a customer
    // for it. If not (anonymous pay-first), omit it entirely: in subscription
    // mode Stripe Checkout creates the customer and collects the email itself.
    let customerParam = {};
    if (email) {
      const existing = await stripe.customers.list({ email: email, limit: 1 });
      if (existing.data.length > 0) {
        customerParam = { customer: existing.data[0].id };
      } else {
        const created = await stripe.customers.create({
          email: email,
          metadata: userId ? { supabase_user_id: userId } : {},
        });
        customerParam = { customer: created.id };
      }
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
      ...customerParam,
      ...(userId ? { client_reference_id: userId } : {}),
      line_items: [{ price: selectedPrice, quantity: 1 }],
      subscription_data: {
        ...(plan === "monthly" ? { trial_period_days: 7 } : {}),
        metadata: {
          ...(userId ? { supabase_user_id: userId } : {}),
          products: cfg.grants.join(","),
        },
      },
      success_url:
        "https://comps.jdmstrategy.com/currency_app.html?checkout=success&product=" +
        product +
        "&plan=" +
        (plan === "annual" ? "annual" : "monthly") +
        "&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://comps.jdmstrategy.com/currency_app.html?checkout=cancel",
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return res.status(500).json({ error: err.message || "Checkout failed" });
  }
};
