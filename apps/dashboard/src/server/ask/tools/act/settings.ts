import "server-only";
import { z } from "zod";
import {
  AskSettingsChangeSchema,
  PROPOSAL_SPECS,
  describeSettingsChange,
  proposalBelowNeeds,
} from "@chanlytics/contracts";
import { roleAtLeast } from "../../../with-route";
import { approverOf, defineAct, propose, refuse, type ProposalOutcome, type ToolContext } from "../context";

async function proposeSettings(t: ToolContext, input: { change: Record<string, unknown> }): Promise<ProposalOutcome> {
  if (!roleAtLeast(t.role, PROPOSAL_SPECS.settings.needs)) return refuse(proposalBelowNeeds("settings"));
  const raw = input.change && typeof input.change === "object" ? (input.change as Record<string, unknown>) : null;
  if (!raw) return refuse("change is required");
  const clean: Record<string, unknown> = { op: raw.op };
  for (const k of ["date", "until", "note", "day", "open", "close", "title", "text", "name"])
    if (typeof raw[k] === "string" && raw[k]) clean[k] = raw[k];
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
    title:
      change.op === "add_closure"
        ? "Close for a day"
        : change.op === "set_hours"
          ? "Change the hours"
          : change.op === "add_note"
            ? "Remember this"
            : "Add a service",
    summary: describeSettingsChange(change),
    payload: { change },
  });
}

export const propose_settings = defineAct({
  name: "propose_settings",
  description: `Propose a settings change the receptionist will follow, as one change object: add_closure (date, an optional until for a range, and a note), set_hours (one weekday's day with open and close, or both empty for closed), add_note (a title and the text the receptionist reads), or add_service (name, and duration_min in minutes). Dates are YYYY-MM-DD, days mon..sun, times HH:MM. Call it when they say they are closed, their hours change, the receptionist should know something, or they offer a new service; propose_policy is for what the receptionist may do alone. Only ${approverOf("settings")} can approve it: for anyone else, say so and that one of them can ask.`,
  // The flat shape the model is shown, as before: every field of every op, the op required. The change itself is
  // judged by AskSettingsChangeSchema (contracts) in the handler, op by op, whose words the refusal carries.
  input: z.object({
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
  }),
  examples: [
    { change: { op: "add_closure", date: "2026-12-24", until: "2026-12-26", note: "Holidays" } },
    { change: { op: "set_hours", day: "sat", open: "10:00", close: "14:00" } },
    { change: { op: "add_service", name: "Deep clean", duration_min: 90 } },
  ],
  label: "Preparing a settings change",
  build: proposeSettings,
});
