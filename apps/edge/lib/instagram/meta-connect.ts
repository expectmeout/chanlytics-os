/**
 * POST /api/admin/meta/connection — a business's Instagram professional account connected through Meta (decision 0117,
 * Instagram API with Unified Login), disconnected, or asked whether it can be here. Signed admin token only: the
 * dashboard's /api/v1/channels/meta routes are the callers, for an owner or a manager, and only where the workspace's
 * `content_preview` is on (contracts contentPreviewOf: the switch is read here, since a member may not read the config).
 *
 *   status      Whether this deployment holds the Meta app's login configuration, whether this workspace may use it, and
 *               the public half of the app the dashboard builds the way out from.
 *   connect     The code becomes the business's own token (Meta app's id and secret); `debug_token` says what it may do;
 *               it must carry the account and its DMs, or nothing is written. The one account the business shared is
 *               read (several are refused with the list, to be connected again with one), refused when another
 *               workspace holds it, and subscribed to this app's webhook for the fields its permissions allow. Then, as
 *               the Instagram connect does: the row (the account's one row, R1: whichever login connected it), the token
 *               in the Vault through the one door that writes a credential, and only then the row on. A row this
 *               workspace already had is put back as it was if the Vault would not keep the new token, so a working
 *               account never goes quiet for a failed connect. An account taken over from Instagram's own login has
 *               that login's subscription removed afterwards, best effort, so Meta sends each DM once.
 *   disconnect  The account's row turned off, and its subscription removed with the token, best effort.
 *
 * Every answer is JSON with `ok`; a refusal is a code (http.ts refuse) and Meta's words in `detail`. The lines carry the
 * account's id and handle, never a token.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  callInstagram,
  instagramUnsubscribeRequest,
  metaAccountRequest,
  metaAssignedAccountsRequest,
  metaBusinessRequest,
  metaCodeRequest,
  metaDebugTokenRequest,
  metaSubscribeRequest,
  metaUnsubscribeRequest,
  metaWebhookFieldsOf,
  parseMetaAccount,
  parseMetaAssignedAccounts,
  parseMetaBusiness,
  parseMetaDebugToken,
  parseMetaToken,
  instagramErrorOf,
  type MetaApp,
} from "@chanlytics/channels/instagram";
import { emitEvent, recordActivation } from "@chanlytics/db/events";
import {
  findInstagramAccountRow,
  putChannelSecret,
  readChannelSecret,
  setInstagramStatus,
  writeInstagramAccount,
} from "@chanlytics/db/channels";
import { findWorkspaceNameAndConfig } from "@chanlytics/db/campaigns";
import type { Database, Json } from "@chanlytics/db/types";
import { contentPreviewOf, isTenantId, recordOrNull, UUID, type TenantId } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";
import { personFor, workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { json, refuse } from "../shared/http.js";
import { pg } from "../shared/pg.js";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";
import { metaAppId } from "../whatsapp/meta-graph.js";
import { heldElsewhere } from "./connect.js";
import type { InstagramSecret } from "./credentials.js";

type Db = SupabaseClient<Database>;
type Log = ReturnType<typeof logger>;

/** What the door reads of its body. */
export interface MetaBody {
  op?: string;
  tenant_id?: string;
  user_id?: string;
  code?: string;
  channel_id?: string;
}

/** The permissions without which nothing is kept: the account itself, and its DMs (the configuration requires them). */
const NEEDED = ["instagram_basic", "instagram_manage_messages"] as const;

/** The Meta app's login as this deployment holds it, or null when any part is not set (Connect Meta says so). */
export function metaLoginApp(): MetaApp | null {
  const clientSecret = env.META_APP_SECRET;
  const configId = env.META_LOGIN_CONFIG_ID;
  const redirectUri = env.META_REDIRECT_URI;
  return clientSecret && configId && redirectUri
    ? { clientId: metaAppId(), clientSecret, configId, redirectUri }
    : null;
}

/** Whether the workspace may connect Meta, by its switch; null when its config could not be read. */
async function switchedOn(db: Db, tenantId: TenantId): Promise<boolean | null> {
  return findWorkspaceNameAndConfig(db, tenantId)
    .then(({ config }) => contentPreviewOf(config))
    .catch(() => null);
}

/** One call of the way in, read by its parser, or Meta's words for its refusal. */
async function step<T>(
  log: Log,
  at: string,
  call: ReturnType<typeof callInstagram>,
  parse: (json: unknown) => T,
): Promise<T | { refused: string }> {
  const answer = await call;
  if (answer.outcome !== "ok") {
    const detail = instagramErrorOf(answer.json)?.message ?? answer.error ?? `HTTP ${answer.status}`;
    log.info("meta_connect_refused", { at, status: answer.status, error: detail.slice(0, 200) });
    return { refused: detail.slice(0, 300) };
  }
  try {
    return parse(answer.json);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    log.info("meta_connect_refused", { at, error: detail.slice(0, 200) });
    return { refused: detail.slice(0, 300) };
  }
}
const isRefused = (v: unknown): v is { refused: string } => typeof v === "object" && v !== null && "refused" in v;

/** The token's account: the one the business shared (granular scopes when Meta lists none), or a refusal. */
async function accountOf(
  log: Log,
  app: MetaApp,
  token: string,
  byScope: Record<string, string[]>,
): Promise<{ id: string } | Response> {
  const listed = await step(
    log,
    "accounts",
    callInstagram(metaAssignedAccountsRequest(token, app.clientSecret)),
    parseMetaAssignedAccounts,
  );
  if (isRefused(listed)) return refuse(502, "instagram_account_unreadable", listed.refused);
  const ids = listed.length ? listed.map((a) => a.id) : (byScope.instagram_basic ?? []);
  const [only, ...more] = ids;
  if (!only) return refuse(502, "instagram_account_unreadable", "Meta shared no Instagram account.");
  if (more.length) {
    log.info("meta_connect_several_accounts", { accounts: ids.length });
    return json(409, {
      ok: false,
      error: "instagram_accounts_several",
      detail: "That sign-in shared several Instagram accounts. Connect again and choose only this workspace's.",
      accounts: listed.map((a) => ({ id: a.id, username: a.username })),
    });
  }
  return { id: only };
}

/** The old login's token on a row this workspace holds, for removing that login's subscription once Meta's stands. */
async function oldLoginToken(
  db: Db,
  row: { id: string; credentials_ref: string | null } | null,
): Promise<string | null> {
  if (!row?.credentials_ref) return null;
  // An old token that cannot be read leaves its subscription standing: Meta then sends each DM twice, which the replay
  // gate takes once.
  const kept = (await readChannelSecret(db, row.id).catch(
    logAndGoOn("read the old login's token", null),
  )) as Partial<InstagramSecret> | null;
  return kept?.access_token && kept.login !== "meta" ? kept.access_token : null;
}

async function connect(
  db: Db,
  app: MetaApp,
  by: { tenantId: TenantId; userId: string },
  code: string,
): Promise<Response> {
  const { tenantId, userId } = by;
  let log = logger({ tenant_id: tenantId });
  // 1. The code becomes the business's token, and Meta says what it may do.
  const grant = await step(log, "exchange", callInstagram(metaCodeRequest(app, code)), parseMetaToken);
  if (isRefused(grant)) return refuse(502, "exchange_failed", grant.refused);
  const facts = await step(
    log,
    "token",
    callInstagram(metaDebugTokenRequest(app, grant.accessToken)),
    parseMetaDebugToken,
  );
  if (isRefused(facts) || !facts.valid)
    return refuse(502, "exchange_failed", isRefused(facts) ? facts.refused : "Meta says the token is not valid.");
  if (!NEEDED.every((p) => facts.scopes.includes(p))) {
    log.info("ig_connect_messages_not_granted", { login: "meta" });
    return refuse(403, "instagram_messages_not_granted", "The business did not allow its account and its messages.");
  }
  // 2. Whose business, and which account.
  const business = await step(
    log,
    "business",
    callInstagram(metaBusinessRequest(grant.accessToken, app.clientSecret)),
    parseMetaBusiness,
  );
  const picked = await accountOf(log, app, grant.accessToken, facts.accountsByScope);
  if (picked instanceof Response) return picked;
  const account = await step(
    log,
    "account",
    callInstagram(metaAccountRequest(grant.accessToken, app.clientSecret, picked.id)),
    parseMetaAccount,
  );
  if (isRefused(account)) return refuse(502, "instagram_account_unreadable", account.refused);
  log = logger({ tenant_id: tenantId, account: account.id });
  const held = await heldElsewhere(db, log, tenantId, account.id);
  if (held) return held;
  let before: Awaited<ReturnType<typeof findInstagramAccountRow>>;
  try {
    before = await findInstagramAccountRow(db, tenantId, account.id);
  } catch {
    return refuse(503, "channel_read_failed");
  }
  const oldToken = await oldLoginToken(db, before);
  // 3. Its events reach this app's webhook, for what its permissions allow.
  const fields = metaWebhookFieldsOf(facts.scopes);
  const sub = await step(
    log,
    "subscribe",
    callInstagram(metaSubscribeRequest(grant.accessToken, app.clientSecret, account.id, fields)),
    (j) => {
      if (recordOrNull(j)?.success !== true) throw new Error("Meta did not confirm the subscription");
      return true;
    },
  );
  if (isRefused(sub)) return refuse(502, "subscribe_failed", sub.refused);
  // 4. The row, then the token, then the row on.
  const now = new Date().toISOString();
  const config = {
    login: "meta",
    username: account.username,
    name: account.name,
    connected_at: now,
    connected_by: userId,
    business_id: isRefused(business) ? null : business,
    scopes: facts.scopes,
    token_checked_at: now,
  };
  const row = await writeInstagramAccount(db, { tenantId, accountId: account.id, config });
  if (row === "taken") return refuse(409, "instagram_account_taken");
  if ("failed" in row) {
    log.info("ig_connect_channel_write_failed", { error: row.failed, login: "meta" });
    return refuse(500, "channel_write_failed");
  }
  const secret: InstagramSecret = {
    access_token: grant.accessToken,
    account_id: account.id,
    expires_at: facts.expiresAt,
    refreshed_at: now,
    login: "meta",
    business_id: config.business_id,
    scopes: facts.scopes,
  };
  try {
    await putChannelSecret(db, row.id, { ...secret });
  } catch (e) {
    log.info("ig_connect_credentials_failed", { error: e instanceof Error ? e.message : String(e), login: "meta" });
    await putBack(db, { tenantId, accountId: account.id, rowId: row.id }, before);
    return refuse(500, "credentials_failed");
  }
  if (!(await setInstagramStatus(db, tenantId, row.id, "active"))) return refuse(500, "channel_write_failed");
  if (oldToken) await dropOldLogin(log, oldToken, account.id);
  await emitEvent(db, tenantId, "channel.connected", "channel", row.id, {
    kind: "instagram",
    login: "meta",
    account_id: account.id,
    username: account.username,
    by: userId,
  }).catch(logAndGoOn("event channel.connected"));
  // The workspace's first line that answers, the funnel's first milestone, whichever wire it is.
  await recordActivation(db, tenantId, "line_live", "instagram").catch(logAndGoOn("record the line live", false));
  log.info("meta_connected", { channel_id: row.id, username: account.username, scopes: facts.scopes.length });
  return json(200, { ok: true, channel_id: row.id, account_id: account.id, username: account.username });
}

/** The row as it was before a connect whose token the Vault would not keep: its config and status back, or off if new. */
async function putBack(
  db: Db,
  at: { tenantId: TenantId; accountId: string; rowId: string },
  before: { status: string; config: Json } | null,
): Promise<void> {
  const { tenantId, accountId, rowId } = at;
  if (!before) {
    await setInstagramStatus(db, tenantId, rowId, "disabled");
    return;
  }
  await writeInstagramAccount(db, { tenantId, accountId, config: before.config });
  await setInstagramStatus(db, tenantId, rowId, before.status === "active" ? "active" : "disabled");
}

/** Instagram's own login's subscription removed, best effort: Meta's now carries the account's DMs. */
async function dropOldLogin(log: Log, oldToken: string, accountId: string): Promise<void> {
  const answer = await callInstagram(instagramUnsubscribeRequest(oldToken, accountId));
  log.info("meta_old_login_unsubscribed", { outcome: answer.outcome, status: answer.status });
}

async function disconnect(db: Db, app: MetaApp | null, tenantId: TenantId, channelId: string): Promise<Response> {
  const log = logger({ tenant_id: tenantId, channel_id: channelId });
  if (!(await setInstagramStatus(db, tenantId, channelId, "disabled"))) {
    log.info("meta_disconnect_failed");
    return refuse(404, "not_found");
  }
  // The row is off whatever the Vault says; a token that cannot be read leaves Meta's subscription standing, and an
  // account no row routes is told to the platform, never answered.
  const kept = (await readChannelSecret(db, channelId).catch(
    logAndGoOn("read the token to unsubscribe", null),
  )) as Partial<InstagramSecret> | null;
  if (app && kept?.login === "meta" && kept.access_token && kept.account_id) {
    const answer = await callInstagram(metaUnsubscribeRequest(kept.access_token, app.clientSecret, kept.account_id));
    log.info("meta_unsubscribed", { outcome: answer.outcome, status: answer.status });
  }
  log.info("meta_disconnected");
  return json(200, { ok: true });
}

/** The door's ops: what each answers is in the module's head. */
export async function runMetaOp(auth: Admitted, body: Partial<MetaBody>): Promise<Response> {
  const op = typeof body.op === "string" ? body.op : "";
  const app = metaLoginApp();
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  const db = pg();
  if (op === "status") {
    const on = db && isTenantId(tenantId) ? await switchedOn(db, tenantId) : false;
    return json(200, {
      ok: true,
      ready: !!app,
      on: on === true,
      ...(app ? { app: { client_id: app.clientId, config_id: app.configId, redirect_uri: app.redirectUri } } : {}),
    });
  }
  const userId = personFor(auth, body.user_id) ?? "";
  if (!isTenantId(tenantId) || !UUID.test(userId)) return refuse(400, "bad_request", "tenant_id and user_id required");
  if (!db) return refuse(503, "no_database");
  if (op === "connect") {
    if (!app) return refuse(503, "no_app_credentials");
    const on = await switchedOn(db, tenantId);
    if (on === null) return refuse(503, "no_database");
    if (!on) {
      logger({ tenant_id: tenantId }).info("meta_connect_off");
      return refuse(409, "meta_off", "Connecting Meta is not offered in this workspace yet.");
    }
    const code = String(body.code ?? "").trim();
    if (!code || code.length > 2000) return refuse(400, "bad_request", "code required");
    return connect(db, app, { tenantId, userId }, code);
  }
  if (op === "disconnect") {
    const channelId = String(body.channel_id ?? "");
    if (!UUID.test(channelId)) return refuse(400, "bad_request", "channel_id required");
    return disconnect(db, app, tenantId, channelId);
  }
  return refuse(400, "bad_request", "op is status, connect or disconnect");
}
