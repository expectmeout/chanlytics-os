/**
 * The settings change a card may apply: its shape and schema, the change applied to a parsed config
 * (applySettingsChange) and the card's one line (describeSettingsChange). The workspace's cards propose it
 * (ask-proposals/workspace.ts).
 */
import { z } from "zod";

/* ------------------------------------------------------- settings changes */

/**
 * The few settings an owner changes from the floor, as a change the model
 * may propose and a card may apply: a closure, a day's hours, a note the
 * receptionist will read, a service. Applied to a parsed config, never to
 * the row, so the settings route's own validation still decides.
 */
export type AskSettingsChange =
  | { op: "add_closure"; date: string; until?: string; note?: string }
  | { op: "set_hours"; day: string; open: string | null; close: string | null }
  | { op: "add_note"; title: string; text: string }
  | { op: "add_service"; name: string; duration_min?: number };

export const AskSettingsChangeSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_closure"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    note: z.string().max(200).optional(),
  }),
  z.object({
    op: z.literal("set_hours"),
    day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
    open: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
    close: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
  }),
  z.object({ op: z.literal("add_note"), title: z.string().min(1).max(80), text: z.string().min(1).max(1200) }),
  z.object({
    op: z.literal("add_service"),
    name: z.string().min(1).max(80),
    duration_min: z.number().int().min(1).max(1440).optional(),
  }),
]);

type Cfg = { brain?: { profile?: Record<string, unknown> } & Record<string, unknown> } & Record<string, unknown>;

export function applySettingsChange<C extends Cfg>(config: C, change: AskSettingsChange): C {
  const brain = { ...(config.brain ?? {}) } as NonNullable<C["brain"]>;
  const profile = { ...((brain.profile ?? {}) as Record<string, unknown>) };
  switch (change.op) {
    case "add_closure": {
      const closures = [...((profile.closures as unknown[]) ?? [])];
      closures.push({
        date: change.date,
        ...(change.until ? { until: change.until } : {}),
        ...(change.note ? { note: change.note } : {}),
      });
      profile.closures = closures;
      break;
    }
    case "set_hours": {
      const hours = { ...((profile.hours as Record<string, unknown>) ?? {}) };
      hours[change.day] =
        change.open && change.close ? { open: change.open, close: change.close } : { open: null, close: null };
      profile.hours = hours;
      break;
    }
    case "add_note": {
      const notes = [...((profile.notes as unknown[]) ?? [])];
      notes.push({ title: change.title, text: change.text });
      profile.notes = notes;
      break;
    }
    case "add_service": {
      const services = [...((profile.services as unknown[]) ?? [])];
      services.push({ name: change.name, ...(change.duration_min ? { duration_min: change.duration_min } : {}) });
      profile.services = services;
      break;
    }
  }
  brain.profile = profile;
  return { ...config, brain };
}

/** One line for a card: what the change does, in the person's words. */
export function describeSettingsChange(change: AskSettingsChange): string {
  switch (change.op) {
    case "add_closure":
      return change.until
        ? `Closed ${change.date} to ${change.until}${change.note ? ` (${change.note})` : ""}`
        : `Closed on ${change.date}${change.note ? ` (${change.note})` : ""}`;
    case "set_hours":
      return change.open && change.close ? `${change.day}: ${change.open}–${change.close}` : `${change.day}: closed`;
    case "add_note":
      return `Note for the receptionist: “${change.title}”`;
    case "add_service":
      return `New service: ${change.name}${change.duration_min ? ` (${change.duration_min} min)` : ""}`;
  }
}
