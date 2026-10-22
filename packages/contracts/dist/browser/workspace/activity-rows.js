import { DECISION_VERBS, EVENT_KINDS, WABA_FIELDS } from "../shared/enums.js";
import { isUuid } from "../shared/identity.js";
import { activityWords } from "./activity.js";
export const ACTIVITY_NOISE_PREFIXES = ["usage.", "webhook.", "ingest."];
export const ACTIVITY_NOISE_KINDS = [
  "escalation.changed",
  "lead.set_aside",
  // Later, in a pass of the pile (00426): a soft word for this sitting, not a decision the owner reads back.
  "lead.later",
  // The ideas for a search, written or asked for again (00400): how often is Reports', not the owner's day.
  "lead.ideas_written",
  // Ask's journal written and a member's morning claimed (00470): how often is Reports', and the journal never writes
  // about its own day.
  "ask.journal_written",
  "ask.morning_claimed",
  "call.transferred",
  "booking_link.sent",
  "channel.quality_rating",
  // A door's own record of a match (00342, decision 0034): the owner reads contact.added, not every arrival.
  "person.resolved",
  // The calendar's hourly read, one row per appointment it kept (00348, decision 0002): the calendar is where they read it.
  "appointment.changed"
];
export const isActivityMoney = (row) => row.category === "billing";
export const ACTIVITY_KINDS = [
  ...DECISION_VERBS,
  ...EVENT_KINDS,
  ...WABA_FIELDS.map((field) => `channel.${field}`)
];
export function isActivityNoise(kind) {
  return ACTIVITY_NOISE_PREFIXES.some((p) => kind.startsWith(p)) || ACTIVITY_NOISE_KINDS.includes(kind);
}
export function activityRowOfDecision(d) {
  return {
    id: `d-${d.id}`,
    at: d.created_at,
    source: "decision",
    kind: d.verb,
    subject_type: d.subject_type,
    subject_id: d.subject_id,
    actor_user_id: d.actor_user_id,
    actor_type: d.actor_type,
    text: activityWords(d.verb, d.payload),
    category: null
  };
}
function activityEventBy(data) {
  const by = data && typeof data === "object" && !Array.isArray(data) ? data.by : null;
  return typeof by === "string" && isUuid(by) ? by : null;
}
export function activityRowOfEvent(e) {
  const by = activityEventBy(e.data);
  return {
    id: `e-${e.id}`,
    at: e.created_at,
    source: "event",
    kind: e.kind,
    subject_type: e.subject_type,
    subject_id: e.subject_id,
    actor_user_id: by,
    actor_type: by ? "user" : null,
    text: activityWords(e.kind, e.data),
    category: e.category
  };
}
