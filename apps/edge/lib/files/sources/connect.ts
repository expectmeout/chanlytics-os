/**
 * A business's Google Drive connected, and disconnected (the footage sources plan, P2). The code from Google becomes
 * the workspace's connection: the grant checked to hold its door's Drive scope, its token in Vault and never on a row,
 * and the account's row written (one an account and a door in a workspace, so a reconnect writes over its own and
 * keeps its folders).
 *
 * A connection opens one door (the archive PRD 1.1, principle 9; 00683). `watch` reads a folder the business chose,
 * with Drive, read only. `save` reaches only the files the business picks or the app makes, with the narrow scope; a
 * grant for it that came back holding the whole Drive is not kept, so the narrow key is never a wide one. Each door's
 * connect writes its own row and leaves the other's row, token and folders alone.
 *
 * A connect that cannot finish says why, and a grant it does not keep goes back to Google only when no other
 * connection of that Google account rides it: Google ends every token an account gave this project at once, a
 * mailbox's and a Business Profile's among them (shared/google/give-back.ts, the one rule for it; this file never
 * calls Google's revoke another way).
 *
 * An organisation that does not let the app read its Drive gives no grant: the workspace's row says so
 * (`blocked_by_admin`), with nothing to read, until someone connects an account that may.
 *
 * Disconnecting closes each folder's channel, asks the rule whether the grant goes back, drops the token from Vault and
 * removes the account's row, and with it its folders and their items. The Library's files stay.
 *
 * The rollout guard is the workspace's video switch (`features.video_preview`, the plan's D9): until Google has
 * reviewed the app, only a workspace that takes videos may connect. It is a guard on the rollout, not on access.
 */
import { DRIVE_READ_SCOPE, driveScopeOfDoor, driveSource, driveTokenRequest } from "@chanlytics/channels/files";
import {
  grantHasScope,
  idTokenClaims,
  parseTokenResponse,
  revokeRequest,
  type TokenGrant,
} from "@chanlytics/channels/google";
import { fetchFromProvider } from "@chanlytics/channels/shared";
import {
  SECOND_MS,
  normalizeEmail,
  recordOrEmpty,
  videoPreviewOf,
  type SourceDoor,
  type SourceRefusal,
  type TenantId,
} from "@chanlytics/contracts";
import { findWorkspaceNameAndConfig } from "@chanlytics/db/campaigns";
import {
  deleteSourceConnection,
  dropSourceCredentials,
  findSourceConnection,
  listMediaSourcesOfConnection,
  listSourceConnectionsOf,
  putSourceCredentials,
  saveBlockedSourceConnection,
  saveSourceConnection,
  type SourceConnectionRow,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { logAndGoOn } from "@chanlytics/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { giveGoogleGrantBack } from "../../shared/google/give-back.js";
import { errField, type Logger } from "../../shared/log.js";
import { closeChannel } from "./channel.js";
import { driveClient } from "./config.js";
import { getSourceToken, readSourceCredentials } from "./credentials.js";
import { resumeSourcesOf } from "./standing.js";

type Db = SupabaseClient<Database>;

/** One token endpoint call's bound. */
const EXCHANGE_CALL_MS = 15 * SECOND_MS;

/**
 * Google's revoke, asked: the transport the one rule for giving a grant back is handed (give-back.ts), and reached only
 * when that rule finds the grant alone. Nothing else in this file asks it.
 */
async function askRevoke(token: string): Promise<{ status: number }> {
  const request = revokeRequest(token);
  const reply = await fetchFromProvider("google", request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    timeoutMs: EXCHANGE_CALL_MS,
    tries: 1,
  });
  return { status: reply.status };
}

/** Why a connect did not finish. */
export type ConnectRefusal = Extract<
  SourceRefusal,
  | "not_available"
  | "not_enabled"
  | "failed"
  | "blocked_by_admin"
  | "no_account"
  | "scope_missing"
  | "no_refresh_token"
  | "credentials_failed"
>;

type ConnectOutcome =
  | { ok: true; connection: SourceConnectionRow; resumed: number }
  | { ok: false; reason: ConnectRefusal; detail: string | null };

/** Whether the workspace may connect footage yet (the plan's D9); a read that fails is no. */
async function mayConnect(db: Db, tenantId: TenantId): Promise<boolean> {
  const config = await findWorkspaceNameAndConfig(db, tenantId)
    .then((workspace) => workspace.config)
    .catch(logAndGoOn("footage connect: read the video switch", null));
  return config !== null && videoPreviewOf(config);
}

/** The code traded for a grant, or Google's word for why not. */
async function exchange(
  code: string,
  verifier: string | null,
): Promise<{ ok: true; grant: TokenGrant } | { ok: false; refusal: string } | null> {
  const client = driveClient();
  if (!client) return null;
  const request = driveTokenRequest(client, code, verifier);
  const reply = await fetchFromProvider("google", request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    timeoutMs: EXCHANGE_CALL_MS,
    tries: 1,
  });
  if (reply.outcome !== "ok") {
    const answer = recordOrEmpty(reply.json);
    return { ok: false, refusal: typeof answer.error === "string" ? answer.error : `status ${reply.status}` };
  }
  try {
    return { ok: true, grant: parseTokenResponse(reply.json) };
  } catch (error) {
    return { ok: false, refusal: error instanceof Error ? error.message : String(error) };
  }
}

/** What a connect is asked with. */
interface ConnectAsk {
  tenantId: TenantId;
  userId: string | null;
  code: string;
  verifier: string | null;
  /** Which door the grant is for: it must hold that door's Drive scope, and its row is that door's. */
  door: SourceDoor;
}

/**
 * The code from Google becomes the workspace's Drive connection. A reconnect of the same account writes over its row,
 * stores the new token in one step, and resumes the folders that were paused for it.
 */
export async function connectDrive(db: Db, ask: ConnectAsk, log: Logger, now = new Date()): Promise<ConnectOutcome> {
  const refused = (reason: ConnectRefusal, detail: string | null = null): ConnectOutcome => ({
    ok: false,
    reason,
    detail,
  });
  if (!(await mayConnect(db, ask.tenantId))) return refused("not_enabled");
  const traded = await exchange(ask.code, ask.verifier);
  if (traded === null) return refused("not_available");
  if (!traded.ok) {
    // The account's organisation does not let the app read its Drive: no grant was given, and the row says so. That
    // word is a watched folder's; the narrow door refuses the same way and writes none.
    if (/admin_policy_enforced/i.test(traded.refusal)) {
      if (ask.door === "watch")
        await saveBlockedSourceConnection(db, { tenantId: ask.tenantId, by: ask.userId, at: now.toISOString() });
      return refused("blocked_by_admin");
    }
    return refused("failed", traded.refusal.slice(0, 300));
  }
  const { grant } = traded;
  const claims = idTokenClaims(grant.id_token);
  // A grant this connect does not keep, given back unless another connection of its Google account rides it.
  const giveBack = (token: string) => giveGoogleGrantBack(db, { account: claims.sub, token }, askRevoke);
  const email = normalizeEmail(claims.email ?? "");
  if (!claims.sub || !email) {
    await giveBack(grant.refresh_token ?? grant.access_token);
    return refused("no_account");
  }
  if (!grantHasScope(grant, driveScopeOfDoor(ask.door))) {
    await giveBack(grant.refresh_token ?? grant.access_token);
    return refused("scope_missing");
  }
  // The narrow sign-in asks for nothing of the whole Drive and folds in no earlier grant: one that holds it all the
  // same is wider than its door, and is not kept.
  if (ask.door === "save" && grantHasScope(grant, DRIVE_READ_SCOPE)) {
    await giveBack(grant.refresh_token ?? grant.access_token);
    return refused("failed", "a grant wider than its door");
  }
  if (!grant.refresh_token) {
    await giveBack(grant.access_token);
    return refused("no_refresh_token");
  }
  // This door's rows alone: a reconnect is known by its own door's row, and the blocked word ended below is a watched
  // folder's.
  const before = await listSourceConnectionsOf(db, ask.tenantId, ask.door);
  const known = before.some((row) => row.provider_account === claims.sub);
  const connection = await saveSourceConnection(db, {
    tenant_id: ask.tenantId,
    provider_account: claims.sub,
    email,
    door: ask.door,
    scopes: grant.scope.split(/\s+/).filter(Boolean).slice(0, 20),
    connected_by: ask.userId,
    connected_at: now.toISOString(),
  });
  try {
    await putSourceCredentials(db, {
      id: connection.id,
      secret: {
        refresh_token: grant.refresh_token,
        access_token: grant.access_token,
        expires_at: now.getTime() + grant.expires_in * SECOND_MS,
        scope: grant.scope,
      },
      ifRefreshToken: null,
    });
  } catch (error) {
    // Without its token a new row is a lie; a reconnect's row keeps the token it had, which may still read. The rule is
    // asked after the row is gone or kept, so it reads what this failure left behind.
    if (!known) await deleteSourceConnection(db, ask.tenantId, connection.id);
    await giveBack(grant.refresh_token);
    log.error("source_connect_failed", { reason: "credentials", error: errField(error) });
    return refused("credentials_failed");
  }
  // An account that may be read ends the word that one could not.
  for (const row of before.filter((blocked) => blocked.health === "blocked_by_admin"))
    await deleteSourceConnection(db, ask.tenantId, row.id);
  const resumed = await resumeSourcesOf(db, connection, now);
  log.info("source_connected", { connection: connection.id, door: ask.door, again: known, resumed: resumed.length });
  return { ok: true, connection, resumed: resumed.length };
}

/**
 * The account disconnected: every folder's channel closed, the grant given back where nothing else rides it, the token
 * out of Vault, and the row gone with its folders and their items. `revoked` says whether Google took the grant back.
 */
export async function disconnectDrive(
  db: Db,
  named: { tenantId: TenantId; connectionId: string },
  log: Logger,
): Promise<{ removed: boolean; revoked: boolean }> {
  const connection = await findSourceConnection(db, named.tenantId, named.connectionId);
  if (!connection) return { removed: false, revoked: false };
  // The channels first, while the token still reads: a channel left open would signal a folder nobody watches.
  const token = await getSourceToken(db, connection.id).catch(logAndGoOn("footage disconnect: a token", null));
  if (token?.ok) {
    const drive = driveSource();
    for (const source of await listMediaSourcesOfConnection(db, named.tenantId, connection.id))
      await closeChannel({ drive, token: token.token, log, source }, source.channel_id, source.channel_resource_id);
  }
  const kept = await readSourceCredentials(db, connection.id).catch(
    logAndGoOn("footage disconnect: credentials", null),
  );
  let revoked = false;
  if (kept) {
    // The row is still there (it goes last), so it is named as the one leaving.
    const outcome = await giveGoogleGrantBack(
      db,
      { account: connection.provider_account, token: kept.refresh_token, leaving: { source: connection.id } },
      askRevoke,
    );
    revoked = outcome === "given";
  }
  // Before the row goes: it is what a token left in Vault would be found by, and a retry starts from it.
  await dropSourceCredentials(db, connection.id);
  await deleteSourceConnection(db, named.tenantId, connection.id);
  log.info("source_disconnected", { connection: connection.id, revoked });
  return { removed: true, revoked };
}
