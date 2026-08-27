/**
 * Real-thread verb dispatch for the legacy Inbox engine. The engine's verb
 * functions branch here when a thread is real (thread.real): the API commits,
 * the overrides re-apply (fresh globals + surface events), and the caller's
 * toast reports honestly. Business logic stays server-side — this is a courier.
 */
import { activateOverride, conversationsOverride, inboxOverride, type SurfaceOverride } from "./surface-data";

interface RealThread {
  conversationId: string;
  escalationId: string | null;
  who: string;
}

type VerbResult = { ok: true; data?: unknown } | { ok: false; message: string };

// Tenant #1 facts for the outside-window template send — moves to
// tenant_profiles config in Slice 6.
const BOOKING_TEMPLATE = {
  name: "booking_link_v1",
  language: "en_US",
  params: ["Melany's Beauty Salon", "booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn"],
};

async function call(url: string, body?: unknown): Promise<VerbResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 401) {
      window.location.assign("/login");
      return { ok: false, message: "Signed out." };
    }
    const j = (await res.json().catch(() => null)) as
      | { ok: boolean; data?: unknown; error?: { message?: string } }
      | null;
    if (!j || !j.ok) return { ok: false, message: j?.error?.message ?? `Request failed (${res.status}).` };
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, message: "Network error — nothing was changed." };
  }
}

async function refresh(): Promise<void> {
  const surfaces: SurfaceOverride[] = [inboxOverride, conversationsOverride];
  await Promise.all(surfaces.map((s) => activateOverride(s).catch(() => false)));
}

export type InboxVerb =
  | "take-over" | "hand-back" | "snooze" | "archive" | "resolve"
  | "reply" | "reply-template";

export async function inboxVerb(
  thread: RealThread,
  verb: InboxVerb,
  payload?: { text?: string; until?: string },
): Promise<VerbResult> {
  const convBase = `/api/v1/conversations/${thread.conversationId}`;
  let result: VerbResult;
  switch (verb) {
    case "take-over":
      result = await call(`${convBase}/take-over`);
      break;
    case "hand-back":
      result = await call(`${convBase}/hand-back`);
      break;
    case "snooze": {
      const until = payload?.until ?? tomorrowAt(10);
      result = await call(`${convBase}/snooze`, { until });
      break;
    }
    case "archive":
      result = await call(`${convBase}/archive`);
      break;
    case "resolve":
      result = thread.escalationId
        ? await call(`/api/v1/escalations/${thread.escalationId}/resolve`)
        : { ok: false, message: "No open escalation on this thread." };
      break;
    case "reply":
      result = await call(`${convBase}/reply`, { text: payload?.text ?? "" });
      break;
    case "reply-template":
      result = await call(`${convBase}/reply`, { template: BOOKING_TEMPLATE });
      break;
    default:
      result = { ok: false, message: `Unknown verb ${verb as string}.` };
  }
  if (result.ok) await refresh();
  return result;
}

function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

declare global {
  interface Window {
    __inboxVerb: typeof inboxVerb;
  }
}

export function installInboxVerbs(): void {
  window.__inboxVerb = inboxVerb;
}
