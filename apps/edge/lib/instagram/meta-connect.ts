/**
 * POST /api/admin/meta/connection — a business's Instagram professional account connected through Meta (decision 0117,
 * Instagram API with Unified Login), disconnected, or asked whether it can be here. Signed admin token only: the
 * dashboard's /api/v1/channels/meta routes are the callers, for an owner or a manager, and only where the workspace's
 * `content_preview` is on (contentPreviewOf: the switch is read here, since a member may not read the config).
 *
 *   status      Whether this deployment holds the Meta app's login configuration, whether this workspace may use it, and
 *               the public half of the app the dashboard builds the way out from.
 *   connect     The code becomes the business's own token (Meta app's id and secret); `debug_token` says what it may do;
 *               it must carry the account and its DMs, or nothing is written. The one account the business shared is
 *               read (several are refused with the list, to be connected again with one), refused when another
 *               workspace holds it, and subscribed to this app's webhook for the fields its permissions allow. Then, as
 *               the Instagram connect does: the row (the account's one row, whichever login connected it), the token in
 *               the Vault through the one door that writes a credential, and only then the row on. A row this workspace
 *               already had is put back as it was if the Vault would not keep the new token, so a working account never
 *               goes quiet for a failed connect. An account taken over from Instagram's own login has that login's
 *               subscription removed afterwards, best effort, so Meta sends each DM once.
 *   disconnect  The account's row turned off, and its subscription removed with the token, best effort.
 *
 * Every answer is JSON with `ok`; a refusal is a code (http.ts refuse) and Meta's words in `detail`. The lines carry the
 * account's id and handle, never a token.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  callInstagram,
  instagramErrorOf,
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
  type MetaApp,
  type MetaTokenFacts,
} from "@chanlytics/channels/instagram";
import { emitEvent, recordActivation } from "@chanlytics/db/events";
import {
  findInstagramAccountRow,
  putChannelSecret,
  setInstagramStatus,
  writeInstagramAccount,
} from "@chanlytics/db/channels";
import { findWorkspaceNameAndConfig } from "@chanlytics/db/campaigns";
import type { Database, Json } from "@chanlytics/db/types";
import { isTenantId, recordOrNull, UUID, type TenantId } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";
import { personFor, workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { json, refuse } from "../shared/http.js";
import { pg } from "../shared/pg.js";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";
import { metaAppId } from "../whatsapp/meta-graph.js";
import { refuseIfHeldElsewhere } from "./connect.js";
import { readKeptSecret, type InstagramSecret } from "./credentials.js";

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

/**
 * Whether a workspace's config offers Connect Meta (`features.content_preview`, the flag registry's `content_preview`). Read
 * off the config as stored, so anything but `true` is off. The one reader of the switch.
 */
export function contentPreviewOf(config: unknown): boolean {
  const features = recordOrNull(recordOrNull(config)?.features);
  return features?.content_preview === true;
}

/** Whether the workspace may connect Meta, by its switch; null when its config could not be read. */
async function switchedOn(db: Db, tenantId: TenantId): Promise<boolean | null> {
  return findWorkspaceNameAndConfig(db, tenantId)
    .then(({ config }) => contentPreviewOf(config))
    .catch(logAndGoOn("read the workspace's switch", null));
}

/** One call of the way in, read by its parser, or Meta's words for its refusal. */
async function askMeta<T>(
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
const metaRefused = (v: unknown): v is { refused: string } => typeof v === "object" && v !== null && "refused" in v;

/** The code traded for the business's token, and what Meta says it may do; a refusal when it may not reach the DMs. */
async function tokenThroughMeta(
  log: Log,
  app: MetaApp,
  code: string,
): Promise<{ token: string; facts: MetaTokenFacts } | Response> {
  const grant = await askMeta(log, "exchange", callInstagram(metaCodeRequest(app, code)), parseMetaToken);
  if (metaRefused(grant)) return refuse(502, "exchange_failed", grant.refused);
  const facts = await askMeta(
    log,
    "token",
    callInstagram(metaDebugTokenRequest(app, grant.accessToken)),
    parseMetaDebugToken,
  );
  if (metaRefused(facts)) return refuse(502, "exchange_failed", facts.refused);
  if (!facts.valid) return refuse(502, "exchange_failed", "Meta says the token is not valid.");
  if (!NEEDED.every((p) => facts.scopes.includes(p))) {
    log.info("ig_connect_messages_not_granted", { login: "meta" });
    return refuse(403, "instagram_messages_not_granted", "The business did not allow its account and its messages.");
  }
  return { token: grant.accessToken, facts };
}

/** The token's account: the one the business shared (granular scopes when Meta lists none), or a refusal. */
async function sharedAccountOf(
  log: Log,
  app: MetaApp,
  token: string,
  byScope: Record<string, string[]>,
): Promise<{ id: string; username: string | null; name: string | null } | Response> {
  const listed = await askMeta(
    log,
    "accounts",
    callInstagram(metaAssignedAccountsRequest(token, app.clientSecret)),
    parseMetaAssignedAccounts,
  );
  if (metaRefused(listed)) return refuse(502, "instagram_account_unreadable", listed.refused);
  const ids = listed.length ? listed.map((a) => a.id) : (byScope.instagram_basic ?? []);
  const [only, ...more] = ids;
  if (!only) return refuse(502, "instagram_account_unreadable", "Meta shared no Instagram account.");
  if (more.length) {
    log.info("meta_connect_refused", { at: "accounts", accounts: ids.length });
    return json(409, {
      ok: false,
      error: "instagram_accounts_several",
      detail: "That sign-in shared several Instagram accounts. Connect again and choose only this workspace's.",
      accounts: listed.map((a) => ({ id: a.id, username: a.username })),
    });
  }
  const account = await askMeta(
    log,
    "account",
    callInstagram(metaAccountRequest(token, app.clientSecret, only)),
    parseMetaAccount,
  );
  return metaRefused(account) ? refuse(502, "instagram_account_unreadable", account.refused) : account;
}

/** The old login's token on a row this workspace holds, for removing that login's subscription once Meta's stands. */
async function oldLoginToken(
  db: Db,
  row: { id: string; credentials_ref: string | null } | null,
): Promise<string | null> {
  if (!row?.credentials_ref) return null;
  // An old token that cannot be read leaves its subscription standing: Meta then sends each DM twice, which the replay
  // gate takes once.
  const kept = await readKeptSecret(db, row.id).catch(logAndGoOn("read the old login's token", null));
  return kept?.access_token && kept.login !== "meta" ? kept.access_token : null;
}

/** The account's events sent to this app's webhook, for the fields its permissions allow; a refusal when Meta would not. */
async function subscribeThroughMeta(
  log: Log,
  app: MetaApp,
  account: { id: string; token: string; scopes: string[] },
): Promise<Response | null> {
  const fields = metaWebhookFieldsOf(account.scopes);
  const sub = await askMeta(
    log,
    "subscribe",
    callInstagram(metaSubscribeRequest(account.token, app.clientSecret, account.id, fields)),
    (j) => {
      if (recordOrNull(j)?.success !== true) throw new Error("Meta did not confirm the subscription");
      return true;
    },
  );
  return metaRefused(sub) ? refuse(502, "subscribe_failed", sub.refused) : null;
}

async function connectThroughMeta(
  db: Db,
  app: MetaApp,
  by: { tenantId: TenantId; userId: string },
  code: string,
): Promise<Response> {
  const { tenantId, userId } = by;
  let log = logger({ tenant_id: tenantId });
  // 1. The code becomes the business's token, and Meta says what it may do; then whose business, and which account.
  const granted = await tokenThroughMeta(log, app, code);
  if (granted instanceof Response) return granted;
  const { token, facts } = granted;
  const business = await askMeta(
    log,
    "business",
    callInstagram(metaBusinessRequest(token, app.clientSecret)),
    parseMetaBusiness,
  );
  const account = await sharedAccountOf(log, app, token, facts.accountsByScope);
  if (account instanceof Response) return account;
  log = logger({ tenant_id: tenantId, account: account.id });
  const held = await refuseIfHeldElsewhere(db, log, tenantId, account.id);
  if (held) return held;
  let before: Awaited<ReturnType<typeof findInstagramAccountRow>>;
  try {
    before = await findInstagramAccountRow(db, tenantId, account.id);
  } catch {
    return refuse(503, "channel_read_failed");
  }
  const oldToken = await oldLoginToken(db, before);
  // 2. Its events reach this app's webhook, for what its permissions allow.
  const unsubscribed = await subscribeThroughMeta(log, app, { id: account.id, token, scopes: facts.scopes });
  if (unsubscribed) return unsubscribed;
  // 3. The row, then the token, then the row on.
  const now = new Date().toISOString();
  const businessId = metaRefused(business) ? null : business;
  const row = await writeInstagramAccount(db, {
    tenantId,
    accountId: account.id,
    config: {
      login: "meta",
      username: account.username,
      name: account.name,
      connected_at: now,
      connected_by: userId,
      business_id: businessId,
      scopes: facts.scopes,
      token_checked_at: now,
    },
  });
  if (row === "taken") return refuse(409, "instagram_account_taken");
  if ("failed" in row) {
    log.info("ig_connect_channel_write_failed", { error: row.failed, login: "meta" });
    return refuse(500, "channel_write_failed");
  }
  const secret: InstagramSecret = {
    access_token: token,
    account_id: account.id,
    expires_at: facts.expiresAt,
    refreshed_at: now,
    login: "meta",
    business_id: businessId,
    scopes: facts.scopes,
  };
  try {
    await putChannelSecret(db, row.id, { ...secret });
  } catch (e) {
    log.info("ig_connect_credentials_failed", { error: e instanceof Error ? e.message : String(e), login: "meta" });
    await restoreRow(db, { tenantId, accountId: account.id, rowId: row.id }, before);
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
async function restoreRow(
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

async function disconnectFromMeta(
  db: Db,
  app: MetaApp | null,
  tenantId: TenantId,
  channelId: string,
): Promise<Response> {
  const log = logger({ tenant_id: tenantId, channel_id: channelId });
  if (!(await setInstagramStatus(db, tenantId, channelId, "disabled"))) {
    log.info("ig_disconnect_failed", { login: "meta" });
    return refuse(404, "not_found");
  }
  // The row is off whatever the Vault says; a token that cannot be read leaves Meta's subscription standing, and an
  // account no row routes is told to the platform, never answered.
  const kept = await readKeptSecret(db, channelId).catch(logAndGoOn("read the token to unsubscribe", null));
  let unsubscribed = "not_asked";
  if (app && kept?.login === "meta" && kept.access_token && kept.account_id) {
    const answer = await callInstagram(metaUnsubscribeRequest(kept.access_token, app.clientSecret, kept.account_id));
    unsubscribed = answer.outcome;
  }
  log.info("meta_disconnected", { unsubscribed });
  return json(200, { ok: true });
}

/** `status`: whether the app's login is held here, whether this workspace's switch is on, and the app's public half. */
async function metaStatus(db: Db | null, tenantId: string, app: MetaApp | null): Promise<Response> {
  const on = db && isTenantId(tenantId) ? await switchedOn(db, tenantId) : false;
  return json(200, {
    ok: true,
    ready: !!app,
    on: on === true,
    ...(app ? { app: { client_id: app.clientId, config_id: app.configId, redirect_uri: app.redirectUri } } : {}),
  });
}

/** `connect`: the app held, the workspace's switch on, a code, and then the way in. */
async function metaConnectOp(
  db: Db,
  app: MetaApp | null,
  by: { tenantId: TenantId; userId: string },
  code: string,
): Promise<Response> {
  if (!app) return refuse(503, "no_app_credentials");
  const on = await switchedOn(db, by.tenantId);
  if (on === null) return refuse(503, "no_database");
  if (!on) {
    logger({ tenant_id: by.tenantId }).info("meta_connect_refused", { at: "switch" });
    return refuse(409, "meta_off", "Connecting Meta is not offered in this workspace yet.");
  }
  if (!code || code.length > 2000) return refuse(400, "bad_request", "code required");
  return connectThroughMeta(db, app, by, code);
}

/** The door's ops: what each answers is in the module's head. */
export async function runMetaOp(auth: Admitted, body: Partial<MetaBody>): Promise<Response> {
  const op = typeof body.op === "string" ? body.op : "";
  const app = metaLoginApp();
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  const db = pg();
  if (op === "status") return metaStatus(db, tenantId, app);
  const userId = personFor(auth, body.user_id) ?? "";
  if (!isTenantId(tenantId) || !UUID.test(userId)) return refuse(400, "bad_request", "tenant_id and user_id required");
  if (!db) return refuse(503, "no_database");
  if (op === "connect") return metaConnectOp(db, app, { tenantId, userId }, String(body.code ?? "").trim());
  if (op === "disconnect") {
    const channelId = String(body.channel_id ?? "");
    if (!UUID.test(channelId)) return refuse(400, "bad_request", "channel_id required");
    return disconnectFromMeta(db, app, tenantId, channelId);
  }
  return refuse(400, "bad_request", "op is status, connect or disconnect");
}
