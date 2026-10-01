/**
 * Real-thread verb dispatch for the Inbox and Conversations (moved from legacy-bridge/inbox-verbs.ts, decision 0015,
 * step 3). A verb on a real thread commits through the API, the overrides re-apply (fresh values + surface events), and
 * the caller's toast reports honestly. Business logic stays server-side — this is a courier.
 */
import { api } from "@/legacy-bridge/api";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { todayOverride } from "../today/surface";
import { workspaceZone } from "@/legacy-bridge/zone";
import type { ApiResult, RouteKey } from "@/client/api";
import { refusalOf, tomorrowAtIn } from "@chanlytics/contracts";
import { conversationsOverride } from "./conversations-surface";
import { inboxOverride } from "./surface";

interface RealThread {
  conversationId: string;
  escalationId: string | null;
  who: string;
}

/** The client's answer, as the pages read it: `ok`, `data`, or the refusal's `message`. */
type VerbResult = ApiResult<unknown>;

/** A refusal the courier makes before asking: nothing was sent, and it reads as any other refusal does. */
const local = (message: string): VerbResult => ({
  ok: false,
  ...refusalOf({ code: "client", status: 0, message, write: true }),
});

async function refresh(): Promise<void> {
  // Today carries the "needs you" count — leaving it out means snoozing from
  // the Inbox leaves a stale number on the brief.
  const surfaces: SurfaceOverride[] = [inboxOverride, conversationsOverride, todayOverride];
  // Through the runner, so the result is PERSISTED to the cache and the pill
  // tells the truth — calling activateOverride directly skipped both.
  await refreshSurfaces(surfaces);
}

// The template SEND is an intent; its params are tenant facts and are
// resolved server-side from the control plane (PRD E4) — the browser no
// longer knows or ships any workspace's booking link.
/**
 * The workspace's own approved templates decide what can be sent outside the
 * 24-hour window. There is deliberately no fallback name here any more.
 *
 * This file carried `{ name: "booking_link_v1", language: "en_US" }` and the
 * docblock claimed the real list was "fetched and offered" — nothing fetched
 * it. That literal is right for exactly one workspace and a guaranteed failure
 * for every other, including every newly created one, which has no template
 * row at all: the operator saw a working-looking button and a server error
 * they could do nothing about. The composer now sends a template the server
 * has actually confirmed as approved, or renders an honest empty state.
 *
 * Params stay server-resolved from the control plane, so the browser still
 * knows nothing about any workspace's booking link.
 */

export type InboxVerb =
  "take-over" | "hand-back" | "snooze" | "wake" | "archive" | "resolve" | "reply" | "reply-template";

// One verb per thread at a time: no double-click double-send, no two claims.
const inFlight = new Set<string>();

export async function inboxVerb(
  thread: RealThread,
  verb: InboxVerb,
  payload?: { text?: string; until?: string; template?: { name: string; language: string }; emailTo?: string },
  /**
   * `refresh: false` for one step of a bulk act, which reads the surfaces again once, at its end. `onAccepted` is
   * called the moment the server takes the act, before the surfaces are read again: the page says so then, and the
   * thread repaints from the re-read as it always did (the server owns its state).
   */
  opts: { refresh?: boolean; onAccepted?: () => void } = {},
): Promise<VerbResult> {
  const lock = `${thread.conversationId}:${verb}`;
  if (inFlight.has(lock)) return local("Still working on that one…");
  inFlight.add(lock);
  try {
    return await runVerb(thread, verb, payload, { refresh: opts.refresh !== false, onAccepted: opts.onAccepted });
  } finally {
    inFlight.delete(lock);
  }
}

/** What a bulk bar does to many threads at once, and the wake its Undo sends. */
export type BulkVerb = "snooze" | "wake" | "archive";

const BULK_ROUTE = {
  snooze: "POST conversations/[id]/snooze",
  wake: "POST conversations/[id]/wake",
  archive: "POST conversations/[id]/archive",
} as const satisfies Record<BulkVerb, RouteKey>;

/** Asks one bulk act has out at once: quick over a page of threads, never a hundred together. */
const BULK_AT_ONCE = 4;

/**
 * One act over many threads: one ask per thread, the surfaces read again once
 * every ask has its answer, and each refusal kept beside the thread it names.
 *
 * The bulk bar called the single verb once per thread. Each one re-read the
 * Inbox, the threads and Today the moment it landed, racing the next ask, and
 * each put up its own toast on a stack that keeps three, so no count, no
 * refusal and no Undo was left to read. The page says the count and names the
 * refused from what this returns.
 */
export async function inboxBulk<T extends RealThread>(
  threads: T[],
  verb: BulkVerb,
): Promise<{ done: T[]; refused: Array<{ thread: T; message: string }> }> {
  // One queue the workers share: each takes the next thread when its last ask is answered.
  const queue = threads.entries();
  const answers = new Map<number, VerbResult>();
  const worker = async () => {
    for (const [i, thread] of queue) answers.set(i, await inboxVerb(thread, verb, undefined, { refresh: false }));
  };
  await Promise.all(Array.from({ length: Math.min(BULK_AT_ONCE, threads.length) }, worker));
  const done: T[] = [];
  const refused: Array<{ thread: T; message: string }> = [];
  threads.forEach((thread, i) => {
    const r = answers.get(i);
    if (!r) return;
    if (r.ok) done.push(thread);
    else refused.push({ thread, message: r.message });
  });
  // Once, by the same table a single verb's re-read follows (refresh-map.ts).
  if (threads.length) await import("@/legacy-bridge/refresh-map").then((m) => m.refreshAfter(BULK_ROUTE[verb]));
  return { done, refused };
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
  payload:
    { text?: string; until?: string; template?: { name: string; language: string }; emailTo?: string } | undefined,
  { refresh, onAccepted }: { refresh: boolean; onAccepted?: () => void },
): Promise<VerbResult> {
  // A replayed send must return the ORIGINAL result, never a second message.
  //
  // This key used to carry Date.now() and Math.random(), which meant every
  // attempt produced a DIFFERENT key and the server's idempotency check could
  // never match — the feature was dead code, and a retry after a timeout sent
  // the customer a second text. An idempotency key has to identify the INTENT,
  // so it is derived from what is being sent, not from when.
  //
  // The server only honours a stored receipt for a SHORT window (see the reply
  // route), so deliberately sending the same words again later still works.
  //
  // The first version hashed `payload?.text ?? "template"`, and a template send
  // carries no text — so every template in a conversation produced the SAME
  // key and the second one within the window was swallowed while the UI
  // reported success. The template's own identity goes into the key.
  const tpl = payload?.template ?? null;
  const intent = payload?.text?.trim()
    ? `text:${payload.text.trim()}`
    : `template:${tpl ? `${tpl.name}:${tpl.language}` : "none"}`;
  const sendKey = `${thread.conversationId}:${intentHash(intent)}`;
  const id = thread.conversationId;
  let result: VerbResult;
  switch (verb) {
    case "take-over":
      result = await api()("POST conversations/[id]/take-over", { params: { id }, refresh, onAccepted });
      break;
    case "hand-back":
      result = await api()("POST conversations/[id]/hand-back", { params: { id }, refresh, onAccepted });
      break;
    case "snooze": {
      // Ten tomorrow where the business is, not where the browser is (zone.ts).
      const until = payload?.until ?? new Date(tomorrowAtIn(await workspaceZone(), Date.now(), 10)).toISOString();
      result = await api()("POST conversations/[id]/snooze", { params: { id }, body: { until }, refresh, onAccepted });
      break;
    }
    case "wake":
      // Its own verb, not hand-back: waking ends the snooze and leaves the
      // thread exactly as it was, rather than resolving what it was about.
      result = await api()("POST conversations/[id]/wake", { params: { id }, refresh, onAccepted });
      break;
    case "archive":
      result = await api()("POST conversations/[id]/archive", { params: { id }, refresh, onAccepted });
      break;
    case "resolve":
      result = thread.escalationId
        ? await api()("POST escalations/[id]/resolve", { params: { id: thread.escalationId }, refresh, onAccepted })
        : local("No open escalation on this thread.");
      break;
    case "reply":
      // `emailTo` is the operator's yes to where an email reply goes, when the server asked (Refusal.confirmEmailTo).
      result = await api()("POST conversations/[id]/reply", {
        params: { id },
        body: { text: payload?.text ?? "", ...(payload?.emailTo ? { email_to: payload.emailTo } : {}) },
        idempotencyKey: sendKey,
        refresh,
        onAccepted,
      });
      break;
    case "reply-template":
      // Refuse in the browser rather than sending a request the server must
      // reject: "we do not know of an approved template" is a clearer thing to
      // say than "Template not found or not approved".
      result = tpl
        ? await api()("POST conversations/[id]/reply", {
            params: { id },
            body: { template: tpl },
            idempotencyKey: sendKey,
            refresh,
            onAccepted,
          })
        : local("This workspace has no approved template yet, so nothing can be sent outside the 24-hour window.");
      break;
    default:
      result = local(`Unknown verb ${verb as string}.`);
  }
  // The refresh map re-reads the Inbox, the threads and Today after each of these lands, unless a bulk act reads them once at its end.
  return result;
}

/** The text whisper: one line, and the held draft is written again with it in mind. */
export async function steerDraft(messageId: string, text: string): Promise<VerbResult> {
  return api()("POST messages/[id]/steer", { params: { id: messageId }, body: { text } });
}

/** The honest undo: cancel a queued send inside its grace window. */
export async function cancelSend(messageId: string): Promise<VerbResult> {
  return api()("POST messages/[id]/cancel-send", { params: { id: messageId } });
}

/**
 * Re-read the surfaces, without committing anything.
 *
 * The veto countdown needs this: the deadline it displays belongs to the
 * SERVER, and when it passes the browser has no idea what happened — the draft
 * may have sent, or a colleague may have withdrawn it a second earlier. The
 * mockup fabricates the send at zero; on a real thread the only honest move at
 * zero is to go and look.
 */
export async function refreshInbox(): Promise<void> {
  await refresh();
}
