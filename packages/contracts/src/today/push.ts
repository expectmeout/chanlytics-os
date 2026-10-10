import type { ServerNotificationKind } from "./notifications";
import { MIN_MS } from "../shared/time";

/** Where a phone can be one of ours. Held to push_devices.platform (schema-sets.ts). */
export const PUSH_PLATFORMS = ["ios", "android"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export interface PushDevice {
  token: string;
  platform: PushPlatform;
  app_version: string | null;
  activity_token: string | null;
}

const TOKEN_MAX = 200;
const VERSION_MAX = 40;
/**
 * The shape of a token Expo's push service hands an app (getExpoPushTokenAsync). Anything else can never be told,
 * and one such row breaks the send for every phone in its batch: the service refuses the whole request.
 */
const EXPO_PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

/** What PUT /api/v1/me/devices accepts, or why not, in one sentence. */
export function parseDevice(body: unknown): { ok: true; device: PushDevice } | { ok: false; reason: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (!token) return { ok: false, reason: "A device needs its push token." };
  if (token.length > TOKEN_MAX) return { ok: false, reason: "That push token is longer than any we know." };
  const platform = (PUSH_PLATFORMS as readonly string[]).includes(String(b.platform))
    ? (b.platform as PushPlatform)
    : null;
  if (!platform) return { ok: false, reason: "A device is an iPhone or an Android phone." };
  if (!EXPO_PUSH_TOKEN.test(token)) return { ok: false, reason: "That is not a push token the service hands out." };
  const version =
    typeof b.app_version === "string" && b.app_version.trim() ? b.app_version.trim().slice(0, VERSION_MAX) : null;
  // The Live Activity's push-to-start token (00191), when the phone has one: iOS 17.2 and later, never Android.
  const activity = typeof b.activity_token === "string" && b.activity_token.trim() ? b.activity_token.trim() : null;
  if (activity && activity.length > TOKEN_MAX)
    return { ok: false, reason: "That activity token is longer than any we know." };
  return { ok: true, device: { token, platform, app_version: version, activity_token: activity } };
}

/**
 * The kept kinds a phone is told about. A list, not everything: a sweep's
 * health and a plain alert are the platform's news or the bell's, and a phone
 * that buzzes for them is a phone put on silent. Each member turns any of them
 * off for their own phones (memberships.push_off, 00372: `pushesFor`).
 */
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
] as const satisfies readonly ServerNotificationKind[];
export type PushKind = (typeof PUSH_KINDS)[number];
export const isPushKind = (kind: string): kind is PushKind => (PUSH_KINDS as readonly string[]).includes(kind);

/**
 * The kinds a member turned off for their phones, from what their membership holds (memberships.push_off, 00372): the
 * kinds a phone is told and nothing else, each once. Read leniently, as the config is: a kind this build does not know,
 * written by a newer one, is left out rather than refused, and anything that is not a list is none.
 */
export function pushOffOf(raw: unknown): PushKind[] {
  if (!Array.isArray(raw)) return [];
  return PUSH_KINDS.filter((k) => raw.includes(k));
}

/** Whether a member's phones are told a kept row of this kind: a kind phones are told, which the member did not turn off. */
export function pushesFor(pushOff: readonly string[] | null | undefined, kind: string): boolean {
  return isPushKind(kind) && !(pushOff ?? []).includes(kind);
}

/** One of the member's own phones, as Settings › Notifications names it: never its token. */
export interface PhoneDto {
  platform: PushPlatform;
  app_version: string | null;
  last_seen_at: string | null;
}

/**
 * What `GET /api/v1/me/alerts` answers: the kinds this member's phones are not told in this workspace, their phones, and
 * whether the choice can be saved yet (false where 00372 is not applied: the page then shows what a phone is told, and
 * offers no tick).
 */
export interface MemberAlertsDto {
  push_off: PushKind[];
  phones: PhoneDto[];
  choosable: boolean;
}

/** What `PUT /api/v1/me/alerts` accepts, or why not, in one sentence: `{ push_off: [kind, …] }`. */
export function parseMemberAlerts(body: unknown): { ok: true; pushOff: PushKind[] } | { ok: false; reason: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!Array.isArray(b.push_off)) return { ok: false, reason: "Send the kinds your phone is not told, as push_off." };
  const unknown = b.push_off.filter((k) => typeof k !== "string" || !isPushKind(k));
  if (unknown.length) return { ok: false, reason: "That is not something a phone is told." };
  return { ok: true, pushOff: pushOffOf(b.push_off) };
}

/** One message to one device, in the shape Expo's push service takes. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: "default";
  /** The bell's unread count for this phone's person: the number on the icon while the app is closed (00189). */
  badge: number;
  data: { route: string | null; notification_id: string; tenant_id: string };
}

/** A phone to tell, with the number its icon should wear. */
export interface PushTarget {
  token: string;
  badge: number;
}

/**
 * The bell's number, by the bell's own rule (notifications.ts serverNotificationRows): kept rows of the window newer
 * than the person's seen moment, not marked read or dismissed by them. The edge counts it per reader before a push
 * and the page counts it on every bell change; both must agree, so both count here.
 */
export function unreadFor(
  rows: readonly { id: string; created_at: string }[],
  seenAt: string | null,
  marks: readonly { notification_id: string; read_at: string | null; dismissed_at: string | null }[],
): number {
  const seen = seenAt ? Date.parse(seenAt) : 0;
  const gone = new Set(marks.filter((m) => m.read_at || m.dismissed_at).map((m) => m.notification_id));
  return rows.filter((r) => Date.parse(r.created_at) > seen && !gone.has(r.id)).length;
}

/**
 * Whether a kept row is on this member's bell: the workspace's own (no recipient) or a note left for them
 * (notifications.recipient_user_id, 00158). The page never sees another member's note, since the table's row policy
 * narrows its read to exactly this; a read the policy does not narrow (the service role's, which counts a phone's
 * badge) narrows by this, so the number on the icon is the number on the bell.
 */
export const isForReader = (row: { recipient_user_id: string | null }, userId: string): boolean =>
  row.recipient_user_id === null || row.recipient_user_id === userId;

/** The first line of a kept row's body: what the bell shows under the title, and what a phone shows. */
export function firstLine(body: string, max = 160): string {
  return (
    body
      .split("\n")
      .find((l) => l.trim())
      ?.trim()
      .slice(0, max) ?? ""
  );
}

/** The bell's own words, once per device. */
export function pushFor(
  n: { id: string; tenant_id: string; title: string; body: string; route: string | null },
  targets: readonly PushTarget[],
): PushMessage[] {
  const body = firstLine(n.body);
  return targets.map((t) => ({
    to: t.token,
    title: n.title,
    body,
    sound: "default",
    badge: t.badge,
    data: { route: n.route, notification_id: n.id, tenant_id: n.tenant_id },
  }));
}

/** How long after a send its receipts are asked for: what Expo asks. */
export const PUSH_RECEIPTS_AFTER_MS = 15 * MIN_MS;
/** The window the bell counts over: the thirty days its route keeps. */
export const BELL_WINDOW_DAYS = 30;
