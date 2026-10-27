/**
 * Instagram for the dashboard (decision 0001, step 8): whether this deployment can connect an account, the way to
 * Instagram's consent screen, the callback that proves the signed state and hands the code to the edge, and a
 * disconnect. The edge holds the app's secret and every token and makes every call to Instagram (lib/instagram/connect.ts);
 * the one secret used here is the dashboard's own, the key that signs the OAuth state (Google's, which a mailbox's
 * connect signs with too: the state names its provider, and each callback refuses another's).
 */
import { AppError, appLink, ROLE_PERMS } from "@chanlytics/contracts";
import { instagramAuthorizeUrl, newNonce, signState, verifyState, STATE_TTL_MS } from "@chanlytics/channels";
import { callEdge, edgeConfigured, READY_TTL_MS, type EdgeAnswer } from "../edge";
import { deployment } from "../env";
import { log } from "../log";
import { memberContext, type RouteContext } from "../with-route";
import type { Member } from "../route";
import { stateSecret } from "./google";

/** The provider a state for Instagram names (OAuthState.p): the Google and mailbox callbacks refuse it. */
const PROVIDER = "instagram";

/** The edge's Instagram door, behind the dashboard's own credential, for the workspace and the person it acts for. */
export async function edgeInstagram(body: Record<string, unknown>, timeoutMs = 20_000): Promise<EdgeAnswer> {
  if (!edgeConfigured()) return { status: 503, body: { ok: false, error: "no_edge_credential" } };
  // A preview never reaches Instagram under a business's name, as no provider door does.
  if (!deployment.providersLive) return { status: 503, body: { ok: false, error: "preview" } };
  return callEdge("/api/admin/instagram/account", body, {
    workspace: typeof body.tenant_id === "string" ? body.tenant_id : null,
    user: typeof body.user_id === "string" ? body.user_id : null,
    timeoutMs,
  });
}

/** Whether an account can be connected here, and the public half of the app the way out is built from. */
interface InstagramReadiness {
  ready: boolean;
  app: { client_id: string; redirect_uri: string } | null;
}
const NOT_CONNECTABLE: InstagramReadiness = { ready: false, app: null };
let readyCache: { at: number; value: InstagramReadiness } | null = null;

/** The edge's word on the app, kept READY_TTL_MS: a page's Connections asks it on every open. */
export async function instagramReadiness(now = Date.now()): Promise<InstagramReadiness> {
  if (readyCache && now - readyCache.at < READY_TTL_MS) return readyCache.value;
  const a = await edgeInstagram({ op: "status" }, 4_000);
  const b = a.body ?? {};
  const app =
    b.app && typeof b.app === "object" ? (b.app as Partial<Record<"client_id" | "redirect_uri", unknown>>) : null;
  const value: InstagramReadiness =
    a.status === 200 &&
    b.ok === true &&
    b.ready === true &&
    typeof app?.client_id === "string" &&
    typeof app.redirect_uri === "string"
      ? { ready: true, app: { client_id: app.client_id, redirect_uri: app.redirect_uri } }
      : NOT_CONNECTABLE;
  readyCache = { at: now, value };
  return value;
}

/** `GET channels/instagram`: whether Connect Instagram can be offered here, and to this member. */
export async function readInstagram(member: Member): Promise<{ ready: boolean; can_connect: boolean }> {
  const ready = (await instagramReadiness()).ready;
  return { ready, can_connect: ready && !!ROLE_PERMS[member.role]?.settings };
}

/**
 * Where the browser lands after Instagram: Connections, with the outcome in a word the row reads once, on the workspace's
 * own address once the signed state has proved whose workspace it was (contracts appLink), else on the front door.
 */
export function afterInstagram(origin: string, outcome: string, why?: string, slug?: string | null): string {
  return `${origin}${appLink(slug, "admin/integrations", { instagram: outcome, why: why || null })}`;
}

/** `GET channels/instagram/connect`: a signed state naming the workspace and the person, then Instagram's consent screen. */
export async function startInstagramConnect(ctx: RouteContext, member: Member): Promise<Response> {
  const ready = await instagramReadiness();
  const secret = stateSecret();
  if (!ready.app || !secret) throw new AppError("conflict", "Connecting Instagram is not available here yet.", 409);
  const state = await signState(secret, {
    t: member.tenantId,
    u: ctx.userId,
    n: newNonce(),
    exp: Date.now() + STATE_TTL_MS,
    p: PROVIDER,
  });
  const url = instagramAuthorizeUrl({ clientId: ready.app.client_id, redirectUri: ready.app.redirect_uri }, state);
  return new Response(null, { status: 302, headers: { location: url } });
}

/**
 * `GET channels/instagram/callback`: back from Instagram with a code and the state. Nothing is trusted until the state
 * proves itself: signed with the dashboard's key, unexpired, naming Instagram, and naming the person signed in now; then
 * this person's standing in the workspace it names is judged, and only then does the code go to the edge, which trades
 * it. Every outcome is a redirect to Connections with one word the row reads once.
 */
export async function instagramCallback(ctx: RouteContext, req: Request): Promise<Response> {
  const url = new URL(req.url);
  let slug: string | null = null;
  const back = (outcome: string, why?: string) =>
    new Response(null, { status: 302, headers: { location: afterInstagram(url.origin, outcome, why, slug) } });
  // A person who pressed Cancel on Instagram's screen comes back with error=access_denied.
  const refused = url.searchParams.get("error");
  if (refused) return back("error", refused === "access_denied" ? "declined" : refused.slice(0, 60));
  const secret = stateSecret();
  if (!secret) return back("error", "not_available");
  const proof = await verifyState(secret, url.searchParams.get("state"), Date.now());
  if (!proof.ok) return back("error", `state_${proof.reason}`);
  if (proof.state.p !== PROVIDER) return back("error", "state_malformed");
  if (proof.state.u !== ctx.userId) return back("error", "someone_else");
  let tenantId: string;
  try {
    const member = await memberContext(ctx, proof.state.t);
    slug = member.slug ?? null;
    if (!ROLE_PERMS[member.role]?.settings) return back("error", "not_owner");
    tenantId = member.tenantId;
  } catch {
    return back("error", "no_workspace");
  }
  const code = url.searchParams.get("code") ?? "";
  if (!code) return back("error", "no_code");
  const a = await edgeInstagram({ op: "connect", tenant_id: tenantId, user_id: ctx.userId, code }, 55_000);
  const b = a.body ?? {};
  if (a.status !== 200 || b.ok !== true) {
    const reason = typeof b.error === "string" ? b.error : `edge_${a.status}`;
    log.error("instagram_connect_failed", {
      tenant_id: tenantId,
      reason,
      detail: typeof b.detail === "string" ? b.detail.slice(0, 200) : null,
    });
    return back("error", reason);
  }
  return back("connected");
}

/** `POST channels/instagram/disconnect`: the account's row turned off, so nothing it is sent routes. */
export async function disconnectInstagram(ctx: RouteContext, member: Member, channelId: string): Promise<{ ok: true }> {
  const a = await edgeInstagram({
    op: "disconnect",
    tenant_id: member.tenantId,
    user_id: ctx.userId,
    channel_id: channelId,
  });
  const b = a.body ?? {};
  if (a.status === 404) throw new AppError("not_found", "That Instagram account is not connected here.", 404);
  if (a.status !== 200 || b.ok !== true)
    throw new AppError("internal", "Instagram could not be disconnected just now. Try again.", 502);
  return { ok: true };
}
