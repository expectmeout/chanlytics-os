/**
 * Real-thread verb dispatch for the legacy Inbox engine. The engine's verb
 * functions branch here when a thread is real (thread.real): the API commits,
 * the overrides re-apply (fresh globals + surface events), and the caller's
 * toast reports honestly. Business logic stays server-side — this is a courier.
 */
import { activateOverride, conversationsOverride, inboxOverride, todayOverride, type SurfaceOverride } from "./surface-data";

interface RealThread {
  conversationId: string;
  escalationId: string | null;
  who: string;
}

type VerbResult = { ok: true; data?: unknown } | { ok: false; message: string };

// The template SEND is an intent; its params are tenant facts and are
// resolved server-side from the control plane (PRD E4) — the browser no
// longer knows or ships any workspace's booking link.
const BOOKING_TEMPLATE = { name: "booking_link_v1", language: "en_US" };

async function call(url: string, body?: unknown, idempotencyKey?: string): Promise<VerbResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
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
  // Today carries the "needs you" count — leaving it out means snoozing from
  // the Inbox leaves a stale number on the brief.
  const surfaces: SurfaceOverride[] = [inboxOverride, conversationsOverride, todayOverride];
  await Promise.all(surfaces.map((s) => activateOverride(s).catch(() => false)));
}

export type InboxVerb =
  | "take-over" | "hand-back" | "snooze" | "archive" | "resolve"
  | "reply" | "reply-template";

// One verb per thread at a time: no double-click double-send, no two claims.
const inFlight = new Set<string>();

export async function inboxVerb(
  thread: RealThread,
  verb: InboxVerb,
  payload?: { text?: string; until?: string },
): Promise<VerbResult> {
  const lock = `${thread.conversationId}:${verb}`;
  if (inFlight.has(lock)) return { ok: false, message: "Still working on that one…" };
  inFlight.add(lock);
  try {
    return await runVerb(thread, verb, payload);
  } finally {
    inFlight.delete(lock);
  }
}

async function runVerb(
  thread: RealThread,
  verb: InboxVerb,
  payload?: { text?: string; until?: string },
): Promise<VerbResult> {
  const convBase = `/api/v1/conversations/${thread.conversationId}`;
  // a replayed send must return the ORIGINAL result, never a second message
  const sendKey = `${thread.conversationId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
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
      result = await call(`${convBase}/reply`, { text: payload?.text ?? "" }, sendKey);
      break;
    case "reply-template":
      result = await call(`${convBase}/reply`, { template: BOOKING_TEMPLATE }, sendKey);
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

/** The honest undo: cancel a queued send inside its grace window. */
export async function cancelSend(messageId: string): Promise<VerbResult> {
  const r = await call(`/api/v1/messages/${messageId}/cancel-send`);
  if (r.ok) await refresh();
  return r;
}

declare global {
  interface Window {
    __inboxVerb: typeof inboxVerb;
    __cancelSend: typeof cancelSend;
  }
}

export function installInboxVerbs(): void {
  window.__inboxVerb = inboxVerb;
  window.__cancelSend = cancelSend;
}
