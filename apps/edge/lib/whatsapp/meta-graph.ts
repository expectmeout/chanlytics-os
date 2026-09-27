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

async function call<T>(path: string, init: RequestInit & { token?: string }): Promise<GraphResult<T>> {
  const { token, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${GRAPH}${path}`, {
      ...rest,
      headers: { ...(rest.headers ?? {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), code: null, status: 0 };
  }
  const body = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || body.error) {
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
  return call(`/oauth/access_token?${qs}`, { method: "GET" });
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
  return call(
    `/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`,
    { method: "GET", token },
  );
}

/** The WABA, to prove the token sees it. */
export function wabaInfo(token: string, wabaId: string): Promise<GraphResult<{ id: string; name?: string }>> {
  return call(`/${encodeURIComponent(wabaId)}?fields=id,name`, { method: "GET", token });
}

/** Subscribe this app to the WABA's webhooks; without it, its messages never reach us. */
export function subscribeWaba(token: string, wabaId: string): Promise<GraphResult<{ success?: boolean }>> {
  return call(`/${encodeURIComponent(wabaId)}/subscribed_apps`, { method: "POST", token });
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
  return call(`/${encodeURIComponent(phoneNumberId)}/register`, {
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
  return String(100000 + (n[0] % 900000));
}

/** +15551234567 out of Meta's "+1 555-123-4567". */
export function toE164(display: string | undefined): string | null {
  if (!display) return null;
  const digits = display.replace(/[^\d]/g, "");
  return digits.length >= 7 ? `+${digits}` : null;
}
