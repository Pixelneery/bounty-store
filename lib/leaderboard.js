const { getAllOrders } = require("./orders");

function getTopDonators(limit = 5) {
  const orders = Object.values(getAllOrders());
  const totals = {};

  for (const order of orders) {
    if (order.status !== "paid" && order.status !== "fulfilled") continue;
    if (!order.playerName) continue;
    totals[order.playerName] = (totals[order.playerName] || 0) + order.total;
  }

  return Object.entries(totals)
    .map(([playerName, total]) => ({ playerName, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

module.exports = { getTopDonators };
