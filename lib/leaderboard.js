const { query } = require("./db");

async function getTopDonators(limit = 5) {
  const { rows } = await query(
    `SELECT buyer_username, SUM(total_cents)::bigint AS cents
     FROM orders
     WHERE status IN ('paid', 'fulfilled')
     GROUP BY buyer_username
     ORDER BY cents DESC, buyer_username ASC
     LIMIT $1`,
    [limit]
  );

  return rows.map((row) => ({
    playerName: row.buyer_username,
    total: Number(row.cents) / 100,
  }));
}

module.exports = { getTopDonators };
