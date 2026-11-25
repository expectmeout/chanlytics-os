/**
 * A business's watched folder, for the dashboard (the footage sources plan, P5): whether connecting Google Drive is
 * offered here, the way to Google's own window and back, one level of the folder chooser, and the acts on a folder
 * (watch, check now, stop) and on the account (disconnect). The edge holds the Google app's secret and every token
 * and makes every call to Google (apps/edge/lib/files/sources/ops.ts); the one secret used here is the dashboard's
 * own key that signs the state a sign-in leaves and comes back with.
 *
 * Connecting reads a person's Drive, so it is an owner's or a partner's (the canvas's call 10): the routes say so, and
 * the callback asks again once the state has proved who came back. Every refusal is said in the owner's words: what
 * happened, whether anything changed, and the one thing to do. Never Google's wording and never a code.
 */
import "server-only";
import { z } from "zod";
import {
  AppError,
  ROLE_PERMS,
  SECOND_MS,
  SOURCE_REFUSALS,
  appLink,
  connectStoppedOf,
  isOneOf,
  type DoorAnswer,
  type FootagePassedDto,
  type SOURCES_DOOR,
  type TenantId,
} from "@chanlytics/contracts";
import { driveAuthorizeUrl } from "@chanlytics/channels/files";
import { makeMailboxPkceChallenge, makeMailboxPkceVerifier } from "@chanlytics/channels/email";
import { newNonce, signState, STATE_TTL_MS, verifyState } from "@chanlytics/channels/tokens";
import {
  listMediaSourcesOf,
  listSourceConnectionsOf,
  listSourceItemsPassed,
  countSourcedFiles,
  readingAccountOf,
  watchedFolderOf,
  type MediaSourceRow,
  removeSourcedFiles,
} from "@chanlytics/db/files";
import { stateSecret } from "../connections/google";
import { callEdge, edgeConfigured, READY_TTL_MS, type EdgeAnswer, type EdgeBody } from "../shared/edge";
import { deployment } from "../shared/env";
import { log } from "../shared/log";
import type { Member } from "../shared/route";
import { getMemberContext, type RouteContext } from "../shared/with-route";

/** The provider a state for a Drive sign-in names: every other sign-in's callback refuses it. */
const SOURCE_PROVIDER = "drive";

/** The page Google's window comes back to: Connections, whose row reads the word once and, in a window of Google's, closes. */
const BACK_TO = "admin/integrations";

type SourcesAnswer = EdgeAnswer<DoorAnswer<typeof SOURCES_DOOR>>;

/** The edge's door for footage sources, behind the dashboard's own credential, for the workspace and the person it acts for. */
async function edgeSources(body: EdgeBody<"/api/admin/sources">, timeoutMs = 20 * SECOND_MS): Promise<SourcesAnswer> {
  if (!edgeConfigured()) return { status: 503, body: { ok: false, error: "no_edge_credential" } };
  // A preview never signs a business's Google account in, as no provider door does.
  if (!deployment.providersLive) return { status: 503, body: { ok: false, error: "preview" } };
  return callEdge("/api/admin/sources", body, {
    workspace: typeof body.tenant_id === "string" ? body.tenant_id : null,
    user: typeof body.user_id === "string" ? body.user_id : null,
    timeoutMs,
  });
}

/** Whether a Drive connect is offered on this deployment, and the public half of the client the way out is built from. */
interface SourcesReadiness {
  client: { client_id: string; redirect_uri: string } | null;
}
const NOT_OFFERED: SourcesReadiness = { client: null };
/** Each workspace's answer, kept briefly: the edge offers Drive in the workspaces SOURCES_WORKSPACES names. */
const driveReady = new Map<TenantId, { at: number; value: SourcesReadiness }>();
/** "Not offered" is kept briefly: a setting made a minute ago must not hide Connect for five. */
const DRIVE_NOT_READY_TTL_MS = 30 * SECOND_MS;

async function sourcesReadiness(tenantId: TenantId, now = Date.now()): Promise<SourcesReadiness> {
  const kept = driveReady.get(tenantId);
  if (kept && now - kept.at < (kept.value.client ? READY_TTL_MS : DRIVE_NOT_READY_TTL_MS)) return kept.value;
  const answer = await edgeSources({ op: "readiness", tenant_id: tenantId }, 4 * SECOND_MS);
  const client = answer.body?.oauth ?? null;
  const value: SourcesReadiness =
    answer.status === 200 &&
    answer.body?.ok === true &&
    answer.body.drive === true &&
    typeof client?.client_id === "string" &&
    typeof client.redirect_uri === "string"
      ? { client: { client_id: client.client_id, redirect_uri: client.redirect_uri } }
      : NOT_OFFERED;
  driveReady.set(tenantId, { at: now, value });
  return value;
}

/** Whether connecting Google Drive is offered on this deployment: the folder's reader asks it. */
export async function isDriveOffered(tenantId: TenantId): Promise<boolean> {
  return (await sourcesReadiness(tenantId)).client !== null;
}

/* ------------------------------------------------------------------------------------------------ the sign-in */

/**
 * `GET sources/connect`: a signed state naming the workspace, the person and this sign-in, then Google's own window,
 * asked with PKCE's challenge. An account that is to be connected again is asked for by its address, so the person
 * signs in as the account the folder is read through.
 */
export async function startSourceConnect(ctx: RouteContext, member: Member): Promise<Response> {
  const ready = await sourcesReadiness(member.tenantId);
  const secret = stateSecret();
  if (!ready.client || !secret) throw new AppError("conflict", connectStoppedOf("not_available").say, 409);
  const accounts = await listSourceConnectionsOf(ctx.supabase, member.tenantId, "watch");
  const again = accounts.find((account) => account.health === "needs_reconnect") ?? null;
  const nonce = newNonce();
  const state = await signState(secret, {
    t: member.tenantId,
    u: ctx.userId,
    n: nonce,
    exp: Date.now() + STATE_TTL_MS,
    p: SOURCE_PROVIDER,
    k: 1,
  });
  const challenge = await makeMailboxPkceChallenge(await makeMailboxPkceVerifier(secret, nonce));
  const url = driveAuthorizeUrl({ clientId: ready.client.client_id, redirectUri: ready.client.redirect_uri }, state, {
    door: "watch",
    loginHint: again?.email ?? null,
    challenge,
  });
  return new Response(null, { status: 302, headers: { location: url } });
}

/** What Google's window comes back with: the state it left with, and a code, or an error where the person backed out. */
const WindowReturn = z.object({
  state: z.string().optional(),
  error: z.string().optional(),
  code: z.string().optional(),
});

/** The way back after Google's window, with the outcome in a word the row reads once. */
function backToConnections(origin: string, slugOf: () => string | null): (outcome: string, why?: string) => Response {
  return (outcome, reason) =>
    new Response(null, {
      status: 302,
      headers: { location: `${origin}${appLink(slugOf(), BACK_TO, { drive: outcome, why: reason || null })}` },
    });
}

/**
 * `GET sources/connect/callback`: back from Google with a code and the state. Nothing is trusted until the state
 * proves itself (signed with the dashboard's key, unexpired, naming this sign-in and the person signed in now); then
 * this person's standing in the workspace it names is judged, and only then does the code go to the edge. Every outcome
 * is a redirect with one word: `connected`, `closed` (the person backed out, nothing changed), or `error` with why.
 */
export async function handleSourceCallback(ctx: RouteContext, request: Request): Promise<Response> {
  const returned = new URL(request.url);
  const query = WindowReturn.parse(Object.fromEntries(returned.searchParams));
  let slug: string | null = null;
  const back = backToConnections(returned.origin, () => slug);
  const secret = stateSecret();
  if (!secret) return back("error", "not_available");
  const proof = await verifyState(secret, query.state ?? null, Date.now());
  // A state made for another sign-in, or by someone else, proves nothing here.
  const mine = proof.ok && proof.state.p === SOURCE_PROVIDER && proof.state.u === ctx.userId ? proof.state : null;
  // Google's Cancel comes back with error=access_denied and the state: nothing was connected. Without a proven state
  // the workspace is unknown, and the word is said on the front door.
  let tenantId: TenantId | null = null;
  if (mine) {
    try {
      const member = await getMemberContext(ctx, mine.t);
      slug = member.slug ?? null;
      if (!ROLE_PERMS[member.role].settings) return back("error", "not_allowed");
      tenantId = member.tenantId;
    } catch {
      return back("error", "failed");
    }
  }
  if (query.error) return back("closed");
  if (!mine || !tenantId) return back("error", "failed");
  const code = query.code ?? "";
  if (!code) return back("closed");
  const answer = await edgeSources(
    {
      op: "connect",
      tenant_id: tenantId,
      user_id: ctx.userId,
      code,
      ...(mine.k === 1 ? { code_verifier: await makeMailboxPkceVerifier(secret, mine.n) } : {}),
    },
    55 * SECOND_MS,
  );
  const body = answer.body ?? {};
  if (answer.status !== 200 || body.ok !== true) {
    const reason = sourcesRefusedFor(answer) ?? "failed";
    log.warn("source_connect_failed", { tenant_id: tenantId, reason });
    return back("error", reason);
  }
  return back("connected");
}

/* ------------------------------------------------------------------------------------------------ the acts */

/**
 * Why the edge's sources door refused, read once (the review of 20 Nov, finding 5): its reason where the door gave one
 * of SOURCE_REFUSALS, else its code (`preview`, `provider_unauthorized`, `unreadable` are codes beside them); null where
 * it answered nothing.
 */
function sourcesRefusedFor(answer: SourcesAnswer): string | null {
  const body = answer.body ?? {};
  if (isOneOf(SOURCE_REFUSALS, body.reason)) return body.reason;
  return typeof body.error === "string" ? body.error : null;
}

/** The words a refusal of the edge's is said in. `doing` finishes "Couldn't ...". */
function sourceRefusalOf(answer: SourcesAnswer, doing: string): AppError {
  switch (sourcesRefusedFor(answer)) {
    case "preview":
      return new AppError("unavailable", "Google Drive can't be connected or changed from a preview.");
    case "needs_reconnect":
    case "provider_unauthorized":
      return new AppError("conflict", "Google signed this account out. Connect it again first.", 409);
    // Google will not let the connected account open it: the one refusal a page says in its own words, by this code.
    case "no_access":
    case "unreadable":
      return new AppError("forbidden", "That folder can't be opened with the connected account.", 403);
    case "not_found":
      return new AppError("not_found", "That isn't there any more.", 404);
    case "too_many":
      return new AppError("conflict", "One folder is watched for now. Stop watching it to choose another.", 409);
    case "busy":
      return new AppError("unavailable", "Google is busy right now. Try again in a minute.");
    default:
      return new AppError("upstream_provider", `Couldn't ${doing} just now. Nothing changed. Try again.`);
  }
}

/** The workspace's Google account that folders are read through, on the member's own read; null where none is connected. */
async function connectionIdOf(ctx: RouteContext, tenantId: TenantId): Promise<string | null> {
  const accounts = await listSourceConnectionsOf(ctx.supabase, tenantId, "watch");
  return readingAccountOf(accounts)?.id ?? null;
}

/** The folder the workspace watches, on the member's own read; null where none is. */
async function watchedOf(ctx: RouteContext, tenantId: TenantId): Promise<MediaSourceRow | null> {
  return watchedFolderOf(await listMediaSourcesOf(ctx.supabase, tenantId));
}

const NOT_CONNECTED = () => new AppError("conflict", "Google Drive isn't connected yet.", 409);
/** A folder gone or unshared between choosing it and the press: nothing is watched, and choosing another is the way on. */
const CANT_OPEN_NOW = () =>
  new AppError("forbidden", "That folder can't be opened any more, so nothing is watched. Choose another.", 403);

/** One level of the chooser: where it looks, and the page of it. */
interface FolderChoicesAsk {
  place: "mine" | "drives" | "shared" | "folder";
  folder_id?: string;
  page?: string;
}

/** `GET sources/folders`: one level of the folder chooser, folders only, a page of them. */
export async function listSourceFolders(
  ctx: RouteContext,
  member: Member,
  ask: FolderChoicesAsk,
): Promise<{ folders: { id: string; name: string }[]; next_page: string | null }> {
  const connectionId = await connectionIdOf(ctx, member.tenantId);
  if (!connectionId) throw NOT_CONNECTED();
  const answer = await edgeSources({
    op: "folders",
    tenant_id: member.tenantId,
    user_id: ctx.userId,
    connection_id: connectionId,
    place: ask.place,
    ...(ask.folder_id ? { folder_id: ask.folder_id } : {}),
    ...(ask.page ? { page: ask.page } : {}),
  });
  const body = answer.body ?? {};
  if (answer.status !== 200 || body.ok !== true) throw sourceRefusalOf(answer, "load your folders");
  return { folders: body.folders ?? [], next_page: body.next_page ?? null };
}

/**
 * `POST sources/watch`: the folder watched from now on. With `instead`, the folder watched until now is stopped
 * first (one folder a workspace: the canvas's call 9); what came in from it stays.
 */
export async function watchSourceFolder(
  ctx: RouteContext,
  member: Member,
  ask: { folder_id: string; include_subfolders: boolean; instead: boolean },
): Promise<{ source_id: string }> {
  const connectionId = await connectionIdOf(ctx, member.tenantId);
  if (!connectionId) throw NOT_CONNECTED();
  // One ask, a switch too: the edge opens the new folder and reads its place before it stops the one watched now, so a
  // folder that can't be watched never costs the one that is.
  const answer = await edgeSources(
    {
      op: "watch",
      tenant_id: member.tenantId,
      user_id: ctx.userId,
      connection_id: connectionId,
      folder_id: ask.folder_id,
      include_subfolders: ask.include_subfolders,
      instead: ask.instead,
    },
    30 * SECOND_MS,
  );
  const body = answer.body ?? {};
  if (answer.status !== 200 || body.ok !== true || typeof body.source_id !== "string") {
    // Gone between choosing it and the press: the folder's own words, as one that can't be opened is said.
    const refused = sourcesRefusedFor(answer);
    if (refused === "not_found" || refused === "no_access") throw CANT_OPEN_NOW();
    throw sourceRefusalOf(answer, "start watching that folder");
  }
  return { source_id: body.source_id };
}

/** `POST sources/check`: the watched folder is looked at now. */
export async function checkSourceNow(ctx: RouteContext, member: Member): Promise<{ scheduled: boolean }> {
  const watched = (await watchedOf(ctx, member.tenantId))?.id;
  if (!watched) throw new AppError("conflict", "No folder is watched.", 409);
  const answer = await edgeSources({
    op: "check",
    tenant_id: member.tenantId,
    user_id: ctx.userId,
    source_id: watched,
  });
  if (answer.status !== 200 || answer.body?.ok !== true) throw sourceRefusalOf(answer, "look now");
  return { scheduled: answer.body.scheduled === true };
}

/**
 * `POST sources/older`: the watched folder's older files, asked for on AI's card (the footage screens' call 7): what its
 * first look left in Drive comes in by itself, at the day's pace. Answers how many were asked for.
 */
export async function askForOlderSourceFiles(ctx: RouteContext, member: Member): Promise<{ asked: number }> {
  const watched = (await watchedOf(ctx, member.tenantId))?.id;
  if (!watched) throw new AppError("conflict", "No folder is watched.", 409);
  const answer = await edgeSources({
    op: "older",
    tenant_id: member.tenantId,
    user_id: ctx.userId,
    source_id: watched,
  });
  if (answer.status !== 200 || answer.body?.ok !== true) throw sourceRefusalOf(answer, "ask for the older files");
  return { asked: typeof answer.body.asked === "number" ? answer.body.asked : 0 };
}

/** `POST sources/stop`: the folder is no longer watched. The account stays connected, and what came in stays. */
export async function stopSourceWatch(ctx: RouteContext, member: Member): Promise<{ stopped: boolean }> {
  const watched = (await watchedOf(ctx, member.tenantId))?.id;
  if (!watched) return { stopped: false };
  const answer = await edgeSources({ op: "stop", tenant_id: member.tenantId, user_id: ctx.userId, source_id: watched });
  if (answer.status !== 200 || answer.body?.ok !== true) throw sourceRefusalOf(answer, "stop watching");
  return { stopped: true };
}

/**
 * `POST sources/disconnect`: the account is let go. Chanlytics drops its key at once, nothing new comes in, and what
 * came in stays. `revoked` says whether Google took the grant back: it does not while a mailbox or a Business Profile
 * of the same Google account is connected here, and the sheet says so before the press.
 */
export async function disconnectSource(ctx: RouteContext, member: Member): Promise<{ revoked: boolean }> {
  // The watched folder's accounts alone: a narrow key that chooses and saves is not this press's to end (00686).
  const accounts = await listSourceConnectionsOf(ctx.supabase, member.tenantId, "watch");
  let revoked = false;
  // Every account is let go, one failing or not, and the one that failed is named (the review of 20 Nov, finding 14):
  // stopping at the first left the rest connected with no word of which.
  let failed: Error | null = null;
  for (const account of accounts) {
    const answer = await edgeSources(
      { op: "disconnect", tenant_id: member.tenantId, user_id: ctx.userId, connection_id: account.id },
      40 * SECOND_MS,
    );
    if (answer.status !== 200 || answer.body?.ok !== true) {
      failed ??= sourceRefusalOf(answer, `disconnect ${account.email ?? "Google Drive"}`);
      continue;
    }
    revoked = revoked || answer.body.revoked === true;
  }
  if (failed) throw failed;
  return { revoked };
}

/**
 * `GET sources/leaving`: what a stop and a disconnect say before the press: how many photos and videos came from the
 * folder and stay, how many clips are kept in Drive now (they play again only while a folder is watched), and how many
 * a post or a video used. Counted on the member's own session: the tally's door asks that they belong (00717).
 */
export async function readSourceLeaving(
  ctx: RouteContext,
  member: Member,
): Promise<{ files: number; away: number; used: number }> {
  return countSourcedFiles(ctx.supabase, member.tenantId);
}

/**
 * `POST sources/remove`: "Remove what came from it too" (the canvas's Settings 19), pressed beside Stop watching or
 * Disconnect: what the watched folders brought and nothing used leaves the Library, on the member's own session (the
 * door holds them to the settings permission). Never the default; a file a post or a video used stays.
 */
export async function removeSourceFiles(ctx: RouteContext, member: Member): Promise<{ removed: number; kept: number }> {
  return removeSourcedFiles(ctx.supabase, member.tenantId);
}

/**
 * `GET sources/contents`: what the watched folder holds that is not in the Library, counted by where it stands and why:
 * what its sheet lists under what came in. Read on the member's own session, when the sheet is opened.
 */
export async function readSourceContents(ctx: RouteContext, member: Member): Promise<{ rows: FootagePassedDto[] }> {
  const watched = (await watchedOf(ctx, member.tenantId))?.id;
  if (!watched) return { rows: [] };
  return { rows: await listSourceItemsPassed(ctx.supabase, { tenantId: member.tenantId, sourceId: watched }) };
}

/**
 * A pasted folder, named by the account folders are read through: `{ id, name }`; `shut` where that account cannot
 * open it (or it is not a folder there); null where no account is connected or Google could not be asked, so whoever
 * asked goes on without its name.
 */
export async function nameSourceFolder(
  ctx: RouteContext,
  tenantId: TenantId,
  folderId: string,
): Promise<{ id: string; name: string } | "shut" | null> {
  const connectionId = await connectionIdOf(ctx, tenantId);
  if (!connectionId) return null;
  const answer = await edgeSources({
    op: "folder",
    tenant_id: tenantId,
    user_id: ctx.userId,
    connection_id: connectionId,
    folder_id: folderId,
  });
  const body = answer.body ?? {};
  const folder = answer.status === 200 && body.ok === true ? body.folders?.[0] : undefined;
  if (folder) return folder;
  const refused = sourcesRefusedFor(answer);
  return refused === "no_access" || refused === "unreadable" || refused === "not_found" ? "shut" : null;
}

/** `GET sources/folder`: a pasted folder as the connected account names it, or that it cannot be opened. */
export async function readSourceFolder(
  ctx: RouteContext,
  member: Member,
  folderId: string,
): Promise<{ folder: { id: string; name: string } | null; shut: boolean }> {
  const named = await nameSourceFolder(ctx, member.tenantId, folderId);
  return named === "shut" || named === null ? { folder: null, shut: named === "shut" } : { folder: named, shut: false };
}
