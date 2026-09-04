/**
 * Real-thread verb dispatch for the legacy Inbox engine. The engine's verb
 * functions branch here when a thread is real (thread.real): the API commits,
 * the overrides re-apply (fresh globals + surface events), and the caller's
 * toast reports honestly. Business logic stays server-side — this is a courier.
 */
import {
  conversationsOverride,
  inboxOverride,
  invalidateInFlight,
  scoped,
  settingsOverride,
  todayOverride,
  type SurfaceOverride,
  reportsOverride,
  setReportDays,
} from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { clearSurfaceCache } from "./surface-cache";
import { MAX_INTERVALS_PER_DAY, describeNow, hoursRuns, newReceptionistDefaults, resolveSystemPrompt } from "@chanlytics/contracts";

interface RealThread {
  conversationId: string;
  escalationId: string | null;
  who: string;
}

type VerbResult = { ok: true; data?: unknown } | { ok: false; message: string };

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

async function call(
  url: string,
  body?: unknown,
  idempotencyKey?: string,
  /** Settings is a PUT; the team verbs added PATCH and DELETE. */
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
): Promise<VerbResult> {
  try {
    // Scoped HERE rather than at each call site, for the same reason the reads
    // are scoped inside fetchEnvelope: a rule applied per call site is a rule
    // someone forgets on call site seven. Every current and future verb
    // inherits it.
    const res = await fetch(scoped(url), {
      method,
      headers: {
        "content-type": "application/json",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 401) {
      // Clear BEFORE redirecting. The surface cache holds real customer
      // transcripts in sessionStorage, and every other exit — sign-out, and a
      // 401 during a surface refresh — clears it on the way out. This path did
      // not, so a session expiring while an operator pressed a button left one
      // workspace's messages sitting in storage for whoever signed in next.
      clearSurfaceCache();
      window.location.assign("/login");
      return { ok: false, message: "Signed out." };
    }
    const j = (await res.json().catch(() => null)) as
      | { ok: boolean; data?: unknown; error?: { message?: string } }
      | null;
    if (!j || !j.ok) return { ok: false, message: j?.error?.message ?? `Request failed (${res.status}).` };
    // Something changed. Anything already in flight was issued before that
    // change and cannot describe the world the operator is now in — sharing it
    // with the refresh that follows repaints the thread exactly as it was.
    invalidateInFlight();
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
  | "take-over" | "hand-back" | "snooze" | "wake" | "archive" | "resolve"
  | "reply" | "reply-template";

// One verb per thread at a time: no double-click double-send, no two claims.
const inFlight = new Set<string>();

export async function inboxVerb(
  thread: RealThread,
  verb: InboxVerb,
  payload?: { text?: string; until?: string; template?: { name: string; language: string } },
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
  payload?: { text?: string; until?: string; template?: { name: string; language: string } },
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
    case "wake":
      // Its own verb, not hand-back: waking ends the snooze and leaves the
      // thread exactly as it was, rather than resolving what it was about.
      result = await call(`${convBase}/wake`);
      break;
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
      // Refuse in the browser rather than sending a request the server must
      // reject: "we do not know of an approved template" is a clearer thing to
      // say than "Template not found or not approved".
      result = tpl
        ? await call(`${convBase}/reply`, { template: tpl }, sendKey)
        : { ok: false, message: "This workspace has no approved template yet, so nothing can be sent outside the 24-hour window." };
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
 * `now` is separate because the edge sends it separately — an uncached block,
 * rebuilt every message, so the cached business profile above it survives.
 */
export function composedPrompt(
  channel: "whatsapp" | "voice" = "whatsapp",
): { text: string; now: string; tz: string | null } | null {
  const w = window as unknown as {
    __SETTINGS?: { config?: { brain?: unknown } };
    __WORKSPACES?: Array<{ id: string; timezone?: string | null }>;
    __ACTIVE_WORKSPACE?: string;
  };
  const brain = w.__SETTINGS?.config?.brain;
  if (!brain) return null;
  const ws =
    w.__WORKSPACES?.find((t) => t.id === w.__ACTIVE_WORKSPACE) ?? w.__WORKSPACES?.[0] ?? null;
  const tz = ws?.timezone ?? null;
  try {
    return {
      text: resolveSystemPrompt(brain as Parameters<typeof resolveSystemPrompt>[0], channel, tz),
      now: describeNow(tz),
      tz,
    };
  } catch {
    // A config the composer refuses is a real answer, and the pane says so.
    return null;
  }
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
 * Everything goes through `call()`, so each request carries the active
 * workspace and each failure arrives as the server's own sentence rather than
 * a generic "Something went wrong".
 */
async function teamInvite(email: string, role: "operator" | "viewer"): Promise<VerbResult> {
  const r = await call("/api/v1/team/invite", { email, role });
  if (r.ok) await refreshSettings();
  return r;
}

async function teamSetRole(membershipId: string, role: string): Promise<VerbResult> {
  const r = await call(`/api/v1/team/${encodeURIComponent(membershipId)}`, { role }, undefined, "PATCH");
  if (r.ok) await refreshSettings();
  return r;
}

/** Removes a member, or revokes an invitation that has not been accepted. */
async function teamRemove(id: string): Promise<VerbResult> {
  const r = await call(`/api/v1/team/${encodeURIComponent(id)}`, undefined, undefined, "DELETE");
  if (r.ok) await refreshSettings();
  return r;
}

/** Re-read the roster so the card shows what the server now holds, never what
 *  the browser hoped it would. */
export async function refreshSettings(): Promise<void> {
  await refreshSurfaces([settingsOverride]);
}

declare global {
  interface Window {
    __setReportDays?: (days: number) => Promise<boolean>;
    __setPolicy?: (cls: string, mode: string | undefined, replyDelayMs?: number) => Promise<VerbResult>;
    __refreshSettings?: () => Promise<void>;
    __inboxVerb: typeof inboxVerb;
    __teamInvite: typeof teamInvite;
    __teamSetRole: typeof teamSetRole;
    __teamRemove: typeof teamRemove;
    __cancelSend: typeof cancelSend;
    __refreshInbox: typeof refreshInbox;
    __saveSettings: typeof saveSettings;
    __composedPrompt: typeof composedPrompt;
    __receptionistDefaults: typeof newReceptionistDefaults;
    __hoursRuns: typeof hoursRuns;
    __configLimits: { maxIntervalsPerDay: number };
  }
}

/**
 * Settings → Autonomy: `window.__setPolicy(class, mode, replyDelayMs?)`.
 *
 * PUT /api/v1/policies, operator or owner; viewers get the server's refusal.
 * On success the settings surface is re-fetched through the runner (so the
 * matrix, the approval chips and the cache all agree) and the mockup's own
 * `policy:changed` event fires, which is what every reader listens for.
 */
export async function setPolicy(cls: string, mode: string | undefined, replyDelayMs?: number): Promise<VerbResult> {
  // A delay edit sends no mode. It used to resend the one this page had
  // loaded, so changing the hold window from a stale tab could quietly flip
  // Replies back to whatever that tab remembered.
  const r = await call(
    "/api/v1/policies",
    { class: cls, ...(mode !== undefined ? { mode } : {}), ...(replyDelayMs !== undefined ? { replyDelayMs } : {}) },
    undefined,
    "PUT",
  );
  if (r.ok) {
    await refreshSurfaces([settingsOverride]);
    const saved = (r.data as { policy?: { mode?: string } } | undefined)?.policy?.mode ?? mode;
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

export function installInboxVerbs(): void {
  window.__inboxVerb = inboxVerb;
  window.__setReportDays = setReportRange;
  window.__setPolicy = setPolicy;
  window.__refreshSettings = refreshSettings;
  window.__teamInvite = teamInvite;
  window.__teamSetRole = teamSetRole;
  window.__teamRemove = teamRemove;
  window.__cancelSend = cancelSend;
  window.__refreshInbox = refreshInbox;
  window.__saveSettings = saveSettings;
  window.__composedPrompt = composedPrompt;
  // The settings form builds a brand-new brain and must satisfy the same
  // schema the edge parses; the defaults live beside that schema.
  window.__receptionistDefaults = newReceptionistDefaults;
  // The Settings card summarises the week with the SAME collapse the prompt
  // uses; only the day-name wording differs between them.
  window.__hoursRuns = hoursRuns;
  // The editor must not offer a shift the write schema will refuse, so the
  // cap is published rather than retyped.
  window.__configLimits = { maxIntervalsPerDay: MAX_INTERVALS_PER_DAY };
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
   * Fired the moment the SERVER accepts, before the surfaces are re-read.
   *
   * The refresh that follows re-fetches every surface, which takes seconds.
   * A caller that waited for the whole promise showed nothing at all in the
   * meantime, and pressing Save looked like it had done nothing.
   */
  onAccepted?: () => void,
): Promise<VerbResult> {
  const r = await call("/api/v1/settings", { config, version }, undefined, "PUT");
  if (!r.ok) return r;
  onAccepted?.();
  // The settings surface itself, FIRST: it carries the version the next save
  // has to send. `refresh()` re-reads the Inbox, threads and Today and never
  // this pane, so the second save in a row went out with the version from
  // before the first and came back as "someone else saved settings after you
  // loaded them". Today follows because it states the workspace's facts.
  await refreshSurfaces([settingsOverride, todayOverride]);
  return r;
}
