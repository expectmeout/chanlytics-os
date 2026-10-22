import { DECISION_VERBS, EVENT_KINDS, WABA_FIELDS } from "../shared/enums";
import { isUuid } from "../shared/identity";
import { activityWords, type ActivityRowDto } from "./activity";

/**
 * The activity log's rows, as both ledgers become them: which kinds are kept from an owner unless asked for by name, which
 * are about money, and how one row of each ledger becomes one row of the log. Moved out of activity.ts (the sentences)
 * with decision 0070, when Ask's journal came to read a day the way Settings › Activity reads it: the dashboard's log
 * (server/metrics/activity.ts) and the edge's journal step (apps/edge/lib/notes.ts) make their rows here, so a day says
 * the same in both.
 */

/** Ledger families that are evidence rather than activity: hidden unless asked for by name. */
export const ACTIVITY_NOISE_PREFIXES = ["usage.", "webhook.", "ingest."] as const;

/**
 * Kinds, one by one, that are a record kept for Reports and that no owner reads as activity: hidden unless asked for by
 * name. Each is named, never its family, so an owner-facing kind added under the same prefix later (an `escalation.` one)
 * is shown and not hidden with them.
 */
export const ACTIVITY_NOISE_KINDS = [
  "escalation.changed",
  "lead.set_aside",
  // Later, in a pass of the pile (00426): a soft word for this sitting, not a decision the owner reads back.
  "lead.later",
  // The ideas for a search, written or asked for again (00400): how often is Reports', not the owner's day.
  "lead.ideas_written",
  // Ask's journal written and a member's morning claimed (00471): how often is Reports', and the journal never writes
  // about its own day.
  "ask.journal_written",
  "ask.morning_claimed",
  "call.transferred",
  "booking_link.sent",
  "channel.quality_rating",
  // A door's own record of a match (00342, decision 0034): the owner reads contact.added, not every arrival.
  "person.resolved",
  // The calendar's hourly read, one row per appointment it kept (00348, decision 0002): the calendar is where they read it.
  "appointment.changed",
] as const;

/**
 * Whether a row of the log is about money: an event its emitter filed under billing -- the subscription's
 * (billing.updated, .paused, .resumed, apps/edge/lib/billing/billing.ts) and a partner's share, its reversal, its payment and
 * its standing (partner.earned, .reversed, .paid, .standing_set, written by 00203/00205/00207/00214). Read from the row's
 * own category, which every emitter writes beside the kind, so a money kind added later is money here without a list
 * to keep; a decision carries none. Ask leaves these out (the charter: anything about money), and the page shows them.
 */
export const isActivityMoney = (row: Pick<ActivityRowDto, "category">): boolean => row.category === "billing";

/** Every kind either ledger may hold, for the picker: the verbs, the event kinds, and Meta's own news of the account. */
export const ACTIVITY_KINDS: readonly string[] = [
  ...DECISION_VERBS,
  ...EVENT_KINDS,
  ...WABA_FIELDS.map((field) => `channel.${field}`),
];

/** true for a kind an owner is not shown unless they ask for it by name. */
export function isActivityNoise(kind: string): boolean {
  return (
    ACTIVITY_NOISE_PREFIXES.some((p) => kind.startsWith(p)) ||
    (ACTIVITY_NOISE_KINDS as readonly string[]).includes(kind)
  );
}

/** One row of the decisions ledger, as the log reads it. */
export interface ActivityDecisionRow {
  id: string;
  verb: string;
  subject_type: string | null;
  subject_id: string | null;
  actor_type: string | null;
  actor_user_id: string | null;
  payload: unknown;
  created_at: string;
}

/** One row of the events ledger, as the log reads it. */
export interface ActivityEventRow {
  id: string;
  kind: string;
  category: string | null;
  subject_type: string | null;
  subject_id: string | null;
  data: unknown;
  created_at: string;
}

/** A decision as a row of the log: what a person (or the receptionist, or the system) did, in its sentence. */
export function activityRowOfDecision(d: ActivityDecisionRow): ActivityRowDto {
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
    category: null,
  };
}

/** The member an event's own data names (`by`, contracts event-data.ts), where it names one. */
function activityEventBy(data: unknown): string | null {
  const by = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).by : null;
  return typeof by === "string" && isUuid(by) ? by : null;
}

/**
 * An event as a row of the log: what happened, in its sentence. An event has no hand of its own; the member its data
 * names did it (contact.added's `by`, a consent answer's), so the log says who.
 */
export function activityRowOfEvent(e: ActivityEventRow): ActivityRowDto {
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
    category: e.category,
  };
}
