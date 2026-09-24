import type { ServerNotificationKind } from "./notifications";

/** Where a phone can be one of ours. Held to push_devices.platform (schema-sets.ts). */
export const PUSH_PLATFORMS = ["ios", "android"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export interface PushDevice {
  token: string;
  platform: PushPlatform;
  app_version: string | null;
}

const TOKEN_MAX = 200;
const VERSION_MAX = 40;

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
  const version =
    typeof b.app_version === "string" && b.app_version.trim() ? b.app_version.trim().slice(0, VERSION_MAX) : null;
  return { ok: true, device: { token, platform, app_version: version } };
}

/**
 * The kept kinds a phone is told about. A list, not everything: a sweep's
 * health, the deadman and a plain alert are the platform's news or the
 * bell's, and a phone that buzzes for them is a phone put on silent.
 */
export const PUSH_KINDS = [
  "handoff",
  "call",
  "note_for_you",
  "leads_ready",
  "leads_question",
  "broadcast_sent",
  "broadcast_stopped",
  "job_failed",
  "billing",
  "number",
  "review",
] as const satisfies readonly ServerNotificationKind[];
export type PushKind = (typeof PUSH_KINDS)[number];
export const isPushKind = (kind: string): kind is PushKind => (PUSH_KINDS as readonly string[]).includes(kind);

/** One message to one device, in the shape Expo's push service takes. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: { route: string | null; notification_id: string; tenant_id: string };
}

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
  tokens: readonly string[],
): PushMessage[] {
  const body = firstLine(n.body);
  return tokens.map((to) => ({
    to,
    title: n.title,
    body,
    sound: "default",
    data: { route: n.route, notification_id: n.id, tenant_id: n.tenant_id },
  }));
}
