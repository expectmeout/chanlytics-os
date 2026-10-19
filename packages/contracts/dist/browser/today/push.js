import { MIN_MS } from "../shared/time.js";
export const PUSH_PLATFORMS = ["ios", "android"];
const TOKEN_MAX = 200;
const VERSION_MAX = 40;
const EXPO_PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]+\]$/;
export function parseDevice(body) {
  const b = body && typeof body === "object" ? body : {};
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (!token) return { ok: false, reason: "A device needs its push token." };
  if (token.length > TOKEN_MAX) return { ok: false, reason: "That push token is longer than any we know." };
  const platform = PUSH_PLATFORMS.includes(String(b.platform)) ? b.platform : null;
  if (!platform) return { ok: false, reason: "A device is an iPhone or an Android phone." };
  if (!EXPO_PUSH_TOKEN.test(token)) return { ok: false, reason: "That is not a push token the service hands out." };
  const version = typeof b.app_version === "string" && b.app_version.trim() ? b.app_version.trim().slice(0, VERSION_MAX) : null;
  const activity = typeof b.activity_token === "string" && b.activity_token.trim() ? b.activity_token.trim() : null;
  if (activity && activity.length > TOKEN_MAX)
    return { ok: false, reason: "That activity token is longer than any we know." };
  return { ok: true, device: { token, platform, app_version: version, activity_token: activity } };
}
export const PUSH_KINDS = [
  "handoff",
  // A customer still waiting is the second alert about someone nobody answered (decision 0040): the phone is where it is
  // most likely seen, and it was emailed alone.
  "deadman",
  "call",
  "note_for_you",
  "leads_ready",
  "leads_question",
  "broadcast_sent",
  "broadcast_stopped",
  // A playbook's run that waits for a word, or goes by itself unless it is stopped: the one notice with a deadline (a
  // waiting run is refused once its day has passed, contracts runApprovalRefusal), and the phone never heard it.
  "playbook",
  "job_failed",
  "billing",
  "number",
  "review",
  "reach_out_replied",
  // A reply counting down to go in the owner's name (decision 0064): minutes to stop it, so the phone is where it is seen.
  "reply_held"
];
export const isPushKind = (kind) => PUSH_KINDS.includes(kind);
export function pushOffOf(raw) {
  if (!Array.isArray(raw)) return [];
  return PUSH_KINDS.filter((k) => raw.includes(k));
}
export function pushesFor(pushOff, kind) {
  return isPushKind(kind) && !(pushOff ?? []).includes(kind);
}
export function parseMemberAlerts(body) {
  const b = body && typeof body === "object" ? body : {};
  if (!Array.isArray(b.push_off)) return { ok: false, reason: "Send the kinds your phone is not told, as push_off." };
  const unknown = b.push_off.filter((k) => typeof k !== "string" || !isPushKind(k));
  if (unknown.length) return { ok: false, reason: "That is not something a phone is told." };
  return { ok: true, pushOff: pushOffOf(b.push_off) };
}
export const BELL_LIST_ROWS = 60;
export function unreadFor(rows, seenAt, marks) {
  const seen = seenAt ? Date.parse(seenAt) : 0;
  const gone = new Set(marks.filter((m) => m.read_at || m.dismissed_at).map((m) => m.notification_id));
  return rows.filter((r) => Date.parse(r.created_at) > seen && !gone.has(r.id) && !r.closed_at).length;
}
const marksOf = (dto) => dto.notifications.map((n) => ({
  notification_id: n.id,
  read_at: n.read ? n.created_at : null,
  dismissed_at: n.dismissed ? n.created_at : null
}));
export function olderUnreadOf(dto, seenMs = 0) {
  if (!dto || typeof dto.unread !== "number") return 0;
  const seen = dto.seen_at ? Date.parse(dto.seen_at) : 0;
  const oldest = Date.parse(dto.notifications.at(-1)?.created_at ?? "");
  if (seenMs > seen && seenMs >= oldest) return 0;
  return Math.max(0, dto.unread - unreadFor(dto.notifications, dto.seen_at, marksOf(dto)));
}
const NO_IDS = /* @__PURE__ */ new Set();
export function keptUnreadOf(dto, seenMs = 0, settled = NO_IDS) {
  if (!dto) return 0;
  const seen = Math.max(seenMs, (dto.seen_at ? Date.parse(dto.seen_at) : 0) || 0);
  const listed = dto.notifications.filter((n) => !settled.has(n.id));
  return unreadFor(listed, seen > 0 ? new Date(seen).toISOString() : null, marksOf({ ...dto, notifications: listed })) + olderUnreadOf(dto, seenMs);
}
export const isForReader = (row, userId) => row.recipient_user_id === null || row.recipient_user_id === userId;
export function firstLine(body, max = 160) {
  return body.split("\n").find((l) => l.trim())?.trim().slice(0, max) ?? "";
}
export function pushFor(n, targets) {
  const body = firstLine(n.body);
  return targets.map((t) => ({
    to: t.token,
    // "Harbor · Dana needs a person": a person in several businesses was told who, never which business (R11 S8-7).
    title: t.business ? `${t.business} \xB7 ${n.title}` : n.title,
    body,
    sound: "default",
    ...t.badge === null ? {} : { badge: t.badge },
    data: { route: n.route, notification_id: n.id, tenant_id: n.tenant_id }
  }));
}
export const PUSH_RECEIPTS_AFTER_MS = 15 * MIN_MS;
export const BELL_WINDOW_DAYS = 30;
