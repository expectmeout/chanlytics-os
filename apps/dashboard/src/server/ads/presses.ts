/**
 * An owner's two presses on an ad, for the dashboard (decision 0050, calls 1, 2 and 9): Pause, and turning one back
 * on. The edge keeps the press, holds Meta's token and tells Meta (apps/edge/lib/ads/press.ts); this hands it the ad,
 * the version the press was drawn from and who pressed, and says a refusal in words an owner can act on: what
 * happened, and the one thing to do. Never a code. While AI is stopped no ad is turned back on from here (the Ads
 * plan's G17); a pause always goes.
 */
import "server-only";
import { AppError, SECOND_MS } from "@chanlytics/contracts";

/** How long a press waits for the edge: its own door, Meta's change and the ad read back. */
const PRESS_WAIT_MS = 45 * SECOND_MS;
import { callEdge, edgeConfigured, type EdgeAnswer, type EdgeRead } from "../shared/edge";
import { deployment } from "../shared/env";
import { aiStoppedAt } from "../readers/ads-page";
import { getStoredConfig } from "../workspace/config-row";
import type { Member } from "../shared/route";
import type { RouteContext } from "../shared/with-route";

/** What a press came to, as the page reads it. */
interface AdPressed {
  /**
   * told: Meta took it. sent: no answer yet. soon: sent when Meta will take it. took_back, same: nothing to send.
   * asked: Check asked Meta what stands, and the page says it once that read is in.
   */
  outcome: "told" | "sent" | "soon" | "took_back" | "same" | "asked";
  version: number;
}

type Answer = EdgeAnswer<EdgeRead<"/api/admin/ads/press">>;

/** An owner's press on an ad: Pause, turn it back on, or Check what Meta holds of one whose last switch went unanswered. */
type AdPressOp = "pause" | "resume" | "check";

/**
 * What one ad of a pause of them all came to, as the page reads it. soon: kept, and Meta is told at its pace. took_back:
 * it undid a turning back on Meta was never told of, so the ad stands paused. same: it stood paused already. stale,
 * not_found, not_ready: not kept, and why. unknown: no answer came, so whether it was kept is not known.
 */
const PAUSED_ONE = ["soon", "took_back", "same", "stale", "not_found", "not_ready", "unknown"] as const;

interface AdPausedOne {
  id: string;
  outcome: (typeof PAUSED_ONE)[number];
  /** Its version once kept; null where it was not, or nobody knows. */
  version: number | null;
}

/** The words a refusal of the edge's is said in. */
function refusalOf(answer: Answer, op: AdPressOp | "pause_all"): AppError {
  const code = answer.body?.error;
  if (code === "ad_account_not_owner")
    return new AppError("forbidden", "Only the owner can pause an ad or turn one back on.", 403);
  if (code === "ad_stale")
    return new AppError("conflict", "This ad changed since the page was read. Look again, then press.", 409);
  if (code === "ad_cant_resume")
    return new AppError("conflict", "This ad is turned back on in Meta, where its amount is set.", 409);
  if (code === "ads_writes_off")
    return new AppError("conflict", "Changing an ad from here isn't turned on yet. Change it in Meta.", 409);
  if (code === "meta_signed_out")
    return new AppError("conflict", "Meta signed Chanlytics out. Connect again, or change the ad in Meta.", 409);
  if (code === "meta_refused")
    return new AppError("upstream_provider", "Meta didn't take the change, so nothing was changed. Change it in Meta.");
  if (code === "not_found") return new AppError("not_found", "That ad is no longer here.", 404);
  if (code === "ad_not_ready")
    return new AppError("conflict", "This ad can't be changed from here right now. Change it in Meta.", 409);
  return new AppError("upstream_provider", `Couldn't ${PRESS_DOING[op]} just now. Nothing was changed. Try again.`);
}

/** What each press does, in the words its refusal says it could not. */
const PRESS_DOING: Record<AdPressOp | "pause_all", string> = {
  pause: "pause it",
  resume: "turn it back on",
  check: "ask Meta about it",
  pause_all: "pause them",
};

const OUTCOMES: readonly AdPressed["outcome"][] = ["told", "sent", "soon", "took_back", "same", "asked"];

/** `POST ads/:id/pause` and `POST ads/:id/resume`: the press, handed to the edge. */
export async function pressAd(
  ctx: RouteContext,
  member: Member,
  press: { op: AdPressOp; adId: string; version: number },
): Promise<AdPressed> {
  // A preview never reaches Meta under a business's name, as no provider door does.
  if (!edgeConfigured() || !deployment.providersLive)
    throw new AppError("conflict", "Changing an ad from here isn't available here. Change it in Meta.", 409);
  if (press.op === "resume" && aiStoppedAt(await getStoredConfig(ctx.supabase, member.tenantId)) !== null)
    throw new AppError("conflict", "AI is stopped, so no ad is turned back on. Start AI again first.", 409);
  const answer: Answer = await callEdge(
    "/api/admin/ads/press",
    { op: press.op, tenant_id: member.tenantId, user_id: ctx.userId, ad_id: press.adId, version: press.version },
    { workspace: member.tenantId, user: ctx.userId, timeoutMs: PRESS_WAIT_MS },
  );
  const body = answer.body ?? {};
  if (answer.status !== 200 || body.ok !== true) throw refusalOf(answer, press.op);
  const outcome = OUTCOMES.find((one) => one === body.outcome) ?? "sent";
  return { outcome, version: typeof body.version === "number" ? body.version : press.version };
}

/** What pausing every ad of a set came to, ad by ad, in the order asked. */
interface AdsPausedAll {
  ads: AdPausedOne[];
}

/**
 * `POST ads/pause-all`: every ad of a set paused at once, each with the version it was drawn from (the Ads plan's G17:
 * AI stopped with ads still on). The edge keeps every pause in one transaction before it answers, and tells Meta at
 * Meta's pace (apps/edge/lib/ads/press.ts, pause_all), so a tab that closes after the press leaves none running that it meant to
 * pause. Where the edge gave no answer in time, whether the pauses were kept is not known: each ad says so, and the page
 * reads what stands. Pressed again, each is kept once (a pause of a paused ad is the same press). A pause always goes,
 * AI stopped or not.
 */
export async function pauseAllAds(
  ctx: RouteContext,
  member: Member,
  ads: readonly { id: string; version: number }[],
): Promise<AdsPausedAll> {
  if (!edgeConfigured() || !deployment.providersLive)
    throw new AppError("conflict", "Changing an ad from here isn't available here. Change it in Meta.", 409);
  const answer: Answer = await callEdge(
    "/api/admin/ads/press",
    {
      op: "pause_all",
      tenant_id: member.tenantId,
      user_id: ctx.userId,
      ads: ads.map((ad) => ({ ad_id: ad.id, version: ad.version })),
    },
    { workspace: member.tenantId, user: ctx.userId, timeoutMs: PRESS_WAIT_MS },
  );
  const body = answer.body ?? {};
  if (body.error === "edge_timeout")
    return { ads: ads.map((ad) => ({ id: ad.id, outcome: "unknown", version: null })) };
  if (answer.status !== 200 || body.ok !== true) throw refusalOf(answer, "pause_all");
  const answered = new Map((body.ads ?? []).map((one) => [one.ad_id, one]));
  return {
    ads: ads.map((ad) => {
      const one = answered.get(ad.id);
      return {
        id: ad.id,
        outcome: PAUSED_ONE.find((word) => word === one?.outcome) ?? "unknown",
        version: one?.version ?? null,
      };
    }),
  };
}
