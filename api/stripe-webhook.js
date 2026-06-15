// api/stripe-webhook.js
// Stripe webhook: keeps Supabase in sync when a subscription is created,
// updated, or canceled.
//
// Two things are updated:
//   1) public.user_entitlements  -> one row per (user, product). This is the
//      source of truth for the coins side (and the future currency side).
//   2) public.profiles.subscription_status -> kept in sync for the CURRENCY
//      product only, so the existing is_paid_member() gate / currency RLS keep
//      working unchanged. (No currency downtime.)
//
// Which products a subscription grants is read from subscription metadata
// ("products", comma-separated). If absent (e.g. legacy currency subs created
// before this change), we default to ["currency"] so nothing breaks.
//
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

// Parse the comma-separated products list from metadata; default to currency.
function parseProducts(metadata) {
  const raw = (metadata && metadata.products) || "currency";
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p === "currency" || p === "coins");
}

// Resolve the Supabase user id from either explicit ids or the Stripe customer.
async function resolveUserId({ userId, customerId }) {
  if (userId) return userId;
  if (!customerId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data ? data.id : null;
}

// Map a Stripe status to our entitlement status.
function entitlementStatus(status) {
  if (status === "active") return "active";
  if (status === "past_due") return "past_due";
  return "canceled";
}

// Upsert one entitlement row per granted product.
async function setEntitlements({ userId, products, status, subscriptionId }) {
  if (!userId || !products.length) return;
  const rows = products.map((product) => ({
    user_id: userId,
    product,
    status,
    source: "stripe",
    stripe_subscription_id: subscriptionId || null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("user_entitlements")
    .upsert(rows, { onConflict: "user_id,product" });
  if (error) throw error;
}

// Keep profiles.subscription_status in sync for the CURRENCY product only,
// so the existing currency gate (is_paid_member) is unaffected.
async function syncCurrencyProfile({ userId, customerId, products, status }) {
  if (!products.includes("currency")) return;
  const column = userId ? "id" : "stripe_customer_id";
  const value = userId ? userId : customerId;
  const update = {
    subscription_status: status,
    updated_at: new Date().toISOString(),
  };
  if (customerId) update.stripe_customer_id = customerId;
  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq(column, value)
    .neq("is_admin", true);
  if (error) throw error;
}

async function handle({ customerId, userId, products, stripeStatus, subscriptionId }) {
  const resolvedUserId = await resolveUserId({ userId, customerId });
  const entStatus = entitlementStatus(stripeStatus);
  const profileStatus = stripeStatus === "active" ? "active" : stripeStatus === "canceled" ? "canceled" : "inactive";

  await setEntitlements({
    userId: resolvedUserId,
    products,
    status: entStatus,
    subscriptionId,
  });
  await syncCurrencyProfile({
    userId: resolvedUserId,
    customerId,
    products,
    status: profileStatus,
  });
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
        // Pull products from the subscription's metadata if available.
        let products = parseProducts(s.metadata);
        if (s.subscription) {
          try {
            const sub = await stripe.subscriptions.retrieve(s.subscription);
            products = parseProducts(sub.metadata);
          } catch (e) {
            console.error("Could not retrieve subscription metadata:", e.message);
          }
        }
        await handle({
          customerId: s.customer,
          userId: s.client_reference_id || (s.metadata && s.metadata.supabase_user_id),
          products,
          stripeStatus: "active",
          subscriptionId: s.subscription || null,
        });
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const active = sub.status === "active" || sub.status === "trialing";
        await handle({
          customerId: sub.customer,
          userId: sub.metadata && sub.metadata.supabase_user_id,
          products: parseProducts(sub.metadata),
          stripeStatus: active ? "active" : (sub.status === "past_due" ? "past_due" : "inactive"),
          subscriptionId: sub.id,
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await handle({
          customerId: sub.customer,
          userId: sub.metadata && sub.metadata.supabase_user_id,
          products: parseProducts(sub.metadata),
          stripeStatus: "canceled",
          subscriptionId: sub.id,
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
