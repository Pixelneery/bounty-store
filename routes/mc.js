const express = require("express");
const crypto = require("crypto");
const { claimPending, formatPending, acknowledge } = require("../lib/queue");
const { getGoal, formatGoalText } = require("../lib/goal");
const { getTopDonators } = require("../lib/leaderboard");

const router = express.Router();

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

function tokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  return crypto.timingSafeEqual(digest(provided), digest(expected));
}

router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");

  const expected = process.env.SYNC_TOKEN || "";
  if (!expected) {
    return res.status(503).type("text/plain").send("SYNC_TOKEN is not configured");
  }

  const header = req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !tokenMatches(match[1].trim(), expected)) {
    return res.status(401).type("text/plain").send("Unauthorized");
  }

  next();
});

router.get("/pending", async (req, res, next) => {
  try {
    const rows = await claimPending();
    res.type("text/plain").send(formatPending(rows));
  } catch (err) {
    next(err);
  }
});

function parseIds(body) {
  if (body === undefined || body === null) return [];

  let value = body;
  if (typeof value !== "string") {
    value = value.ids !== undefined ? value.ids : value;
    return normalizeIds(value);
  }

  const text = value.trim();
  if (!text) return [];

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      return normalizeIds(Array.isArray(parsed) ? parsed : parsed.ids);
    } catch (err) {
      return [];
    }
  }

  return normalizeIds(text.split(/[\s,]+/));
}

function normalizeIds(values) {
  if (!Array.isArray(values)) return [];
  const ids = values
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
  return [...new Set(ids)].slice(0, 500);
}

router.post("/ack", express.text({ type: () => true, limit: "16kb" }), async (req, res, next) => {
  try {
    const ids = parseIds(req.body);
    const result = await acknowledge(ids);
    res.json({ acked: result.delivered, fulfilled: result.fulfilled });
  } catch (err) {
    next(err);
  }
});

router.get("/goal", async (req, res, next) => {
  try {
    const goal = await getGoal();
    res.type("text/plain").send(formatGoalText(goal));
  } catch (err) {
    next(err);
  }
});

router.get("/leaderboard", async (req, res, next) => {
  try {
    const entries = await getTopDonators(5);
    const lines = entries
      .map((entry) => `${entry.playerName}|${entry.total.toFixed(2)}`)
      .join("\n");
    res.type("text/plain").send(lines);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
