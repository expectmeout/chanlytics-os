/**
 * The one-time codes texted to a workspace's own line, read from the provider's own record, for the Connections page
 * (GET /api/admin/lines/codes; the dashboard's GET /api/v1/lines/codes is its sole caller).
 *
 * Meta texts a code to the number an owner connects to WhatsApp, and when that number is the workspace's own Chanlytics line
 * the text reaches the line like a customer's: the receptionist never answers it and nothing is made of it
 * (lib/sms/sms-ingress.ts), so the owner could not see it. It is read here, from the provider (recentTexts: the account's
 * own list of the messages to the line's number), narrowed to the codes of the last fifteen minutes by the one rule that says
 * what a code is (lineCodesFrom), and answered { code, from, at } newest first, at most three. Chanlytics never stores a code
 * and this writes nothing; the answer carries no other text, and a failed read is a line that names the workspace and never
 * what a text said (line_codes_read_failed).
 *
 * A workspace with no line of ours, a line the business kept at its carrier, a line whose subaccount or token is missing and
 * a line of another provider than this deployment's (a preview's dry line on a deployment that texts through Twilio) have no
 * texts to read: each answers an empty list, not an error, and the provider is not asked.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { json, refuse } from "../http.js";
import { tokenWorkspace, type Admitted } from "../admin-auth.js";
import { errorMessage } from "../admin-door.js";
import { pg } from "../pg.js";
import { errField, logger } from "../log.js";
import { lineCodesFrom, type ProviderAccount } from "../packages/channels.js";
import { LINE_CODES_WITHIN_MS, UUID } from "../packages/contracts.js";
import { ownLineOf, type Database } from "../packages/db.js";
import { lineAccount } from "../sms/sms.js";
import { lineProviderFromEnv } from "./lines.js";

/**
 * The workspace's own line, its number and the account it is read as, or null where there is nothing to read: no line, one that has
 * no number yet (provisioning has not reached it, so no text can have been sent to it) or one whose account cannot be had.
 */
async function ownLineAccount(db: SupabaseClient<Database>, tenantId: string) {
  const line = await ownLineOf(db, tenantId);
  const acct: ProviderAccount | null = line ? await lineAccount(db, line) : null;
  return line && line.e164 && acct ? { line, number: line.e164, acct } : null;
}

/** GET /api/admin/lines/codes: the codes sent to the token's workspace's own line lately. */
export async function lineCodes(auth: Admitted): Promise<Response> {
  const tenantId = tokenWorkspace(auth);
  if (!tenantId || !UUID.test(tenantId)) return refuse(400, "bad_tenant");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const held = await ownLineAccount(db, tenantId).catch((e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  );
  if (held instanceof Error) return refuse(503, "read_failed", held.message);
  if (!held) return json(200, { ok: true, codes: [] });
  const choice = lineProviderFromEnv();
  if (!choice) return refuse(503, "no_line_provider");
  if (choice.name !== held.line.provider) return json(200, { ok: true, codes: [] });
  const now = Date.now();
  try {
    const texts = await choice.provider.recentTexts(held.acct, held.number, now - LINE_CODES_WITHIN_MS);
    return json(200, { ok: true, codes: lineCodesFrom(texts, now) });
  } catch (e) {
    logger({ tenant_id: tenantId }).warn("line_codes_read_failed", { error: errField(e) });
    return refuse(502, "provider_refused", errorMessage(e));
  }
}
