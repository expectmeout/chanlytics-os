/**
 * Each outside service's rules, one row a provider: the table decision 0149 writes out in words ("The table"), and
 * what the door (provider-fetch.ts) reads (lane 8 of the "prove it works" plan, 28 Nov 2026).
 *
 * A row says two things the door could not know from an answer alone:
 *   limits   whose limit a "too many" spends: the workspace's own (its WhatsApp number, its mailbox, its ad account,
 *            its Twilio subaccount), or the platform's (one key for every workspace: the AI's, Resend's, Apify's). A
 *            workspace's "too many" holds that workspace's calls; only the platform's holds everyone's. A "too many" that
 *            names neither is read as the workspace's: one workspace's trouble is never everyone's on a guess.
 *   atOnce   how many of its calls run at once in this instance, per limit holder, before the service has said "too
 *            many": generous, so an ordinary day queues nothing. A "too many" halves it; answers raise it back.
 * and `tooMany`, how the service says it: Meta's Graph in a 400's code, Google in a 403's reason, the rest as a 429.
 * Our own two apps, the files bucket and the relay are not limited: a 429 from the edge is its answer (a workspace's AI
 * budget spent), never a pace. The AI's own "too many" is its port's to act on (ai/anthropic.ts: a fast request asked
 * again at standard speed, then the fallback), so the door never holds it.
 *
 * What each vendor's own pages say, read on 28 Nov 2026, is in decision 0149's table beside each row.
 */
import { MIN_MS, SECOND_MS, recordOrEmpty, valueAt } from "@chanlytics/contracts";

/** Every provider a call leaves for: the breaker keeps one state per name. */
export const PROVIDER_NAMES = [
  "meta",
  "twilio",
  "retell",
  "resend",
  "google",
  "apify",
  "expo",
  "anthropic",
  "typesafe",
  "elevenlabs",
  // A connected Microsoft 365 mailbox's mail (Graph, decision 0056); a Gmail mailbox's is Google's.
  "microsoft",
  // An Instagram account's DMs and its way in (graph.instagram.com: the Instagram API with Instagram Login).
  "instagram",
  // A business's page, read for what it says and declares (site-reads.ts): drawn on the provider's network, never ours.
  "firecrawl",
  // A business's videos, kept, played and cut into frames by Cloudflare Stream (video/stream.ts, decision 0099).
  "cloudflare",
  // A video's sound, heard by Gemini (ai/gemini.ts): Google's, but not the Business Profile's breaker.
  "gemini",
  // An owner's ads, read and paused at Meta's ads interface (ads/meta-call.ts): its own breaker, so a fault there
  // never holds a WhatsApp or an Instagram call.
  "meta_ads",
  // A business's Facebook Page, posted to with the Page's own token (facebook/page.ts): its own breaker too, so a Page
  // that does not answer never holds the account's Instagram calls.
  "facebook",
  // The shelf where a made video keeps its own copy, asked through the relay (files/shelf.ts): Cloudflare's too, but
  // its own breaker, so a relay that gives no answer never holds a call to the video platform.
  "relay",
  // Our own two apps, each asked by the other: the dashboard's calls to the edge (its server/shared/edge.ts), and the
  // edge's and Ask's calls to the dashboard (tokens/dashboard-call.ts, the unsubscribe probe, Ask's presses). Always
  // made (`breaker: "count"`): named for their time and their faults, never held, as they never were.
  "edge",
  "dashboard",
  // The files bucket's bytes, read by a signed link (Supabase Storage): a file's first bytes, a copy its decoder drew.
  "storage",
] as const;
export type Provider = (typeof PROVIDER_NAMES)[number];

/** Whose limit a "too many" spent: a workspace's own, the platform's, or this one call's alone (a person written to too often). */
export type TooManyScope = "workspace" | "platform" | "call";

/** How a service says "too many". */
type TooManyWords = "graph" | "google" | "status" | "none";

interface ProviderRule {
  limits: Exclude<TooManyScope, "call">;
  tooMany: TooManyWords;
  atOnce: number;
}

/** No limit at the door: our own apps, the bucket, the relay, and the AI, whose port acts on its own "too many". */
const UNLIMITED = { tooMany: "none", atOnce: Number.POSITIVE_INFINITY } as const;

const PROVIDER_RULES: Record<Provider, ProviderRule> = {
  meta: { limits: "workspace", tooMany: "graph", atOnce: 16 },
  meta_ads: { limits: "workspace", tooMany: "graph", atOnce: 8 },
  instagram: { limits: "workspace", tooMany: "graph", atOnce: 8 },
  facebook: { limits: "workspace", tooMany: "graph", atOnce: 8 },
  google: { limits: "workspace", tooMany: "google", atOnce: 8 },
  gemini: { limits: "platform", tooMany: "status", atOnce: 8 },
  // Outlook allows four requests at once per app per mailbox (Microsoft Graph's throttling limits).
  microsoft: { limits: "workspace", tooMany: "status", atOnce: 4 },
  twilio: { limits: "workspace", tooMany: "status", atOnce: 16 },
  retell: { limits: "platform", tooMany: "status", atOnce: 16 },
  elevenlabs: { limits: "platform", tooMany: "status", atOnce: 8 },
  resend: { limits: "platform", tooMany: "status", atOnce: 8 },
  apify: { limits: "platform", tooMany: "status", atOnce: 16 },
  cloudflare: { limits: "platform", tooMany: "status", atOnce: 8 },
  firecrawl: { limits: "platform", tooMany: "status", atOnce: 8 },
  expo: { limits: "platform", tooMany: "status", atOnce: 8 },
  typesafe: { limits: "platform", tooMany: "status", atOnce: 8 },
  anthropic: { limits: "platform", ...UNLIMITED },
  relay: { limits: "platform", ...UNLIMITED },
  edge: { limits: "platform", ...UNLIMITED },
  dashboard: { limits: "platform", ...UNLIMITED },
  storage: { limits: "platform", ...UNLIMITED },
};

/** A provider's row. */
export function providerRuleOf(provider: Provider): Readonly<ProviderRule> {
  return PROVIDER_RULES[provider];
}

/** Whether a provider is one of our own two apps: a call to it is a hop of ours, not a service anyone pays for. */
export function isOurOwnApp(provider: Provider): boolean {
  return provider === "edge" || provider === "dashboard";
}

/** What an answer's "too many" says: whose limit it spent, and how long the service asked us to wait, when it said. */
interface TooMany {
  scope: TooManyScope;
  waitMs: number | null;
}

/**
 * Graph's codes for "too many" and whose limit each is (Meta's rate limiting page and WhatsApp's error codes): 4 is the
 * app's, every workspace's at once; 613 with subcode 1996 is the app's too; 17 a sign-in's, 32 a Page's, 613 a call's
 * own, 80000 to 80014 a business's use case (its ad account, Page, Instagram account, WhatsApp account), 80007 a
 * WhatsApp business account's, 130429 a number's throughput, 131048 a number held back for spam; 131056 is one person
 * written to too often, which holds nobody else.
 */
function graphScopeOf(code: number, subcode: number | null): TooManyScope | null {
  if (code === 4 || (code === 613 && subcode === 1996)) return "platform";
  if (code === 131056) return "call";
  if (code === 17 || code === 32 || code === 613 || code === 80007 || code === 130429 || code === 131048)
    return "workspace";
  return code >= 80000 && code <= 80014 ? "workspace" : null;
}

/** The longest wait a Graph usage header names: a business use case's minutes, an ad account's seconds. */
function graphWaitOf(headers: Headers | null): number | null {
  const waits: number[] = [];
  for (const entry of Object.values(jsonHeader(headers, "x-business-use-case-usage"))) {
    for (const use of Array.isArray(entry) ? entry : []) {
      const minutes = Number(valueAt(use, "estimated_time_to_regain_access"));
      if (Number.isFinite(minutes) && minutes > 0) waits.push(minutes * MIN_MS);
    }
  }
  const seconds = Number(jsonHeader(headers, "x-ad-account-usage").reset_time_duration);
  if (Number.isFinite(seconds) && seconds > 0) waits.push(seconds * SECOND_MS);
  return waits.length ? Math.max(...waits) : null;
}

/** A header whose value is JSON, as an object; an empty one when absent or unreadable. */
function jsonHeader(headers: Headers | null, name: string): Record<string, unknown> {
  const raw = headers?.get(name);
  if (!raw) return {};
  try {
    return recordOrEmpty(JSON.parse(raw));
  } catch {
    // Not JSON: it names no wait.
    return {};
  }
}

/**
 * Google's reasons for "too many" (Gmail's, Drive's and Calendar's quota pages): a 403 whose reason is the user's own
 * rate is the workspace's; the project's rate or quota is the platform's. A 429 is said for a user's sending, Drive's
 * backend and the Business Profile alike, so it is read as the workspace's.
 */
function googleScopeOf(status: number, json: unknown): TooManyScope | null {
  if (status === 429) return "workspace";
  if (status !== 403) return null;
  const given = valueAt(json, "error", "errors", 0, "reason");
  const reason = typeof given === "string" ? given : "";
  if (reason === "userRateLimitExceeded") return "workspace";
  return reason === "rateLimitExceeded" || reason === "quotaExceeded" ? "platform" : null;
}

/** Whether, and whose, an answer's "too many" is, with the wait the service named; null for any other answer. */
export function tooManyOf(
  provider: Provider,
  answer: { status: number; json: unknown; headers: Headers | null; retryAfterMs: number | null },
): TooMany | null {
  const rule = PROVIDER_RULES[provider];
  if (rule.tooMany === "none" || answer.status === 0 || (answer.status >= 200 && answer.status < 300)) return null;
  let scope: TooManyScope | null = answer.status === 429 ? rule.limits : null;
  let waitMs = answer.retryAfterMs;
  if (rule.tooMany === "graph") {
    const code = Number(valueAt(answer.json, "error", "code"));
    const sub = Number(valueAt(answer.json, "error", "error_subcode"));
    scope = (Number.isFinite(code) ? graphScopeOf(code, Number.isFinite(sub) ? sub : null) : null) ?? scope;
    waitMs ??= scope ? graphWaitOf(answer.headers) : null;
  } else if (rule.tooMany === "google") scope = googleScopeOf(answer.status, answer.json);
  return scope ? { scope, waitMs } : null;
}

/**
 * The headers a service names its own record of one request in: what its support asks for (Anthropic's and Stripe's
 * `request-id`, Twilio's `Twilio-Request-Id`, Meta's `x-fb-trace-id`, Cloudflare's `cf-ray`, and the common
 * `x-request-id`), in the order read.
 */
const PROVIDER_REQUEST_HEADERS = ["request-id", "x-request-id", "twilio-request-id", "x-fb-trace-id", "cf-ray"];

/**
 * The service's own name for the request, where it gave one: a header above, or Meta's `fbtrace_id` in an error's
 * body. The last leg of an act's search: what to hand the service's support when its answer is the one in question.
 */
export function providerRequestOf(answer: { headers: Headers | null; json: unknown }): string | null {
  for (const name of PROVIDER_REQUEST_HEADERS) {
    const value = answer.headers?.get(name)?.trim();
    if (value) return value.slice(0, 128);
  }
  const trace = valueAt(answer.json, "error", "fbtrace_id");
  return typeof trace === "string" && trace ? trace.slice(0, 128) : null;
}
