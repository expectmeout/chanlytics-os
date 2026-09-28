/**
 * The states a person is in, and the rule that picks one: their labels, the list's tabs and the two windows (new,
 * quiet); whose attention their latest thread asks for, from the one standing rule (standing.ts); and the row's pill
 * (personStateFor). The facts it reads are person-row-facts.ts's; the row that carries the pill is person-row.ts.
 */
import { localDaysBetween } from "../shared/clock";
import { replyWaitsOnYou, standingOf, type StandingVerdict } from "../conversations/standing";
import { isOptedOutContact } from "../consent/consent";
import { ts } from "./person-helpers";
import type { PersonRowDto } from "./person-dto";
import { firstContactOf } from "./person-row-facts";

/* -------------------------------- states --------------------------------- */

export type PersonState = "needs_you" | "waiting_on_you" | "opted_out" | "new" | "quiet" | "active" | "unheard";

export const PERSON_STATE_LABELS: Record<PersonState, string> = {
  needs_you: "Needs you",
  waiting_on_you: "Waiting on you",
  opted_out: "Opted out",
  new: "New",
  quiet: "Quiet",
  active: "Active",
  unheard: "Not heard from",
};

/** The list's tabs: the states, in the order the rule evaluates them. */
export const PEOPLE_TABS: readonly { id: "all" | PersonState; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs_you", label: "Needs you" },
  { id: "waiting_on_you", label: "Waiting on you" },
  { id: "new", label: "New" },
  { id: "quiet", label: "Quiet" },
  { id: "active", label: "Active" },
];
/** First contact this many of the workspace's days ago or fewer, on a real date, is "new" (New this week's rule). */
export const NEW_WINDOW_DAYS = 7;
/** Heard from, then nothing from them for more than this many days, is "quiet" (Quiet 30+ days' rule). */
export const QUIET_AFTER_DAYS = 30;

type StandingRow = Pick<
  PersonRowDto,
  "latest_state" | "latest_paused_until" | "latest_assignee_user_id" | "needs_human" | "open_escalation_reason"
>;

/**
 * The latest thread's standing, from the one rule every surface reads (standing.ts), for `viewerId` when someone is
 * looking: a teammate's claim is theirs. With no one looking a claim reads as mine, as standing.ts reads an unknown.
 */
export function personStanding(r: StandingRow, nowMs: number, viewerId: string | null = null): StandingVerdict {
  return standingOf(
    {
      state:
        r.latest_state === "snoozed"
          ? "snoozed"
          : r.needs_human || r.latest_state === "needs_human"
            ? "needs_human"
            : (r.latest_state ?? "open"),
      paused_until: r.latest_paused_until,
      assignee_user_id: r.latest_assignee_user_id,
      assignee_is_me: viewerId && r.latest_assignee_user_id ? r.latest_assignee_user_id === viewerId : undefined,
      open_escalation: !!r.open_escalation_reason,
    },
    nowMs,
  );
}

/**
 * Whose attention a person's latest thread asks for, judged for `viewerId` (decision 0009): it needs you -- flagged
 * and nobody has it, or a reply counting down to send (standing.ts replyWaitsOnYou, as the Inbox counts it) -- or it
 * waits on you: you have it, or nobody is named on it and someone's reply paused the receptionist, and it is flagged
 * or they wrote last. A teammate's thread waits on them. People's Needs you and Waiting on you lists, and the row's
 * pill, are this.
 */
export function attentionOf(
  r: PersonRowDto,
  nowMs: number,
  viewerId: string | null = null,
): "needs_you" | "waiting_on_you" | null {
  const v = personStanding(r, nowMs, viewerId);
  if (v.standing === "needs_you" || replyWaitsOnYou({ queued: !!r.queued_reply_at }, nowMs)) return "needs_you";
  const assignee = r.latest_assignee_user_id;
  // With no one looking, an assignee reads as you (standing.ts): a row that cannot say whose claim it is does not
  // accuse a teammate.
  const owned = assignee ? !viewerId || assignee === viewerId : v.takenOver;
  if (owned && (v.flagged || r.last_message_direction === "inbound")) return "waiting_on_you";
  return null;
}

/** When they last wrote or called: their message, or a call they placed. A call the owner made is not them asking. */
export function heardAt(r: PersonRowDto): number | null {
  const at = [ts(r.last_inbound_at), ts(r.last_inbound_call_at ?? null)].filter((x): x is number => x !== null);
  return at.length ? Math.max(...at) : null;
}

/** A person has the thread: they claimed it, or their own reply paused the receptionist. */
export function isOwned(r: StandingRow, nowMs: number): boolean {
  return !!r.latest_assignee_user_id || personStanding(r, nowMs).takenOver;
}

/* ------------------------------ the rule --------------------------------- */

/**
 * The row's pill: the first of these that holds. It says the lists' own facts (decision 0009), so a row's pill never
 * disagrees with the list it is on: whose attention it asks (attentionOf), a stop, new by New this week's rule, never
 * heard from, quiet by Quiet 30+ days' rule, else active. Days are the workspace's own dates (`tz`).
 */
export function personStateFor(
  r: PersonRowDto,
  nowMs: number,
  tz: string,
  viewerId: string | null = null,
): PersonState {
  const attention = attentionOf(r, nowMs, viewerId);
  if (attention) return attention;
  if (isOptedOutContact({ consent: r.consent, dnc: r.dnc })) return "opted_out";
  const first = firstContactOf(r, tz, nowMs);
  if (first.evidence && first.ts !== null && localDaysBetween(first.ts, nowMs, tz) <= NEW_WINDOW_DAYS) return "new";
  const heard = heardAt(r);
  if (heard === null) return "unheard";
  if (localDaysBetween(heard, nowMs, tz) > QUIET_AFTER_DAYS) return "quiet";
  return "active";
}
