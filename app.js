require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const stripeRoutes = require("./routes/payments/stripe");
const adminRoutes = require("./routes/admin");
const mcRoutes = require("./routes/mc");
const { getTopDonators } = require("./lib/leaderboard");
const { readJson } = require("./lib/config");

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(cors());

app.get("/api/config", (req, res) => {
  const config = readJson("store.json", {});
  config.discordGuildId = process.env.DISCORD_GUILD_ID || config.discordGuildId || "";
  res.json(config);
});

app.get("/api/products", (req, res) => {
  res.json(readJson("products.json", []));
});

app.get("/api/ranks", (req, res) => {
  res.json(readJson("ranks.json", []));
});

app.get("/api/crates", (req, res) => {
  res.json(readJson("crates.json", []));
});

app.get("/api/leaderboard", async (req, res, next) => {
  try {
    res.json(await getTopDonators(5));
  } catch (err) {
    next(err);
  }
});

app.use("/api/payments/stripe", stripeRoutes);
app.use("/api/mc", mcRoutes);
app.use("/api/admin", adminRoutes);

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Server error" : err.message });
});

module.exports = app;
