/**
 * Real-thread verb dispatch for the legacy Inbox engine. The engine's verb
 * functions branch here when a thread is real (thread.real): the API commits,
 * the overrides re-apply (fresh globals + surface events), and the caller's
 * toast reports honestly. Business logic stays server-side — this is a courier.
 */
import { conversationsOverride, inboxOverride, todayOverride, type SurfaceOverride } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";

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
  // Through the runner, so the result is PERSISTED to the cache and the pill
  // tells the truth — calling activateOverride directly skipped both.
  await refreshSurfaces(surfaces);
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

/** FNV-1a over the message body. Not a security hash — it only has to be
 *  stable across retries of the same text and different for different text. */
function intentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

async function runVerb(
  thread: RealThread,
  verb: InboxVerb,
  payload?: { text?: string; until?: string },
): Promise<VerbResult> {
  const convBase = `/api/v1/conversations/${thread.conversationId}`;
  // A replayed send must return the ORIGINAL result, never a second message.
  //
  // This key used to carry Date.now() and Math.random(), which meant every
  // attempt produced a DIFFERENT key and the server's idempotency check could
  // never match — the feature was dead code, and a retry after a timeout sent
  // the customer a second text. An idempotency key has to identify the INTENT,
  // so it is derived from what is being sent, not from when.
  //
  // The server only honours a stored response for a short window (see the reply
  // route), so deliberately sending the same words again later still works.
  const sendKey = `${thread.conversationId}:${intentHash(payload?.text ?? "template")}`;
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
