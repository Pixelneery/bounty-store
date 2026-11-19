const { query } = require("./db");

const GOAL_COMMAND = "crate key giveall Supreme 3";

async function getGoal() {
  const { rows } = await query("SELECT * FROM goal_state WHERE id = 1");
  return rows[0] || null;
}

function formatGoalText(goal) {
  if (!goal) return "0|0|0";
  return `${goal.current_cents}|${goal.target_cents}|${goal.reached ? "1" : "0"}`;
}

async function resetGoal() {
  const { rows } = await query(
    `UPDATE goal_state
     SET current_cents = 0,
         reached = false,
         reached_at = NULL
     WHERE id = 1
     RETURNING *`
  );
  return rows[0] || null;
}

module.exports = { GOAL_COMMAND, getGoal, formatGoalText, resetGoal };
