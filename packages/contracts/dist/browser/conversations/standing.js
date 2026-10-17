import { holdWaits } from "./escalations.js";
export const HELD_WORDS = {
  yours: {
    pill: "You have it",
    sentence: "You're answering this one. The receptionist stays quiet until you hand it back."
  },
  theirs: {
    pill: "A teammate has it",
    sentence: "A teammate is answering this. The receptionist stays quiet until they hand it back."
  }
};
export const NEEDS_YOU_WORD = "Needs you";
export const INBOX_BUCKET_WORDS = { escalated: NEEDS_YOU_WORD, done: "Handled", snoozed: "Snoozed" };
export function inboxBucketWord(state) {
  return state === "escalated" || state === "done" || state === "snoozed" ? INBOX_BUCKET_WORDS[state] : null;
}
export function heldPill(holder, name) {
  if (holder === "yours") return HELD_WORDS.yours.pill;
  const said = typeof name === "string" ? name.trim() : "";
  return said ? `${said} has it` : HELD_WORDS.theirs.pill;
}
export function standingOf(i, nowMs) {
  const paused = !!i.paused_until && new Date(i.paused_until).getTime() > nowMs;
  const holds = holdWaits(i.open_escalation ? { reason: i.escalation_reason } : false);
  const flagged = holds || i.state === "needs_human" || paused;
  const claimedByTeammate = !!i.assignee_user_id && i.assignee_is_me === false;
  const mine = !!i.assignee_user_id || paused && !holds;
  const standing = i.state === "snoozed" ? "snoozed" : !flagged ? "quiet" : claimedByTeammate ? "theirs" : mine ? "yours" : "needs_you";
  return { standing, flagged, paused, takenOver: standing === "yours", claimedByOther: standing === "theirs" };
}
export function standingOfThread(thread, openEscalation, nowMs) {
  return standingOf(
    {
      state: thread.state,
      paused_until: thread.paused_until,
      assignee_user_id: thread.assignee_user_id,
      assignee_is_me: thread.assignee_is_me,
      // The hold itself where the caller has it: its reason says whether anyone has to act (waitsOnAPerson).
      open_escalation: !!openEscalation,
      escalation_reason: typeof openEscalation === "object" && openEscalation ? openEscalation.reason : null
    },
    nowMs
  );
}
export function replyWaitsOnYou(r, nowMs) {
  if (r.held) return false;
  if (r.endsAtMs !== void 0 && r.endsAtMs !== null) return r.endsAtMs > nowMs;
  return !!r.queued;
}
export function seenBy(marks) {
  if (!marks) return () => ({});
  const floorMs = marks.floor_at ? Date.parse(marks.floor_at) : Number.NEGATIVE_INFINITY;
  const own = new Map(marks.marks.map((m) => [m.contact_id, m]));
  return (contactId) => {
    const mark = own.get(contactId);
    const markMs = mark?.seen_at ? Date.parse(mark.seen_at) : Number.NEGATIVE_INFINITY;
    const seenMs = Math.max(floorMs, markMs);
    return {
      ...Number.isFinite(seenMs) ? { seen_at: new Date(seenMs).toISOString() } : {},
      ...mark?.unread_at ? { marked_unread: true } : {},
      ...mark?.marked_at ? { marked_at: mark.marked_at } : {}
    };
  };
}
export function isUnseen(heardAt, seen) {
  if (seen.marked_unread) return true;
  if (!heardAt || !seen.seen_at) return false;
  return (typeof heardAt === "number" ? heardAt : Date.parse(heardAt)) > Date.parse(seen.seen_at);
}
const msOf = (at) => {
  const ms = typeof at === "number" ? at : at ? Date.parse(at) : 0;
  return Number.isFinite(ms) ? ms : 0;
};
export function readingOf(heardAt, seen) {
  return { unseen: isUnseen(heardAt, seen), heardAtMs: msOf(heardAt), markAtMs: msOf(seen.marked_at) };
}
