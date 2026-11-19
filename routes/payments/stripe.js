const express = require("express");
const Stripe = require("stripe");
const { normalizeCheckout, storeCurrency } = require("../../lib/catalog");
const {
  createOrder,
  deletePendingOrder,
  getOrder,
  serializeOrder,
  settleOrder,
} = require("../../lib/orders");

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || "");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function baseUrl(req) {
  const configured = process.env.BASE_URL || process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

router.post("/create-session", express.json({ limit: "32kb" }), async (req, res) => {
  let checkout;
  try {
    checkout = normalizeCheckout(req.body);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const currency = storeCurrency();
  let order;
  try {
    order = await createOrder({
      lines: checkout.lines,
      totalCents: checkout.totalCents,
      currency,
      buyerUsername: checkout.buyerUsername,
      recipientUsername: checkout.recipientUsername,
    });
  } catch (err) {
    console.error("Could not store order:", err);
    return res.status(500).json({ error: "Could not start checkout" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: order.id,
      line_items: checkout.lines.map((line) => ({
        price_data: {
          currency,
          product_data: { name: line.name },
          unit_amount: line.unitAmountCents,
        },
        quantity: line.quantity,
      })),
      metadata: { orderId: order.id },
      success_url: `${baseUrl(req)}/success.html?order=${order.id}`,
      cancel_url: `${baseUrl(req)}/?checkout=cancelled`,
    });

    if (!session || !session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    res.json({ url: session.url, orderId: order.id });
  } catch (err) {
    console.error("Stripe session error:", err);
    await deletePendingOrder(order.id).catch((cleanupError) => {
      console.error("Could not remove failed order:", cleanupError);
    });
    res.status(500).json({ error: "Could not start Stripe checkout" });
  }
});

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error("STRIPE_WEBHOOK_SECRET is not configured");
      return res.status(503).send("Webhook secret is not configured");
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.get("stripe-signature") || "",
        secret
      );
    } catch (err) {
      console.error("Stripe webhook signature invalid:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const orderId = session.metadata && session.metadata.orderId;

        if (!orderId) {
          console.error(`Webhook ${event.id} has no orderId metadata`);
        } else if (!UUID_PATTERN.test(orderId)) {
          console.error(`Webhook ${event.id} has an invalid orderId: ${orderId}`);
        } else if (session.payment_status !== "paid") {
          console.log(`Webhook ${event.id} ignored: payment_status is ${session.payment_status}`);
        } else {
          const result = await settleOrder({
            orderId,
            stripeSessionId: session.id,
            amountTotalCents: session.amount_total,
          });
          if (result.justPaid) {
            console.log(
              `Order ${orderId} paid; ${result.goalReachedNow ? "goal reached, " : ""}commands queued.`
            );
          } else {
            console.log(`Webhook ${event.id} ignored: order ${orderId} was already processed.`);
          }
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error("Webhook processing failed:", err);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

router.get("/order/:id", async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) {
    return res.status(404).json({ error: "Not found" });
  }

  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json(serializeOrder(order));
  } catch (err) {
    console.error("Could not load order:", err);
    res.status(500).json({ error: "Could not load order" });
  }
});

module.exports = router;
