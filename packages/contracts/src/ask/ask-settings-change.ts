/**
 * The settings change a card may apply: its shape, the change applied to a parsed config (applySettingsChange) and
 * the card's one line (describeSettingsChange). The workspace's cards propose it (ask-proposals/workspace.ts); its
 * schema is ask-schemas.ts's.
 */
// The whole-word cut the thread's lines use; Ask's own `clip` (ask-answer.ts) reaches this module through the
// proposals, so importing it here would close a cycle.
import { clipAtWord } from "../conversations/message-words";

/** How much of a note's text its card quotes, in characters, before it is cut on a whole word. */
const NOTE_TEXT_SAID_MAX = 160;

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
  | { op: "add_note"; title: string; text: string; until?: string }
  | { op: "add_service"; name: string; duration_min?: number }
  | { op: "set_goal"; goal: string };

type Cfg = { brain?: { profile?: Record<string, unknown> } & Record<string, unknown> } & Record<string, unknown>;

export function applySettingsChange<C extends Cfg>(config: C, change: AskSettingsChange): C {
  // The owner's goal is Ask's own section, never the receptionist's profile: set, or taken away when empty.
  if (change.op === "set_goal") {
    const ask = { ...((config.ask as Record<string, unknown> | undefined) ?? {}) };
    const goal = change.goal.trim();
    if (goal) ask.goal = goal;
    else delete ask.goal;
    return { ...config, ask };
  }
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
      // Its last day only when it has one: a note with none is said for good, as every note was before it had one.
      notes.push({ title: change.title, text: change.text, ...(change.until ? { until: change.until } : {}) });
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
    case "add_note": {
      // Its last day as the closure's line above says a day: the date as typed. Then the text the receptionist will be
      // told, quoted on one line and cut on a whole word, as the closure quotes its note: what is approved is what it
      // reads, an offer's price among it.
      const text = clipAtWord(change.text.replace(/\s+/g, " "), NOTE_TEXT_SAID_MAX);
      return `Note for the receptionist: “${change.title}”${change.until ? `, until ${change.until}` : ""}${text ? ` — “${text}”` : ""}`;
    }
    case "add_service":
      return `New service: ${change.name}${change.duration_min ? ` (${change.duration_min} min)` : ""}`;
    case "set_goal":
      return change.goal.trim() ? `Your goal: “${change.goal.trim()}”` : "Your goal, taken away";
  }
}
