const fs = require("fs");
const path = require("path");
const { Rcon } = require("rcon-client");
const { markFulfilled } = require("./orders");

const DEFAULT_RUBY_COMMAND = "rubies give {player} {amount}";

function commandConfig() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "config", "commands.json"), "utf8")
    );
  } catch (err) {
    return {};
  }
}

function expandCommand(template, values) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) =>
    values[key] !== undefined && values[key] !== null ? values[key] : match
  );
}

async function sendRconCommand(command) {
  const rcon = await Rcon.connect({
    host: process.env.RCON_HOST,
    port: Number(process.env.RCON_PORT || 25575),
    password: process.env.RCON_PASSWORD,
  });
  try {
    return await rcon.send(command);
  } finally {
    await rcon.end();
  }
}

async function fulfillOrder(order) {
  if (!order.playerName) {
    console.warn(
      `Order ${order.id} has no playerName attached, cannot auto-fulfill. Fulfil manually.`
    );
    return;
  }

  const recipient = order.recipientName || order.playerName;
  const commands = commandConfig();

  const rubyItems = order.items.filter((item) => item.rubies && !item.command);
  const totalRubies = rubyItems.reduce(
    (sum, item) => sum + item.rubies * item.quantity,
    0
  );
  if (totalRubies > 0) {
    const command = expandCommand(commands.rubies || DEFAULT_RUBY_COMMAND, {
      player: recipient,
      amount: totalRubies,
      rubies: totalRubies,
    });
    const response = await sendRconCommand(command);
    console.log(`Fulfilled order ${order.id} (rubies): ${command} -> ${response}`);
  }

  const commandItems = order.items.filter((item) => item.command);
  for (const item of commandItems) {
    const command = expandCommand(item.command, {
      player: recipient,
      qty: item.quantity,
      amount: item.rubies || "",
      rubies: item.rubies || "",
      name: item.name || "",
      id: item.id || "",
    });
    const response = await sendRconCommand(command);
    console.log(`Fulfilled order ${order.id} (${item.name}): ${command} -> ${response}`);
  }

  if (totalRubies === 0 && commandItems.length === 0) {
    console.warn(
      `Order ${order.id} has no fulfillable items, check the basket payload.`
    );
  }

  markFulfilled(order.id);
}

module.exports = { fulfillOrder, sendRconCommand };
