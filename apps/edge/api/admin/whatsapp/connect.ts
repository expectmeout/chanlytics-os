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
import { authorizeAdmin, workspaceFor } from "../../../lib/admin-auth.js";
import { pg } from "../../../lib/pg.js";
import { emitEvent } from "../../../lib/packages/db.js";
import type { Json } from "../../../lib/packages/db.js";
import {
  alreadyRegistered,
  exchangeCode,
  metaAppId,
  newPin,
  phoneNumber,
  pinMismatch,
  registerNumber,
  subscribeWaba,
  toE164,
  wabaInfo,
} from "../../../lib/whatsapp/meta-graph.js";
import { env } from "../../../lib/env.js";
import { logger } from "../../../lib/log.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^\d{6,32}$/;

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/whatsapp/connect");
  if (!auth.ok) return auth.response;
  const appId = metaAppId();
  const appSecret = env.META_APP_SECRET;
  if (!appId || !appSecret) return json(503, { ok: false, error: "no_app_credentials" });

  let body: { tenant_id?: string; user_id?: string; code?: string; phone_number_id?: string; waba_id?: string } = {};
  try {
    body = JSON.parse(await request.text());
  } catch {
    /* below */
  }
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = String(body.tenant_id || "");
  const userId = String(body.user_id || "");
  const code = String(body.code || "").trim();
  const phoneNumberId = String(body.phone_number_id || "").trim();
  const wabaId = String(body.waba_id || "").trim();
  if (
    !UUID.test(tenantId) ||
    !UUID.test(userId) ||
    !code ||
    code.length > 2000 ||
    !ID.test(phoneNumberId) ||
    !ID.test(wabaId)
  ) {
    return json(400, { ok: false, error: "tenant_id, user_id, code, phone_number_id and waba_id required" });
  }
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });

  const L = logger({ tenant: tenantId, phone_number_id: phoneNumberId, waba_id: wabaId });

  // A number already connected to another workspace is not connected twice.
  // The ERROR is read, not just the row: (kind, external_id) is unique, so the
  // upsert below is an UPDATE of whatever row holds this number — including
  // another workspace's, whose tenant_id and Vault token it would rewrite. A
  // read that failed says nothing about who holds the number, and treating it
  // as "nobody" is how a pooler blip moved a live number between workspaces.
  const { data: taken, error: takenErr } = await db
    .from("tenant_channels")
    .select("id, tenant_id")
    .eq("kind", "whatsapp")
    .eq("external_id", phoneNumberId)
    .maybeSingle();
  if (takenErr) {
    L.info("wa_connect_channel_read_failed", { error: takenErr.message });
    return json(503, { ok: false, error: "channel_read_failed" });
  }
  if (taken && taken.tenant_id !== tenantId) {
    L.info("wa_connect_number_taken");
    return json(409, { ok: false, error: "number_taken" });
  }

  // 1. The code becomes the business's token.
  const tok = await exchangeCode(appId, appSecret, code);
  if (!tok.ok) {
    L.info("wa_connect_exchange_failed", { error: tok.error, code: tok.code });
    return json(502, { ok: false, error: "exchange_failed", detail: tok.error });
  }
  const token = tok.data.access_token;

  // 2. The number, as Meta holds it, and the WABA it belongs to.
  const [num, waba] = await Promise.all([phoneNumber(token, phoneNumberId), wabaInfo(token, wabaId)]);
  if (!num.ok) {
    L.info("wa_connect_number_unreadable", { error: num.error });
    return json(502, { ok: false, error: "number_unreadable", detail: num.error });
  }
  if (!waba.ok) {
    L.info("wa_connect_waba_unreadable", { error: waba.error });
    return json(502, { ok: false, error: "waba_unreadable", detail: waba.error });
  }
  const e164 = toE164(num.data.display_phone_number);

  // 3. The WABA's webhooks reach this app.
  const sub = await subscribeWaba(token, wabaId);
  if (!sub.ok) {
    L.info("wa_connect_subscribe_failed", { error: sub.error });
    return json(502, { ok: false, error: "subscribe_failed", detail: sub.error });
  }

  // 4. Registered for Cloud API messaging. Registration belongs to the
  // number, not to the app: a number Meta already reports on Cloud API is
  // left alone, since re-registering it with a fresh PIN would only trip its
  // two-step verification. A fresh number gets a PIN we keep. A number whose
  // own PIN stands in the way is named as such, not as a generic failure.
  const onCloud = num.data.platform_type === "CLOUD_API";
  const pin = onCloud ? null : newPin();
  const reg = pin ? await registerNumber(token, phoneNumberId, pin) : null;
  if (reg && !reg.ok && !alreadyRegistered(reg)) {
    L.info("wa_connect_register_failed", { error: reg.error, code: reg.code });
    return json(502, { ok: false, error: pinMismatch(reg) ? "pin_required" : "register_failed", detail: reg.error });
  }
  const registration = reg?.ok ? "registered" : "already_registered";

  // 5. The channel row: routing key, number, WABA, and what Meta calls it.
  const config = {
    verified_name: num.data.verified_name ?? null,
    quality_rating: num.data.quality_rating ?? null,
    waba_name: waba.data.name ?? null,
    connected_at: new Date().toISOString(),
    connected_by: userId,
    registration,
  };
  // Scoped to THIS workspace on the way in, so the write cannot cross a tenant
  // even if the read above was answered wrongly: the update touches only a row
  // this workspace already owns, and the insert that follows a miss trips the
  // unique index (23505) when the number belongs to someone else.
  const fields = {
    tenant_id: tenantId,
    kind: "whatsapp" as const,
    external_id: phoneNumberId,
    number_e164: e164,
    waba_id: wabaId,
    status: "active",
    config: config as unknown as Json,
  };
  const mine = await db
    .from("tenant_channels")
    .update(fields)
    .eq("kind", "whatsapp")
    .eq("external_id", phoneNumberId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();
  let row = mine.data;
  let upErr = mine.error;
  if (!upErr && !row) {
    const made = await db.from("tenant_channels").insert(fields).select("id").single();
    if (made.error?.code === "23505") {
      // Somebody got there between the read and the insert. Whose it is
      // decides the answer: another workspace's is the 409 this door exists to
      // give, but this workspace's own is a double-submit — the owner ran
      // Embedded Signup twice because the first attempt's four Graph calls
      // outlasted their patience — and telling them their own number belongs
      // to somebody else would be a worse answer than the upsert used to give.
      const mineNow = await db
        .from("tenant_channels")
        .select("id, tenant_id")
        .eq("kind", "whatsapp")
        .eq("external_id", phoneNumberId)
        .maybeSingle();
      if (mineNow.data?.tenant_id === tenantId) {
        L.info("wa_connect_raced_self");
        row = { id: mineNow.data.id };
      } else {
        L.info("wa_connect_number_taken", { at: "insert" });
        return json(409, { ok: false, error: "number_taken" });
      }
    } else {
      row = made.data;
      upErr = made.error;
    }
  }
  if (upErr || !row) {
    L.info("wa_connect_channel_write_failed", { error: upErr?.message });
    return json(500, { ok: false, error: "channel_write_failed" });
  }

  // 6. The token, in Vault, through the one door that writes a credential.
  const { error: credErr } = await db.rpc("put_channel_credentials", {
    p_channel_id: row.id,
    p_secret: { access_token: token, phone_id: phoneNumberId, pin, waba_id: wabaId } as unknown as Json,
  });
  if (credErr) {
    L.info("wa_connect_credentials_failed", { error: credErr.message });
    // Without credentials the row would ride the environment token: not this business's. Disable it.
    await db.from("tenant_channels").update({ status: "disabled" }).eq("id", row.id);
    return json(500, { ok: false, error: "credentials_failed" });
  }

  await emitEvent(db, tenantId, "channel.connected", "system", "channel", row.id, {
    kind: "whatsapp",
    phone_number_id: phoneNumberId,
    waba_id: wabaId,
    number_e164: e164,
    verified_name: config.verified_name,
    by: userId,
  } as unknown as Json).catch(() => {});
  L.info("wa_connected", { channel_id: row.id, number: e164, registration: config.registration });
  return json(200, {
    ok: true,
    channel_id: row.id,
    number_e164: e164,
    verified_name: config.verified_name,
    quality_rating: config.quality_rating,
    registration: config.registration,
  });
}
