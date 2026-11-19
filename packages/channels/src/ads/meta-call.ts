/**
 * How a call to Meta's ads interface leaves, and what its answer says beside its body (decision 0049, step P1).
 *
 * Meta lets an app in its first tier make very few calls for an ad account: a score of 60, a read costing 1 and a
 * change 3, easing over five minutes, and a caller that reaches the top is held for five more. A refused call counts
 * against the error rate Meta asks of an app that wants more. So every answer's own usage figures are read (three
 * headers, each a share of some limit), and what a refusal was is named here, where the wire is known: a caller then
 * says it in words and never sends what will be refused. Read on Meta's rate-limiting page on 19 November 2026.
 *
 * Every call is sent once. A read that got no answer is asked again by its clock, at the clock's pace, since a second
 * try in the same breath is one more call against the score. A change that got no answer is settled by reading what
 * stands at Meta, never by sending it again (decision 0050).
 */
import { recordOrEmpty, valueAt } from "@chanlytics/contracts";
import { metaErrorOf } from "../meta/client";
import type { MetaRequest } from "../meta/client";
import { answerObject, fetchFromProvider } from "../shared/provider-fetch";
import type { SendOutcome } from "../shared/provider-fetch";

/** The bound on one call: a read of an account with many ads is Meta's slowest. */
const META_ADS_TIMEOUT_MS = 20_000;

/** What an answer's headers say of the caller's pace: the largest share of any limit used, and how long to stay away. */
export interface MetaUsage {
  /** The largest share used of any limit the headers name, in percent. */
  pct: number;
  /** How long Meta says to wait before asking again, in seconds; 0 where it names no wait. */
  waitS: number;
}

const share = (value: unknown): number => (typeof value === "number" && value >= 0 ? value : 0);
const parsed = (headers: Headers, name: string): Record<string, unknown> => {
  try {
    return recordOrEmpty(JSON.parse(headers.get(name) ?? "null"));
  } catch {
    // A header that is not JSON says nothing of the pace.
    return {};
  }
};

/**
 * Meta's usage figures from an answer's headers, or null where it sent none. Three headers, each its own limit: the ad
 * account's score (`x-ad-account-usage`), the business's calls of each kind (`x-business-use-case-usage`, whose wait is
 * in minutes) and the app's own (`x-app-usage`).
 */
export function metaUsageOf(headers: Headers | null): MetaUsage | null {
  if (!headers) return null;
  const account = parsed(headers, "x-ad-account-usage");
  const app = parsed(headers, "x-app-usage");
  const uses = Object.values(parsed(headers, "x-business-use-case-usage")).flatMap((kinds) =>
    Array.isArray(kinds) ? kinds.map(recordOrEmpty) : [],
  );
  const shares = [
    share(account.acc_id_util_pct),
    ...[app, ...uses].flatMap((use) => [share(use.call_count), share(use.total_cputime), share(use.total_time)]),
  ];
  const waits = [
    share(account.reset_time_duration),
    ...uses.map((use) => share(use.estimated_time_to_regain_access) * 60),
  ];
  const said = headers.has("x-ad-account-usage") || headers.has("x-app-usage") || uses.length > 0;
  return said ? { pct: Math.max(...shares), waitS: Math.max(...waits) } : null;
}

/**
 * What a refusal was, named at the wire:
 *  - revoked: the business's sign-in is no longer good (190 and its kin): connect again.
 *  - slowed: Meta is holding this caller back (429; 4, 17, 32, 613; 80000 to 80014). Nothing was taken.
 *  - forbidden: the sign-in may not do this on that account or ad (10, and 200 to 299).
 *  - gone: what was asked about is not there, or not this sign-in's to see (100 with subcode 33).
 *  - silent: no answer came, or Meta's own fault (a timeout, a 5xx). Whether a change went is not known.
 *  - refused: anything else Meta said no to, with its own words.
 */
export type MetaAdsFault = "revoked" | "slowed" | "forbidden" | "gone" | "silent" | "refused";

const REVOKED_SUBCODES: readonly number[] = [458, 459, 460, 463, 464, 467, 492];
const SLOWED_CODES: readonly number[] = [4, 17, 32, 613];

/** One answer from Meta's ads interface. */
export interface MetaAdsAnswer {
  outcome: SendOutcome;
  status: number;
  json: Record<string, unknown> | null;
  /** Null where the call went well. */
  fault: MetaAdsFault | null;
  /** Meta's own words for a refusal, or why no answer came. Null where the call went well. */
  said: string | null;
  usage: MetaUsage | null;
}

function faultOf(outcome: SendOutcome, status: number, json: unknown): MetaAdsFault | null {
  if (outcome === "ok") return null;
  const error = metaErrorOf(json);
  const code = error?.code ?? null;
  if (code === 190 || code === 102 || (error?.subcode != null && REVOKED_SUBCODES.includes(error.subcode)))
    return "revoked";
  if (status === 429 || (code !== null && (SLOWED_CODES.includes(code) || (code >= 80000 && code <= 80014))))
    return "slowed";
  if (code === 10 || (code !== null && code >= 200 && code <= 299)) return "forbidden";
  if (code === 100 && error?.subcode === 33) return "gone";
  if (outcome !== "refused" || status >= 500) return "silent";
  return "refused";
}

/** What a test hands in instead of the network. */
export interface MetaAdsDeps {
  fetch?: typeof fetch;
}

/** One call to Meta's ads interface, bounded, never thrown, and sent once. */
export async function callMetaAds(
  req: MetaRequest,
  opts: { timeoutMs?: number } = {},
  deps: MetaAdsDeps = {},
): Promise<MetaAdsAnswer> {
  const reply = await fetchFromProvider(
    "meta_ads",
    req.url,
    {
      method: req.method,
      ...(req.headers ? { headers: req.headers } : {}),
      ...(req.body !== undefined ? { body: req.body } : {}),
      timeoutMs: opts.timeoutMs ?? META_ADS_TIMEOUT_MS,
    },
    deps.fetch ? { fetch: deps.fetch } : {},
  );
  const json = answerObject(reply);
  const fault = faultOf(reply.outcome, reply.status, json);
  return {
    outcome: reply.outcome,
    status: reply.status,
    json,
    fault,
    said: fault === null ? null : (metaErrorOf(json)?.message ?? reply.error ?? `HTTP ${reply.status}`).slice(0, 300),
    usage: metaUsageOf(reply.headers),
  };
}

/** Whether an answer confirmed what was asked: Meta's `{ success: true }`. */
export const metaConfirmed = (json: unknown): boolean => valueAt(recordOrEmpty(json), "success") === true;
