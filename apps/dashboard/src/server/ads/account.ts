/**
 * An owner's ad account, for the dashboard (decision 0049, step P1; decision 0050, call 2): whether Connect is offered
 * here, the way to Meta's own window with the app's saved sign-in for ads, the callback that proves the signed state
 * and hands the code to the edge, the owner's answer to which of two accounts is meant, and "look again". The edge
 * holds the Meta app's secret and every token and makes every call to Meta (apps/edge/lib/ads/account-ops.ts). The one
 * secret used here is the dashboard's own key that signs the state a sign-in leaves and comes back with: it names its
 * provider, and each callback refuses another's.
 *
 * Connecting an ad account is the owner's alone (the `ads` permission): the routes say so, the callback asks again once
 * the state has proved who came back, and the edge and the door that writes each ask again.
 */
import "server-only";
import { AppError, ADS_ROUTE, HOUR_MS, ROLE_PERMS, appLink, type TenantId } from "@chanlytics/contracts";
import { metaDialogUrl } from "@chanlytics/channels/meta";
import { signStateFor, verifyStateFor } from "@chanlytics/channels/tokens";
import { stateSecret } from "../connections/google";
import { callEdge, edgeConfigured, READY_TTL_MS, type EdgeAnswer, type EdgeBody, type EdgeRead } from "../shared/edge";
import { deployment } from "../shared/env";
import { log } from "../shared/log";
import type { Member } from "../shared/route";
import { getMemberContext, type RouteContext } from "../shared/with-route";

/** The provider a state for an ad account's sign-in names: the Google, mailbox, Instagram and Meta callbacks refuse it. */
const PROVIDER = "meta_ads";

/**
 * How long Meta's window may take. An owner with no ad account, or no Page, makes one in that window before sharing it:
 * the first real Connect came back after 23 minutes (19 November 2026), past the ten every other sign-in has.
 */
const META_WINDOW_LIFE_MS = HOUR_MS;

/** The edge's door for an ad account, behind the dashboard's own credential, for the workspace and the person it acts for. */
async function edgeAds(
  body: EdgeBody<"/api/admin/ads/account">,
  timeoutMs = 20_000,
): Promise<EdgeAnswer<EdgeRead<"/api/admin/ads/account">>> {
  if (!edgeConfigured()) return { status: 503, body: { ok: false, error: "no_edge_credential" } };
  // A preview never reaches Meta under a business's name, as no provider door does.
  if (!deployment.providersLive) return { status: 503, body: { ok: false, error: "preview" } };
  return callEdge("/api/admin/ads/account", body, {
    workspace: typeof body.tenant_id === "string" ? body.tenant_id : null,
    user: typeof body.user_id === "string" ? body.user_id : null,
    timeoutMs,
  });
}

/** Whether Connect can be offered in a workspace here, and the public half of the app the way out is built from. */
interface AdsReadiness {
  offered: boolean;
  /** Whether an owner's Pause and Resume do anything here: the edge's own switch is not off. */
  presses: boolean;
  app: { client_id: string; config_id: string; redirect_uri: string } | null;
}
const NOT_OFFERED: AdsReadiness = { offered: false, presses: false, app: null };
/** The edge's word per workspace, kept READY_TTL_MS: the Ads page asks it on every open. */
const readyCache = new Map<TenantId, { at: number; value: AdsReadiness }>();

async function adsReadiness(tenantId: TenantId, now = Date.now()): Promise<AdsReadiness> {
  const kept = readyCache.get(tenantId);
  if (kept && now - kept.at < READY_TTL_MS) return kept.value;
  const answer = await edgeAds({ op: "status", tenant_id: tenantId }, 4_000);
  const body = answer.body ?? {};
  const app = body.app ?? null;
  const value: AdsReadiness =
    answer.status === 200 &&
    body.ok === true &&
    body.ready === true &&
    body.on === true &&
    typeof app?.client_id === "string" &&
    typeof app.config_id === "string" &&
    typeof app.redirect_uri === "string"
      ? {
          offered: true,
          presses: body.writes === "live" || body.writes === "sandbox",
          app: { client_id: app.client_id, config_id: app.config_id, redirect_uri: app.redirect_uri },
        }
      : NOT_OFFERED;
  readyCache.set(tenantId, { at: now, value });
  return value;
}

/** Whether Connect is offered in this workspace here: the card's reader asks it. */
export async function adsOffered(tenantId: TenantId): Promise<boolean> {
  return (await adsReadiness(tenantId)).offered;
}

/** Whether an owner's Pause and Resume do anything in this workspace here: the page's reader asks it. */
export async function adsPressesOn(tenantId: TenantId): Promise<boolean> {
  return (await adsReadiness(tenantId)).presses;
}

/** `GET ads/connect`: a signed state naming the workspace, the person and this sign-in, then Meta's own window. */
export async function startAdsConnect(ctx: RouteContext, member: Member): Promise<Response> {
  const ready = await adsReadiness(member.tenantId);
  const secret = stateSecret();
  if (!ready.app || !secret) throw new AppError("conflict", "Connecting an ad account is not available here yet.", 409);
  const signIn = { tenantId: member.tenantId, userId: ctx.userId, provider: PROVIDER };
  const state = await signStateFor(secret, signIn, Date.now(), META_WINDOW_LIFE_MS);
  const url = metaDialogUrl(
    { clientId: ready.app.client_id, configId: ready.app.config_id, redirectUri: ready.app.redirect_uri },
    state,
  );
  return new Response(null, { status: 302, headers: { location: url } });
}

/**
 * The way back to the Ads page after Meta's window, with the outcome in a word the card reads once, on the workspace's
 * own address once the signed state has proved whose it was, else on the front door.
 */
function backToAds(origin: string, slugOf: () => string | null): (outcome: string, why?: string) => Response {
  return (outcome, why) =>
    new Response(null, {
      status: 302,
      headers: { location: `${origin}${appLink(slugOf(), ADS_ROUTE, { connect: outcome, why: why || null })}` },
    });
}

/**
 * `GET ads/connect/callback`: back from Meta with a code and the state. Nothing is trusted until the state proves
 * itself (signed with the dashboard's key, unexpired, naming this sign-in and the person signed in now); then this
 * person's standing in the workspace it names is judged, and only then does the code go to the edge. Every outcome is
 * a redirect to the Ads page with one word the card reads once.
 */
export async function handleAdsCallback(ctx: RouteContext, req: Request): Promise<Response> {
  const returned = new URL(req.url);
  let slug: string | null = null;
  const back = backToAds(returned.origin, () => slug);
  // A person who closed Meta's window on its Cancel comes back with error=access_denied: nothing was connected.
  if (returned.searchParams.get("error")) return back("closed");
  const secret = stateSecret();
  if (!secret) return back("error", "not_available");
  const expected = { provider: PROVIDER, userId: ctx.userId };
  const proof = await verifyStateFor(secret, returned.searchParams.get("state"), expected, Date.now());
  if (!proof.ok) return back("error", proof.reason === "someone_else" ? proof.reason : `state_${proof.reason}`);
  let tenantId: TenantId;
  try {
    const member = await getMemberContext(ctx, proof.tenantId);
    slug = member.slug ?? null;
    if (!ROLE_PERMS[member.role].ads) return back("error", "not_owner");
    tenantId = member.tenantId;
  } catch {
    return back("error", "no_workspace");
  }
  const code = returned.searchParams.get("code") ?? "";
  if (!code) return back("closed");
  const answer = await edgeAds({ op: "connect", tenant_id: tenantId, user_id: ctx.userId, code }, 55_000);
  const body = answer.body ?? {};
  if (answer.status !== 200 || body.ok !== true) {
    const reason = typeof body.error === "string" ? body.error : `edge_${answer.status}`;
    log.error("ads_connect_failed", {
      tenant_id: tenantId,
      reason,
      detail: typeof body.detail === "string" ? body.detail.slice(0, 200) : null,
    });
    return back("error", reason);
  }
  return back(body.outcome === "choosing" ? "choosing" : "connected");
}

/** What a press on the card came to, as the page reads it. */
interface AdAccountPressed {
  outcome: string;
}

/** The words a refusal of the edge's is said in: what happened, and the one thing to do, never a code. */
function refusalOf(answer: EdgeAnswer<EdgeRead<"/api/admin/ads/account">>, doing: string): AppError {
  const code = answer.body?.error;
  if (code === "ad_account_not_owner")
    return new AppError("forbidden", "Only the owner can connect an ad account.", 403);
  if (code === "ad_account_taken")
    return new AppError(
      "conflict",
      "That ad account is connected to another workspace. Disconnect it there first.",
      409,
    );
  if (code === "nothing_to_do") return new AppError("conflict", "That is already answered.", 409);
  if (code === "ad_sign_in_lost") return new AppError("conflict", "Meta's sign-in didn't last. Connect again.", 409);
  return new AppError("upstream_provider", `Couldn't ${doing} just now. Try again.`);
}

/** `POST ads/account/choose`: the owner's answer to which of two ad accounts is meant. */
export async function chooseAdAccount(
  ctx: RouteContext,
  member: Member,
  externalId: string,
): Promise<AdAccountPressed> {
  const answer = await edgeAds(
    { op: "choose", tenant_id: member.tenantId, user_id: ctx.userId, external_id: externalId },
    30_000,
  );
  if (answer.status !== 200 || answer.body?.ok !== true) throw refusalOf(answer, "connect that ad account");
  return { outcome: "connected" };
}

/**
 * `POST ads/account/check`: Chanlytics looks again, when the owner comes back from mending something at Meta. What it
 * found is on the account's row, which the card then reads. A look Meta's pace holds back is no failure: the card keeps
 * what it last knew.
 */
export async function checkAdAccount(ctx: RouteContext, member: Member): Promise<AdAccountPressed> {
  const answer = await edgeAds({ op: "check", tenant_id: member.tenantId, user_id: ctx.userId });
  const body = answer.body ?? {};
  if (answer.status !== 200 || body.ok !== true) throw refusalOf(answer, "look again");
  return { outcome: typeof body.outcome === "string" ? body.outcome : "kept" };
}

/** What a disconnect came to: done, with the ads left running; or held, with the ads whose pause Meta did not confirm. */
interface AdAccountDisconnected {
  outcome: "disconnected" | "not_paused";
  names: string[];
}

/**
 * `POST ads/account/disconnect`: the owner lets the ad account go. Asked to pause first, the edge pauses every running
 * ad and disconnects only where Meta confirmed each; otherwise it answers `not_paused` with their names, and the owner
 * decides again knowing they keep running. Never refused for the owner.
 */
export async function disconnectAdAccountNow(
  ctx: RouteContext,
  member: Member,
  pause: boolean,
): Promise<AdAccountDisconnected> {
  const answer = await edgeAds({ op: "disconnect", tenant_id: member.tenantId, user_id: ctx.userId, pause }, 55_000);
  const body = answer.body ?? {};
  if (answer.status !== 200 || body.ok !== true) throw refusalOf(answer, "disconnect");
  readyCache.delete(member.tenantId);
  return {
    outcome: body.outcome === "not_paused" ? "not_paused" : "disconnected",
    names: Array.isArray(body.names) ? body.names.filter((name): name is string => typeof name === "string") : [],
  };
}
