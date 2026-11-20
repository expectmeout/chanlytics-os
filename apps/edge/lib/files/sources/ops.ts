/**
 * POST /api/admin/sources: a business's footage sources (the footage sources plan, P2). The dashboard's server calls
 * it for a member who may change the workspace's settings: the OAuth client's secret, every token and Google's wire
 * live on the edge and nowhere else.
 *
 * The door is api/admin/sources.ts: it reads the body once as text (the token's body hash is checked over those
 * bytes) and asks who is knocking (authorizeAdmin); everything after is here.
 *
 *   { op: "readiness" }                                        → whether Drive is offered here, and its client's public half
 *   { op: "connect", tenant_id, user_id, code, code_verifier? } → the grant exchanged and checked, the account's row
 *   { op: "disconnect", tenant_id, connection_id }              → its channels closed, its grant given back where
 *                                                                 nothing else rides it, its row and folders gone
 *   { op: "folders", tenant_id, connection_id, place, folder_id?, page? }
 *                                                               → one level of the folder chooser, folders only
 *   { op: "folder", tenant_id, connection_id, folder_id }       → that folder as its account names it (a pasted link)
 *   { op: "watch", tenant_id, connection_id, folder_id, include_subfolders? }
 *                                                               → the folder watched: its place saved, its walk begun
 *   { op: "check" | "confirm" | "stop", tenant_id, source_id }  → read now; a held wave confirmed; no longer watched
 *
 * A refusal answers the code a caller compares, with its reason beside it for the owner's words.
 */
import {
  SECOND_MS,
  TRY_AGAIN_IN_A_MINUTE,
  UUID,
  isTenantId,
  textOrEmpty,
  type DoorRead,
  type SOURCES_DOOR,
} from "@chanlytics/contracts";
import type { TenantId } from "@chanlytics/contracts";
import type { DrivePlace } from "@chanlytics/channels/files";
import { personFor, workspaceFor, type Admitted } from "../../shared/admin-auth.js";
import { json, refuse } from "../../shared/http.js";
import { errField, logger, type Logger } from "../../shared/log.js";
import { pg } from "../../shared/pg.js";
import { sourcesReadiness } from "./config.js";
import { connectDrive, disconnectDrive, type ConnectRefusal } from "./connect.js";
import {
  checkSourceNow,
  confirmSourceHold,
  listFolderChoices,
  nameFolder,
  stopWatching,
  watchFolder,
  type WatchRefusal,
} from "./watch.js";

type Body = DoorRead<typeof SOURCES_DOOR>;
type Db = NonNullable<ReturnType<typeof pg>>;

const SOURCE_OPS = new Set(["connect", "disconnect", "folders", "folder", "watch", "check", "confirm", "stop"]);

/** A connect that did not finish, as the code a caller compares, with its reason beside it. */
function connectRefused(reason: ConnectRefusal): Response {
  switch (reason) {
    case "not_available":
      return json(503, { ok: false, error: "no_oauth_client", reason });
    case "not_enabled":
      return json(503, { ok: false, error: "not_ready", reason });
    case "failed":
      return json(502, { ok: false, error: "exchange_failed", reason });
    case "blocked_by_admin":
      return json(502, { ok: false, error: "google_refused", reason });
    case "no_account":
      return json(400, { ok: false, error: "no_account", reason });
    case "scope_missing":
      return json(400, { ok: false, error: "scope_missing", reason });
    case "no_refresh_token":
      return json(400, { ok: false, error: "no_refresh_token", reason });
    case "credentials_failed":
      return json(500, { ok: false, error: "credentials_failed", reason });
  }
}

/** An act on an account or a folder that was not done, the same way. */
function watchRefused(reason: WatchRefusal): Response {
  if (typeof reason === "object")
    return json(503, { ok: false, error: "unavailable", reason: "busy", rest_s: Math.ceil(reason.restMs / SECOND_MS) });
  switch (reason) {
    case "not_found":
      return json(404, { ok: false, error: "not_found", reason });
    case "needs_reconnect":
      return json(409, { ok: false, error: "provider_unauthorized", reason });
    case "unavailable":
      return json(503, { ok: false, error: "unavailable", reason });
    case "no_access":
      return json(502, { ok: false, error: "unreadable", reason });
    case "too_many":
      return json(409, { ok: false, error: "too_many", reason });
  }
}

/** The chooser's place as the body names it: a folder opened needs its id. */
function drivePlaceOf(body: Body): DrivePlace | null {
  if (body.place === "mine" || body.place === "drives" || body.place === "shared") return { place: body.place };
  const id = textOrEmpty(body.folder_id);
  return body.place === "folder" && id ? { place: "folder", id } : null;
}

/** What every op is run with. */
interface OpContext {
  db: Db;
  tenantId: TenantId;
  by: string | null;
  log: Logger;
}

async function connectOp({ db, tenantId, by, log }: OpContext, body: Body): Promise<Response> {
  const code = textOrEmpty(body.code);
  if (!code || code.length > 4_096) return refuse(400, "bad_request", "code is required");
  const verifier = textOrEmpty(body.code_verifier);
  if (verifier && !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))
    return refuse(400, "bad_request", "code_verifier is PKCE's verifier");
  const out = await connectDrive(db, { tenantId, userId: by, code, verifier: verifier || null }, log);
  if (out.ok) return json(200, { ok: true, connection_id: out.connection.id, resumed: out.resumed });
  log.warn("source_connect_refused", { reason: out.reason, detail: out.detail });
  return connectRefused(out.reason);
}

/** An op on one of the workspace's accounts. */
async function accountOp({ db, tenantId, log }: OpContext, op: string, body: Body): Promise<Response> {
  const connectionId = textOrEmpty(body.connection_id);
  if (!UUID.test(connectionId)) return refuse(400, "bad_request", "connection_id is an account's id");
  if (op === "disconnect") {
    const out = await disconnectDrive(db, { tenantId, connectionId }, log);
    return out.removed ? json(200, { ok: true, removed: true, revoked: out.revoked }) : watchRefused("not_found");
  }
  if (op === "folders") {
    const where = drivePlaceOf(body);
    if (!where) return refuse(400, "bad_request", "place is mine, drives, shared, or folder with its folder_id");
    const out = await listFolderChoices(
      db,
      { tenantId, connectionId, where, page: textOrEmpty(body.page) || null },
      log,
    );
    return out.ok
      ? json(200, { ok: true, folders: out.choices.folders, next_page: out.choices.nextPage })
      : watchRefused(out.reason);
  }
  const folderId = textOrEmpty(body.folder_id);
  if (!folderId || folderId.length > 200) return refuse(400, "bad_request", "folder_id is a folder's id");
  if (op === "folder") {
    const named = await nameFolder(db, { tenantId, connectionId, folderId }, log);
    return named.ok
      ? json(200, { ok: true, folders: [{ id: named.folder.id, name: named.folder.name }], next_page: null })
      : watchRefused(named.reason);
  }
  const out = await watchFolder(
    db,
    { tenantId, connectionId, folderId, includeSubfolders: body.include_subfolders !== false },
    log,
  );
  return out.ok ? json(200, { ok: true, source_id: out.source.id, made: out.made }) : watchRefused(out.reason);
}

/** An op on one of the workspace's watched folders. */
async function sourceOp({ db, tenantId, log }: OpContext, op: string, body: Body): Promise<Response> {
  const sourceId = textOrEmpty(body.source_id);
  if (!UUID.test(sourceId)) return refuse(400, "bad_request", "source_id is a watched folder's id");
  const named = { tenantId, sourceId };
  if (op === "check") {
    const out = await checkSourceNow(db, named);
    return out.ok ? json(200, { ok: true, scheduled: out.scheduled }) : watchRefused(out.reason);
  }
  if (op === "confirm") {
    const out = await confirmSourceHold(db, named);
    return out.ok ? json(200, { ok: true }) : watchRefused(out.reason);
  }
  const out = await stopWatching(db, named, log);
  return out.ok ? json(200, { ok: true, source_id: out.source.id }) : watchRefused(out.reason);
}

export async function runSourcesOp(auth: Admitted, body: Body): Promise<Response> {
  const workspace = workspaceFor(auth, body.tenant_id);
  if (!workspace.ok) return workspace.response;
  const op = textOrEmpty(body.op);
  if (op === "readiness") return json(200, { ok: true, ...sourcesReadiness() });
  if (!SOURCE_OPS.has(op)) return refuse(400, "unknown_op");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const tenantId = workspace.tenantId ?? "";
  if (!isTenantId(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const log = logger({ door: "sources", tenant_id: tenantId, op });
  const context: OpContext = { db, tenantId, by: personFor(auth, body.user_id), log };
  try {
    if (op === "connect") return await connectOp(context, body);
    if (op === "disconnect" || op === "folders" || op === "folder" || op === "watch")
      return await accountOp(context, op, body);
    return await sourceOp(context, op, body);
  } catch (error) {
    log.error("source_door_failed", { error: errField(error) });
    return refuse(503, "unavailable", TRY_AGAIN_IN_A_MINUTE);
  }
}
