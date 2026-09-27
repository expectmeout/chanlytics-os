import "server-only";
import { z } from "zod";
import { AskSettingsChangeSchema, describeSettingsChange } from "@chanlytics/contracts";
import { defineAct, propose, refuse, type ProposalOutcome, type ToolContext } from "../context";

async function proposeSettings(t: ToolContext, input: { change: Record<string, unknown> }): Promise<ProposalOutcome> {
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
    needs: "owner",
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
    undo: "Put the previous settings back",
  });
}

export const propose_settings = defineAct({
  name: "propose_settings",
  description:
    "Propose a settings change the receptionist will follow: add_closure (a day or range closed), set_hours (one weekday's open/close, or closed), add_note (a note the receptionist reads), add_service. Owner-only. Dates YYYY-MM-DD, times HH:MM.",
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
  label: "Preparing a settings change",
  build: proposeSettings,
});
