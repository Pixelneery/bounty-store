require("dotenv").config();

const { initDb, closePool } = require("./lib/db");
const { resetGoal } = require("./lib/goal");

(async () => {
  await initDb();
  const goal = await resetGoal();
  if (!goal) throw new Error("goal_state row is missing");
  console.log(
    `Goal reset: current=${goal.current_cents} target=${goal.target_cents} reached=${goal.reached}`
  );
  await closePool();
})().catch(async (err) => {
  console.error("Could not reset the goal:", err);
  await closePool().catch(() => {});
  process.exit(1);
});
