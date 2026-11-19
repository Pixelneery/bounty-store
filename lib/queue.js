const { query } = require("./db");

const CLAIM_LIMIT = 25;
const STALE_AFTER = "2 minutes";

async function enqueue(client, commands, orderId) {
  for (const command of commands) {
    await client.query(
      "INSERT INTO command_queue (order_id, command) VALUES ($1, $2)",
      [orderId, command]
    );
  }
}

async function claimPending(limit = CLAIM_LIMIT) {
  const { rows } = await query(
    `WITH picked AS (
       SELECT id
       FROM command_queue
       WHERE status = 'pending'
         AND (claimed_at IS NULL OR claimed_at < now() - interval '${STALE_AFTER}')
       ORDER BY id
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE command_queue q
     SET attempts = q.attempts + 1,
         claimed_at = now()
     FROM picked
     WHERE q.id = picked.id
     RETURNING q.id, q.command`,
    [limit]
  );
  return rows;
}

function formatPending(rows) {
  return rows.map((row) => `${row.id}|${row.command}`).join("\n");
}

async function acknowledge(ids) {
  if (!ids || ids.length === 0) return { delivered: 0, fulfilled: 0 };

  const delivered = await query(
    `UPDATE command_queue
     SET status = 'delivered',
         delivered_at = now(),
         claimed_at = NULL
     WHERE id = ANY($1::bigint[])
       AND status = 'pending'
     RETURNING order_id`,
    [ids]
  );

  const orderIds = [...new Set(delivered.rows.map((row) => row.order_id).filter(Boolean))];
  let fulfilled = 0;

  if (orderIds.length > 0) {
    const result = await query(
      `UPDATE orders o
       SET status = 'fulfilled',
           fulfilled_at = now()
       WHERE o.id = ANY($1::uuid[])
         AND o.status = 'paid'
         AND NOT EXISTS (
           SELECT 1
           FROM command_queue q
           WHERE q.order_id = o.id
             AND q.status <> 'delivered'
         )`,
      [orderIds]
    );
    fulfilled = result.rowCount;
  }

  return { delivered: delivered.rowCount, fulfilled };
}

module.exports = { enqueue, claimPending, formatPending, acknowledge };
