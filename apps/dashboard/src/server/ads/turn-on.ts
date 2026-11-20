/**
 * Turn on, for the dashboard (decision 0050, calls 2, 3, 5 and 11; the Ads plan's 4.7): the owner's press on New ad.
 *
 * The press carries what it showed: the most the ad can cost, the end, the picture, the area and the words. Here the
 * workspace's kept draft is judged afresh as the business stands now, and every check before Turn on runs again; a
 * press that showed anything but what the draft holds now is refused, so the owner can only press the number the
 * server would have named. Then the edge keeps the ad, setting up, and the account's job makes it at Meta, paused,
 * reads it back, compares it, and only then switches it on (apps/edge/lib/ads/launch.ts). Nothing here calls Meta.
 *
 * The owner alone, while AI runs, on a deployment whose switch turns ads on in the workspace.
 */
import "server-only";
import { AppError, ROLE_PERMS, adMostOf, SECOND_MS } from "@chanlytics/contracts";
import { callEdge, edgeConfigured, type EdgeAnswer, type EdgeRead } from "../shared/edge";
import { deployment } from "../shared/env";
import type { Member } from "../shared/route";
import { readerContext } from "../shared/reader";
import type { RouteContext } from "../shared/with-route";
import { adDraftAnswer, requireAdsOffered } from "./draft";
import { readAdDraftFacts } from "./draft-facts";
import type { AdDraftAnswer } from "./draft-shape";

/** How long the press waits for the edge: its door keeps the ad and asks for the account's job, and calls no one. */
const TURN_ON_WAIT_MS = 20 * SECOND_MS;

/** What the press showed: what it is refused for where the draft holds anything else now. */
interface PressedAd {
  service: string;
  picture: string;
  miles: number;
  most_minor: number;
  end_day: string;
  versions: { text: string; headline: string }[];
}

/** What Turn on came to: the ad, setting up, made by this press or by the same press before it. */
interface TurnedOn {
  outcome: "kept" | "same";
  ad_id: string;
}

type Judged = Extract<AdDraftAnswer, { can: true }>;
type Answer = EdgeAnswer<EdgeRead<"/api/admin/ads/turn-on">>;

/** Whether the draft holds now exactly what the press showed: the most it can cost worked out in one place. */
function asPressed(answer: Judged, pressed: PressedAd): boolean {
  const { draft } = answer;
  return (
    draft.service === pressed.service &&
    draft.picture.id === pressed.picture &&
    draft.miles === pressed.miles &&
    draft.end_day === pressed.end_day &&
    adMostOf(draft) === pressed.most_minor &&
    draft.versions.length === pressed.versions.length &&
    draft.versions.every((version, nth) => {
      const shown = pressed.versions.at(nth);
      return shown !== undefined && version.text === shown.text && version.headline === shown.headline;
    })
  );
}

/** Why a judged draft cannot be turned on now, in words an owner can act on; null where it can. */
function turnOnBlockedBy(answer: Judged): string | null {
  if (!answer.owner) return "Only the owner can turn an ad on.";
  if (answer.draft.versions.length === 0) return "The ad has no words yet. Turn it on once they're written.";
  if (answer.checks.length > 0) return "Something on New ad would stop this ad. Fix it there, then press again.";
  if (answer.declared !== "none") return "An ad of a special kind isn't turned on here. Make it in Meta.";
  if (answer.turn_on === "video") return "Turn on sends a photo for now. Pick a photo for this ad.";
  if (answer.turn_on === "off") return "Turning an ad on from here isn't on in this workspace yet. Nothing was made.";
  return null;
}

/** The words a refusal of the edge's is said in. */
function turnOnRefusal(answer: Answer): AppError {
  const code = answer.body?.error;
  if (code === "ad_account_not_owner") return new AppError("forbidden", "Only the owner can turn an ad on.", 403);
  if (code === "ad_stale")
    return new AppError("conflict", "This ad changed since you saw it. Look at it again, then press.", 409);
  if (code === "ad_busy")
    return new AppError("conflict", "Another ad is still being set up. Turn this one on once that one is done.", 409);
  if (code === "ai_stopped")
    return new AppError("conflict", "AI is stopped, so no ad is turned on. Start AI again first.", 409);
  if (code === "ads_writes_off")
    return new AppError(
      "conflict",
      "Turning an ad on from here isn't on in this workspace yet. Nothing was made.",
      409,
    );
  if (code === "nothing_to_do")
    return new AppError("conflict", "Your ad account isn't connected right now. Connect it again first.", 409);
  return new AppError("upstream_provider", "Couldn't turn it on just now. Nothing was made. Try again.");
}

/** `POST ads/turn-on`: the kept draft judged as pressed, and handed to the edge, which sets it up. */
export async function requestTurnOn(
  ctx: RouteContext,
  member: Member,
  input: { key: string; expect: PressedAd },
): Promise<TurnedOn> {
  if (!ROLE_PERMS[member.role].ads) throw new AppError("forbidden", "Only the owner can turn an ad on.", 403);
  const rc = readerContext(ctx, member);
  await requireAdsOffered(rc);
  // A preview never reaches Meta under a business's name, as no provider door does.
  if (!edgeConfigured() || !deployment.providersLive)
    throw new AppError("conflict", "Turning an ad on isn't available here. Nothing was made.", 409);
  const facts = await readAdDraftFacts(rc);
  if (facts.stopped) throw new AppError("conflict", "AI is stopped, so no ad is turned on. Start AI again first.", 409);
  const kept = facts.kept;
  if (!kept) throw new AppError("conflict", "This draft is no longer here. Open New ad again.", 409);
  const answer = adDraftAnswer(facts, kept.draft);
  if (!answer.can) throw new AppError("conflict", "This ad can't be turned on yet. Open New ad again.", 409);
  // The checks ran again just now, on the draft as the business stands: a press drawn from anything else is refused.
  if (!asPressed(answer, input.expect))
    throw new AppError("conflict", "This ad changed since you saw it. Look at it again, then press.", 409);
  const reason = turnOnBlockedBy(answer);
  if (reason) throw new AppError("conflict", reason, 409);
  if (!facts.address || !facts.whatsappNumber)
    throw new AppError("conflict", "Add the business's address and connect WhatsApp, then press again.", 409);
  const { draft } = answer;
  const answered: Answer = await callEdge(
    "/api/admin/ads/turn-on",
    {
      tenant_id: member.tenantId,
      user_id: ctx.userId,
      key: input.key,
      draft_at: kept.at,
      ad: {
        name: draft.label ?? draft.service,
        service: draft.service,
        picture: draft.picture.id,
        picture_kind: draft.picture.kind,
        miles: draft.miles,
        total_minor: draft.total_minor,
        most_minor: adMostOf(draft),
        end_day: draft.end_day,
        versions: draft.versions.map((version) => ({ text: version.text, headline: version.headline })),
        address: facts.address,
        whatsapp: facts.whatsappNumber,
        declared: "none",
      },
    },
    { workspace: member.tenantId, user: ctx.userId, timeoutMs: TURN_ON_WAIT_MS },
  );
  const body = answered.body ?? {};
  if (answered.status !== 202 || body.ok !== true || typeof body.ad_id !== "string") throw turnOnRefusal(answered);
  return { outcome: body.outcome === "same" ? "same" : "kept", ad_id: body.ad_id };
}
