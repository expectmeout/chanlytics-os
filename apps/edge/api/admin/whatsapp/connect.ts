/**
 * POST /api/admin/whatsapp/connect — a business's WhatsApp number becomes a
 * channel of its workspace.
 *
 * The dashboard, having checked that the caller owns the workspace, sends
 * what Embedded Signup gave the browser: the one-time code and the ids of
 * the WABA and the phone number the business chose. This edge holds the
 * app secret and the service role, so it does the rest: the code becomes
 * the business's own token, the number is read back and proven to be the
 * WABA's, the app subscribes to the WABA, the number is registered for
 * Cloud API messaging, the channel row is written, and the token goes into
 * Vault through the one function that may write a credential. From then on
 * the receptionist answers on this number with this business's token, never
 * the environment's.
 *
 * Diagnostic-key only: the dashboard is the sole caller, as for steer.
 */
import { json } from "../../../lib/http.js";
import { pg } from "../../../lib/pg.js";
import { emitEvent } from "../../../lib/workspace/db.js";
import type { Json } from "../../../lib/workspace/db.js";
import { alreadyRegistered, exchangeCode, newPin, phoneNumber, registerNumber, subscribeWaba, toE164, wabaInfo } from "../../../lib/meta-graph.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^\d{6,32}$/;

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return json(503, { ok: false, error: "no_app_credentials" });

  let body: { tenant_id?: string; user_id?: string; code?: string; phone_number_id?: string; waba_id?: string } = {};
  try { body = JSON.parse(await request.text()); } catch { /* below */ }
  const tenantId = String(body.tenant_id || "");
  const userId = String(body.user_id || "");
  const code = String(body.code || "").trim();
  const phoneNumberId = String(body.phone_number_id || "").trim();
  const wabaId = String(body.waba_id || "").trim();
  if (!UUID.test(tenantId) || !UUID.test(userId) || !code || code.length > 2000 || !ID.test(phoneNumberId) || !ID.test(wabaId)) {
    return json(400, { ok: false, error: "tenant_id, user_id, code, phone_number_id and waba_id required" });
  }
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });

  const log = (event: string, extra: Record<string, unknown> = {}) =>
    console.log(event, JSON.stringify({ tenant: tenantId, phone_number_id: phoneNumberId, waba_id: wabaId, ...extra }));

  // A number already connected to another workspace is not connected twice.
  const { data: taken } = await db.from("tenant_channels").select("id, tenant_id").eq("kind", "whatsapp").eq("external_id", phoneNumberId).maybeSingle();
  if (taken && taken.tenant_id !== tenantId) {
    log("wa_connect_number_taken");
    return json(409, { ok: false, error: "number_taken" });
  }

  // 1. The code becomes the business's token.
  const tok = await exchangeCode(appId, appSecret, code);
  if (!tok.ok) {
    log("wa_connect_exchange_failed", { error: tok.error, code: tok.code });
    return json(502, { ok: false, error: "exchange_failed", detail: tok.error });
  }
  const token = tok.data.access_token;

  // 2. The number, as Meta holds it, and the WABA it belongs to.
  const [num, waba] = await Promise.all([phoneNumber(token, phoneNumberId), wabaInfo(token, wabaId)]);
  if (!num.ok) {
    log("wa_connect_number_unreadable", { error: num.error });
    return json(502, { ok: false, error: "number_unreadable", detail: num.error });
  }
  if (!waba.ok) {
    log("wa_connect_waba_unreadable", { error: waba.error });
    return json(502, { ok: false, error: "waba_unreadable", detail: waba.error });
  }
  const e164 = toE164(num.data.display_phone_number);

  // 3. The WABA's webhooks reach this app.
  const sub = await subscribeWaba(token, wabaId);
  if (!sub.ok) {
    log("wa_connect_subscribe_failed", { error: sub.error });
    return json(502, { ok: false, error: "subscribe_failed", detail: sub.error });
  }

  // 4. Registered for Cloud API messaging, with a PIN we keep.
  const pin = newPin();
  const reg = await registerNumber(token, phoneNumberId, pin);
  const registered = reg.ok || alreadyRegistered(reg);
  if (!registered) {
    log("wa_connect_register_failed", { error: reg.error, code: reg.code });
    return json(502, { ok: false, error: "register_failed", detail: reg.error });
  }

  // 5. The channel row: routing key, number, WABA, and what Meta calls it.
  const config = {
    verified_name: num.data.verified_name ?? null,
    quality_rating: num.data.quality_rating ?? null,
    waba_name: waba.data.name ?? null,
    connected_at: new Date().toISOString(),
    connected_by: userId,
    registration: reg.ok ? "registered" : "already_registered",
  };
  const { data: row, error: upErr } = await db
    .from("tenant_channels")
    .upsert(
      { tenant_id: tenantId, kind: "whatsapp", external_id: phoneNumberId, number_e164: e164, waba_id: wabaId, status: "active", config: config as unknown as Json },
      { onConflict: "kind,external_id" },
    )
    .select("id")
    .single();
  if (upErr || !row) {
    log("wa_connect_channel_write_failed", { error: upErr?.message });
    return json(500, { ok: false, error: "channel_write_failed" });
  }

  // 6. The token, in Vault, through the one door that writes a credential.
  const { error: credErr } = await db.rpc("put_channel_credentials", {
    p_channel_id: row.id,
    p_secret: { access_token: token, phone_id: phoneNumberId, pin, waba_id: wabaId } as unknown as Json,
  });
  if (credErr) {
    log("wa_connect_credentials_failed", { error: credErr.message });
    // Without credentials the row would ride the environment token: not this business's. Disable it.
    await db.from("tenant_channels").update({ status: "disabled" }).eq("id", row.id);
    return json(500, { ok: false, error: "credentials_failed" });
  }

  await emitEvent(db, tenantId, "channel.connected", "system", "channel", row.id, {
    kind: "whatsapp", phone_number_id: phoneNumberId, waba_id: wabaId, number_e164: e164, verified_name: config.verified_name, by: userId,
  } as unknown as Json).catch(() => {});
  log("wa_connected", { channel_id: row.id, number: e164, registration: config.registration });
  return json(200, { ok: true, channel_id: row.id, number_e164: e164, verified_name: config.verified_name, quality_rating: config.quality_rating, registration: config.registration });
}
