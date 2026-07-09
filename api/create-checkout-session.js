// api/create-checkout-session.js
// Vercel serverless function: creates a Stripe Checkout Session in subscription mode.
// Secrets come from Vercel environment variables, never hard-coded.
//
// Product-aware: supports "currency", "coins", and "bundle" (currency + coins).
// Email is REQUIRED so we can look up / create a single Stripe customer per
// email and reliably block duplicate subscriptions. userId is optional (present
// when the buyer is logged into Supabase); the account/entitlements are
// reconciled by the webhook (by email or stripe_customer_id).

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
    if (!cfg) return res.status(400).json({ error: "Unknown product: " + product });

    // Email is required so we can dedupe customers/subscriptions reliably.
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required to start checkout." });
    }

    // Email is required (validated above). Always reuse an existing customer for
  // this email, or create one, so the duplicate-subscription guard below can run
  // even in the pay-first flow. This prevents multiple customers/subscriptions
  // being created for the same email by rapid or repeated checkouts.
  let customerParam = {};
  const existing = await stripe.customers.list({ email: email, limit: 1 });
  if (existing.data.length) {
    customerParam.customer = existing.data[0].id;
  } else {
    const created = await stripe.customers.create({
      email: email,
      metadata: userId ? { supabase_user_id: userId } : {},
    });
    customerParam.customer = created.id;
  }

  // Guard: if this customer already has an active/trialing subscription for
  // this product, do not create another one - send them to manage billing.
  {
    const subs = await stripe.subscriptions.list({
      customer: customerParam.customer,
      status: "all",
      limit: 20,
    });
    const wanted = cfg.grants.join(",");
    const dupe = subs.data.find(
      (s) =>
        (s.status === "active" || s.status === "trialing") &&
        s.metadata &&
        s.metadata.products === wanted
    );
    if (dupe) {
      return res.status(200).json({
        alreadySubscribed: true,
        error:
          "You already have an active subscription for this product. Use the Subscriptions link to manage your plan.",
      });
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
