/**
 * What an event carries that something reacts to (layer 10, decision 0115): each kind in event_subscriptions, with the fields
 * its subscribers read. Most of these events are written by SQL functions, where no type reaches, so a delivery reads each one
 * through its shape before its subscriber runs, and for now only says what is off: a line naming the fields, never what they
 * hold. A shape is loose: an event may carry more than anything reads. A kind subscribed arrives with its shape
 * (tests/events/what-reacts-is-written-with-its-fact.test.mjs).
 */
import { z } from "zod";

export const SUBSCRIBED_EVENTS = {
  "appointment.changed": z.looseObject({
    change: z.string(),
    source: z.string().nullable().optional(),
    by: z.string().nullable().optional(),
    was_at: z.string().nullable().optional(),
  }),
  // The message that carried the link is the event's subject; nothing it carries is read (decision 0119).
  "booking_link.sent": z.looseObject({}),
  "contact.consent_changed": z.looseObject({
    consent: z.string(),
    source: z.string().nullable().optional(),
    channel: z.string().nullable().optional(),
  }),
  "escalation.changed": z.looseObject({ to: z.string() }),
  "escalation.opened": z.looseObject({ reason: z.string() }),
  "escalation.refreshed": z.looseObject({}),
  "member.joined": z.looseObject({ by: z.string(), role: z.string() }),
  "member.left": z.looseObject({
    by: z.string(),
    how: z.enum(["account_deleted", "left"]),
    had_role: z.string().nullable().optional(),
  }),
};

/** The fields of a delivered event that are not what its subscribers read: their names, never what they hold. */
export function eventFieldsOff(kind: string, data: unknown): string[] {
  const schema = Object.entries(SUBSCRIBED_EVENTS).find(([name]) => name === kind)?.[1];
  if (!schema) return [];
  const read = schema.safeParse(data);
  if (read.success) return [];
  return read.error.issues.map((issue) => issue.path.join(".") || "(the data)");
}
