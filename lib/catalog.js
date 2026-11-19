const { readJson, storeConfig } = require("./config");

const MAX_ITEMS = 50;
const MAX_QUANTITY = 100;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function priceToCents(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return null;
  return Math.round(price * 100);
}

function buildCatalog() {
  const catalog = new Map();

  for (const product of readJson("products.json", [])) {
    if (!product || !product.id) continue;
    const unitAmountCents = priceToCents(product.price);
    if (!unitAmountCents) continue;
    catalog.set(product.id, {
      id: product.id,
      kind: "product",
      name: String(product.name || product.id),
      unitAmountCents,
      rubies: Math.max(0, Math.trunc(Number(product.rubies) || 0)),
    });
  }

  for (const crate of readJson("crates.json", [])) {
    if (!crate || !crate.id || !crate.command) continue;
    const unitAmountCents = priceToCents(crate.price);
    if (!unitAmountCents) continue;
    catalog.set(crate.id, {
      id: crate.id,
      kind: "crate",
      name: String(crate.name || crate.id),
      unitAmountCents,
      command: String(crate.command),
    });
  }

  // Ranks are sold only when they carry a USD `price`. The in-game ruby price
  // (`ingamePrice`) is display data and must never be treated as real money.
  for (const rank of readJson("ranks.json", [])) {
    if (!rank || !rank.id) continue;
    const unitAmountCents = priceToCents(rank.price);
    if (!unitAmountCents) continue;
    catalog.set(rank.id, {
      id: rank.id,
      kind: "rank",
      name: String(rank.name || rank.id),
      unitAmountCents,
      command: rank.command ? String(rank.command) : null,
      // LuckPerms group names are usually lowercase slugs, not display names.
      group: String(rank.group || rank.id.replace(/^rank-/, "")),
    });
  }

  return catalog;
}

function normalizeCheckout(body) {
  const rawItems = Array.isArray(body && body.items) ? body.items : [];
  if (rawItems.length === 0) throw badRequest("Basket is empty");
  if (rawItems.length > MAX_ITEMS) throw badRequest("Too many items in the basket");

  const buyerUsername = String((body && body.playerName) || "").trim();
  if (!USERNAME_PATTERN.test(buyerUsername)) {
    throw badRequest("Enter a valid Minecraft username (3-16 letters, numbers or underscores)");
  }

  const rawRecipient = String((body && body.recipientName) || "").trim();
  const recipientUsername = rawRecipient || null;
  if (recipientUsername && !USERNAME_PATTERN.test(recipientUsername)) {
    throw badRequest("Enter a valid recipient username (3-16 letters, numbers or underscores)");
  }

  const catalog = buildCatalog();
  const merged = new Map();

  for (const raw of rawItems) {
    const id = typeof (raw && raw.id) === "string" ? raw.id : "";
    const entry = catalog.get(id);
    if (!entry) throw badRequest("One of the items in your basket is not available");

    const quantity = Number(raw && raw.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw badRequest(`Quantity must be a whole number between 1 and ${MAX_QUANTITY}`);
    }

    const existing = merged.get(id);
    if (existing) {
      existing.quantity += quantity;
      if (existing.quantity > MAX_QUANTITY) {
        throw badRequest(`Quantity must be a whole number between 1 and ${MAX_QUANTITY}`);
      }
    } else {
      merged.set(id, { ...entry, quantity });
    }
  }

  const lines = [...merged.values()];
  const totalCents = lines.reduce(
    (sum, line) => sum + line.unitAmountCents * line.quantity,
    0
  );

  return { lines, totalCents, buyerUsername, recipientUsername };
}

function expandCommand(template, values) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) =>
    values[key] !== undefined && values[key] !== null ? values[key] : match
  );
}

function oneLine(command) {
  return String(command || "").replace(/[\r\n]+/g, " ").trim();
}

function buildDeliveryCommands(items, { buyerUsername, recipientUsername }) {
  const commands = readJson("commands.json", {});
  const player = recipientUsername || buyerUsername;
  const result = [];

  let totalRubies = 0;
  for (const item of items) {
    if (item.kind === "product") {
      totalRubies += Math.max(0, Math.trunc(Number(item.rubies) || 0)) * item.quantity;
    }
  }
  if (totalRubies > 0) {
    result.push(
      expandCommand(commands.rubies || "rubies give {player} {amount}", {
        player,
        amount: totalRubies,
        rubies: totalRubies,
      })
    );
  }

  for (const item of items) {
    if (item.kind === "crate" && item.command) {
      result.push(
        expandCommand(item.command, {
          player,
          qty: item.quantity,
          name: item.name || "",
          id: item.id || "",
        })
      );
    }

    if (item.kind === "rank") {
      result.push(
        expandCommand(item.command || commands.rank || "lp user {player} parent add {rank}", {
          player,
          rank:
            item.group ||
            String(item.id || item.name || "").replace(/^rank-/, ""),
          name: item.name || "",
          id: item.id || "",
        })
      );
    }
  }

  return result.map(oneLine).filter(Boolean);
}

function storeCurrency() {
  return String(storeConfig().currency || "usd").toLowerCase();
}

module.exports = {
  MAX_QUANTITY,
  USERNAME_PATTERN,
  buildCatalog,
  normalizeCheckout,
  buildDeliveryCommands,
  storeCurrency,
  expandCommand,
};
