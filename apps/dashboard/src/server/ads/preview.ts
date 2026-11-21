/**
 * The ad as Meta draws it, for New ad (the Ads plan's 4.6, "The ad as Meta draws it", and section 10): one version of
 * the workspace's kept draft, handed to the edge, which asks Meta for its own preview of it in each place the ad shows
 * (apps/edge/lib/ads/preview.ts). The edge holds the token and makes every call; nothing here touches Meta.
 *
 * The version is the kept draft's, never words a browser sends: what Meta draws is what Turn on would make, and the
 * answer names the picture and the words it drew, so the screen shows Meta's frame only beside the same. A read: it
 * makes nothing at Meta and spends nothing, so any member who opens New ad asks it. Where Meta's own can't be had, the
 * answer says why, and the screen draws its own and says so: nothing here is a refusal.
 */
import "server-only";
import { findAdDraft } from "@chanlytics/db/ads";
import { callEdge, edgeConfigured } from "../shared/edge";
import { deployment } from "../shared/env";
import type { ReaderContext } from "../shared/reader";
import { AdDraftStateSchema } from "./draft-shape";
import type { AdPreviewAnswer, AdPreviewFrame, AdPreviewPlace, AdPreviewWhy } from "./preview-shape";

/** How long the edge may take: Meta's three reads at once, each bounded at the edge, with a little to spare. */
const PREVIEW_WAIT_MS = 12_000;

const PREVIEW_PLACES: readonly AdPreviewPlace[] = ["feed", "story", "reel"];

/** The edge's word for why Meta drew none, as the screen says it. */
const WHY: Record<string, AdPreviewWhy> = {
  not_connected: "not_connected",
  signed_out: "signed_out",
  video: "video",
  slowed: "busy",
  silent: "busy",
  no_picture: "refused",
  refused: "refused",
};

/** Why one place has no frame of Meta's, by what stood in its way. */
const placeWhy = (fault: string | null | undefined): AdPreviewWhy =>
  fault === "revoked" ? "signed_out" : fault === "slowed" || fault === "silent" ? "busy" : "refused";

/** Meta's frame for one place, as the edge answered it; null where Meta drew none. */
function frameOf(place: { src?: string | null; width?: number | null; height?: number | null }): AdPreviewFrame | null {
  if (typeof place.src !== "string" || !place.src) return null;
  return { src: place.src, width: place.width ?? null, height: place.height ?? null };
}

/** GET ads/preview: Meta's own preview of one version of the kept draft, in each place, or why Meta's can't be had. */
export async function readAdPreview(rc: ReaderContext, version: number): Promise<AdPreviewAnswer> {
  const row = await findAdDraft(rc.ctx.supabase, rc.tenantId);
  const kept = row ? AdDraftStateSchema.safeParse(row.draft) : null;
  const words = kept?.success ? kept.data.versions[version] : undefined;
  if (!kept?.success || !words?.text.trim() || !words.headline.trim()) return { drew: null, frames: {}, why: null };
  const drew = { picture: kept.data.picture, text: words.text, headline: words.headline };
  // A preview deployment never reaches Meta under a business's name, as no provider door does.
  if (!edgeConfigured() || !deployment.providersLive) return { drew, frames: {}, why: "not_here" };
  const answer = await callEdge(
    "/api/admin/ads/preview",
    { tenant_id: rc.tenantId, user_id: rc.userId, preview: drew },
    { workspace: rc.tenantId, user: rc.userId, timeoutMs: PREVIEW_WAIT_MS },
  );
  const body = answer.body ?? {};
  // Ads not offered here (409), or an edge that has no such door yet (404, either deploy order): Meta can't be asked.
  if (answer.status !== 200 || body.ok !== true)
    return { drew, frames: {}, why: answer.status === 409 || answer.status === 404 ? "not_here" : "busy" };
  const frames: AdPreviewAnswer["frames"] = {};
  let missing: AdPreviewWhy | null = null;
  for (const place of body.places ?? []) {
    const frame = PREVIEW_PLACES.includes(place.place) ? frameOf(place) : null;
    if (frame) frames[place.place] = frame;
    else missing ??= placeWhy(place.fault);
  }
  const outcome = typeof body.outcome === "string" ? body.outcome : "";
  if (Object.keys(frames).length === 0) missing = WHY[outcome] ?? missing ?? "busy";
  return { drew, frames, why: missing };
}
