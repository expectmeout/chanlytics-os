/**
 * Whether Ads is on for a workspace on this deployment, as the edge says it (decision 0049, step P1): whether its pages
 * are drawn (readAdsShown, the one answer every page asks), whether Connect is offered, whether an owner's Pause and
 * Resume do anything, and the public half of the Meta app the way out is built from. It is the edge's word, kept a
 * short while per workspace. The settings read, the ad account's card and the Ads page read it (server/readers), and so
 * do the routes that connect an account or draft an ad (server/ads), so it stands here, below both.
 */
import "server-only";
import type { TenantId } from "@chanlytics/contracts";
import { findAdAccountForPage } from "@chanlytics/db/ads";
import { callEdge, edgeConfigured, READY_TTL_MS, type EdgeAnswer, type EdgeBody, type EdgeRead } from "../shared/edge";
import { deployment } from "../shared/env";

/** The edge's door for an ad account, behind the dashboard's own credential, for the workspace and the person it acts for. */
export async function callAdsEdge(
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

/** The edge's word for a workspace: asked at most once in READY_TTL_MS, and "not offered" where the edge does not say yes. */
export async function readAdsReadiness(tenantId: TenantId, now = Date.now()): Promise<AdsReadiness> {
  const kept = readyCache.get(tenantId);
  if (kept && now - kept.at < READY_TTL_MS) return kept.value;
  const answer = await callAdsEdge({ op: "status", tenant_id: tenantId }, 4_000);
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

/** The edge's word let go for a workspace, so the next ask reads it again: its ad account was just disconnected. */
export function forgetAdsReadiness(tenantId: TenantId): void {
  readyCache.delete(tenantId);
}

/** Whether Connect is offered in this workspace here: the card's reader asks it. */
export async function readAdsOffered(tenantId: TenantId): Promise<boolean> {
  return (await readAdsReadiness(tenantId)).offered;
}

/** Whether an owner's Pause and Resume do anything in this workspace here: the page's reader asks it. */
export async function readAdsPressesOn(tenantId: TenantId): Promise<boolean> {
  return (await readAdsReadiness(tenantId)).presses;
}

/** The client the workspace's ad account is read on. */
type AdsDb = Parameters<typeof findAdAccountForPage>[0];

/** An account the Ads page draws as the workspace's own: connected, signed out by Meta, or let go with its ads kept. */
const ACCOUNT_HELD: readonly string[] = ["connected", "revoked", "disconnected"];

/**
 * Whether Campaigns › Ads is drawn in a workspace here: the one answer every page asks (the Ads plan's 6.2), carried
 * to the browser on the settings read. The switch is the edge's list of workspaces (ADS_WORKSPACES), which took the
 * place of the workspace feature that drew the mockup: Ads is drawn where the edge offers it. A workspace that holds an
 * ad account is drawn it too, whatever the list says now, so its owner can always see what runs at Meta and let the
 * account go (0050, call 8: Disconnect is never refused). The account is read only where the edge says no.
 */
export async function readAdsShown(supabase: AdsDb, tenantId: TenantId): Promise<boolean> {
  if ((await readAdsReadiness(tenantId)).offered) return true;
  const held = await findAdAccountForPage(supabase, tenantId, "meta");
  return held !== null && ACCOUNT_HELD.includes(held.status);
}
