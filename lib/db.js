const { Pool } = require("pg");
const { readJson } = require("./config");

let pool = null;

function useSsl(connectionString) {
  if (process.env.DATABASE_SSL === "true") return true;
  if (process.env.DATABASE_SSL === "false") return false;
  if (process.env.NODE_ENV === "production") return true;
  return /sslmode=require/i.test(connectionString || "");
}

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env locally or `heroku config:set DATABASE_URL=...`."
    );
  }
  pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 5),
    ssl: useSsl(connectionString) ? { rejectUnauthorized: false } : false,
  });
  pool.on("error", (err) => {
    console.error("Unexpected Postgres pool error:", err);
  });
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError);
    }
    throw err;
  } finally {
    client.release();
  }
}

function configuredGoalTarget() {
  const goal = readJson("goal.json", {});
  const target = Number(goal.targetCents);
  return Number.isFinite(target) && target > 0 ? Math.round(target) : 5000;
}

async function initDb() {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id uuid PRIMARY KEY,
        stripe_session_id text UNIQUE,
        buyer_username text NOT NULL,
        recipient_username text,
        items jsonb NOT NULL DEFAULT '[]'::jsonb,
        total_cents integer NOT NULL,
        currency text NOT NULL,
        status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'paid', 'fulfilled')),
        created_at timestamptz NOT NULL DEFAULT now(),
        paid_at timestamptz,
        fulfilled_at timestamptz
      )
    `);
    await client.query(
      "CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders (status, created_at DESC)"
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS command_queue (
        id bigserial PRIMARY KEY,
        order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
        command text NOT NULL,
        status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'delivered', 'failed')),
        created_at timestamptz NOT NULL DEFAULT now(),
        claimed_at timestamptz,
        delivered_at timestamptz,
        attempts integer NOT NULL DEFAULT 0
      )
    `);
    await client.query(
      "CREATE INDEX IF NOT EXISTS command_queue_pending_idx ON command_queue (status, claimed_at)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS command_queue_order_idx ON command_queue (order_id)"
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS goal_state (
        id integer PRIMARY KEY,
        current_cents integer NOT NULL DEFAULT 0,
        target_cents integer NOT NULL,
        reached boolean NOT NULL DEFAULT false,
        reached_at timestamptz
      )
    `);

    await client.query(
      `INSERT INTO goal_state (id, current_cents, target_cents, reached)
       VALUES (1, 0, $1, false)
       ON CONFLICT (id) DO UPDATE SET target_cents = EXCLUDED.target_cents
       WHERE goal_state.target_cents <> EXCLUDED.target_cents`,
      [configuredGoalTarget()]
    );

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError);
    }
    throw err;
  } finally {
    client.release();
  }
}

async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = { getPool, query, withTransaction, initDb, closePool };
