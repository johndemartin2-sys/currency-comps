// api/verify-session.js
// Verifies a Stripe Checkout session was actually paid, server-side.
// Used by the pay-first flow: after Stripe redirects back, the create-account
// page calls this with the session_id to confirm payment and to retrieve the
// email Stripe has on file, so the new account is locked to the paid email.
// No account creation or password handling happens here. No secrets exposed.

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const sessionId = body.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer", "subscription"],
    });

    const sub = session.subscription;
    const paid =
      session.payment_status === "paid" ||
      (sub && typeof sub === "object" && sub.status === "active");

    if (!paid) {
      return res.status(402).json({ ok: false, error: "Session not paid" });
    }

    const email =
      (session.customer_details && session.customer_details.email) ||
      (session.customer && typeof session.customer === "object" && session.customer.email) ||
      null;

    const products =
      (sub && typeof sub === "object" && sub.metadata && sub.metadata.products) ||
      "currency";

    return res.status(200).json({
      ok: true,
      email: email,
      customerId:
        typeof session.customer === "string"
          ? session.customer
          : session.customer && session.customer.id,
      subscriptionId:
        typeof sub === "string" ? sub : sub && sub.id,
      products: products, // "currency", "coins", or "currency,coins"
    });
  } catch (err) {
    console.error("verify-session error:", err.message);
    return res.status(500).json({ ok: false, error: "Verification failed" });
  }
};
