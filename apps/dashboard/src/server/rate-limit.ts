/**
 * Request limits, per signed-in user, shared across instances.
 *
 * Nothing limited any route (review F45): an operator's session could send
 * a customer thirty templates a minute, mint invitations without end, or
 * hammer the two plpgsql aggregates. These are ceilings a person never
 * reaches in honest use and a script reaches at once.
 *
 * The count lives in Postgres (one row per hit, one door: take_rate), so a
 * burst spread across serverless instances is limited in total, not per
 * instance. The database answering slowly or not at all must not refuse
 * everyone: a failed count falls back to this instance's memory, which is
 * also the whole limiter where no database is configured (tests, a laptop).
 * The store behind `takeRate` is the only thing that changed; the routes
 * did not: the signature is the contract.
 *
 * Refusals are the envelope's own `rate_limited` (429) with a retry hint, so
 * the client shows a sentence, never a raw status.
 *
 * Two things are said out loud rather than left to a log nobody reads. A
 * deployment with no database keys counts per instance, for ever: it says so
 * once when the store is chosen, and louder in production, where it is a
 * misconfiguration. And a route that SPENDS money takes its count strictly:
 * when the shared count cannot be read, it refuses (503) instead of falling
 * back to a per-instance count that a burst across instances walks past --
 * a ceiling on spend that cannot be held is not a ceiling.
 */
import { AppError } from "@chanlytics/contracts";
import { createServiceClient, type Database } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RateRule {
  limit: number;
  windowMs: number;
  /** What the refusal calls the thing being limited. */
  noun: string;
}

/** One rule per bucket. Named by what the route DOES, not by its path. */
export const RATE = {
  /** Invitations send real email. */
  invite: { limit: 10, windowMs: 3_600_000, noun: "invitations" },
  /** A role change or a removal. Neither had a limit and nothing said why; one person reshaping a roster stays well under this, a script does not. */
  team: { limit: 30, windowMs: 3_600_000, noun: "team changes" },
  /** A reply reaches a real person. */
  reply: { limit: 30, windowMs: 60_000, noun: "replies" },
  /**
   * Taking a thread over, handing it back, snoozing, waking, archiving,
   * resolving, calling back a send. None had a limit and nothing said why.
   * One person working an inbox stays well under two a second; a script
   * flipping a thread between the receptionist and a person does not.
   */
  thread_state: { limit: 120, windowMs: 60_000, noun: "conversation changes" },
  /** Irreversible, and a job per erasure. */
  erase: { limit: 5, windowMs: 3_600_000, noun: "erasures" },
  /** A sentence into a live call. */
  whisper: { limit: 20, windowMs: 60_000, noun: "whispers" },
  /** Ending a call, or passing it to the business. */
  call_control: { limit: 20, windowMs: 60_000, noun: "call controls" },
  /**
   * metrics_summary, report_series, the campaign series and the calendar
   * feed: the plpgsql aggregates and the one outside read. One load of Today
   * spends four of these (Today, Reports, Campaigns and Calendar all boot
   * together), so sixty a minute was fifteen page loads — a person with two
   * tabs and a refresh habit, or the e2e suite, then saw "Can't reach your
   * workspace" for a rate limit. Sixty loads a minute clears honest use; a
   * script still cannot hammer the database.
   */
  aggregate: { limit: 240, windowMs: 60_000, noun: "report requests" },
  /** Whole-config writes and policy flips. */
  settings: { limit: 30, windowMs: 60_000, noun: "settings changes" },
  /** A new tenant, its rows and its provisioning. */
  create_workspace: { limit: 5, windowMs: 3_600_000, noun: "new workspaces" },
  /** A person's receptionist mode. */
  person_mode: { limit: 60, windowMs: 60_000, noun: "receptionist changes" },
  consent: { limit: 60, windowMs: 60_000, noun: "consent changes" },
  lists: { limit: 60, windowMs: 60_000, noun: "list changes" },
  broadcast: { limit: 10, windowMs: 60_000, noun: "broadcasts" },
  playbook: { limit: 30, windowMs: 60_000, noun: "playbook changes" },
  /** A person added by hand — from an appointment, before they ever write. */
  person_create: { limit: 60, windowMs: 3_600_000, noun: "people added" },
  /** A client list arrives in parts of fifty: two hundred and forty parts an hour is twelve thousand people, and a script is not. */
  person_import: { limit: 240, windowMs: 3_600_000, noun: "import parts" },
  /** A person's name or the notes the receptionist reads. */
  person_edit: { limit: 60, windowMs: 60_000, noun: "profile edits" },
  /** Read and dismiss marks on the bell. */
  notify_mark: { limit: 120, windowMs: 60_000, noun: "notification marks" },
  setup_request: { limit: 5, windowMs: 3_600_000, noun: "setup requests" },
  lines_search: { limit: 20, windowMs: 3_600_000, noun: "number searches" },
  lines_buy: { limit: 3, windowMs: 3_600_000, noun: "lines" },
  lines_retry: { limit: 10, windowMs: 3_600_000, noun: "line retries" },
  lines_forwarding: { limit: 10, windowMs: 3_600_000, noun: "forwarding changes" },
  /** The business on record: edited freely, but it is a write that leaves for a provider. */
  business_record: { limit: 20, windowMs: 3_600_000, noun: "changes to your business record" },
  /** Filing with the carriers costs money and cannot be undone. */
  lines_register: { limit: 3, windowMs: 3_600_000, noun: "registrations" },
  /*
   * THE BACK OFFICE'S OWN CEILINGS, because the three ops routes were borrowing
   * the owner buckets above and this table's own rule is "named by what the route
   * DOES, not by its path".
   *
   * Three things followed from the borrowing, all of them wrong in the same
   * direction. `takeRate` counts per PERSON, so a support engineer's refiles for
   * three different customers drew down the same three-an-hour as filings for
   * their own workspace. Refiling a REJECTED campaign is free and reversible --
   * Twilio assesses the vetting fee once per campaign -- so the most common A2P
   * support action there is was capped by a ceiling sized for an irreversible
   * $19.50 spend, and a shift clearing four rejections was refused on the fourth.
   * And the refusal reads from `noun`, so giving a number BACK was refused with
   * "Too many lines in a short time".
   *
   * These are sized for a support session rather than for one owner's wallet, and
   * they are still ceilings: a runaway loop against another business's carrier
   * registration is exactly what a limit is for. Release stays the tightest --
   * it is permanent, and a number handed back cannot be reclaimed.
   */
  platform_line_retry: { limit: 30, windowMs: 3_600_000, noun: "line retries for other workspaces" },
  platform_line_refile: { limit: 20, windowMs: 3_600_000, noun: "registrations resent for other workspaces" },
  platform_line_release: { limit: 5, windowMs: 3_600_000, noun: "numbers handed back" },
  /**
   * Marking somebody on the waiting list as invited. Generous, because working
   * down a queue is exactly this action repeated -- it costs nothing, sends
   * nothing and can be undone by nobody, so the ceiling is here to stop a loop
   * rather than to ration a support shift.
   */
  platform_waitlist_invited: { limit: 200, windowMs: 3_600_000, noun: "people marked as invited" },
  profile_set: { limit: 10, windowMs: 3_600_000, noun: "name changes" },
  /** Becoming a partner (0011): once per account, so the bucket is for the codes tried. */
  partner_become: { limit: 10, windowMs: 3_600_000, noun: "partner codes tried" },
  /** The native app's sign-in door (app/auth/native): per network, a token that does not verify costs a call each time. */
  native_sign_in: { limit: 20, windowMs: 3_600_000, noun: "sign-ins" },
  /** The phone app registers its push token on launch (me/devices); sixty an hour is a loop, not a person. */
  device_register: { limit: 60, windowMs: 3_600_000, noun: "device registrations" },
  /** A stranger at the door: per network they came from and per address they typed. */
  signup_ip: { limit: 5, windowMs: 3_600_000, noun: "sign-ups" },
  signup_email: { limit: 3, windowMs: 3_600_000, noun: "sign-ups" },
  /** Each is a paid call to Google, made for an owner who typed a few words. */
  google_search: { limit: 20, windowMs: 3_600_000, noun: "listing searches" },
  google_link: { limit: 10, windowMs: 3_600_000, noun: "listing changes" },
  google_refresh: { limit: 6, windowMs: 3_600_000, noun: "listing reads" },
  /** A reply reaches Google under the business's name. */
  google_reply: { limit: 20, windowMs: 3_600_000, noun: "review replies" },
  google_draft: { limit: 30, windowMs: 3_600_000, noun: "review drafts" },
  /** A Checkout or portal session, a resume, a sync: each a call to Stripe for an owner that changes something. */
  billing: { limit: 20, windowMs: 3_600_000, noun: "billing requests" },
  /** Reading the invoices: a call to Stripe that changes nothing, and must not spend the Checkout bucket. */
  billing_read: { limit: 60, windowMs: 3_600_000, noun: "billing reads" },
  /** A whole thread, a whole call, or everyone, as a file. */
  export: { limit: 10, windowMs: 60_000, noun: "exports" },
  /** A page remembering its view: a sort, a tab. One small write per click at most. */
  view_set: { limit: 60, windowMs: 60_000, noun: "view changes" },
  /** A lead search: a provider run and a judge on the platform's account (the door reserves the month; this stops a loop). */
  lead_search: { limit: 10, windowMs: 3_600_000, noun: "lead searches" },
  /** An answer to the question after 25, or a Stop. */
  lead_answer: { limit: 30, windowMs: 3_600_000, noun: "search answers" },
  /** Keep, exclude, put back, undo, and every B act on ONE lead or ONE search: one click each, many in a session. */
  lead_member: { limit: 120, windowMs: 60_000, noun: "lead changes" },
  /**
   * The lead finder's three from release B. There is deliberately no fourth for
   * a single lead's edit: it would be this file's `lead_member` to the
   * character, and two buckets with one noun make a refusal nobody can tell
   * apart. The two model buckets are per PERSON and small because both spend
   * Ask's one daily budget.
   */
  lead_bulk: { limit: 30, windowMs: 60_000, noun: "changes to many leads" },
  lead_draft: { limit: 60, windowMs: 3_600_000, noun: "email drafts" },
  lead_suggest: { limit: 10, windowMs: 3_600_000, noun: "suggestion requests" },
  /** A question to the workspace assistant: a model turn, tools and all. */
  ask: { limit: 20, windowMs: 60_000, noun: "questions" },
} as const satisfies Record<string, RateRule>;

export type RateBucket = keyof typeof RATE;

export type RateVerdict = { allowed: true } | { allowed: false; retryAfterS: number };

/**
 * Where the count lives. `take` counts the hit or says when to try again.
 * `strict` means the count must be the shared one: a store that cannot give
 * it refuses (503) rather than answering from this instance alone.
 */
export interface RateStore {
  take(bucket: RateBucket, actor: string, rule: RateRule, now: number, strict?: boolean): Promise<RateVerdict>;
}

/** The refusal when a strict count cannot be given: the verb is not run on a ceiling nobody can hold. */
export function uncountable(why: string): AppError {
  return new AppError("internal", `The shared count could not be read just now (${why}) — try again in a moment.`, 503);
}

/** Past this many live keys the map is swept; a long-lived instance must not grow forever. */
const SWEEP_AT = 5_000;

/**
 * This instance's memory: the fallback behind the shared store, and the whole
 * limiter where no database is configured. A burst that lands on one instance
 * — the shape abuse takes — is still refused here.
 */
export function memoryStore(): RateStore & { reset(): void } {
  const hits = new Map<string, number[]>();
  return {
    async take(bucket, actor, rule, now) {
      const key = `${bucket}:${actor}`;
      const recent = (hits.get(key) ?? []).filter((t) => now - t < rule.windowMs);
      if (recent.length >= rule.limit) {
        return { allowed: false, retryAfterS: Math.max(1, Math.ceil((recent[0] + rule.windowMs - now) / 1000)) };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > SWEEP_AT) {
        for (const [k, times] of hits) {
          if (!times.some((t) => now - t < 3_600_000)) hits.delete(k);
        }
      }
      return { allowed: true };
    },
    reset() {
      hits.clear();
    },
  };
}

/**
 * The shared count: one door in Postgres, exact across instances (take_rate
 * serialises one actor's one bucket). A database that does not answer falls
 * back to the instance's memory — a limiter must never be the outage — and
 * says so once a minute, not once a request.
 */
export function postgresStore(db: Pick<SupabaseClient<Database>, "rpc">, fallback: RateStore): RateStore {
  let warnedAt = Number.NEGATIVE_INFINITY;
  return {
    async take(bucket, actor, rule, now, strict = false) {
      try {
        const { data, error } = await db.rpc("take_rate", {
          p_bucket: bucket,
          p_actor: actor,
          p_limit: rule.limit,
          p_window_ms: rule.windowMs,
        });
        if (error) throw new Error(error.message);
        const v = (data ?? {}) as { allowed?: boolean; retry_after_s?: number };
        if (v.allowed === true) return { allowed: true };
        if (v.allowed === false)
          return { allowed: false, retryAfterS: Math.max(1, Math.ceil(Number(v.retry_after_s ?? 1))) };
        throw new Error("take_rate answered without a verdict");
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        if (now - warnedAt > 60_000) {
          warnedAt = now;
          console.error("rate_store_failed", JSON.stringify({ bucket, error: why }));
        }
        // Money is not spent on a count this instance alone would hold.
        if (strict) throw uncountable("the shared store did not answer");
        return fallback.take(bucket, actor, rule, now);
      }
    },
  };
}

const memory = memoryStore();
let store: RateStore | null = null;

/**
 * This instance's memory, chosen BY CONFIGURATION: no database keys. Says so
 * once, in the same family as the store failure, and louder in production,
 * where a limiter that never shares its count is a misconfiguration. A
 * strict take refuses: a deployment that cannot count across instances does
 * not spend on a ceiling it cannot hold.
 */
export function memoryByConfiguration(
  fallback: RateStore,
  production = process.env.VERCEL_ENV === "production",
): RateStore {
  let said = false;
  return {
    async take(bucket, actor, rule, now, strict = false) {
      if (!said) {
        said = true;
        console.error(
          "rate_store_memory_by_configuration",
          JSON.stringify({
            production,
            bucket,
            note: production
              ? "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing: every ceiling is per instance"
              : "no database keys: ceilings are per instance, which is the whole limiter on a laptop",
          }),
        );
      }
      if (strict) throw uncountable("this deployment has no shared store");
      return fallback.take(bucket, actor, rule, now);
    },
  };
}

/** Postgres when the server has its keys, else this instance's memory, said once. Chosen once. */
function activeStore(): RateStore {
  if (store) return store;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  store =
    url && serviceRoleKey
      ? postgresStore(createServiceClient({ url, serviceRoleKey }), memory)
      : memoryByConfiguration(memory);
  return store;
}

function human(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const m = Math.ceil(seconds / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

/**
 * Count this request against the bucket, or refuse it.
 *
 * `actor` is the signed-in user id — the limit follows the person, not the
 * workspace, so a busy team is not throttled by one of its members. `strict`
 * is for a route that spends: the shared count or a refusal, never this
 * instance's own.
 */
export async function takeRate(
  actor: string,
  bucket: RateBucket,
  now: number = Date.now(),
  strict = false,
): Promise<void> {
  const rule: RateRule = RATE[bucket];
  const verdict = await activeStore().take(bucket, actor, rule, now, strict);
  if (!verdict.allowed) {
    throw new AppError(
      "rate_limited",
      `Too many ${rule.noun} in a short time — try again in ${human(verdict.retryAfterS)}.`,
      429,
      { retry_after_s: verdict.retryAfterS },
    );
  }
}

/** Tests only: forget every count held in memory. */
export function resetRates(): void {
  memory.reset();
}

/** Tests only: put a store behind takeRate (null = choose again from the env). */
export function setRateStore(s: RateStore | null): void {
  store = s;
}
