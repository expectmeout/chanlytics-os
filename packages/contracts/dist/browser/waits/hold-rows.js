import {
  applyReadState,
  conversationOfNeedsKey,
  dedupeFeed,
  serverNotificationRows
} from "../today/notifications.js";
import { olderUnreadOf } from "../today/push.js";
import { closeSettledNotices, kindsEndedBy, NOTHING_WAITS_KNOWN } from "./notice-closes.js";
const INVITE_KEY_PREFIX = "invite:";
function acceptedInvitations(kept) {
  return new Set(
    (kept?.notifications ?? []).flatMap(
      (n) => n.kind === "member_joined" && n.subject_type === "invitation" && n.subject_id ? [n.subject_id] : []
    )
  );
}
const HOLD_NOTICE_KINDS = kindsEndedBy("hold");
export function holdMarksOf(derivedKey, kept) {
  const conversationId = conversationOfNeedsKey(derivedKey);
  if (!conversationId) return [];
  return (kept?.notifications ?? []).filter(
    (n) => HOLD_NOTICE_KINDS.includes(n.kind) && n.subject_type === "conversation" && n.subject_id === conversationId && !n.closed_at
  );
}
export function bellOlderOf(dto, seenMs, drawn) {
  const older = olderUnreadOf(dto, seenMs);
  const holds = dto?.older_holds ?? [];
  if (!older || !holds.length) return older;
  const waiting = new Set(drawn.map((r) => conversationOfNeedsKey(r.key)).filter((c) => !!c));
  return Math.max(0, older - holds.filter((c) => waiting.has(c)).length);
}
export function bellFeed(input) {
  const { device, kept } = input;
  const seenMs = Math.max(device.seenAt, (kept?.seen_at ? Date.parse(kept.seen_at) : 0) || 0);
  const accepted = acceptedInvitations(kept);
  const own = [];
  for (const item of input.derived) {
    if (item.key.startsWith(INVITE_KEY_PREFIX) && accepted.has(item.key.slice(INVITE_KEY_PREFIX.length))) continue;
    const marks = item.kind === "needs_you" ? holdMarksOf(item.key, kept) : [];
    if (marks.length === 0) {
      own.push(...applyReadState([item], device));
      continue;
    }
    if (marks.every((n) => n.dismissed)) continue;
    own.push({
      ...item,
      unread: marks.some((n) => !n.dismissed && !n.read && Date.parse(n.created_at) > seenMs)
    });
  }
  return dedupeFeed([...own, ...closeSettledNotices(serverNotificationRows(kept), input.waits ?? NOTHING_WAITS_KNOWN)]);
}
