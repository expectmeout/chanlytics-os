/**
 * Texting on the edge: the line a workspace texts through, its credentials
 * from the vault, and the one sender every outbound text goes through —
 * the receptionist's reply, a held draft fired later, a person's reply from
 * the Inbox. The provider is the same one the lines saga uses, so the dry
 * provider on a preview sends nothing and says so.
 *
 * Cross-workspace: an inbound text names only the number it reached, so its line is found by that number.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../packages/db.js";
import type { LineSecrets, ProviderAccount, ProviderReply, SendResult } from "../packages/channels.js";
import { answerObject, smsStatusUrl, smsRefusalOf, twilioRequest } from "../packages/channels.js";
import { lineProviderFromEnv } from "../lines/lines.js";
import { edgeFnUrl } from "../dashboard-origin.js";
import { logger, errField, type Logger } from "../log.js";
import { phoneTail, type EdgeRefusal } from "../packages/contracts.js";
import { wireUnavailable, type WireUnavailable } from "../packages/core.js";

type Db = SupabaseClient<Database>;
const SUBACCOUNT_READ_TIMEOUT_MS = 15000;
export type SmsLine = Pick<
  Database["public"]["Tables"]["lines"]["Row"],
  "id" | "tenant_id" | "e164" | "provider" | "subaccount_sid" | "messaging_service_sid" | "sms_state" | "voice_state"
>;

const COLS = "id, tenant_id, e164, provider, subaccount_sid, messaging_service_sid, sms_state, voice_state";

/** The line a text arrived on, by the number Twilio says it was sent to. */
export async function lineByNumber(db: Db, e164: string): Promise<SmsLine | null> {
  const { data, error } = await db
    .from("lines")
    .select(COLS)
    .eq("e164", e164)
    .neq("voice_state", "failed")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`reading the line for ${e164}: ${error.message}`);
  return data ?? null;
}

/** The line a workspace texts from: the one with a Messaging Service, newest first. */
async function smsLineForTenant(db: Db, tenantId: string): Promise<SmsLine | null> {
  const { data, error } = await db
    .from("lines")
    .select(COLS)
    .eq("tenant_id", tenantId)
    .not("messaging_service_sid", "is", null)
    .neq("voice_state", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`reading the texting line: ${error.message}`);
  return data ?? null;
}

/** The subaccount the line lives in, with its token from the vault. Null when either is missing. */
export async function lineAccount(db: Db, line: SmsLine): Promise<ProviderAccount | null> {
  if (!line.subaccount_sid) return null;
  const { data, error } = await db.rpc("get_line_credentials", { p_line_id: line.id });
  if (error) throw new Error(`reading the line's credentials: ${error.message}`);
  const s = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as LineSecrets;
  return s.auth_token ? { sid: line.subaccount_sid, token: s.auth_token } : null;
}

/**
 * What a failed read of a subaccount says, by what the call came to (provider-fetch's four outcomes) and never by
 * "it was not ok": a 401 or 403 is the one answer that means the platform's own credentials are wrong, and an operator
 * is sent to the master key for it and for nothing else. A 503, a 429, a timeout or a breaker held is the provider not
 * answering just now, which the next tick asks again; any other 4xx is the provider's no about this one subaccount.
 */
function refreshRefusal(L: Logger, r: ProviderReply): EdgeRefusal {
  if (r.outcome === "refused" && (r.status === 401 || r.status === 403)) {
    // The MASTER credentials are wrong, which is a different and worse fault:
    // nothing can be provisioned either. Said in those words so whoever reads
    // the log is not sent looking at the subaccount.
    L.error("line_token_refresh_refused", {
      status: r.status,
      note: "the platform's own Twilio credentials were refused",
    });
    return {
      ok: false,
      error: "provider_unauthorized",
      detail: `the provider refused the platform's credentials (HTTP ${r.status})`,
    };
  }
  if (r.outcome === "refused") {
    L.error("line_token_refresh_failed", { status: r.status, outcome: r.outcome });
    return {
      ok: false,
      error: "provider_refused",
      detail: `the provider would not give this line's subaccount token (HTTP ${r.status})`,
    };
  }
  // Nothing says the platform's key is wrong: the read got no answer, or a gateway's. The next check asks again.
  L.warn("line_token_refresh_failed", { status: r.status, outcome: r.outcome, reason: r.error });
  const heard = r.status ? `HTTP ${r.status}` : (r.error ?? "no answer");
  return {
    ok: false,
    error: "unavailable",
    detail: `the provider could not be asked just now (${heard}); the next check asks again`,
  };
}

/**
 * Re-read a line's subaccount token from the provider and put it back in the Vault.
 *
 * A subaccount's auth token can be rotated in the Twilio console at any moment,
 * and our copy is dead the instant it is. Nothing noticed: every provider call
 * for that line answers 401, and the call that mattered most -- the hourly read
 * of where the carrier registration stands -- turned an unanswerable question
 * into "the carriers have not answered yet". The line would have sat in
 * `registering` for ever with nothing wrong on any page.
 *
 * The parent account can read its own subaccounts' tokens, which is how the
 * saga obtained this one in the first place. So the platform can heal itself
 * rather than wait for somebody to notice and paste a secret.
 *
 * Returns the new account on success. Never throws: a failure is a verdict the
 * caller reports, its code in `error` and what happened in `detail`.
 */
export async function refreshLineToken(
  db: Db,
  line: SmsLine,
): Promise<{ ok: true; account: ProviderAccount } | EdgeRefusal> {
  if (!line.subaccount_sid) return { ok: false, error: "no_subaccount" };
  const choice = lineProviderFromEnv();
  if (!choice || choice.name !== "twilio") return { ok: false, error: "no_provider" };
  const L = logger({ tenant_id: line.tenant_id, line_id: line.id });
  const master = choice.master;
  const r = await twilioRequest(
    master,
    "GET",
    `https://api.twilio.com/2010-04-01/Accounts/${line.subaccount_sid}.json`,
    {
      timeoutMs: SUBACCOUNT_READ_TIMEOUT_MS,
    },
  );
  if (r.outcome !== "ok") return refreshRefusal(L, r);
  const body = answerObject(r) as { auth_token?: unknown } | null;
  const token = typeof body?.auth_token === "string" && body.auth_token ? body.auth_token : null;
  if (!token)
    return { ok: false, error: "no_token", detail: "the provider did not return a token for this subaccount" };
  const { error } = await db.rpc("put_line_credentials", {
    p_line_id: line.id,
    p_secret: { auth_token: token } as unknown as Json,
  });
  if (error) return { ok: false, error: "write_failed", detail: `storing the refreshed token: ${error.message}` };
  L.info("line_token_refreshed", { subaccount: line.subaccount_sid });
  return { ok: true, account: { sid: line.subaccount_sid, token } };
}

export interface SmsSender {
  send(to: string, body: string): Promise<SendResult>;
}

/**
 * The sender for one line. `wamid` carries the provider's message id under
 * the name the WhatsApp path gave it, so every caller records it the same
 * way; `code` carries the provider's own error code, so the send door (core
 * deliver.ts) can tell the carrier's no on the person's behalf -- Twilio
 * 21610, the person replied STOP to this number (channels smsRefusalOf) --
 * from a failure of ours. The first is said here as the person's refusal,
 * the second as our failure: alerting greps the second.
 */
export function smsSenderFor(line: SmsLine, acct: ProviderAccount): SmsSender | null {
  const choice = lineProviderFromEnv();
  if (!choice || !line.messaging_service_sid) return null;
  const serviceSid = line.messaging_service_sid;
  const L = logger({ tenant_id: line.tenant_id, line_id: line.id });
  return {
    async send(to, body) {
      // The carrier's word comes back to /api/sms-status, signed with this line's own token, and lands on the row by its sid.
      const r = await choice.provider.sendSms(acct, {
        serviceSid,
        to,
        body,
        statusCallback: smsStatusUrl(edgeFnUrl()),
      });
      if (r.ok) L.info("sms_sent", { to_tail: phoneTail(to), sid: r.sid });
      else if (smsRefusalOf(r)) L.info("sms_send_refused", { to_tail: phoneTail(to), status: r.status, code: r.code });
      else L.error("sms_send_failed", { to_tail: phoneTail(to), status: r.status, code: r.code });
      return {
        ok: r.ok,
        wamid: r.sid,
        status: r.status,
        code: r.code,
        errorBody: r.ok ? undefined : `Twilio ${r.code ?? r.status}`,
        ...(r.outcome ? { outcome: r.outcome } : {}),
      };
    },
  };
}

/**
 * The sender a job runner injects for a tenant: nothing when the workspace has no texting line yet, or its line
 * carries no credentials -- a refusal at the door. A read that FAILED (the lines table, the vault) is neither: the line
 * may well be there, so the wire could not be bound (core WireUnavailable), and a reply waits for a heartbeat that
 * can read it instead of failing for good and flagging a thread over a blip.
 */
export async function smsSenderForTenant(db: Db, tenantId: string): Promise<SmsSender | null | WireUnavailable> {
  try {
    const line = await smsLineForTenant(db, tenantId);
    if (!line) return null;
    const acct = await lineAccount(db, line);
    return acct ? smsSenderFor(line, acct) : null;
  } catch (e) {
    logger({ tenant_id: tenantId }).error("sms_sender_unavailable", { error: errField(e) });
    return wireUnavailable(errField(e));
  }
}
