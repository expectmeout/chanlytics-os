/**
 * Email over Resend: the one function with a network in it.
 *
 * It sends a request that was built and frozen elsewhere (email.ts) and says
 * what happened. Like every send adapter here it RETURNS a result and never
 * throws, and it is bounded: a hung connection must not take the worker's
 * whole run with it (whatsapp.ts postGraph says why).
 *
 * The Idempotency-Key is the request's own, which is the queued row's id.
 * Resend honours a key for 24 hours and answers a repeated key with the first
 * send's result, so the one retry the ledger allows cannot deliver twice; a
 * repeated key with a different payload is refused (409), which a frozen
 * request never produces.
 *
 * A refusal that means "not this second" (resendLimitOf: rate, in_flight) is
 * waited out once, when the provider's wait is short, and the same bytes are
 * posted again under the same key: the provider did not take the first, or it
 * answers the second with the first's result. A longer wait, a used-up day or
 * month, or a second refusal is handed back as it came.
 */
import type { SendResult } from "./whatsapp";
import {
  mailDomainsFrom,
  receivedEmailFrom,
  resendLimitOf,
  type EmailRequest,
  type MailDomainFacts,
  type ReceivedEmail,
} from "./email";

export interface ResendConfig {
  apiKey: string;
}

const RESEND_EMAILS = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 15_000;
/** The longest a send waits for the provider's "in a moment" before handing the answer back: a worker's run is bounded. */
const LIMIT_WAIT_MAX_MS = 2_000;
/** What a refusal that says nothing about how long is given. */
const LIMIT_WAIT_DEFAULT_MS = 1_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** How long the provider asked us to wait, in ms: retry-after, else ratelimit-reset, both in seconds. Null when it did not say. */
function waitAskedMs(h: Headers): number | null {
  for (const name of ["retry-after", "ratelimit-reset"]) {
    const v = h.get(name);
    const s = Number(v);
    if (v !== null && v.trim() !== "" && Number.isFinite(s) && s >= 0) return Math.round(s * 1000);
  }
  return null;
}

/** One POST of the frozen request, and how long the provider asked us to wait if it refused. */
async function postEmail(
  cfg: ResendConfig,
  request: EmailRequest,
): Promise<{ result: SendResult; waitMs: number | null }> {
  const { idempotency_key, ...body } = request;
  try {
    const r = await fetch(RESEND_EMAILS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotency_key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const raw = await r.text().catch(() => "");
    if (r.ok) {
      const id = (() => {
        try {
          return (JSON.parse(raw) as { id?: unknown }).id;
        } catch {
          return null;
        }
      })();
      // Accepted with no id is still accepted: the words are with the provider,
      // and the receipt finds the row by its tag, not by this id.
      return { result: { ok: true, wamid: typeof id === "string" ? id : null, status: r.status }, waitMs: null };
    }
    return {
      result: { ok: false, wamid: null, status: r.status, errorBody: raw.slice(0, 500) },
      waitMs: waitAskedMs(r.headers),
    };
  } catch (e) {
    // status 0: never reached the provider, which is distinct from any answer it gave.
    return {
      result: { ok: false, wamid: null, status: 0, errorBody: e instanceof Error ? e.message : String(e) },
      waitMs: null,
    };
  }
}

export async function sendEmail(
  cfg: ResendConfig,
  request: EmailRequest,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<SendResult> {
  const first = await postEmail(cfg, request);
  const limit = resendLimitOf(first.result);
  if (limit !== "rate" && limit !== "in_flight") return first.result;
  const ms = first.waitMs ?? LIMIT_WAIT_DEFAULT_MS;
  if (ms > LIMIT_WAIT_MAX_MS) return first.result;
  await wait(ms);
  return (await postEmail(cfg, request)).result;
}

const RESEND_RECEIVED = "https://api.resend.com/emails/receiving";
const FETCH_TIMEOUT_MS = 15_000;

/**
 * One received email, by the id its webhook named. `null` is the provider
 * saying it has no such email (404): a fact, and the intake ends. Anything
 * else that is not an email THROWS, because "we could not ask" is not "it is
 * gone": the ledger keeps the job and tries it again later (packages/jobs
 * RETRY_WAITS_MS), and fails it only when the last try throws too.
 */
export async function fetchReceivedEmail(cfg: ResendConfig, receivedId: string): Promise<ReceivedEmail | null> {
  const r = await fetch(`${RESEND_RECEIVED}/${encodeURIComponent(receivedId)}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (r.status === 404) return null;
  const raw = await r.text();
  if (!r.ok) throw new Error(`resend: received email ${receivedId} answered ${r.status}: ${raw.slice(0, 200)}`);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`resend: received email ${receivedId} answered something that is not JSON`);
  }
  const email = receivedEmailFrom(body);
  if (!email) throw new Error(`resend: received email ${receivedId} answered a shape that is not an email`);
  return email;
}

const RESEND_DOMAINS = "https://api.resend.com/domains";

/**
 * Every domain this account holds, with what the provider makes of each. Read
 * by the health check to see whether the one we send and receive on is still
 * verified.
 *
 * It THROWS rather than answering an empty list when it cannot ask, for the
 * reason fetchReceivedEmail does: "we could not reach the provider" is not
 * "the provider has no such domain", and only one of those is worth waking
 * somebody for.
 */
export async function fetchMailDomains(cfg: ResendConfig): Promise<MailDomainFacts[]> {
  const r = await fetch(RESEND_DOMAINS, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`resend: domains answered ${r.status}: ${raw.slice(0, 200)}`);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error("resend: domains answered something that is not JSON");
  }
  const domains = mailDomainsFrom(body);
  if (!domains) throw new Error("resend: domains answered a shape that is not a list of domains");
  return domains;
}
