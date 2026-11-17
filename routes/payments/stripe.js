const express = require("express");
const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");
const { createOrder, markPaid, getOrder } = require("../../lib/orders");
const { fulfillOrder } = require("../../lib/fulfill");

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || "");

function storeCurrency() {
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "config", "store.json"), "utf8")
  );
  return (config.currency || "usd").toLowerCase();
}

router.post("/create-session", express.json(), async (req, res) => {
  try {
    const { items, playerName, recipientName } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Basket is empty" });
    }

    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const currency = storeCurrency();
    const order = createOrder({
      items,
      total,
      currency,
      method: "card",
      playerName,
      recipientName,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: items.map((i) => ({
        price_data: {
          currency,
          product_data: { name: i.name },
          unit_amount: Math.round(i.price * 100),
        },
        quantity: i.quantity,
      })),
      metadata: { orderId: order.id },
      success_url: `${process.env.PUBLIC_BASE_URL}/success.html?order=${order.id}`,
      cancel_url: `${process.env.PUBLIC_BASE_URL}/?checkout=cancelled`,
    });

    res.json({ url: session.url, orderId: order.id });
  } catch (err) {
    console.error("Stripe session error:", err);
    res.status(500).json({ error: "Could not start Stripe checkout" });
  }
});

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Stripe webhook signature invalid:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = session.metadata.orderId;
      const order = markPaid(orderId, { stripeSessionId: session.id });
      if (order) {
        try {
          await fulfillOrder(order);
        } catch (e) {
          console.error("Fulfillment failed for order", orderId, e);
        }
      }
    }

    res.json({ received: true });
  }
);

router.get("/order/:id", (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Not found" });
  res.json(order);
});

module.exports = router;
