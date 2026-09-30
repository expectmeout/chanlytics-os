/**
 * The bridge's couriers that no surface has taken yet: the Live Monitor's calls (whisper, end, hand over), Settings' saves
 * and the policy row, the team's, and the address builder every download reads. The Inbox's own verbs (a thread's take-over,
 * snooze, reply and the bulk bar) moved with it to src/surfaces/inbox/verbs.ts (decision 0015, step 3). Business logic
 * stays server-side: this is a courier.
 */
import { liveOverride } from "./surfaces/live";
import { settingsOverride } from "./surfaces/settings";
import { refreshSurfaces } from "./surface-runner";
import { api } from "./api";
import type { ApiOptions, ApiResult, Input, Params, RouteKey } from "../client/api";
import {
  FALLBACK_DEFAULTS,
  INSTRUCTIONS_MAX,
  fallbackMessages,
  instructionsDraft,
  inviteState,
  newReceptionistDefaults,
  unknownDetails,
} from "@chanlytics/contracts";
import type { Api } from "../client/api";
import type { PromptPreviewDto } from "../server/receptionist/prompt-preview";

/** The client's answer, as the pages read it: `ok`, `data`, or the refusal's `message`. */
type VerbResult = ApiResult<unknown>;

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
 * (server/receptionist/prompt-preview.ts) with every input the edge has; this only reads
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
    __setPolicy?: (cls: string, mode: string | undefined, limits?: PolicyDials) => Promise<VerbResult>;
    __refreshSettings?: () => Promise<void>;
    __refreshLive?: () => Promise<void>;
    __href: typeof href;
    __teamInvite: typeof teamInvite;
    __teamSetRole: typeof teamSetRole;
    __teamRemove: typeof teamRemove;
    __whisperCall: typeof whisperCall;
    __endCall: typeof endCall;
    __handOverCall: typeof handOverCall;
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

type PolicyDialsBody = Omit<Input<"PUT policies">, "class" | "mode">;

/**
 * The dials as the wire names them. The pages hand the bridge memory's camelCase (`PolicyDials`) and the route takes
 * snake_case, the names the row keeps them under (docs/naming.md): they cross here, in one named mapping, and a dial
 * not given stays out of the body.
 */
function dialsOnTheWire(d: PolicyDials): PolicyDialsBody {
  const wire: PolicyDialsBody = {};
  if (d.replyDelayMs !== undefined) wire.reply_delay_ms = d.replyDelayMs;
  if (d.minConfidence !== undefined) wire.min_confidence = d.minConfidence;
  if (d.maxTokensDay !== undefined) wire.max_llm_tokens_day = d.maxTokensDay;
  if (d.maxRepliesDay !== undefined) wire.max_replies_day = d.maxRepliesDay;
  if (d.pauseHours !== undefined) wire.pause_hours = d.pauseHours;
  return wire;
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
  const r = await api()("PUT policies", {
    body: { class: cls, ...(mode !== undefined ? { mode } : {}), ...dialsOnTheWire(limits) },
  });
  if (r.ok) {
    const saved = r.data.policy?.mode ?? mode;
    window.dispatchEvent(new CustomEvent("policy:changed", { detail: { class: cls, mode: saved } }));
  }
  return r;
}

/**
 * A link the browser follows rather than a request it makes: a download, a photo. A download of ONE view names
 * it in the query (Leads' export of a search), which is typed as that route's own input.
 */
const href = <K extends RouteKey>(key: K, params?: Params<K>, query?: ApiOptions<K>["query"]) =>
  api().url(key, { params, query });

export function installInboxVerbs(): void {
  // A download is a plain link to a route, and the route needs the workspace
  // named like every other request; the page builds the href with this.
  window.__href = href;
  window.__setPolicy = setPolicy;
  window.__refreshSettings = refreshSettings;
  window.__refreshLive = refreshLive;
  window.__teamInvite = teamInvite;
  window.__teamSetRole = teamSetRole;
  window.__teamRemove = teamRemove;
  // A call's recording is no verb: the thread's <audio> points at the route (window.__href), which redirects to a
  // link signed for each request.
  window.__whisperCall = whisperCall;
  window.__endCall = endCall;
  window.__handOverCall = handOverCall;
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
