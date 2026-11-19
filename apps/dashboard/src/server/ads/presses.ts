/**
 * An owner's two presses on an ad, for the dashboard (decision 0050, calls 1, 2 and 9): Pause, and turning one back
 * on. The edge keeps the press, holds Meta's token and tells Meta (apps/edge/lib/ads/press.ts); this hands it the ad,
 * the version the press was drawn from and who pressed, and says a refusal in words an owner can act on: what
 * happened, and the one thing to do. Never a code.
 */
import "server-only";
import { AppError, SECOND_MS } from "@chanlytics/contracts";

/** How long a press waits for the edge: its own door, Meta's change and the ad read back. */
const PRESS_WAIT_MS = 45 * SECOND_MS;
import { callEdge, edgeConfigured, type EdgeAnswer, type EdgeRead } from "../shared/edge";
import { deployment } from "../shared/env";
import type { Member } from "../shared/route";
import type { RouteContext } from "../shared/with-route";

/** What a press came to, as the page reads it. */
interface AdPressed {
  /** told: Meta took it. sent: no answer yet. soon: sent when Meta will take it. took_back, same: nothing to send. */
  outcome: "told" | "sent" | "soon" | "took_back" | "same";
  version: number;
}

type Answer = EdgeAnswer<EdgeRead<"/api/admin/ads/press">>;

/** The words a refusal of the edge's is said in. */
function refusalOf(answer: Answer, op: "pause" | "resume"): AppError {
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
  return new AppError(
    "upstream_provider",
    `Couldn't ${op === "pause" ? "pause it" : "turn it back on"} just now. Nothing was changed. Try again.`,
  );
}

const OUTCOMES: readonly AdPressed["outcome"][] = ["told", "sent", "soon", "took_back", "same"];

/** `POST ads/:id/pause` and `POST ads/:id/resume`: the press, handed to the edge. */
export async function pressAd(
  ctx: RouteContext,
  member: Member,
  press: { op: "pause" | "resume"; adId: string; version: number },
): Promise<AdPressed> {
  // A preview never reaches Meta under a business's name, as no provider door does.
  if (!edgeConfigured() || !deployment.providersLive)
    throw new AppError("conflict", "Changing an ad from here isn't available here. Change it in Meta.", 409);
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
