require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { initDb, withTransaction, closePool } = require("../lib/db");

const ORDERS_FILE = path.join(__dirname, "..", "data", "orders.json");
const VALID_STATUSES = new Set(["pending", "paid", "fulfilled"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  if (!fs.existsSync(ORDERS_FILE)) {
    console.log("No data/orders.json found; nothing to migrate.");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
  } catch (err) {
    throw new Error(`data/orders.json is not valid JSON: ${err.message}`);
  }

  const orders = Object.values(parsed || {});
  if (orders.length === 0) {
    console.log("No orders found in data/orders.json; nothing to migrate.");
    return;
  }

  await initDb();

  let inserted = 0;
  let skipped = 0;

  await withTransaction(async (client) => {
    for (const order of orders) {
      if (!order || !order.id) {
        skipped += 1;
        continue;
      }

      if (!UUID_PATTERN.test(order.id)) {
        console.warn(`Skipping order with a non-UUID id: ${order.id}`);
        skipped += 1;
        continue;
      }

      const status = VALID_STATUSES.has(order.status) ? order.status : "pending";
      const totalCents = Math.round(Number(order.total || 0) * 100);

      const result = await client.query(
        `INSERT INTO orders
           (id, stripe_session_id, buyer_username, recipient_username, items,
            total_cents, currency, status, created_at, paid_at, fulfilled_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          order.id,
          order.stripeSessionId || null,
          order.playerName || order.buyerUsername || "unknown",
          order.recipientName || order.recipientUsername || null,
          JSON.stringify(order.items || []),
          totalCents,
          String(order.currency || "usd").toLowerCase(),
          status,
          order.createdAt || new Date().toISOString(),
          order.paidAt || null,
          order.fulfilledAt || null,
        ]
      );

      if (result.rowCount > 0) inserted += 1;
      else skipped += 1;
    }
  });

  console.log(`Imported ${inserted} order(s); skipped ${skipped}.`);
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error("Order migration failed:", err);
    await closePool().catch(() => {});
    process.exit(1);
  });
