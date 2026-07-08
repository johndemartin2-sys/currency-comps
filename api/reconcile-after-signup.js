// api/reconcile-after-signup.js
// Pay-first safety net: after a user creates their account following a paid
// Stripe Checkout, link that paid subscription to the new Supabase profile.
// This closes the gap where the webhook fired before the profile existed and
// therefore could not provision the user (the pay-first reconciliation bug).
// Verifies the session server-side; writes with the service-role key.
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseProducts(metadata) {
  const raw = (metadata && metadata.products) || "currency";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((p) => p === "currency" || p === "coins");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    // Verify the session is real and paid.
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer", "subscription"],
    });
    const sub = session.subscription;
    const paid =
      session.payment_status === "paid" ||
      (sub &&
        typeof sub === "object" &&
        (sub.status === "active" || sub.status === "trialing"));
    if (!paid) return res.status(402).json({ ok: false, error: "Session not paid" });

    const email =
      (session.customer_details && session.customer_details.email) ||
      (session.customer && typeof session.customer === "object"
        ? session.customer.email
        : null);
    if (!email) return res.status(422).json({ ok: false, error: "No email on session" });

    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : (session.customer && session.customer.id) || null;
    const subscriptionId = typeof sub === "string" ? sub : (sub && sub.id) || null;
    const products = parseProducts(
      sub && typeof sub === "object" ? sub.metadata : null
    );

    // Find the profile that was just created with this email.
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!profile) {
      // Account not created yet; webhook / next login will reconcile.
      return res.status(202).json({ ok: false, pending: true });
    }
    const userId = profile.id;

    // 1) Entitlement row(s) - idempotent on (user_id, product).
    const rows = products.map((product) => ({
      user_id: userId,
      product,
      status: "active",
      source: "stripe",
      stripe_subscription_id: subscriptionId,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error: entErr } = await supabase
        .from("user_entitlements")
        .upsert(rows, { onConflict: "user_id,product" });
      if (entErr) throw entErr;
    }

    // 2) Currency profile sync (keeps existing is_paid_member gate working).
    if (products.includes("currency")) {
      const update = {
        subscription_status: "active",
        updated_at: new Date().toISOString(),
      };
      if (customerId) update.stripe_customer_id = customerId;
      const { error: profErr } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", userId);
      if (profErr) throw profErr;
    } else if (customerId) {
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);
    }

    return res.status(200).json({ ok: true, products });
  } catch (err) {
    console.error("reconcile-after-signup error:", err.message);
    return res.status(500).json({ ok: false, error: "Reconcile failed" });
  }
};
