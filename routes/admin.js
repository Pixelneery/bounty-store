const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const router = express.Router();

const CONFIG_DIR = path.join(__dirname, "..", "config");
const SESSION_COOKIE = "bm_admin";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, file), "utf8"));
  } catch (err) {
    return fallback;
  }
}

function writeJson(file, data) {
  const target = path.join(CONFIG_DIR, file);
  const temp = path.join(CONFIG_DIR, `.${file}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(temp, target);
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function text(value, field, max = 120, required = true) {
  const valueString = typeof value === "string" ? value.trim() : "";
  if (required && !valueString) throw httpError(400, `${field} is required`);
  if (valueString.length > max) throw httpError(400, `${field} must be ${max} characters or fewer`);
  return valueString;
}

function number(value, field, { min = 0, max = 1000000, required = true } = {}) {
  if (value === "" || value === null || value === undefined) {
    if (required) throw httpError(400, `${field} is required`);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw httpError(400, `${field} must be a number between ${min} and ${max}`);
  }
  return parsed;
}

function integer(value, field, options = {}) {
  const parsed = number(value, field, options);
  if (!Number.isInteger(parsed)) throw httpError(400, `${field} must be a whole number`);
  return parsed;
}

function perks(value) {
  const list = Array.isArray(value) ? value : String(value || "").split("\n");
  const cleaned = list.map((entry) => String(entry).trim()).filter(Boolean);
  if (cleaned.length > 30) throw httpError(400, "Perks must contain 30 entries or fewer");
  if (cleaned.some((entry) => entry.length > 200)) {
    throw httpError(400, "Each perk must be 200 characters or fewer");
  }
  return cleaned;
}

function slugify(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "item"
  );
}

function uniqueId(base, existingIds) {
  if (!existingIds.includes(base)) return base;
  let suffix = 2;
  while (existingIds.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function catalogIds() {
  const products = readJson("products.json", []).map((item) => item.id);
  const crates = readJson("crates.json", []).map((item) => item.id);
  return [...products, ...crates];
}

function credentials() {
  return {
    login: process.env.ADMIN_LOGIN || "",
    password: process.env.ADMIN_PASSWORD || "",
  };
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

function safeEqual(left, right) {
  return crypto.timingSafeEqual(hash(left), hash(right));
}

function cookie(req, name) {
  const header = req.headers.cookie || "";
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function requireAuth(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  const token = cookie(req, SESSION_COOKIE);
  const expiresAt = token ? sessions.get(token) : 0;
  if (!expiresAt || expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function buildProduct(body, id) {
  const image = text(body.image, "Image path", 120, false);
  if (image) {
    const segments = image.split("/");
    if (
      !/^[A-Za-z0-9/_.-]+$/.test(image) ||
      image.startsWith("/") ||
      segments.includes("..")
    ) {
      throw httpError(400, "Image path must be a relative path inside /img");
    }
  }
  return {
    id,
    name: text(body.name, "Name", 80),
    rubies: integer(body.rubies, "Rubies", { min: 1, max: 10000000 }),
    price: number(body.price, "Price", { min: 0, max: 1000000 }),
    originalPrice: number(body.originalPrice, "Original price", {
      min: 0,
      max: 1000000,
      required: false,
    }),
    badge: text(body.badge, "Badge", 30, false) || null,
    image: image || null,
  };
}

function buildRank(body, id) {
  return {
    id,
    name: text(body.name, "Name", 80),
    ingamePrice: integer(body.ingamePrice, "In-game price", { min: 0, max: 100000000 }),
    perks: perks(body.perks),
  };
}

function buildCrate(body, id) {
  return {
    id,
    name: text(body.name, "Name", 80),
    price: number(body.price, "Price", { min: 0, max: 1000000 }),
    command: text(body.command, "Command", 300),
    perks: perks(body.perks),
  };
}

router.post("/login", express.json(), (req, res) => {
  const expected = credentials();
  if (!expected.login || !expected.password) {
    return res.status(503).json({
      error: "Admin login is not configured. Set ADMIN_LOGIN and ADMIN_PASSWORD in .env.",
    });
  }

  const login = String(req.body?.login || "");
  const password = String(req.body?.password || "");
  if (!safeEqual(login, expected.login) || !safeEqual(password, expected.password)) {
    return res.status(401).json({ error: "Invalid login or password" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${
      SESSION_TTL_MS / 1000
    }${secure ? "; Secure" : ""}`
  );
  res.json({ authenticated: true });
});

router.post("/logout", (req, res) => {
  const token = cookie(req, SESSION_COOKIE);
  if (token) sessions.delete(token);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
  );
  res.json({ ok: true });
});

router.get("/session", requireAuth, (req, res) => {
  res.json({ authenticated: true });
});

router.get("/data", requireAuth, (req, res) => {
  const store = readJson("store.json", {});
  res.json({
    products: readJson("products.json", []),
    ranks: readJson("ranks.json", []),
    crates: readJson("crates.json", []),
    commands: readJson("commands.json", { rubies: "rubies give {player} {amount}" }),
    currencySymbol: store.currencySymbol || "$",
  });
});

router.post("/products", requireAuth, express.json(), (req, res) => {
  const products = readJson("products.json", []);
  const name = text(req.body.name, "Name", 80);
  const product = buildProduct(req.body, uniqueId(`pkg-${slugify(name)}`, catalogIds()));
  products.push(product);
  writeJson("products.json", products);
  res.status(201).json(product);
});

router.put("/products/:id", requireAuth, express.json(), (req, res) => {
  const products = readJson("products.json", []);
  const index = products.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Package not found" });
  products[index] = buildProduct(req.body, req.params.id);
  writeJson("products.json", products);
  res.json(products[index]);
});

router.delete("/products/:id", requireAuth, (req, res) => {
  const products = readJson("products.json", []);
  const next = products.filter((item) => item.id !== req.params.id);
  if (next.length === products.length) {
    return res.status(404).json({ error: "Package not found" });
  }
  writeJson("products.json", next);
  res.json({ ok: true });
});

router.post("/ranks", requireAuth, express.json(), (req, res) => {
  const ranks = readJson("ranks.json", []);
  const name = text(req.body.name, "Name", 80);
  const ids = ranks.map((item) => item.id);
  const rank = buildRank(req.body, uniqueId(`rank-${slugify(name)}`, ids));
  ranks.push(rank);
  writeJson("ranks.json", ranks);
  res.status(201).json(rank);
});

router.put("/ranks/:id", requireAuth, express.json(), (req, res) => {
  const ranks = readJson("ranks.json", []);
  const index = ranks.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Rank not found" });
  ranks[index] = buildRank(req.body, req.params.id);
  writeJson("ranks.json", ranks);
  res.json(ranks[index]);
});

router.delete("/ranks/:id", requireAuth, (req, res) => {
  const ranks = readJson("ranks.json", []);
  const next = ranks.filter((item) => item.id !== req.params.id);
  if (next.length === ranks.length) {
    return res.status(404).json({ error: "Rank not found" });
  }
  writeJson("ranks.json", next);
  res.json({ ok: true });
});

router.post("/crates", requireAuth, express.json(), (req, res) => {
  const crates = readJson("crates.json", []);
  const name = text(req.body.name, "Name", 80);
  const crate = buildCrate(req.body, uniqueId(`crate-${slugify(name)}`, catalogIds()));
  crates.push(crate);
  writeJson("crates.json", crates);
  res.status(201).json(crate);
});

router.put("/crates/:id", requireAuth, express.json(), (req, res) => {
  const crates = readJson("crates.json", []);
  const index = crates.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Crate key not found" });
  crates[index] = buildCrate(req.body, req.params.id);
  writeJson("crates.json", crates);
  res.json(crates[index]);
});

router.delete("/crates/:id", requireAuth, (req, res) => {
  const crates = readJson("crates.json", []);
  const next = crates.filter((item) => item.id !== req.params.id);
  if (next.length === crates.length) {
    return res.status(404).json({ error: "Crate key not found" });
  }
  writeJson("crates.json", next);
  res.json({ ok: true });
});

router.put("/commands", requireAuth, express.json(), (req, res) => {
  const commands = readJson("commands.json", {});
  commands.rubies = text(req.body.rubies, "Ruby command", 300);
  writeJson("commands.json", commands);
  res.json(commands);
});

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

module.exports = router;
