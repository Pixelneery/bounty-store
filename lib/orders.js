const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "..", "data", "orders.json");

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "{}");
}

function readAll() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeAll(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function createOrder({ items, total, currency, method, playerName, recipientName }) {
  const orders = readAll();
  const id = crypto.randomUUID();
  orders[id] = {
    id,
    items,
    total,
    currency,
    method,
    playerName: playerName || null,
    recipientName: recipientName || null,
    status: "pending",
    createdAt: new Date().toISOString(),
    paidAt: null,
    fulfilledAt: null,
  };
  writeAll(orders);
  return orders[id];
}

function getOrder(id) {
  const orders = readAll();
  return orders[id] || null;
}

function markPaid(id, extra = {}) {
  const orders = readAll();
  if (!orders[id]) return null;
  orders[id].status = "paid";
  orders[id].paidAt = new Date().toISOString();
  Object.assign(orders[id], extra);
  writeAll(orders);
  return orders[id];
}

function markFulfilled(id) {
  const orders = readAll();
  if (!orders[id]) return null;
  orders[id].status = "fulfilled";
  orders[id].fulfilledAt = new Date().toISOString();
  writeAll(orders);
  return orders[id];
}

module.exports = { createOrder, getOrder, markPaid, markFulfilled, getAllOrders: readAll };
