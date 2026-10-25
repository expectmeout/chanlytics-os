/**
 * POST /api/admin/whatsapp/connect — a business's WhatsApp number becomes a
 * channel of its workspace.
 *
 * The door is api/admin/whatsapp/connect.ts: it checks who may knock (authorizeAdmin) and reads the body, then hands
 * this the knock (`auth`) and what the body carried; everything after is here, in the order the door had it.
 *
 * The dashboard, having checked that the caller owns the workspace, sends
 * what Embedded Signup gave the browser: the one-time code and, where the
 * browser heard them, the ids of the WABA and the phone number the business
 * chose. This edge holds the app secret and the service role, so it does the
 * rest: the code becomes the business's own token, an id the browser did not
 * hear is read from the token's own grant (idsOf), the number is read back
 * and proven to be the WABA's, the app subscribes to the WABA, the number is
 * registered for Cloud API messaging, the channel row is written, and the
 * token goes into Vault through the one function that may write a
 * credential. From then on the receptionist answers on this number with this
 * business's token, never the environment's.
 *
 * A business that keeps its WhatsApp Business app (`keep_app`, coexistence:
 * decision 0073, R12) went through Meta's own flow for it: the number is
 * already registered and is never registered again (a PIN of ours would trip
 * the app's own two-step verification), and once it routes, the app's
 * contacts and chats of the last six months are asked for, inside the day
 * Meta allows (R21; lib/imports/whatsapp-history.ts).
 *
 * Signed admin token only: the dashboard is the sole caller, as for steer.
 */
import { json, refuse } from "../http.js";
import { personFor, workspaceFor, type Admitted } from "../admin-auth.js";
import { pg } from "../pg.js";
import { emitEvent, recordActivation, type Json } from "../packages/db.js";
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
  tokenGrants,
  wabaIdsGranted,
  wabaInfo,
  wabaPhoneNumbers,
} from "./meta-graph.js";
import { readAndKeepStanding } from "./number-standing.js";
import { startWhatsappHistory } from "../imports/history-import.js";
import { env } from "../env.js";
import { logger } from "../log.js";
import { UUID } from "../packages/contracts.js";

interface ConnectBody {
  tenant_id?: string;
  user_id?: string;
  code?: string;
  phone_number_id?: string;
  waba_id?: string;
  keep_app?: boolean;
}

/**
 * The connection told to the platform's own record: the event that a number was connected, and the workspace's first line
 * that answers, the funnel's first milestone (a phone line is the other door); then what Meta holds about the number now, kept
 * and told if Meta says it cannot send. The payment method Meta asks for at the end of its sign-up window is what a business that
 * skipped it finds out here, in the Connections row and a notice, instead of from the messages it starts that never go. Best
 * effort: the connection stands either way (readAndKeepStanding never throws, and says what it could not do), so a read that
 * fails costs the row its notes and never the connection.
 */
async function connected(
  db: NonNullable<ReturnType<typeof pg>>,
  tenantId: string,
  channelId: string,
  n: { phoneNumberId: string; wabaId: string; e164: string | null; name: string | null; by: string; token: string },
): Promise<void> {
  await emitEvent(db, tenantId, "channel.connected", "channel", channelId, {
    kind: "whatsapp",
    phone_number_id: n.phoneNumberId,
    waba_id: n.wabaId,
    number_e164: n.e164,
    verified_name: n.name,
    by: n.by,
  }).catch(() => {});
  await recordActivation(db, tenantId, "line_live", "whatsapp").catch(() => false);
  const log = logger({ tenant_id: tenantId, phone_number_id: n.phoneNumberId, waba_id: n.wabaId });
  await readAndKeepStanding({ db, log }, n.token, {
    tenant_id: tenantId,
    channel_id: channelId,
    phone_number_id: n.phoneNumberId,
    waba_id: n.wabaId,
    number_e164: n.e164,
  });
}

const ID = /^\d{6,32}$/;

/**
 * The channel row, written for THIS workspace: an update of the row it already holds on this number, else an insert
 * that the unique index refuses when the number is somebody else's (23505); the race between the read and the insert
 * is decided by whose row it is. A new row is written disabled: a number routes only once its token is in Vault
 * (connectWhatsAppNumber, step 7). The row's id, or the refusal to answer with.
 */
async function writeChannelRow(
  db: NonNullable<ReturnType<typeof pg>>,
  L: ReturnType<typeof logger>,
  fields: {
    tenant_id: string;
    kind: "whatsapp";
    external_id: string;
    number_e164: string | null;
    waba_id: string | null;
    config: Json;
  },
): Promise<{ id: string } | Response> {
  const { tenant_id: tenantId, external_id: phoneNumberId } = fields;
  // Scoped to THIS workspace on the way in, so the write cannot cross a tenant
  // even if the caller's number-taken read was answered wrongly: the update
  // touches only a row this workspace already owns, and the insert that follows
  // a miss trips the unique index (23505) when the number belongs to someone else.
  // The row's status is not among the fields: a number routes only once its token is in Vault (the caller's step 7).
  // A row from an earlier connection keeps the status it has until then; a new one is written disabled. Written
  // active here, a crash between this write and the token's left a number that took every message and answered
  // none of them, since the reply found no credential and was refused as absent (the wiring trace, 5 October 2026).
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
    const made = await db
      .from("tenant_channels")
      .insert({ ...fields, status: "disabled" })
      .select("id")
      .single();
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
        return refuse(409, "number_taken");
      }
    } else {
      row = made.data;
      upErr = made.error;
    }
  }
  if (upErr || !row) {
    L.info("wa_connect_channel_write_failed", { error: upErr?.message });
    return refuse(500, "channel_write_failed");
  }
  return row;
}

type Db = NonNullable<ReturnType<typeof pg>>;
type Log = ReturnType<typeof logger>;

/** The ids a sign-up ends with, and where they came from: Meta's window named both, or the token itself was asked. */
interface SignupIds {
  phoneNumberId: string;
  wabaId: string;
  from: "message" | "token";
}

/**
 * A number already connected to another workspace is not connected twice. The ERROR is read, not just the row: (kind,
 * external_id) is unique, so the write that follows is an UPDATE of whatever row holds this number — including another
 * workspace's, whose tenant_id and Vault token it would rewrite. A read that failed says nothing about who holds the
 * number, and treating it as "nobody" is how a pooler blip moved a live number between workspaces.
 */
async function heldElsewhere(db: Db, L: Log, tenantId: string, phoneNumberId: string): Promise<Response | null> {
  const { data: taken, error: takenErr } = await db
    .from("tenant_channels")
    .select("id, tenant_id")
    .eq("kind", "whatsapp")
    .eq("external_id", phoneNumberId)
    .maybeSingle();
  if (takenErr) {
    L.info("wa_connect_channel_read_failed", { error: takenErr.message });
    return refuse(503, "channel_read_failed");
  }
  if (taken && taken.tenant_id !== tenantId) {
    L.info("wa_connect_number_taken");
    return refuse(409, "number_taken");
  }
  return null;
}

/**
 * The ids the sign-up ends with. Meta's window posts them to the page as it finishes and the page sends them on, but that
 * message is a courtesy a browser can miss (8 October 2026: three sign-ups finished on Meta's side, the page heard no ids,
 * and each code was thrown away with nothing connected). The token itself knows: Meta's introspection lists the accounts
 * the sign-up granted, the newest first, and the account lists its numbers. One number is the business that just signed
 * up and is connected as if named; none, or several with none named, is said rather than guessed.
 */
async function idsOf(
  db: Db,
  tenantId: string,
  app: { id: string; secret: string },
  token: string,
  given: { phoneNumberId: string; wabaId: string },
): Promise<SignupIds | Response> {
  if (given.phoneNumberId && given.wabaId) return { ...given, from: "message" };
  const L = boundLog(tenantId, given.phoneNumberId, given.wabaId);
  let wabaId = given.wabaId;
  if (!wabaId) {
    const grants = await tokenGrants(app.id, app.secret, token);
    if (!grants.ok) {
      L.info("wa_connect_grant_unreadable", { error: grants.error, code: grants.code });
      return refuse(502, "grant_unreadable", grants.error);
    }
    wabaId = wabaIdsGranted(grants.data)[0] ?? "";
    if (!wabaId) {
      L.info("wa_connect_waba_not_granted");
      return refuse(502, "waba_not_granted");
    }
  }
  let phoneNumberId = given.phoneNumberId;
  if (!phoneNumberId) {
    const numbers = await wabaPhoneNumbers(token, wabaId);
    if (!numbers.ok) {
      L.info("wa_connect_number_unreadable", { waba_id: wabaId, error: numbers.error });
      return refuse(502, "number_unreadable", numbers.error);
    }
    const ids = (numbers.data.data ?? []).map((n) => String(n.id ?? "")).filter((id) => ID.test(id));
    if (ids.length === 0) {
      L.info("wa_connect_number_missing", { waba_id: wabaId });
      return refuse(502, "number_missing");
    }
    if (ids.length > 1) {
      L.info("wa_connect_number_ambiguous", { waba_id: wabaId, numbers: ids.length });
      return refuse(502, "number_ambiguous", `${ids.length} numbers on the account`);
    }
    phoneNumberId = ids[0] ?? "";
  }
  L.info("wa_connect_found", {
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
    waba_from: given.wabaId ? "message" : "token",
    number_from: given.phoneNumberId ? "message" : "account",
  });
  // A number found this way is checked as one the window named is (before Meta is asked, in the caller).
  if (!given.phoneNumberId) {
    const held = await heldElsewhere(db, boundLog(tenantId, phoneNumberId, wabaId), tenantId, phoneNumberId);
    if (held) return held;
  }
  return { phoneNumberId, wabaId, from: "token" };
}

/**
 * Registered for Cloud API messaging. Registration belongs to the number, not to the app: a number Meta already reports
 * on Cloud API is left alone, since re-registering it with a fresh PIN would only trip its two-step verification, and a
 * number that keeps its Business app (coexistence) was registered by Meta's own flow. A fresh number gets a PIN we keep.
 * A number whose own PIN stands in the way is named as such, not as a generic failure.
 */
async function registeredFor(
  token: string,
  phoneNumberId: string,
  n: { cloud: boolean; keepApp: boolean },
  L: Log,
): Promise<{ pin: string | null; registration: "registered" | "already_registered" | "coexistence" } | Response> {
  if (n.keepApp) return { pin: null, registration: "coexistence" };
  if (n.cloud) return { pin: null, registration: "already_registered" };
  const pin = newPin();
  const reg = await registerNumber(token, phoneNumberId, pin);
  if (reg.ok) return { pin, registration: "registered" };
  if (alreadyRegistered(reg)) return { pin, registration: "already_registered" };
  L.info("wa_connect_register_failed", { error: reg.error, code: reg.code });
  return refuse(502, pinMismatch(reg) ? "pin_required" : "register_failed", reg.error);
}

/** An id the window gave that is not Meta's; an absent one is not wrong, it is looked up. */
const badId = (id: string): boolean => id !== "" && !ID.test(id);

/** The door's log, bound to what is known of the number and the account at that point. */
function boundLog(tenantId: string, phoneNumberId: string, wabaId: string): Log {
  return logger({
    tenant_id: tenantId,
    ...(phoneNumberId ? { phone_number_id: phoneNumberId } : {}),
    ...(wabaId ? { waba_id: wabaId } : {}),
  });
}

export async function connectWhatsAppNumber(auth: Admitted, body: Partial<ConnectBody>): Promise<Response> {
  const appId = metaAppId();
  const appSecret = env.META_APP_SECRET;
  if (!appId || !appSecret) return refuse(503, "no_app_credentials");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = String(body.tenant_id || "");
  const userId = personFor(auth, body.user_id) ?? "";
  const code = String(body.code || "").trim();
  // The ids Meta's window named, where the page heard it; either may be missing (idsOf).
  const given = { phoneNumberId: String(body.phone_number_id || "").trim(), wabaId: String(body.waba_id || "").trim() };
  if (
    !UUID.test(tenantId) ||
    !UUID.test(userId) ||
    !code ||
    code.length > 2000 ||
    badId(given.phoneNumberId) ||
    badId(given.wabaId)
  ) {
    return refuse(
      400,
      "bad_request",
      "tenant_id, user_id and code required; phone_number_id and waba_id, when given, Meta's ids",
    );
  }
  const db = pg();
  if (!db) return refuse(503, "no_database");
  let L = boundLog(tenantId, given.phoneNumberId, given.wabaId);

  // A number the window named that another workspace holds is refused before Meta is asked.
  const held = given.phoneNumberId ? await heldElsewhere(db, L, tenantId, given.phoneNumberId) : null;
  if (held) return held;

  // 1. The code becomes the business's token.
  const tok = await exchangeCode(appId, appSecret, code);
  if (!tok.ok) {
    L.info("wa_connect_exchange_failed", { error: tok.error, code: tok.code });
    return refuse(502, "exchange_failed", tok.error);
  }
  const token = tok.data.access_token;

  // The ids: the window's, or the token's own grant (and a number found that way checked as one named is).
  const ids = await idsOf(db, tenantId, { id: appId, secret: appSecret }, token, given);
  if (ids instanceof Response) return ids;
  const { phoneNumberId, wabaId } = ids;
  L = boundLog(tenantId, phoneNumberId, wabaId);

  // 2. The number, as Meta holds it, and the WABA it belongs to.
  const [num, waba] = await Promise.all([phoneNumber(token, phoneNumberId), wabaInfo(token, wabaId)]);
  if (!num.ok) {
    L.info("wa_connect_number_unreadable", { error: num.error });
    return refuse(502, "number_unreadable", num.error);
  }
  if (!waba.ok) {
    L.info("wa_connect_waba_unreadable", { error: waba.error });
    return refuse(502, "waba_unreadable", waba.error);
  }
  const e164 = toE164(num.data.display_phone_number);

  // 3. The WABA's webhooks reach this app.
  const sub = await subscribeWaba(token, wabaId);
  if (!sub.ok) {
    L.info("wa_connect_subscribe_failed", { error: sub.error });
    return refuse(502, "subscribe_failed", sub.error);
  }

  // 4. Registered for Cloud API messaging (registeredFor).
  const keepApp = body.keep_app === true;
  const reg = await registeredFor(token, phoneNumberId, { cloud: num.data.platform_type === "CLOUD_API", keepApp }, L);
  if (reg instanceof Response) return reg;
  const { pin, registration } = reg;

  // One writer for the row's status, so the only word a crash between the writes can leave is "disabled".
  const setStatus = (id: string, status: "active" | "disabled") =>
    db.from("tenant_channels").update({ status }).eq("id", id).eq("tenant_id", tenantId).select("id");

  // 5. The channel row: routing key, number, WABA, and what Meta calls it.
  const config = {
    verified_name: num.data.verified_name ?? null,
    quality_rating: num.data.quality_rating ?? null,
    waba_name: waba.data.name ?? null,
    connected_at: new Date().toISOString(),
    connected_by: userId,
    registration,
    // The business answers from its WhatsApp Business app too (coexistence): its replies there arrive as echoes.
    ...(keepApp ? { coexistence: true } : {}),
  };
  const row = await writeChannelRow(db, L, {
    tenant_id: tenantId,
    kind: "whatsapp",
    external_id: phoneNumberId,
    number_e164: e164,
    waba_id: wabaId,
    config,
  });
  if (row instanceof Response) return row;

  // 6. The token, in Vault, through the one door that writes a credential.
  const { error: credErr } = await db.rpc("put_channel_credentials", {
    p_channel_id: row.id,
    p_secret: { access_token: token, phone_id: phoneNumberId, pin, waba_id: wabaId } as unknown as Json,
  });
  if (credErr) {
    L.info("wa_connect_credentials_failed", { error: credErr.message });
    // Without credentials the row would ride the environment token: not this business's. Disable it.
    await setStatus(row.id, "disabled");
    return refuse(500, "credentials_failed");
  }

  // 7. Only now may the number route. Counted, as every permission-sensitive update is: a row that did not turn
  // active is a failed connect, not a quiet one.
  const live = await setStatus(row.id, "active");
  if (live.error || !live.data?.length) {
    L.info("wa_connect_channel_write_failed", { at: "activate", error: live.error?.message ?? "no row" });
    return refuse(500, "channel_write_failed");
  }

  await connected(db, tenantId, row.id, { phoneNumberId, wabaId, e164, name: config.verified_name, by: userId, token });
  // The kept app's contacts and chats, asked for while Meta allows (never throws: the connect stands either way).
  if (keepApp) await startWhatsappHistory(db, { tenantId, channelId: row.id, nowMs: Date.now(), log: L });
  L.info("wa_connected", { channel_id: row.id, number: e164, registration: config.registration, ids_from: ids.from });
  return json(200, {
    ok: true,
    channel_id: row.id,
    phone_number_id: phoneNumberId,
    waba_id: wabaId,
    ids_from: ids.from,
    number_e164: e164,
    verified_name: config.verified_name,
    quality_rating: config.quality_rating,
    registration: config.registration,
  });
}
