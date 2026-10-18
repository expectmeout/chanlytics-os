/**
 * The owner's goal on Settings › Details (the Settings wiring review, item 9, 18 Oct 2026): what Ask weighs every
 * signal and plan against (config `ask.goal`, Ask's own section; the receptionist never reads it). Until then only Ask's
 * card could set it, and no page said what it was. The row writes it as that card does (applySettingsChange's
 * set_goal) and says so in the card's own line (describeSettingsChange), so the two never word one change two ways.
 */
import { describeSettingsChange } from "../../ask/ask-settings-change";
import { ASK_GOAL_MAX } from "../workspace-config/config-rules";

export const ASK_GOAL_WORDS = {
  title: "Your goal",
  // What it is for is the hint, since a phone draws no card's sub; the sub says who reads it.
  sub: "Only Ask reads it",
  label: "Goal",
  empty: "Not set",
  hint: "What Ask works toward, like twenty new clients a month.",
  placeholder: "Twenty new clients a month",
  gate: "change your goal",
} as const;

/** Why a typed goal cannot be kept, or null: the config's own limit, said before any round trip. */
export function askGoalRefusal(goal: string): string | null {
  return goal.trim().length > ASK_GOAL_MAX ? `Keep it to ${ASK_GOAL_MAX} characters.` : null;
}

/** The toast once it is kept: Ask's card's own line for the same change. */
export function askGoalSaved(goal: string): string {
  return describeSettingsChange({ op: "set_goal", goal });
}
