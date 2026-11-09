/**
 * The Meta link for the dashboard (decision 0117, Instagram API with Unified Login): whether this workspace may connect
 * Meta, the way to Facebook Login for Business's dialog with the app's saved configuration, the callback that proves the
 * signed state and hands the code to the edge, and a disconnect. The edge holds the Meta app's secret and every token and
 * makes every call to Meta (apps/edge/lib/instagram/meta-connect.ts), and reads the workspace's switch (`content_preview`),
 * since a member may not read the config. The one secret used here is the dashboard's own key that signs the OAuth state
 * (Google's: the state names its provider, and each callback refuses another's).
 */
import { AppError, appLink, ROLE_PERMS, type TenantId } from "@chanlytics/contracts";
import { metaDialogUrl } from "@chanlytics/channels/instagram";
import { newNonce, signState, verifyState, STATE_TTL_MS } from "@chanlytics/channels/google";
import { callEdge, edgeConfigured, READY_TTL_MS, type EdgeAnswer, type EdgeBody, type EdgeRead } from "../shared/edge";
import { deployment } from "../shared/env";
import { log } from "../shared/log";
import { getMemberContext, type RouteContext } from "../shared/with-route";
import type { Member } from "../shared/route";
import { stateSecret } from "./google";

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
const readyCache = new Map<TenantId, { at: number; value: MetaReadiness }>();

async function metaReadiness(tenantId: TenantId, now = Date.now()): Promise<MetaReadiness> {
  const kept = readyCache.get(tenantId);
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
  readyCache.set(tenantId, { at: now, value });
  return value;
}

/** `GET channels/meta`: whether Connect Meta can be offered in this workspace, and to this member. */
export async function readMeta(member: Member): Promise<{ ready: boolean; can_connect: boolean }> {
  const ready = (await metaReadiness(member.tenantId)).ready;
  return { ready, can_connect: ready && !!ROLE_PERMS[member.role]?.settings };
}

/** Where the browser lands after Meta: Connections, with the outcome in a word the row reads once. */
function afterMeta(origin: string, outcome: string, reason?: string, slug?: string | null): string {
  return `${origin}${appLink(slug, "admin/integrations", { meta: outcome, why: reason || null })}`;
}

/** `GET channels/meta/connect`: a signed state naming the workspace and the person, then Meta's dialog. */
export async function startMetaConnect(ctx: RouteContext, member: Member): Promise<Response> {
  const ready = await metaReadiness(member.tenantId);
  const secret = stateSecret();
  if (!ready.app || !secret) throw new AppError("conflict", "Connecting Meta is not available here yet.", 409);
  const state = await signState(secret, {
    t: member.tenantId,
    u: ctx.userId,
    n: newNonce(),
    exp: Date.now() + STATE_TTL_MS,
    p: PROVIDER,
  });
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
  const url = new URL(req.url);
  let slug: string | null = null;
  const back = (outcome: string, reason?: string) =>
    new Response(null, { status: 302, headers: { location: afterMeta(url.origin, outcome, reason, slug) } });
  // A person who pressed Cancel in Meta's dialog comes back with error=access_denied.
  const refused = url.searchParams.get("error");
  if (refused) return back("error", refused === "access_denied" ? "declined" : refused.slice(0, 60));
  const secret = stateSecret();
  if (!secret) return back("error", "not_available");
  const proof = await verifyState(secret, url.searchParams.get("state"), Date.now());
  if (!proof.ok) return back("error", `state_${proof.reason}`);
  if (proof.state.p !== PROVIDER) return back("error", "state_malformed");
  if (proof.state.u !== ctx.userId) return back("error", "someone_else");
  let tenantId: TenantId;
  try {
    const member = await getMemberContext(ctx, proof.state.t);
    slug = member.slug ?? null;
    if (!ROLE_PERMS[member.role]?.settings) return back("error", "not_owner");
    tenantId = member.tenantId;
  } catch {
    return back("error", "no_workspace");
  }
  const code = url.searchParams.get("code") ?? "";
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
    return back("error", reason);
  }
  // The row says Connected from the channels read; the next status asks the edge again.
  readyCache.delete(tenantId);
  return back("connected");
}

/** `POST channels/meta/disconnect`: the account's row turned off, and its subscription removed. */
export async function disconnectMeta(ctx: RouteContext, member: Member, channelId: string): Promise<{ ok: true }> {
  const answer = await edgeMeta({
    op: "disconnect",
    tenant_id: member.tenantId,
    user_id: ctx.userId,
    channel_id: channelId,
  });
  const body = answer.body ?? {};
  if (answer.status === 404) throw new AppError("not_found", "That Instagram account is not connected here.", 404);
  if (answer.status !== 200 || body.ok !== true)
    throw new AppError("upstream_provider", "Meta could not be disconnected just now. Try again.");
  return { ok: true };
}
