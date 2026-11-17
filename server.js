require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const stripeRoutes = require("./routes/payments/stripe");
const adminRoutes = require("./routes/admin");
const { getTopDonators } = require("./lib/leaderboard");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get("/api/config", (req, res) => {
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, "config", "store.json"), "utf8")
  );
  res.json(config);
});

app.get("/api/products", (req, res) => {
  const products = JSON.parse(
    fs.readFileSync(path.join(__dirname, "config", "products.json"), "utf8")
  );
  res.json(products);
});

app.get("/api/ranks", (req, res) => {
  const ranks = JSON.parse(
    fs.readFileSync(path.join(__dirname, "config", "ranks.json"), "utf8")
  );
  res.json(ranks);
});

app.get("/api/crates", (req, res) => {
  const crates = JSON.parse(
    fs.readFileSync(path.join(__dirname, "config", "crates.json"), "utf8")
  );
  res.json(crates);
});

app.get("/api/leaderboard", (req, res) => {
  res.json(getTopDonators(5));
});

app.get("/api/mc/leaderboard", (req, res) => {
  const lines = getTopDonators(5)
    .map((e) => `${e.playerName}|${e.total}`)
    .join("\n");
  res.type("text/plain").send(lines);
});

app.use("/api/payments/stripe", stripeRoutes);
app.use("/api/admin", adminRoutes);

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`BountyMine store running on http://localhost:${PORT}`);
});
