/**
 * An Instagram account's place in a workspace, as both logins take it and end it (decision 0143): Instagram's own
 * (connect.ts) and Meta's (meta-connect.ts) come here for what is the same whichever login it was.
 *
 *   refuseIfHeld     Before Meta is asked for anything more: the account is connected in another workspace, or this
 *                    workspace has a different account connected (one account a workspace). Only a CONNECTED row
 *                    holds an account: a disconnect lets it go, and it is then anyone's to connect.
 *   keepConnection   The one write (instagram_account_connect, 00677): the row, its token in the Vault, the row on,
 *                    all or nothing. It asks the two questions above again under its own lock, so two connects at once
 *                    cannot both win.
 *   disconnectAccount  The row off and let go, its token deleted and the disconnect said on the ledger, in one write
 *                    (instagram_account_disconnect), then Meta asked to stop sending the account's events with the
 *                    token it had, best effort. An account no row routes is told to the platform, never answered.
 *
 * The lines carry the account's id and handle, never a token.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { callInstagram, instagramUnsubscribeRequest, metaUnsubscribeRequest } from "@chanlytics/channels/instagram";
import {
  connectInstagramAccount,
  disconnectInstagramAccount,
  findInstagramAccountHolder,
  findInstagramChannel,
  listConnectedInstagramAccounts,
  type InstagramConnect,
} from "@chanlytics/db/channels";
import type { Database, Json } from "@chanlytics/db/types";
import { recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";
import { json, refuse } from "../shared/http.js";
import { env } from "../shared/env.js";
import { errField, logger } from "../shared/log.js";
import { readKeptSecret, type InstagramSecret } from "./credentials.js";

type Db = SupabaseClient<Database>;
type Log = ReturnType<typeof logger>;

/** The handle a row's config keeps, or null. */
const handleOf = (config: Json): string | null => {
  const username = recordOrEmpty(config).username;
  return typeof username === "string" && username ? username : null;
};

/** Refused: another workspace has the account connected. The dashboard is told which, and says it only to its own. */
function takenBy(log: Log, heldBy: string | null, at: "read" | "write"): Response {
  log.info("ig_connect_account_taken", { at });
  return json(409, { ok: false, error: "instagram_account_taken", ...(heldBy ? { held_by: heldBy } : {}) });
}

/** Refused: this workspace has a different account connected, and one account is what a workspace has. */
function anotherHere(log: Log, username: string | null): Response {
  log.info("ig_connect_refused", { at: "another_here" });
  return json(409, {
    ok: false,
    error: "instagram_another_connected",
    detail: "This workspace already has an Instagram account connected. Disconnect it first.",
    username,
  });
}

/**
 * What stands in a connect's way, asked before the account is subscribed: a refusal, or null. A read that failed says
 * nothing about who holds the account, and refuses.
 */
export async function refuseIfHeld(db: Db, log: Log, tenantId: TenantId, accountId: string): Promise<Response | null> {
  try {
    const [holder, here] = await Promise.all([
      findInstagramAccountHolder(db, accountId),
      listConnectedInstagramAccounts(db, tenantId),
    ]);
    if (holder && holder.tenant_id !== tenantId && holder.status === "active")
      return takenBy(log, holder.tenant_id, "read");
    const other = here.find((row) => row.external_id !== accountId);
    return other ? anotherHere(log, handleOf(other.config)) : null;
  } catch (e) {
    log.info("ig_connect_channel_read_failed", { error: errField(e) });
    return refuse(503, "channel_read_failed");
  }
}

/** The account kept in one write: its channel's id, or the refusal. A write that failed changed nothing. */
export async function keepConnection(
  db: Db,
  log: Log,
  fields: { tenantId: TenantId; accountId: string; config: Json; secret: InstagramSecret },
): Promise<{ channelId: string } | Response> {
  let kept: InstagramConnect;
  try {
    kept = await connectInstagramAccount(db, { ...fields, secret: { ...fields.secret } });
  } catch (e) {
    log.info("ig_connect_channel_write_failed", { error: errField(e) });
    return refuse(500, "channel_write_failed");
  }
  if (kept.outcome === "taken") return takenBy(log, kept.heldBy, "write");
  if (kept.outcome === "another_here") return anotherHere(log, kept.username);
  return { channelId: kept.channelId };
}

/** Meta asked to stop sending an account's events, with the token it had and through the login it came by. */
async function stopSending(kept: Partial<InstagramSecret> | null): Promise<string> {
  if (!kept?.access_token || !kept.account_id) return "not_asked";
  if (kept.login !== "meta")
    return (await callInstagram(instagramUnsubscribeRequest(kept.access_token, kept.account_id))).outcome;
  const appSecret = env.META_APP_SECRET;
  if (!appSecret) return "not_asked";
  return (await callInstagram(metaUnsubscribeRequest(kept.access_token, appSecret, kept.account_id))).outcome;
}

/**
 * `disconnect`, for either login: the workspace's own row let go, then Meta asked to stop sending. The token is read
 * before the door deletes it, and used only once the door has said the row was this workspace's and is let go.
 */
export async function disconnectAccount(
  db: Db,
  by: { tenantId: TenantId; userId: string },
  channelId: string,
): Promise<Response> {
  const { tenantId, userId } = by;
  const log = logger({ tenant_id: tenantId, channel_id: channelId });
  try {
    const row = await findInstagramChannel(db, tenantId, channelId);
    if (!row) {
      log.info("ig_disconnect_failed");
      return refuse(404, "not_found");
    }
    // A token that cannot be read leaves Meta's subscription standing: its deliveries then route nowhere.
    const kept = row.credentials_ref
      ? await readKeptSecret(db, row.id).catch(logAndGoOn("read the token to unsubscribe", null))
      : null;
    const done = await disconnectInstagramAccount(db, { tenantId, channelId, by: userId });
    if (done.outcome === "gone") {
      log.info("ig_disconnect_failed");
      return refuse(404, "not_found");
    }
    if (done.outcome === "already") return json(200, { ok: true });
    const login = recordOrEmpty(row.config).login === "meta" ? "meta" : "instagram";
    const unsubscribed = await stopSending(kept);
    log.info(login === "meta" ? "meta_disconnected" : "ig_disconnected", { unsubscribed });
    return json(200, { ok: true });
  } catch (e) {
    log.info("ig_disconnect_failed", { error: errField(e) });
    return refuse(500, "channel_write_failed");
  }
}
