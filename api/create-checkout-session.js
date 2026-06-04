// api/create-checkout-session.js
// Vercel serverless function: creates a Stripe Checkout Session in subscription mode.
// Secrets come from Vercel environment variables, never hard-coded.

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Vercel parses JSON bodies automatically for this runtime.
    const body = req.body || {};
    const { userId, email } = body;

    if (!userId || !email) {
      return res.status(400).json({ error: "Missing userId or email" });
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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      client_reference_id: userId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: {
        metadata: { supabase_user_id: userId },
      },
      success_url: "https://comps.jdmstrategy.com/?checkout=success",
      cancel_url: "https://comps.jdmstrategy.com/?checkout=cancel",
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return res.status(500).json({ error: err.message || "Checkout failed" });
  }
};
