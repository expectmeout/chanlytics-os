import { describeSettingsChange } from "../../ask/ask-settings-change.js";
import { ASK_GOAL_MAX } from "../workspace-config/config-rules.js";
export const ASK_GOAL_WORDS = {
  title: "Your goal",
  // What it is for is the hint, since a phone draws no card's sub; the sub says who reads it.
  sub: "Only Ask reads it",
  label: "Goal",
  empty: "Not set",
  hint: "What Ask works toward, like twenty new clients a month.",
  placeholder: "Twenty new clients a month",
  gate: "change your goal"
};
export function askGoalRefusal(goal) {
  return goal.trim().length > ASK_GOAL_MAX ? `Keep it to ${ASK_GOAL_MAX} characters.` : null;
}
export function askGoalSaved(goal) {
  return describeSettingsChange({ op: "set_goal", goal });
}
