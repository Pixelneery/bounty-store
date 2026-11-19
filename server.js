require("dotenv").config();

const app = require("./app");
const { initDb } = require("./lib/db");

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Store running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize the database:", err);
    process.exit(1);
  });
