/**
 * Email over Resend: the one function with a network in it.
 *
 * It sends a request that was built and frozen elsewhere (email/request.ts) and says
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
 *
 * An email the provider took as the last its rate allowed (ratelimit-remaining
 * 0) waits out the reset before it returns (Reach out C14), so the next email
 * this instance sends meets an open second rather than a 429.
 */
import type { SendResult } from "../whatsapp";
import { providerFetch, type SendOutcome } from "../provider-fetch";
import { receivedEmailFrom, type ReceivedEmail } from "./intake";
import { mailDomainsFrom, resendLimitOf, type MailDomainFacts } from "./provider-answers";
import type { EmailRequest } from "./request";

export interface ResendConfig {
  apiKey: string;
}

/** The provider's API, once: every call in this package goes to a path under it (resendRequest). */
export const RESEND_API = "https://api.resend.com";
/** The longest one request to the provider waits: a send's try, a domain's read. The domains sweep's budget counts it. */
export const SEND_TIMEOUT_MS = 15_000;
/**
 * The most one send may take, both tries and a short wait included: a worker's run is bounded (the jobs tick yields
 * at 45 s of 60), and Part 1 measured the worst case at 32 s.
 */
export const SEND_DEADLINE_MS = 32_000;
/** A second try after a timeout needs at least this much of the deadline left, or it would only time out again. */
const RETRY_NEEDS_MS = 5_000;
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

/** What the provider answered, or that it did not: status 0 is no answer, and `timedOut` says whether we gave up. */
export interface ResendAnswer {
  status: number;
  json: unknown;
  raw: string;
  headers: Headers | null;
  timedOut: boolean;
  /** What the call came to (provider-fetch SendOutcome). */
  outcome: SendOutcome;
}

/**
 * One call to the provider. It never throws: every answer is a status the caller reads, and "we could not ask"
 * (status 0) is kept apart from any answer it gave. The one place this package builds a request, so a timeout, a key
 * and a base URL are each spelled once.
 */
export async function resendRequest(
  cfg: ResendConfig,
  method: "GET" | "POST" | "DELETE" | "PATCH",
  path: string,
  opts: { body?: unknown; timeoutMs?: number; idempotencyKey?: string } = {},
): Promise<ResendAnswer> {
  const a = await providerFetch("resend", `${RESEND_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    timeoutMs: opts.timeoutMs ?? SEND_TIMEOUT_MS,
  });
  return {
    status: a.status,
    json: a.json,
    raw: a.status === 0 ? (a.error ?? "") : a.text,
    headers: a.headers,
    timedOut: a.error === "timeout",
    outcome: a.outcome,
  };
}

/**
 * What an email's send came to, as the send door reads it: the provider's "not this second" left nothing and may be
 * tried again; a used-up day or month is a no until it resets, which is longer than any retry waits; a try still in
 * flight under this key may yet arrive.
 */
function emailOutcome(result: SendResult, answered: SendOutcome): SendOutcome {
  const limit = resendLimitOf(result);
  if (limit === "rate") return "retryable";
  if (limit === "in_flight") return "unknown";
  if (limit === "daily" || limit === "monthly") return "refused";
  return answered;
}

/** An answer's own rate, read from its headers: how long until the next request may go, when this one was the last. */
function paceAskedMs(h: Headers | null): number | null {
  if (!h || h.get("ratelimit-remaining")?.trim() !== "0") return null;
  const s = Number(h.get("ratelimit-reset"));
  return h.get("ratelimit-reset") !== null && Number.isFinite(s) && s >= 0
    ? Math.round(s * 1000)
    : LIMIT_WAIT_DEFAULT_MS;
}

/**
 * One POST of the frozen request: how long the provider asked us to wait if it refused, and, if it took it as the last
 * its rate allowed, how long until the next may go.
 */
async function postEmail(
  cfg: ResendConfig,
  request: EmailRequest,
  timeoutMs: number,
): Promise<{ result: SendResult; waitMs: number | null; paceMs: number | null; timedOut: boolean }> {
  const { idempotency_key, ...body } = request;
  const a = await resendRequest(cfg, "POST", "/emails", { body, timeoutMs, idempotencyKey: idempotency_key });
  if (a.status >= 200 && a.status < 300) {
    const id = (a.json as { id?: unknown } | null)?.id;
    // Accepted with no id is still accepted: the words are with the provider,
    // and the receipt finds the row by its tag, not by this id.
    return {
      result: { ok: true, wamid: typeof id === "string" ? id : null, status: a.status, outcome: "ok" },
      waitMs: null,
      paceMs: paceAskedMs(a.headers),
      timedOut: false,
    };
  }
  if (a.status === 0)
    // status 0: never answered. A timeout is kept by name: the provider may have taken it (deliver.ts outcome unknown).
    return {
      result: { ok: false, wamid: null, status: 0, errorBody: a.timedOut ? "timeout" : a.raw, outcome: a.outcome },
      waitMs: null,
      paceMs: null,
      timedOut: a.timedOut,
    };
  const refused: SendResult = { ok: false, wamid: null, status: a.status, errorBody: a.raw.slice(0, 500) };
  return {
    result: { ...refused, outcome: emailOutcome(refused, a.outcome) },
    waitMs: a.headers ? waitAskedMs(a.headers) : null,
    paceMs: null,
    timedOut: false,
  };
}

export interface SendEmailOptions {
  /** How a short wait is waited (a test hands its own). */
  wait?: (ms: number) => Promise<void>;
  /** The most this send may take, every try included (SEND_DEADLINE_MS). */
  deadlineMs?: number;
  /** Epoch ms, injected so the deadline is testable. */
  now?: () => number;
}

/**
 * Post the frozen request, and try once more when the answer allows it, always under the same idempotency key, so a
 * second try is the same email (the provider keeps a key a day):
 *   - the provider's "not this second" (rate, in flight), waited out when it asks for 2 s or less;
 *   - a timeout, when at least 5 s of the deadline are left: the first may never have arrived.
 * A network failure that is not a timeout is not tried again: nothing left.
 */
export async function sendEmail(
  cfg: ResendConfig,
  request: EmailRequest,
  opts: SendEmailOptions = {},
): Promise<SendResult> {
  const wait = opts.wait ?? sleep;
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.deadlineMs ?? SEND_DEADLINE_MS);
  const left = (): number => Math.max(0, deadline - now());
  // C14: an email taken as the last of its second waits out the reset here, briefly and within the deadline, so the
  // next email this instance sends does not meet a 429.
  const paced = async (p: { result: SendResult; paceMs: number | null }): Promise<SendResult> => {
    if (p.result.ok && p.paceMs) await wait(Math.min(p.paceMs, LIMIT_WAIT_MAX_MS, left()));
    return p.result;
  };
  const first = await postEmail(cfg, request, Math.min(SEND_TIMEOUT_MS, left()));
  if (first.timedOut) {
    if (left() < RETRY_NEEDS_MS) return first.result;
    const second = await postEmail(cfg, request, Math.min(SEND_TIMEOUT_MS, left()));
    // The first may have been taken. A second answer that cannot say otherwise -- no answer, the first still being
    // worked under this key, the provider's own error -- leaves the outcome unknown, so the row stays settleable by its
    // receipt (deliver.ts). A plain answer (sent, or refused for a reason) is what became of it.
    const s = second.result;
    if (!s.ok && (s.status === 0 || s.status >= 500 || resendLimitOf(s) === "in_flight"))
      return { ok: false, wamid: null, status: 0, errorBody: "timeout", outcome: "unknown" };
    return paced(second);
  }
  const limit = resendLimitOf(first.result);
  if (limit !== "rate" && limit !== "in_flight") return paced(first);
  const ms = first.waitMs ?? LIMIT_WAIT_DEFAULT_MS;
  if (ms > LIMIT_WAIT_MAX_MS || ms >= left()) return first.result;
  await wait(ms);
  return paced(await postEmail(cfg, request, Math.min(SEND_TIMEOUT_MS, left())));
}

const RESEND_RECEIVED = `${RESEND_API}/emails/receiving`;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * One received email, by the id its webhook named. `null` is the provider
 * saying it has no such email (404): a fact, and the intake ends. Anything
 * else that is not an email THROWS, because "we could not ask" is not "it is
 * gone": the ledger keeps the job and tries it again later (packages/jobs
 * RETRY_WAITS_MS), and fails it only when the last try throws too.
 */
export async function fetchReceivedEmail(cfg: ResendConfig, receivedId: string): Promise<ReceivedEmail | null> {
  const r = await providerFetch("resend", `${RESEND_RECEIVED}/${encodeURIComponent(receivedId)}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    timeoutMs: FETCH_TIMEOUT_MS,
    idempotent: true,
    tries: 2,
  });
  if (r.status === 404) return null;
  if (r.status === 0) throw new Error(`resend: received email ${receivedId} could not be read: ${r.error}`);
  const raw = r.text;
  if (r.outcome !== "ok")
    throw new Error(`resend: received email ${receivedId} answered ${r.status}: ${raw.slice(0, 200)}`);
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

const RESEND_DOMAINS = `${RESEND_API}/domains`;

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
  const r = await providerFetch("resend", RESEND_DOMAINS, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    timeoutMs: FETCH_TIMEOUT_MS,
    idempotent: true,
    tries: 2,
  });
  if (r.status === 0) throw new Error(`resend: domains could not be read: ${r.error}`);
  const raw = r.text;
  if (r.outcome !== "ok") throw new Error(`resend: domains answered ${r.status}: ${raw.slice(0, 200)}`);
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
