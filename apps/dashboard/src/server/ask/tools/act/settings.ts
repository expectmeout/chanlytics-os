import "server-only";
import { z } from "zod";
import {
  ASK_GOAL_MAX,
  AskSettingsChangeSchema,
  describeSettingsChange,
  proposalBelowNeeds,
  type AskSettingsChange,
} from "@chanlytics/contracts";
import {
  actAction,
  approvalWords,
  defineActions,
  offeredTo,
  propose,
  refuse,
  type ActDef,
  type ProposalOutcome,
  type ToolContext,
} from "../context";
import { autonomyAction } from "./policy";

/** Each change's card title, in the person's words. */
const SETTINGS_TITLE: Record<AskSettingsChange["op"], string> = {
  add_closure: "Close for a day",
  set_hours: "Change the hours",
  add_note: "Remember this",
  add_service: "Add a service",
  set_goal: "Your goal",
};

async function proposeSettings(t: ToolContext, input: { change: Record<string, unknown> }): Promise<ProposalOutcome> {
  // Below the card's role, by the one predicate the registry offers it by (context.ts offeredTo).
  if (!offeredTo(settingsAct, t.role)) return refuse(proposalBelowNeeds("settings"));
  const raw = input.change && typeof input.change === "object" ? (input.change as Record<string, unknown>) : null;
  if (!raw) return refuse("change is required");
  const clean: Record<string, unknown> = { op: raw.op };
  for (const k of ["date", "until", "note", "day", "open", "close", "title", "text", "name"])
    if (typeof raw[k] === "string" && raw[k]) clean[k] = raw[k];
  // A goal may be empty: that clears it.
  if (raw.op === "set_goal") clean.goal = typeof raw.goal === "string" ? raw.goal : "";
  if (typeof raw.duration_min === "number") clean.duration_min = raw.duration_min;
  if (raw.op === "set_hours") {
    clean.open = typeof raw.open === "string" && raw.open ? raw.open : null;
    clean.close = typeof raw.close === "string" && raw.close ? raw.close : null;
  }
  const parsed = AskSettingsChangeSchema.safeParse(clean);
  if (!parsed.success)
    return refuse(`change rejected: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const change = parsed.data;
  return propose({
    kind: "settings",
    title: SETTINGS_TITLE[change.op],
    summary: describeSettingsChange(change),
    payload: { change },
  });
}

/**
 * The flat shape the model is shown, as before: every field of every op, the op required (`until` is a closure's last
 * day and a note's alike). The change itself is judged by AskSettingsChangeSchema (contracts) in the handler, op by op,
 * whose words the refusal carries.
 */
const SETTINGS_INPUT = z.object({
  change: z.object({
    op: z.enum(["add_closure", "set_hours", "add_note", "add_service"]),
    date: z.string().optional(),
    until: z.string().optional(),
    note: z.string().optional(),
    day: z.string().optional(),
    open: z.string().optional(),
    close: z.string().optional(),
    title: z.string().optional(),
    text: z.string().optional(),
    name: z.string().optional(),
    duration_min: z.number().int().optional(),
  }),
});

/**
 * A settings change as a card, propose_settings' one definition: also a plan's note for the receptionist (act/plan.ts),
 * built by this same handler.
 */
export const settingsAct: ActDef<typeof SETTINGS_INPUT> = {
  kind: "settings",
  input: SETTINGS_INPUT,
  examples: [
    { change: { op: "add_closure", date: "2026-12-24", until: "2026-12-26", note: "Holidays" } },
    { change: { op: "set_hours", day: "sat", open: "10:00", close: "14:00" } },
    { change: { op: "add_service", name: "Deep clean", duration_min: 90 } },
  ],
  label: "Preparing a settings change",
  build: proposeSettings,
};

/** The owner's goal for Ask (the operator, 15 Oct 2026, D13): one line Ask weighs every plan against, or cleared. */
const goalAction = actAction({
  kind: "settings",
  input: z.object({
    goal: z
      .string()
      .describe(
        `The goal in the owner's own words, at most ${ASK_GOAL_MAX} characters, such as "twenty new clients a month"; empty clears it.`,
      ),
  }),
  examples: [{ goal: "Twenty new clients a month" }],
  label: "Preparing your goal",
  words: `Action goal keeps the owner's goal in one line (at most ${ASK_GOAL_MAX} characters), which you read on every question and weigh every suggestion and plan against; empty clears it. Call it when they say what they want the business to reach, or ask you to aim for something. The receptionist never reads it. ${approvalWords("settings")}.`,
  build: (t, input) => proposeSettings(t, { change: { op: "set_goal", goal: input.goal } }),
});

/**
 * What the workspace is set to (D11, the operator, 15 Oct 2026): a change the receptionist follows (change, once the one
 * definition), what it may do alone for a class of message (autonomy, once propose_autonomy) and the owner's goal for
 * Ask (goal).
 */
export const propose_settings = defineActions({
  name: "propose_settings",
  description:
    "Propose a settings change as a card the person approves, by action: what the receptionist knows (closed days, hours, a note, a service), what it may do alone for a class of message (autonomy), or the business's goal for you.",
  actions: {
    change: actAction({
      ...settingsAct,
      words: `Action change takes one change object: add_closure (date, an optional until for a range, and an optional note), set_hours (one weekday's day with open and close, or both empty for closed), add_note (a title, the text the receptionist reads, and an optional until, its last day), or add_service (name, and an optional duration_min in minutes). Dates are YYYY-MM-DD, days mon..sun, times HH:MM. Call it when they say they are closed, their hours change, the receptionist should know something, or they offer a new service. ${approvalWords("settings")}.`,
    }),
    autonomy: autonomyAction,
    goal: goalAction,
  },
});
