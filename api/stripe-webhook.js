// api/stripe-webhook.js
// Stripe webhook: updates profiles.subscription_status in Supabase
// when a subscription is created, updated, or canceled.
// All secrets come from Vercel environment variables.

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role: server-side only
);

// Stripe needs the raw, unparsed body to verify the signature.
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function setStatus({ customerId, userId, status }) {
  const column = userId ? "id" : "stripe_customer_id";
  const value = userId ? userId : customerId;

  const update = {
    subscription_status: status,
    updated_at: new Date().toISOString(),
  };
  if (customerId) update.stripe_customer_id = customerId;

    const { error } = await supabase.from("profiles").update(update).eq(column, value).neq("is_admin", true);
  if (error) throw error;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  let event;
  try {
    const raw = await readRawBody(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send("Webhook Error: " + err.message);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        await setStatus({
          customerId: s.customer,
          userId: s.client_reference_id || (s.metadata && s.metadata.supabase_user_id),
          status: "active",
        });
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const active = sub.status === "active" || sub.status === "trialing";
        await setStatus({
          customerId: sub.customer,
          userId: sub.metadata && sub.metadata.supabase_user_id,
          status: active ? "active" : "inactive",
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await setStatus({
          customerId: sub.customer,
          userId: sub.metadata && sub.metadata.supabase_user_id,
          status: "canceled",
        });
        break;
      }
      default:
        break;
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).send("Webhook handler failed");
  }
};
