import { localDaysBetween } from "../shared/clock.js";
import {
  HELD_WORDS,
  NEEDS_YOU_WORD,
  replyWaitsOnYou,
  standingOf
} from "../conversations/standing.js";
import { isOptedOutContact, STOP_WORDS } from "../consent/consent.js";
import { ts } from "./person-helpers.js";
import { firstContactOf } from "./person-row-facts.js";
export const PERSON_STATE_LABELS = {
  needs_you: NEEDS_YOU_WORD,
  waiting_on_you: HELD_WORDS.yours.pill,
  opted_out: STOP_WORDS.pill,
  new: "New",
  quiet: "Quiet",
  active: "Active",
  unheard: "Not heard from"
};
export const PEOPLE_TABS = [
  { id: "all", label: "All" },
  { id: "needs_you", label: PERSON_STATE_LABELS.needs_you },
  { id: "waiting_on_you", label: PERSON_STATE_LABELS.waiting_on_you },
  { id: "new", label: "New" },
  { id: "quiet", label: "Quiet" },
  { id: "active", label: "Active" }
];
export const NEW_WINDOW_DAYS = 7;
export const QUIET_AFTER_DAYS = 30;
export function personStanding(r, nowMs, viewerId = null) {
  return standingOf(
    {
      state: r.latest_state === "snoozed" ? "snoozed" : r.needs_human || r.latest_state === "needs_human" ? "needs_human" : r.latest_state ?? "open",
      paused_until: r.latest_paused_until,
      assignee_user_id: r.latest_assignee_user_id,
      assignee_is_me: viewerId && r.latest_assignee_user_id ? r.latest_assignee_user_id === viewerId : void 0,
      open_escalation: !!r.open_escalation_reason,
      escalation_reason: r.open_escalation_reason
    },
    nowMs
  );
}
export function attentionOf(r, nowMs, viewerId = null) {
  const v = personStanding(r, nowMs, viewerId);
  if (v.standing === "needs_you" || replyWaitsOnYou({ queued: !!r.queued_reply_at }, nowMs)) return "needs_you";
  return v.takenOver ? "waiting_on_you" : null;
}
export function heardAt(r) {
  const at = [ts(r.last_inbound_at), ts(r.last_inbound_call_at ?? null)].filter((x) => x !== null);
  return at.length ? Math.max(...at) : null;
}
export function holderOf(r, nowMs, viewerId) {
  const v = personStanding(r, nowMs, viewerId);
  return v.claimedByOther ? "theirs" : v.takenOver ? viewerId ? "yours" : "someone" : null;
}
export function personStateFor(r, nowMs, tz, viewerId = null) {
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
export function stopToldBesideState(r) {
  return r.stopped && r.state !== "opted_out";
}
