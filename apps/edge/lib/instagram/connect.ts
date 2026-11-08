/**
 * POST /api/admin/instagram/account — a business's Instagram professional account becomes a channel of its workspace, and stops
 * being one (the Instagram API with Instagram Login, decision 0001 step 8). Signed admin token only: the dashboard's
 * /api/v1/channels/instagram routes are the callers, for an owner or a manager.
 *
 * The door is api/admin/instagram/account.ts: the knock (authorizeAdmin) and the body; the ops are here:
 *
 *   status      Whether this deployment can connect an account at all, and the app's id and the address Meta sends a
 *               person back to, which the dashboard's way out is built from (the app id is public; its secret is here).
 *   connect     The code Instagram handed back becomes the business's token: traded for a short one, then for a 60-day
 *               one; the account it speaks for is read (`/me`: its Instagram id, the one its webhooks are addressed to),
 *               refused when another workspace holds it, and subscribed to this app's webhook for its messages; the
 *               channel row is written disabled, the token put in the Vault through the one function that writes a
 *               credential, and only then is the row turned on, so the only word a crash between the writes can leave is
 *               "disabled". From then on DMs to the account are answered on its own token.
 *   disconnect  The account's row turned off: nothing it is sent routes, and nothing leaves it. Its token stays in the
 *               Vault until a connect replaces it or the workspace is deleted, as a WhatsApp number's does.
 *
 * Every answer is JSON with `ok`; a refusal is a code (http.ts refuse) and Meta's words in `detail`. The lines carry the
 * account's id and handle, never the token.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  callInstagram,
  instagramCodeRequest,
  instagramLongLivedRequest,
  instagramMeRequest,
  instagramSubscribeRequest,
  instagramErrorOf,
  parseInstagramCodeGrant,
  parseInstagramMe,
  parseInstagramToken,
  type InstagramApp,
} from "@chanlytics/channels/instagram";
import { emitEvent, recordActivation } from "@chanlytics/db/events";
import {
  findInstagramAccountHolder,
  putChannelSecret,
  setInstagramStatus,
  writeInstagramAccount,
} from "@chanlytics/db/channels";
import type { Database } from "@chanlytics/db/types";
import { UUID, recordOrNull, isTenantId } from "@chanlytics/contracts";
import { personFor, workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { json, refuse } from "../shared/http.js";
import { pg } from "../shared/pg.js";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";
import type { InstagramSecret } from "./credentials.js";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;
type Log = ReturnType<typeof logger>;

export interface InstagramBody {
  op?: string;
  tenant_id?: TenantId;
  user_id?: string;
  code?: string;
  channel_id?: string;
}

/** The app as this deployment holds it, or null when any of the three is not set (Connect Instagram says so). */
function instagramApp(): InstagramApp | null {
  const clientId = env.INSTAGRAM_APP_ID;
  const clientSecret = env.INSTAGRAM_APP_SECRET;
  const redirectUri = env.INSTAGRAM_REDIRECT_URI;
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

/** Meta's permission a business must grant for its DMs to be answered: without it the token reads the account and no more. */
const MESSAGES_SCOPE = "instagram_business_manage_messages";

/** A step of the way in that Instagram refused, or whose answer could not be read: Meta's words, for `detail`. */
interface Refused {
  refused: string;
}
const isRefused = (v: unknown): v is Refused => typeof v === "object" && v !== null && "refused" in v;

/** One call of the way in, read as its parser reads it, or Meta's words for its refusal (each caller names its code). */
async function step<T>(
  log: Log,
  kind: "exchange" | "token" | "account" | "subscribe",
  call: Promise<{ outcome: string; status: number; json: Record<string, unknown> | null; error: string | null }>,
  parse: (json: unknown) => T,
): Promise<T | Refused> {
  const first = await call;
  if (first.outcome !== "ok") {
    const detail = instagramErrorOf(first.json)?.message ?? first.error ?? `HTTP ${first.status}`;
    log.info("ig_connect_refused", { at: kind, status: first.status, error: detail.slice(0, 200) });
    return { refused: detail.slice(0, 300) };
  }
  try {
    return parse(first.json);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    log.info("ig_connect_refused", { at: kind, error: detail.slice(0, 200) });
    return { refused: detail.slice(0, 300) };
  }
}

/**
 * Another workspace's row for this account is refused before anything is written: (kind, external_id) is unique, so the
 * write that follows would otherwise move a live account, its token and its DMs between workspaces. A read that failed
 * says nothing about who holds it.
 */
async function heldElsewhere(db: Db, log: Log, tenantId: TenantId, accountId: string): Promise<Response | null> {
  let holder: { tenant_id: TenantId } | null;
  try {
    holder = await findInstagramAccountHolder(db, accountId);
  } catch (e) {
    log.info("ig_connect_channel_read_failed", { error: e instanceof Error ? e.message : String(e) });
    return refuse(503, "channel_read_failed");
  }
  if (holder && holder.tenant_id !== tenantId) {
    log.info("ig_connect_account_taken");
    return refuse(409, "instagram_account_taken");
  }
  return null;
}

async function connect(
  db: Db,
  app: InstagramApp,
  by: { tenantId: TenantId; userId: string },
  code: string,
): Promise<Response> {
  const { tenantId, userId } = by;
  let log = logger({ tenant_id: tenantId });
  // 1. The code becomes a short token, then a 60-day one, granted what the business allowed.
  const grant = await step(log, "exchange", callInstagram(instagramCodeRequest(app, code)), parseInstagramCodeGrant);
  if (isRefused(grant)) return refuse(502, "exchange_failed", grant.refused);
  if (grant.permissions.length > 0 && !grant.permissions.includes(MESSAGES_SCOPE)) {
    log.info("ig_connect_messages_not_granted");
    return refuse(403, "instagram_messages_not_granted", "The business did not allow its messages to be managed.");
  }
  const long = await step(
    log,
    "token",
    callInstagram(instagramLongLivedRequest(app.clientSecret, grant.accessToken)),
    parseInstagramToken,
  );
  if (isRefused(long)) return refuse(502, "exchange_failed", long.refused);
  // 2. The account the token speaks for, by the id its webhooks name.
  const me = await step(log, "account", callInstagram(instagramMeRequest(long.accessToken)), parseInstagramMe);
  if (isRefused(me)) return refuse(502, "instagram_account_unreadable", me.refused);
  log = logger({ tenant_id: tenantId, account: me.accountId });
  const held = await heldElsewhere(db, log, tenantId, me.accountId);
  if (held) return held;
  // 3. Its DMs reach this app's webhook.
  const sub = await step(
    log,
    "subscribe",
    callInstagram(instagramSubscribeRequest(long.accessToken, me.accountId)),
    (j) => {
      if (recordOrNull(j)?.success !== true) throw new Error("Instagram did not confirm the subscription");
      return true;
    },
  );
  if (isRefused(sub)) return refuse(502, "subscribe_failed", sub.refused);
  // 4. The row, disabled until its token is kept.
  const now = new Date();
  const expiresAt = long.expiresInS > 0 ? new Date(now.getTime() + long.expiresInS * 1000).toISOString() : null;
  const row = await writeInstagramAccount(db, {
    tenantId,
    accountId: me.accountId,
    config: { username: me.username, name: me.name, connected_at: now.toISOString(), connected_by: userId },
  });
  if (row === "taken") {
    log.info("ig_connect_account_taken", { at: "insert" });
    return refuse(409, "instagram_account_taken");
  }
  if ("failed" in row) {
    log.info("ig_connect_channel_write_failed", { error: row.failed });
    return refuse(500, "channel_write_failed");
  }
  // 5. The token, in the Vault, through the one door that writes a credential.
  const secret: InstagramSecret = {
    access_token: long.accessToken,
    account_id: me.accountId,
    expires_at: expiresAt,
    refreshed_at: now.toISOString(),
  };
  try {
    await putChannelSecret(db, row.id, { ...secret });
  } catch (e) {
    log.info("ig_connect_credentials_failed", { error: e instanceof Error ? e.message : String(e) });
    await setInstagramStatus(db, tenantId, row.id, "disabled");
    return refuse(500, "credentials_failed");
  }
  // 6. Only now may the account route.
  if (!(await setInstagramStatus(db, tenantId, row.id, "active"))) {
    log.info("ig_connect_channel_write_failed", { at: "activate" });
    return refuse(500, "channel_write_failed");
  }
  await emitEvent(db, tenantId, "channel.connected", "channel", row.id, {
    kind: "instagram",
    account_id: me.accountId,
    username: me.username,
    by: userId,
  }).catch(() => {});
  // The workspace's first line that answers, the funnel's first milestone, whichever wire it is.
  await recordActivation(db, tenantId, "line_live", "instagram").catch(() => false);
  log.info("ig_connected", { channel_id: row.id, username: me.username });
  return json(200, { ok: true, channel_id: row.id, account_id: me.accountId, username: me.username, name: me.name });
}

async function disconnect(db: Db, tenantId: TenantId, channelId: string): Promise<Response> {
  const log = logger({ tenant_id: tenantId, channel_id: channelId });
  if (!(await setInstagramStatus(db, tenantId, channelId, "disabled"))) {
    log.info("ig_disconnect_failed");
    return refuse(404, "not_found");
  }
  log.info("ig_disconnected");
  return json(200, { ok: true });
}

export async function runInstagramOp(auth: Admitted, body: Partial<InstagramBody>): Promise<Response> {
  const op = typeof body.op === "string" ? body.op : "";
  const app = instagramApp();
  if (op === "status")
    return json(200, {
      ok: true,
      ready: !!app,
      ...(app ? { app: { client_id: app.clientId, redirect_uri: app.redirectUri } } : {}),
    });
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  const userId = personFor(auth, body.user_id) ?? "";
  if (!isTenantId(tenantId) || !UUID.test(userId)) return refuse(400, "bad_request", "tenant_id and user_id required");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  if (op === "connect") {
    if (!app) return refuse(503, "no_app_credentials");
    const code = String(body.code ?? "").trim();
    if (!code || code.length > 2000) return refuse(400, "bad_request", "code required");
    return connect(db, app, { tenantId, userId }, code);
  }
  if (op === "disconnect") {
    const channelId = String(body.channel_id ?? "");
    if (!UUID.test(channelId)) return refuse(400, "bad_request", "channel_id required");
    return disconnect(db, tenantId, channelId);
  }
  return refuse(400, "bad_request", "op is status, connect or disconnect");
}
