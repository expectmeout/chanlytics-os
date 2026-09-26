/**
 * Real-thread verb dispatch for the legacy Inbox engine. The engine's verb
 * functions branch here when a thread is real (thread.real): the API commits,
 * the overrides re-apply (fresh globals + surface events), and the caller's
 * toast reports honestly. Business logic stays server-side — this is a courier.
 */
import {
  conversationsOverride,
  inboxOverride,
  liveOverride,
  settingsOverride,
  todayOverride,
  type SurfaceOverride,
  reportsOverride,
  setReportDays,
  paintHeldReports,
} from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { api } from "./api";
import type { ApiOptions, ApiResult, Params, RouteKey } from "../client/api";
import {
  FALLBACK_DEFAULTS,
  INSTRUCTIONS_MAX,
  fallbackMessages,
  inboxTemplates,
  instructionsDraft,
  inviteState,
  newReceptionistDefaults,
  refusalOf,
  tomorrowAtIn,
  unknownDetails,
} from "@chanlytics/contracts";
import { workspaceZone } from "./zone";
import type { Api } from "../client/api";
import type { PromptPreviewDto } from "../server/prompt-preview";

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
  payload?: { text?: string; until?: string; template?: { name: string; language: string } },
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
    return await runVerb(thread, verb, payload, opts.refresh !== false, opts.onAccepted);
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
  if (threads.length) await import("./refresh-map").then((m) => m.refreshAfter(BULK_ROUTE[verb]));
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
  payload?: { text?: string; until?: string; template?: { name: string; language: string }; emailTo?: string },
  refresh = true,
  onAccepted?: () => void,
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

/** The honest undo: cancel a queued send inside its grace window. */
/**
 * Live: a sentence for the phone receptionist, heard by it alone and kept in
 * mind from here on. `trigger` asks it to speak now; off by default — a
 * whisper is used when it fits, which may be a later turn.
 */
export async function whisperCall(callId: string, text: string, trigger = false): Promise<VerbResult> {
  return api()("POST calls/[id]/whisper", { params: { id: callId }, body: { text, trigger } });
}

/** End the call in progress: the caller is cut off, and the ledger says who did it. */
export async function endCall(callId: string): Promise<VerbResult> {
  return api()("POST calls/[id]/end", { params: { id: callId } });
}

/** Pass the call in progress to the business's own line: the receptionist transfers it, the way it does when a caller asks for a person. */
export async function handOverCall(callId: string): Promise<VerbResult> {
  return api()("POST calls/[id]/hand-over", { params: { id: callId } });
}

/** The text whisper: one line, and the held draft is written again with it in mind. */
export async function steerDraft(messageId: string, text: string): Promise<VerbResult> {
  return api()("POST messages/[id]/steer", { params: { id: messageId }, body: { text } });
}

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

/**
 * Exactly what this workspace's receptionist is told, right now.
 *
 * Not a description of it, not a rendering that resembles it — the output of
 * the SAME function the edge calls on the message it is about to answer, from
 * the same saved config and the same `tenants.timezone`. Anything else drifts,
 * and a prompt preview that drifts is worse than none: it is a screen telling
 * an owner their receptionist knows something it does not.
 *
 * That was not hypothetical. Filling in the hours quietly replaced a live
 * 5,000-character prompt with a 700-character one, and nothing anywhere in the
 * product would have shown it. The composed hours and the owner's own prose
 * then disagreed about whether the salon opened on Sundays, on a number real
 * customers were texting, and that took a production incident to notice
 * instead of a glance.
 *
 * The browser used to run the composer itself, and drifted the other way: it
 * could not see the Autonomy rows, the platform's own facts, the closures or
 * the calendar's openings, so the card showed a prompt missing its rules under
 * the words "word for word". The settings read composes it now
 * (server/prompt-preview.ts) with every input the edge has; this only reads
 * what it composed. Null when there is no receptionist to compose for.
 *
 * `now` is separate because the edge sends it separately — an uncached block,
 * rebuilt every message, so the cached business profile above it survives.
 */
export function composedPrompt(
  channel: "whatsapp" | "voice" = "whatsapp",
): { text: string; now: string; tz: string | null } | null {
  const w = window as unknown as { __SETTINGS?: { prompt?: PromptPreviewDto | null } };
  const prompt = w.__SETTINGS?.prompt;
  if (!prompt) return null;
  return { text: prompt[channel], now: prompt.now, tz: prompt.tz };
}

/**
 * Team changes, against the routes that have existed since Session A and had
 * no caller until now.
 *
 * The card read the real roster and then wrote to the mockup's seeded store:
 * an owner pressed Invite, read "Invite sent to x as Operator", and nothing
 * was sent, stored or audited; a demotion showed a confirmation while the
 * database still said owner. That is the README's one rule — nothing in the UI
 * may state a fact the database cannot support — broken on the surface where
 * it is most consequential, because these controls hand out the power to
 * message customers.
 *
 * Everything goes through the typed client, so each request carries the
 * active workspace, each failure arrives as the server's own sentence rather
 * than a generic "Something went wrong", and the roster is re-read after each
 * lands.
 */
async function teamInvite(email: string, role: "operator" | "viewer"): Promise<VerbResult> {
  return api()("POST team/invite", { body: { email, role } });
}

async function teamSetRole(membershipId: string, role: string): Promise<VerbResult> {
  return api()("PATCH team/[id]", { params: { id: membershipId }, body: { role } });
}

/** Removes a member, or revokes an invitation that has not been accepted. */
async function teamRemove(id: string): Promise<VerbResult> {
  return api()("DELETE team/[id]", { params: { id } });
}

/** Live: re-read the calls in progress. The page calls this every 8 s while
 *  a call is up, as insurance beside the realtime channel. */
export async function refreshLive(): Promise<void> {
  await refreshSurfaces([liveOverride]);
}

/** Re-read the roster so the card shows what the server now holds, never what
 *  the browser hoped it would. */
export async function refreshSettings(): Promise<void> {
  await refreshSurfaces([settingsOverride]);
}

declare global {
  interface Window {
    __setReportDays?: (days: number) => Promise<boolean>;
    __setPolicy?: (cls: string, mode: string | undefined, limits?: PolicyDials) => Promise<VerbResult>;
    __refreshSettings?: () => Promise<void>;
    __refreshLive?: () => Promise<void>;
    __inboxVerb: typeof inboxVerb;
    __inboxBulk: typeof inboxBulk;
    __href: typeof href;
    __steerDraft: typeof steerDraft;
    __teamInvite: typeof teamInvite;
    __teamSetRole: typeof teamSetRole;
    __teamRemove: typeof teamRemove;
    __cancelSend: typeof cancelSend;
    __whisperCall: typeof whisperCall;
    __endCall: typeof endCall;
    __handOverCall: typeof handOverCall;
    __refreshInbox: typeof refreshInbox;
    __saveSettings: typeof saveSettings;
    __composedPrompt: typeof composedPrompt;
    __receptionistDefaults: typeof newReceptionistDefaults;
    /** What the Business editor's instructions box opens with, and the most it holds (S4). */
    __instructionsDraft: typeof instructionsDraft;
    __instructionsMax: number;
    /** The messages sent in the business's name as a customer reads them, the product's wording, and the names nothing fills in (S5). */
    __fallbackMessages: typeof fallbackMessages;
    __fallbackDefaults: typeof FALLBACK_DEFAULTS;
    __unknownDetails: typeof unknownDetails;
    /** The approved templates one person can be sent, and why the rest are not offered (I4). */
    __inboxTemplates: typeof inboxTemplates;
    /** An open invitation's state for the Team card: pending with its expiry, or expired. */
    __inviteState: (expiresAt: string | null | undefined) => { expired: boolean; words: string };
  }
}

/** The reply row's dials: the hold window, the confidence dial, the day's budget, the reply cap and the pause (S6). */
export interface PolicyDials {
  replyDelayMs?: number;
  minConfidence?: number;
  maxTokensDay?: number;
  maxRepliesDay?: number;
  pauseHours?: number;
}

/**
 * Settings → Autonomy: `window.__setPolicy(class, mode, dials?)`.
 *
 * PUT /api/v1/policies, operator or owner; viewers get the server's refusal.
 * On success the refresh map re-reads the settings surface through the runner
 * (so the matrix, the approval chips and the cache all agree) and the mockup's own
 * `policy:changed` event fires, which is what every reader listens for.
 */
export async function setPolicy(cls: string, mode: string | undefined, limits: PolicyDials = {}): Promise<VerbResult> {
  // A delay edit sends no mode. It used to resend the one this page had
  // loaded, so changing the hold window from a stale tab could quietly flip
  // Replies back to whatever that tab remembered. Every dial travels the same
  // way: only the ones given, the mode untouched.
  const dials = Object.fromEntries(Object.entries(limits).filter(([, v]) => v !== undefined));
  const r = await api()("PUT policies", {
    body: { class: cls, ...(mode !== undefined ? { mode } : {}), ...dials },
  });
  if (r.ok) {
    const saved = r.data.policy?.mode ?? mode;
    window.dispatchEvent(new CustomEvent("policy:changed", { detail: { class: cls, mode: saved } }));
  }
  return r;
}

/** Reports: change the period and re-read through the runner, so the cache
 *  and the pill agree with what is on screen. */
export async function setReportRange(days: number): Promise<boolean> {
  const reports = (window as unknown as { __REPORTS?: { days?: number } }).__REPORTS;
  const prev = reports?.days ?? days;
  setReportDays(days);
  // A period this tab has read paints at once; the read behind it keeps it current (the loading standard's held
  // views). Only a period never read waits for its read.
  if (paintHeldReports()) {
    void refreshSurfaces([reportsOverride]);
    return true;
  }
  await refreshSurfaces([reportsOverride]);
  // The override writes the period it fetched. Anything else means the
  // fetch failed and the page is still showing the old period — so the
  // preferred period goes back too, or the next background refresh would
  // load the new one silently.
  const got = (window as unknown as { __REPORTS?: { days?: number } }).__REPORTS?.days;
  if (got !== days) {
    setReportDays(prev);
    return false;
  }
  return true;
}

/**
 * A link the browser follows rather than a request it makes: a download, a photo. A download of ONE view names
 * it in the query (Leads' export of a search), which is typed as that route's own input.
 */
const href = <K extends RouteKey>(key: K, params?: Params<K>, query?: ApiOptions<K>["query"]) =>
  api().url(key, { params, query });

export function installInboxVerbs(): void {
  window.__inboxVerb = inboxVerb;
  window.__inboxBulk = inboxBulk;
  // A download is a plain link to a route, and the route needs the workspace
  // named like every other request; the page builds the href with this.
  window.__href = href;
  window.__setReportDays = setReportRange;
  window.__setPolicy = setPolicy;
  window.__refreshSettings = refreshSettings;
  window.__refreshLive = refreshLive;
  window.__teamInvite = teamInvite;
  window.__teamSetRole = teamSetRole;
  window.__teamRemove = teamRemove;
  window.__cancelSend = cancelSend;
  // A call's recording is no verb: the thread's <audio> points at the route (window.__href), which redirects to a
  // link signed for each request.
  window.__steerDraft = steerDraft;
  window.__whisperCall = whisperCall;
  window.__endCall = endCall;
  window.__handOverCall = handOverCall;
  window.__refreshInbox = refreshInbox;
  window.__saveSettings = saveSettings;
  window.__composedPrompt = composedPrompt;
  // The settings form builds a brand-new brain and must satisfy the same
  // schema the edge parses; the defaults live beside that schema.
  window.__receptionistDefaults = newReceptionistDefaults;
  // The instructions box opens with what contracts says it should, and holds what the schema holds (S4).
  window.__instructionsDraft = instructionsDraft;
  window.__instructionsMax = INSTRUCTIONS_MAX;
  // The messages sent in the business's name, as the form previews and checks them (S5).
  window.__fallbackMessages = fallbackMessages;
  window.__fallbackDefaults = FALLBACK_DEFAULTS;
  window.__unknownDetails = unknownDetails;
  // The composer offers the templates the reply route accepts for this person, in the owner's words (I4).
  window.__inboxTemplates = inboxTemplates;
  window.__inviteState = (expiresAt) => inviteState(expiresAt, Date.now());
}

/**
 * Save the workspace's settings.
 *
 * A WHOLE-config write with optimistic concurrency: the server compares the
 * version we loaded against the row's, and a mismatch is a 409 rather than a
 * silent overwrite of another owner's edit. So the caller must send the entire
 * config it read, with its edits merged in — sending only the changed section
 * would delete the rest.
 *
 * Refreshes on success so the pane and the version both come from the server
 * rather than from what we hoped we saved.
 */
export async function saveSettings(
  config: unknown,
  version: number,
  /**
   * Fired the moment the SERVER accepts, before the surfaces are re-read, with
   * the config and version the server now holds.
   *
   * The refresh that follows re-fetches every surface, which takes seconds.
   * A caller that waited for the whole promise showed nothing at all in the
   * meantime, and pressing Save looked like it had done nothing. And a second
   * save made in those seconds went out on the version read before the first,
   * so the server refused it as someone else's; the Business tab's saver
   * sends the next one on this answer instead.
   */
  onAccepted?: (saved: { config: unknown; version: number }) => void,
  /** The tab's own client and refresh, or a test's stand-ins. */
  deps: { client?: Api; refresh?: () => Promise<void> } = {},
): Promise<VerbResult> {
  // The refresh map re-reads the settings surface FIRST: it carries the
  // version the next save has to send. The generic thread refresh never
  // re-read this pane, so the second save in a row once went out with the
  // version from before the first and came back as "someone else saved
  // settings after you loaded them". Today and the Calendar follow.
  const r = await (deps.client ?? api())("PUT settings", { body: { config, version }, onAccepted });
  // A conflict means the row moved under this tab. Re-read the settings
  // surface now, so the version the NEXT save sends is the current one: a
  // refusal used to leave the stale version in place, and every later save
  // from the tab failed the same way until a reload. The message still says
  // to reapply, because the form's words are the person's.
  if (!r.ok && r.code === "conflict") await (deps.refresh ?? (() => refreshSurfaces([settingsOverride])))();
  return r;
}
