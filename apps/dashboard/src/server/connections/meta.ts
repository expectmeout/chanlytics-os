/**
 * The Meta link for the dashboard (decision 0117, Instagram API with Unified Login): whether this workspace may connect
 * Meta, the way to Facebook Login for Business's dialog with the app's saved configuration, the callback that proves the
 * signed state and hands the code to the edge, and a disconnect. The edge holds the Meta app's secret and every token and
 * makes every call to Meta (apps/edge/lib/instagram/meta-connect.ts), and reads the workspace's switch (`content_preview`),
 * since a member may not read the config. The one secret used here is the dashboard's own key that signs the OAuth state
 * (Google's: the state names its provider, and each callback refuses another's).
 */
import {
  AppError,
  ROLE_PERMS,
  metaLinesOf,
  recordOrEmpty,
  type InstagramPostable,
  type TenantId,
} from "@chanlytics/contracts";
import { findMetaInstagramRow } from "@chanlytics/db/channels";
import { metaDialogUrl } from "@chanlytics/channels/meta";
import { STATE_TTL_MS, verifyStateFor, signStateFor } from "@chanlytics/channels/tokens";
import { callEdge, edgeConfigured, READY_TTL_MS, type EdgeAnswer, type EdgeBody, type EdgeRead } from "../shared/edge";
import { deployment } from "../shared/env";
import { log } from "../shared/log";
import { serviceDb } from "../shared/service-db";
import { getMemberContext, type RouteContext } from "../shared/with-route";
import type { Member } from "../shared/route";
import { stateSecret } from "./google";
import { countPostsTimed } from "@chanlytics/db/files";
import { logAndGoOn } from "@chanlytics/log";
import { backToConnections, loginReturnOf, findOwnWorkspaceHolding } from "./instagram";

/** The provider a state for Meta names (OAuthState.p): the Google, mailbox and Instagram callbacks refuse it. */
const PROVIDER = "meta";

/** The edge's Meta door, behind the dashboard's own credential, for the workspace and the person it acts for. */
async function edgeMeta(
  body: EdgeBody<"/api/admin/meta/connection">,
  timeoutMs = 20_000,
): Promise<EdgeAnswer<EdgeRead<"/api/admin/meta/connection">>> {
  if (!edgeConfigured()) return { status: 503, body: { ok: false, error: "no_edge_credential" } };
  // A preview never reaches Meta under a business's name, as no provider door does.
  if (!deployment.providersLive) return { status: 503, body: { ok: false, error: "preview" } };
  return callEdge("/api/admin/meta/connection", body, {
    workspace: typeof body.tenant_id === "string" ? body.tenant_id : null,
    user: typeof body.user_id === "string" ? body.user_id : null,
    timeoutMs,
  });
}

/** Whether this workspace may connect Meta here, and the public half of the app the way out is built from. */
interface MetaReadiness {
  ready: boolean;
  app: { client_id: string; config_id: string; redirect_uri: string } | null;
}
const NOT_CONNECTABLE: MetaReadiness = { ready: false, app: null };
/** The edge's word per workspace, kept READY_TTL_MS: Connections asks it on every open, and the switch is per workspace. */
const metaReadyCache = new Map<TenantId, { at: number; value: MetaReadiness }>();

async function metaReadiness(tenantId: TenantId, now = Date.now()): Promise<MetaReadiness> {
  const kept = metaReadyCache.get(tenantId);
  if (kept && now - kept.at < READY_TTL_MS) return kept.value;
  const answer = await edgeMeta({ op: "status", tenant_id: tenantId }, 4_000);
  const body = answer.body ?? {};
  const app = body.app ?? null;
  const value: MetaReadiness =
    answer.status === 200 &&
    body.ok === true &&
    body.ready === true &&
    body.on === true &&
    typeof app?.client_id === "string" &&
    typeof app.config_id === "string" &&
    typeof app.redirect_uri === "string"
      ? { ready: true, app: { client_id: app.client_id, config_id: app.config_id, redirect_uri: app.redirect_uri } }
      : NOT_CONNECTABLE;
  metaReadyCache.set(tenantId, { at: now, value });
  return value;
}

/** Whether the Meta link is switched on for this workspace (the edge's word, kept a while): a post goes to Instagram only then. */
export async function readMetaSwitch(tenantId: TenantId): Promise<boolean> {
  return (await metaReadiness(tenantId)).ready;
}

/**
 * `GET channels/meta`: whether Connect Meta can be offered in this workspace, and to this member; and how many posts
 * wait for their time on Instagram, which a Disconnect would hold and its question says first (decision 0143).
 */
export async function readMeta(
  ctx: RouteContext,
  member: Member,
): Promise<{ ready: boolean; can_connect: boolean; posts_waiting: number }> {
  const ready = (await metaReadiness(member.tenantId)).ready;
  // A count that could not be read says nothing of posts: the question is asked without them, and each is still held
  // and told at its time.
  const waiting = ready
    ? await countPostsTimed(ctx.supabase, member.tenantId, new Date().toISOString(), "instagram").catch(
        logAndGoOn("count the posts a disconnect would hold", 0),
      )
    : 0;
  return { ready, can_connect: ready && ROLE_PERMS[member.role].settings, posts_waiting: waiting };
}

/** `GET channels/meta/connect`: a signed state naming the workspace and the person, then Meta's dialog. */
export async function startMetaConnect(ctx: RouteContext, member: Member): Promise<Response> {
  const ready = await metaReadiness(member.tenantId);
  const secret = stateSecret();
  if (!ready.app || !secret) throw new AppError("conflict", "Connecting Meta is not available here yet.", 409);
  const signIn = { tenantId: member.tenantId, userId: ctx.userId, provider: PROVIDER };
  const state = await signStateFor(secret, signIn, Date.now(), STATE_TTL_MS);
  const url = metaDialogUrl(
    { clientId: ready.app.client_id, configId: ready.app.config_id, redirectUri: ready.app.redirect_uri },
    state,
  );
  return new Response(null, { status: 302, headers: { location: url } });
}

/**
 * `GET channels/meta/callback`: back from Meta with a code and the state. Nothing is trusted until the state proves itself
 * (signed with the dashboard's key, unexpired, naming Meta and the person signed in now); then this person's standing in the
 * workspace it names is judged, and only then does the code go to the edge. Every outcome is a redirect to Connections with
 * one word the row reads once.
 */
export async function handleMetaCallback(ctx: RouteContext, req: Request): Promise<Response> {
  const loginReturn = loginReturnOf(req);
  let slug: string | null = null;
  const back = backToConnections(PROVIDER, loginReturn.origin, () => slug);
  // A person who pressed Cancel in Meta's dialog comes back with error=access_denied.
  const refused = loginReturn.refused;
  if (refused) return back("error", refused === "access_denied" ? "declined" : refused.slice(0, 60));
  const secret = stateSecret();
  if (!secret) return back("error", "not_available");
  const expected = { provider: PROVIDER, userId: ctx.userId };
  const proof = await verifyStateFor(secret, loginReturn.state, expected, Date.now());
  if (!proof.ok) return back("error", proof.reason === "someone_else" ? proof.reason : `state_${proof.reason}`);
  let tenantId: TenantId;
  try {
    const member = await getMemberContext(ctx, proof.tenantId);
    slug = member.slug ?? null;
    if (!ROLE_PERMS[member.role].settings) return back("error", "not_owner");
    tenantId = member.tenantId;
  } catch {
    return back("error", "no_workspace");
  }
  const code = loginReturn.code;
  if (!code) return back("error", "no_code");
  const answer = await edgeMeta({ op: "connect", tenant_id: tenantId, user_id: ctx.userId, code }, 55_000);
  const body = answer.body ?? {};
  if (answer.status !== 200 || body.ok !== true) {
    const reason = typeof body.error === "string" ? body.error : `edge_${answer.status}`;
    log.error("meta_connect_failed", {
      tenant_id: tenantId,
      reason,
      detail: typeof body.detail === "string" ? body.detail.slice(0, 200) : null,
    });
    return back("error", reason, await findOwnWorkspaceHolding(ctx, body.held_by));
  }
  // The row says Connected from the channels read; the next status asks the edge again.
  metaReadyCache.delete(tenantId);
  return back("connected");
}

/** `POST channels/meta/disconnect`: the account let go, its token deleted and its subscription removed. */
export async function disconnectMeta(ctx: RouteContext, member: Member, channelId: string): Promise<{ ok: true }> {
  const answer = await edgeMeta({
    op: "disconnect",
    tenant_id: member.tenantId,
    user_id: ctx.userId,
    channel_id: channelId,
  });
  const body = answer.body ?? {};
  if (answer.status === 404) throw new AppError("not_found", "No account is connected through Meta here.", 404);
  if (answer.status !== 200 || body.ok !== true)
    throw new AppError("upstream_provider", "Meta could not be disconnected just now. Try again.");
  return { ok: true };
}

/**
 * Whether this workspace's Instagram takes a post now; null where the Meta link is not switched on, and nothing is offered.
 * A connection Meta no longer accepts (the daily check's `token_lapsed_at`) is not connected: a press there would only be
 * held a minute later, so it is not offered, and the sheet says to connect again.
 */
export async function readInstagramPostable(tenantId: TenantId): Promise<InstagramPostable | null> {
  if (!(await readMetaSwitch(tenantId))) return null;
  const row = await findMetaInstagramRow(serviceDb(), tenantId);
  if (!row) return "not_connected";
  const config = recordOrEmpty(row.config);
  if (config.token_lapsed_at) return "not_connected";
  return metaLinesOf(config.scopes).publish ? "yes" : "line_off";
}
