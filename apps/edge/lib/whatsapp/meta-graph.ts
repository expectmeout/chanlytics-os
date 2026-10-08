/**
 * The Graph API calls a connection needs, and nothing else.
 *
 * Embedded Signup hands the browser a one-time code and the ids of the WABA
 * and the phone number the business chose. Turning that into a working line
 * is four calls: the code becomes a business token (the app secret is the
 * only thing that can do this, and it lives here), the number is read back
 * (its display number and verified name, which the app never guessed), the
 * app subscribes to the WABA's webhooks (so its messages reach us), and the
 * number is registered for Cloud API messaging with a two-step PIN. Every
 * call reports the API's own error message; nothing is retried blindly.
 */
import { env } from "../env.js";
import { providerFetch } from "../packages/channels.js";
import type { NumberStanding } from "../packages/contracts.js";

export const GRAPH_VERSION = "v25.0";
/** How long one Graph API request may take. */
export const GRAPH_TIMEOUT_MS = 15_000;

/**
 * The Meta app this deployment speaks for. Its id is public by nature (the
 * browser hands it to Meta's SDK), and the one live app is the default, so
 * a deployment without META_APP_ID still introspects tokens and starts a
 * sign-up. The secret has no default and never will.
 */
export const DEFAULT_META_APP_ID = "1823820738182125";
export function metaAppId(): string {
  return env.META_APP_ID || DEFAULT_META_APP_ID;
}
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

type GraphResult<T> = { ok: true; data: T } | { ok: false; error: string; code: number | null; status: number };

interface GraphError {
  error?: { message?: string; code?: number; error_subcode?: number; type?: string };
}

async function graphCall<T>(
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: string; token?: string },
): Promise<GraphResult<T>> {
  const { token, ...rest } = init;
  const res = await providerFetch("meta", `${GRAPH}${path}`, {
    ...rest,
    headers: { ...(rest.headers ?? {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    timeoutMs: GRAPH_TIMEOUT_MS,
  });
  if (res.status === 0) return { ok: false, error: String(res.error), code: null, status: 0 };
  const body = (res.json !== null && typeof res.json === "object" ? res.json : {}) as T & GraphError;
  if (res.outcome !== "ok" || body.error) {
    return {
      ok: false,
      error: body.error?.message ?? `graph ${res.status}`,
      code: body.error?.code ?? null,
      status: res.status,
    };
  }
  return { ok: true, data: body };
}

/** The Embedded Signup code, exchanged for the business's own token. */
export function exchangeCode(
  appId: string,
  appSecret: string,
  code: string,
): Promise<GraphResult<{ access_token: string; token_type?: string }>> {
  const qs = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
  return graphCall(`/oauth/access_token?${qs}`, { method: "GET" });
}

interface PhoneNumberInfo {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  platform_type?: string;
}

/** The number as Meta holds it: its display form, its verified name, its quality. */
export function phoneNumber(token: string, phoneNumberId: string): Promise<GraphResult<PhoneNumberInfo>> {
  return graphCall(
    `/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`,
    { method: "GET", token },
  );
}

/** The WABA, to prove the token sees it. */
export function wabaInfo(token: string, wabaId: string): Promise<GraphResult<{ id: string; name?: string }>> {
  return graphCall(`/${encodeURIComponent(wabaId)}?fields=id,name`, { method: "GET", token });
}

/** What Meta's introspection says a token was granted: each permission, and the ids it was granted on. */
interface TokenGrants {
  data?: {
    is_valid?: boolean;
    granular_scopes?: { scope?: string; target_ids?: (string | number)[] }[];
  };
}

/**
 * The business token, read back by Meta's introspection as the app this deployment speaks for (`debug_token` takes the
 * app's own token, `app_id|app_secret`; the secret rides in the header, never in the URL). What comes back names the
 * WhatsApp accounts the sign-up granted, the newest first.
 */
export function tokenGrants(appId: string, appSecret: string, token: string): Promise<GraphResult<TokenGrants>> {
  const qs = new URLSearchParams({ input_token: token });
  return graphCall(`/debug_token?${qs}`, { method: "GET", token: `${appId}|${appSecret}` });
}

/** The WABAs a token was granted management of, newest first (Meta's own order), as the ids the Graph takes. */
export function wabaIdsGranted(grants: TokenGrants): string[] {
  const scope = (grants.data?.granular_scopes ?? []).find((s) => s.scope === "whatsapp_business_management");
  return (scope?.target_ids ?? []).map(String).filter((id) => /^\d{6,32}$/.test(id));
}

/** The numbers a WABA holds, each as the number read is (phoneNumber). */
export function wabaPhoneNumbers(token: string, wabaId: string): Promise<GraphResult<{ data?: PhoneNumberInfo[] }>> {
  return graphCall(
    `/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`,
    { method: "GET", token },
  );
}

/** Meta's text cut to what an owner reads and a row keeps: a sentence, never a page. */
const STANDING_TEXT_MAX = 300;
/** The most problems, and the most notes, one standing keeps. */
const STANDING_LIST_MAX = 10;
/** What a read says when Meta answered and the answer holds no word for what the number may do (a Graph result's own sentence, never a refusal's code). */
const NO_HEALTH_STATUS = "the answer holds no health_status";

const graphRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const graphList = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);
const graphText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, STANDING_TEXT_MAX) : null;

/** Whether an answer holds a value that says something: text that is not blank, or a number (Meta's ids come as text, and as numbers in some answers). */
const graphPresent = (v: unknown): boolean => typeof v === "number" || graphText(v) !== null;

/** What the account said, one answer to each thing asked of it apart: the data Meta answered, or null where it refused or was not asked. */
interface AccountAnswers {
  verification: unknown;
  funding: unknown;
  owner: unknown;
}

/**
 * Meta's answers as a standing: the phone's `health_status` (the word for whether it may send, and every entity's errors and
 * `additional_info`), its display name and the name's review, and the account's verification and tier, whether it has a payment
 * method (its `primary_funding_id` is there) and the business that owns it. Null where the phone's answer holds no `health_status`
 * with a word for it: that is a read that failed, never a standing guessed. What Meta said is kept as it said it (the word for
 * `can_send_message` upper-cased; text trimmed and cut; lists cut). An account read that failed leaves what it held null. A funding
 * answer with no funding id is a payment method that is missing; a funding read that failed is one that is unknown, never missing.
 */
function standingFromGraph(phone: unknown, account: AccountAnswers, wabaId: string | null): NumberStanding | null {
  const p = graphRecord(phone);
  const health = graphRecord(p?.health_status);
  const canSend = graphText(health?.can_send_message)?.toUpperCase();
  if (!p || !health || !canSend) return null;
  const problems: NumberStanding["problems"] = [];
  const notes: string[] = [];
  for (const raw of graphList(health.entities)) {
    const entity = graphRecord(raw);
    if (!entity) continue;
    const kind = graphText(entity.entity_type) ?? "UNKNOWN";
    for (const e of graphList(entity.errors)) {
      const error = graphRecord(e);
      const said = graphText(error?.error_description);
      if (!error || !said) continue;
      problems.push({
        entity: kind,
        code: typeof error.error_code === "number" ? error.error_code : null,
        said,
        fix: graphText(error.possible_solution),
      });
    }
    for (const info of graphList(entity.additional_info)) {
      const note = graphText(info);
      if (note && !notes.includes(note)) notes.push(note);
    }
  }
  const w = graphRecord(account.verification);
  const funding = graphRecord(account.funding);
  const owner = graphRecord(graphRecord(account.owner)?.owner_business_info);
  return {
    can_send: canSend,
    problems: problems.slice(0, STANDING_LIST_MAX),
    notes: notes.slice(0, STANDING_LIST_MAX),
    name: graphText(p.verified_name),
    name_status: graphText(p.name_status),
    verification: graphText(w?.business_verification_status),
    limit: graphText(w?.whatsapp_business_manager_messaging_limit),
    has_payment_method: funding ? graphPresent(funding.primary_funding_id) : null,
    owner_business_id: graphText(owner?.id),
    waba_id: wabaId,
  };
}

/**
 * What Meta holds about a connected number now: may it send (AVAILABLE, LIMITED or BLOCKED, and what stands in the way), how its
 * display name's review fares, whether the business is verified and at which tier, whether the account has a payment method and
 * which business owns it. Four reads together with the business's own token: the phone's, and three of the account's, asked
 * apart so that one Meta refuses (a permission the token lacks, a field the node does not have) costs only what it held. A
 * number with no account on file asks only the phone; a phone that cannot be read, or answers nothing about what it may do,
 * is the failed read it is.
 */
export async function numberStanding(
  token: string,
  phoneNumberId: string,
  wabaId: string | null,
): Promise<GraphResult<NumberStanding>> {
  const account = (fields: string) =>
    wabaId
      ? graphCall<unknown>(`/${encodeURIComponent(wabaId)}?fields=${fields}`, { method: "GET", token })
      : Promise.resolve(null);
  const [phone, verification, funding, owner] = await Promise.all([
    graphCall<unknown>(`/${encodeURIComponent(phoneNumberId)}?fields=health_status,name_status,verified_name`, {
      method: "GET",
      token,
    }),
    account("business_verification_status,whatsapp_business_manager_messaging_limit"),
    account("primary_funding_id"),
    account("owner_business_info{id}"),
  ]);
  if (!phone.ok) return phone;
  const standing = standingFromGraph(
    phone.data,
    {
      verification: verification?.ok ? verification.data : null,
      funding: funding?.ok ? funding.data : null,
      owner: owner?.ok ? owner.data : null,
    },
    wabaId,
  );
  return standing ? { ok: true, data: standing } : { ok: false, error: NO_HEALTH_STATUS, code: null, status: 200 };
}

/** Subscribe this app to the WABA's webhooks; without it, its messages never reach us. */
export function subscribeWaba(token: string, wabaId: string): Promise<GraphResult<{ success?: boolean }>> {
  return graphCall(`/${encodeURIComponent(wabaId)}/subscribed_apps`, { method: "POST", token });
}

/**
 * Register the number for Cloud API messaging with a two-step PIN. A number
 * that is already registered answers with an error the caller may treat as
 * done; the PIN is kept with the credentials so a re-registration can reuse it.
 */
export function registerNumber(
  token: string,
  phoneNumberId: string,
  pin: string,
): Promise<GraphResult<{ success?: boolean }>> {
  return graphCall(`/${encodeURIComponent(phoneNumberId)}/register`, {
    method: "POST",
    token,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
}

/** Meta's own words for a registration that had already happened. */
export function alreadyRegistered(r: GraphResult<unknown>): boolean {
  return !r.ok && /already registered|already been registered/i.test(r.error);
}

/**
 * Meta's answer when the number has two-step verification on and the PIN
 * offered is not its PIN (code 133005). Registration cannot proceed
 * without that PIN, and this flow never asks for one.
 */
export function pinMismatch(r: GraphResult<unknown>): boolean {
  return !r.ok && (r.code === 133005 || /pin mismatch/i.test(r.error));
}

/** A six-digit PIN from the platform's randomness. */
export function newPin(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(100000 + ((n[0] ?? 0) % 900000));
}

/** +15551234567 out of Meta's "+1 555-123-4567". */
export function toE164(display: string | undefined): string | null {
  if (!display) return null;
  const digits = display.replace(/[^\d]/g, "");
  return digits.length >= 7 ? `+${digits}` : null;
}
