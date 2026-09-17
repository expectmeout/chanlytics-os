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
 */
import type { SendResult } from "./whatsapp";
import type { EmailRequest } from "./email";

export interface ResendConfig {
  apiKey: string;
}

const RESEND_EMAILS = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 15_000;

export async function sendEmail(cfg: ResendConfig, request: EmailRequest): Promise<SendResult> {
  const { idempotency_key, ...body } = request;
  try {
    const r = await fetch(RESEND_EMAILS, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotency_key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const raw = await r.text().catch(() => "");
    if (r.ok) {
      const id = (() => { try { return (JSON.parse(raw) as { id?: unknown }).id; } catch { return null; } })();
      // Accepted with no id is still accepted: the words are with the provider,
      // and the receipt finds the row by its tag, not by this id.
      return { ok: true, wamid: typeof id === "string" ? id : null, status: r.status };
    }
    return { ok: false, wamid: null, status: r.status, errorBody: raw.slice(0, 500) };
  } catch (e) {
    // status 0: never reached the provider, which is distinct from any answer it gave.
    return { ok: false, wamid: null, status: 0, errorBody: e instanceof Error ? e.message : String(e) };
  }
}
