const fs = require("fs");
const path = require("path");

const CONFIG_DIR = path.join(__dirname, "..", "config");

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, name), "utf8"));
  } catch (err) {
    return fallback;
  }
}

function storeConfig() {
  return readJson("store.json", {});
}

module.exports = { CONFIG_DIR, readJson, storeConfig };
