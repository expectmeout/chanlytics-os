/**
 * The states a person is in, and the rule that picks one: their labels, the list's tabs and the two windows (new,
 * quiet); whose attention their latest thread asks for, from the one standing rule (standing.ts); and the row's pill
 * (personStateFor). The facts it reads are person-row-facts.ts's; the row that carries the pill is person-row.ts.
 */
import { localDaysBetween } from "../shared/clock";
import {
  HELD_WORDS,
  NEEDS_YOU_WORD,
  replyWaitsOnYou,
  standingOf,
  type StandingVerdict,
} from "../conversations/standing";
import { isOptedOutContact, STOP_WORDS } from "../consent/consent";
import type { PersonRowDto } from "./person-dto";
import { firstContactOf, heardAt } from "./person-row-facts";

/* -------------------------------- states --------------------------------- */

export type PersonState = "needs_you" | "waiting_on_you" | "opted_out" | "new" | "quiet" | "active" | "unheard";

/**
 * The words of each state, each from the constant that owns it so a word means one thing (D1-waiting-on-you): "Needs you"
 * is a thread flagged that nobody has taken (NEEDS_YOU_WORD, which Reports' tile says too), and a thread you took is the
 * Inbox's "You have it" (HELD_WORDS). The state's key stays `waiting_on_you`: it is a smart list's id and an address that
 * people keep, and a sent broadcast's audience names it.
 */
export const PERSON_STATE_LABELS: Record<PersonState, string> = {
  needs_you: NEEDS_YOU_WORD,
  waiting_on_you: HELD_WORDS.yours.pill,
  opted_out: STOP_WORDS.pill,
  new: "New",
  quiet: "Quiet",
  active: "Active",
  unheard: "Not heard from",
};

/** The list's tabs: the states, in the order the rule evaluates them. */
export const PEOPLE_TABS: readonly { id: "all" | PersonState; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs_you", label: PERSON_STATE_LABELS.needs_you },
  { id: "waiting_on_you", label: PERSON_STATE_LABELS.waiting_on_you },
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
      escalation_reason: r.open_escalation_reason,
    },
    nowMs,
  );
}

/**
 * Whose attention a person's latest thread asks for, judged for `viewerId` (decision 0009): it needs you -- flagged
 * and nobody has it, or a reply counting down to send (standing.ts replyWaitsOnYou, as the Inbox counts it) -- or you
 * have it (`waiting_on_you`, worded "You have it"), by the one standing rule (holderOf's): flagged, and you claimed it
 * or someone's reply paused the receptionist. A teammate's thread is theirs, and a name left on a thread nobody is
 * working is no claim: the receptionist answers it. With no one looking a claim reads as yours (standing.ts reads an
 * unknown so). People's Needs you and You have it lists, and the row's pill, are this.
 */
export function attentionOf(
  r: PersonRowDto,
  nowMs: number,
  viewerId: string | null = null,
): "needs_you" | "waiting_on_you" | null {
  const v = personStanding(r, nowMs, viewerId);
  if (v.standing === "needs_you" || replyWaitsOnYou({ queued: !!r.queued_reply_at }, nowMs)) return "needs_you";
  return v.takenOver ? "waiting_on_you" : null;
}

/** When they last wrote or called (person-row-facts.ts, where the row's last contact reads it too). */
export { heardAt };

/** Who has a person's latest thread, as the member looking is told it: they do, a teammate does, or a person not named. */
export type ThreadHolder = "yours" | "theirs" | "someone";

/**
 * Who has the latest thread, by the one standing rule (standing.ts) for `viewerId`: a person has it when it is flagged
 * and they claimed it, or their own reply paused the receptionist. It is the member looking's (`yours`) or a teammate's
 * (`theirs`), as the Inbox says it (HELD_WORDS); null when nobody has it. A name left on a thread nobody is working is
 * not a claim, which the standing rule keeps and the assignee column does not: it is never cleared, and the receptionist
 * answers that thread. With no one looking it cannot be said whose: a person has it (`someone`), not named.
 */
export function holderOf(r: StandingRow, nowMs: number, viewerId: string | null): ThreadHolder | null {
  const v = personStanding(r, nowMs, viewerId);
  return v.claimedByOther ? "theirs" : v.takenOver ? (viewerId ? "yours" : "someone") : null;
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

/**
 * Whether a row says the stop beside its pill (D1-stop-unseen). The pill is the first state that holds, and attention
 * outranks a stop (personStateFor): a person who texted STOP on a thread that still waits on you read "Needs you" and
 * nothing of the stop anywhere on their row. While the pill says "Opted out" it is the stop already, and says it once.
 */
export function stopToldBesideState(r: { stopped: boolean; state: PersonState }): boolean {
  return r.stopped && r.state !== "opted_out";
}
