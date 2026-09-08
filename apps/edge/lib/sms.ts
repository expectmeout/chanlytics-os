/**
 * Texting on the edge: the line a workspace texts through, its credentials
 * from the vault, and the one sender every outbound text goes through —
 * the receptionist's reply, a held draft fired later, a person's reply from
 * the Inbox. The provider is the same one the lines saga uses, so the dry
 * provider on a preview sends nothing and says so.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import type { LineSecrets, ProviderAccount } from "./workspace/channels.js";
import { lineProviderFromEnv } from "./lines.js";
import { logger } from "./log.js";

type Db = SupabaseClient<Database>;
export type SmsLine = Pick<Database["public"]["Tables"]["lines"]["Row"], "id" | "tenant_id" | "e164" | "provider" | "subaccount_sid" | "messaging_service_sid" | "sms_state" | "voice_state">;

const COLS = "id, tenant_id, e164, provider, subaccount_sid, messaging_service_sid, sms_state, voice_state";

/** The line a text arrived on, by the number Twilio says it was sent to. */
export async function lineByNumber(db: Db, e164: string): Promise<SmsLine | null> {
  const { data, error } = await db.from("lines").select(COLS).eq("e164", e164).neq("voice_state", "failed").limit(1).maybeSingle();
  if (error) throw new Error(`reading the line for ${e164}: ${error.message}`);
  return data ?? null;
}

/** The line a workspace texts from: the one with a Messaging Service, newest first. */
export async function smsLineForTenant(db: Db, tenantId: string): Promise<SmsLine | null> {
  const { data, error } = await db.from("lines").select(COLS).eq("tenant_id", tenantId).not("messaging_service_sid", "is", null).neq("voice_state", "failed")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
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

export interface SmsSender {
  send(to: string, body: string): Promise<{ ok: boolean; wamid: string | null; status: number; errorBody?: string }>;
}

/**
 * The sender for one line. `wamid` carries the provider's message id under
 * the name the WhatsApp path gave it, so every caller records it the same
 * way. Twilio 21610 (the person opted out at the carrier) is reported as a
 * refusal, not a failure of ours.
 */
export function smsSenderFor(line: SmsLine, acct: ProviderAccount): SmsSender | null {
  const choice = lineProviderFromEnv();
  if (!choice || !line.messaging_service_sid) return null;
  const serviceSid = line.messaging_service_sid;
  const L = logger({ tenant_id: line.tenant_id, line_id: line.id });
  return {
    async send(to, body) {
      const r = await choice.provider.sendSms(acct, { serviceSid, to, body });
      if (r.ok) L.info("sms_sent", { to, sid: r.sid });
      else L.error("sms_send_failed", { to, status: r.status, code: r.code });
      return { ok: r.ok, wamid: r.sid, status: r.status, errorBody: r.ok ? undefined : `Twilio ${r.code ?? r.status}` };
    },
  };
}

/** The sender a job runner injects for a tenant: nothing when the workspace has no texting line yet. */
export async function smsSenderForTenant(db: Db, tenantId: string): Promise<SmsSender | null> {
  try {
    const line = await smsLineForTenant(db, tenantId);
    if (!line) return null;
    const acct = await lineAccount(db, line);
    return acct ? smsSenderFor(line, acct) : null;
  } catch (e) {
    console.error("sms_sender_unavailable", e instanceof Error ? e.message : String(e));
    return null;
  }
}
