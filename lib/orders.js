const crypto = require("crypto");
const { query, withTransaction } = require("./db");
const { enqueue } = require("./queue");
const { GOAL_COMMAND } = require("./goal");
const { buildDeliveryCommands } = require("./catalog");

function storedItems(lines) {
  return lines.map((line) => ({
    id: line.id,
    kind: line.kind,
    name: line.name,
    quantity: line.quantity,
    unitAmountCents: line.unitAmountCents,
    rubies: line.rubies || 0,
    command: line.command || null,
    group: line.group || null,
  }));
}

async function createOrder({
  lines,
  totalCents,
  currency,
  buyerUsername,
  recipientUsername,
}) {
  const id = crypto.randomUUID();
  const { rows } = await query(
    `INSERT INTO orders
       (id, buyer_username, recipient_username, items, total_cents, currency, status)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'pending')
     RETURNING *`,
    [
      id,
      buyerUsername,
      recipientUsername,
      JSON.stringify(storedItems(lines)),
      totalCents,
      currency,
    ]
  );
  return rows[0];
}

async function deletePendingOrder(id) {
  await query("DELETE FROM orders WHERE id = $1 AND status = 'pending'", [id]);
}

async function getOrder(id) {
  const { rows } = await query("SELECT * FROM orders WHERE id::text = $1", [id]);
  return rows[0] || null;
}

function serializeOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    status: order.status,
    currency: order.currency,
    total: order.total_cents / 100,
    items: order.items,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    fulfilledAt: order.fulfilled_at,
  };
}

/**
 * Marks a pending order as paid exactly once, credits the money goal, and
 * queues delivery commands. Safe to call with the same webhook repeatedly.
 */
async function settleOrder({ orderId, stripeSessionId, amountTotalCents }) {
  return withTransaction(async (client) => {
    const paid = await client.query(
      `UPDATE orders
       SET status = 'paid',
           paid_at = now(),
           stripe_session_id = $2
       WHERE id = $1
         AND status = 'pending'
       RETURNING *`,
      [orderId, stripeSessionId]
    );

    if (paid.rowCount === 0) {
      return { justPaid: false, order: null, goalReachedNow: false };
    }

    const order = paid.rows[0];

    if (
      Number.isFinite(amountTotalCents) &&
      amountTotalCents > 0 &&
      amountTotalCents !== Number(order.total_cents)
    ) {
      console.warn(
        `Order ${order.id} amount mismatch: Stripe charged ${amountTotalCents} cents, catalog total is ${order.total_cents} cents.`
      );
    }

    const goalResult = await client.query(
      "SELECT current_cents, target_cents, reached FROM goal_state WHERE id = 1 FOR UPDATE"
    );

    let goalReachedNow = false;
    if (goalResult.rowCount > 0) {
      const goal = goalResult.rows[0];
      const nextCurrent = Number(goal.current_cents) + Number(order.total_cents);
      goalReachedNow = !goal.reached && nextCurrent >= Number(goal.target_cents);

      await client.query(
        `UPDATE goal_state
         SET current_cents = $1,
             reached = reached OR $2,
             reached_at = CASE
               WHEN $2 AND reached_at IS NULL THEN now()
               ELSE reached_at
             END
         WHERE id = 1`,
        [nextCurrent, goalReachedNow]
      );

      if (goalReachedNow) {
        await enqueue(client, [GOAL_COMMAND], null);
      }
    }

    const commands = buildDeliveryCommands(order.items || [], {
      buyerUsername: order.buyer_username,
      recipientUsername: order.recipient_username,
    });
    await enqueue(client, commands, order.id);

    return { justPaid: true, order, goalReachedNow };
  });
}

module.exports = {
  createOrder,
  deletePendingOrder,
  getOrder,
  serializeOrder,
  settleOrder,
};
