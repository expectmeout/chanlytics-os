/**
 * Meta, as a launch meets it where `ADS_WRITES` is `sandbox` (launch.ts): every step is taken but the call. A make
 * takes, a dry run, a switch and a removal are confirmed, a list finds nothing, and the read back holds every part as
 * approved, so a launch runs end to end with nothing sent. The ids are made up, digits as Meta's are, beginning 0000,
 * which Meta never gives: the account's read never asks Meta about them (read.ts).
 *
 * Pure: the request and what was approved are handed in.
 */
import { createHash } from "node:crypto";
import { metaAreaSent, type MetaAdsAnswer, type MetaCampaignHeld, type callMetaAds } from "@chanlytics/channels/ads";
import { LAUNCH_PLACES, type LaunchApproved, type LaunchMoment } from "./launch-parts.js";
import { launchNameOf } from "./tag.js";

/** One request to Meta, as the wire sends it. */
type MetaRequest = Parameters<typeof callMetaAds>[0];

/** A made-up id for sandbox, the same for the same part: digits, as Meta's are, beginning 0000, which Meta never gives. */
function sandboxIdOf(seed: string): string {
  const digits = BigInt(`0x${createHash("sha256").update(seed).digest("hex").slice(0, 15)}`)
    .toString()
    .padStart(11, "0");
  return `0000${digits.slice(0, 11)}`;
}

/** What Meta would answer a request, made up for sandbox: every make takes, every switch and removal is confirmed. */
export function sandboxAnswer(request: MetaRequest, seed: string): MetaAdsAnswer {
  const url = new URL(request.url);
  const edge = url.pathname.split("/").at(-1) ?? "";
  const dry = request.body?.includes("execution_options") === true;
  const json: Record<string, unknown> =
    request.method === "GET"
      ? { data: [] }
      : dry || request.method === "DELETE" || url.searchParams.has("status")
        ? { success: true }
        : edge === "adimages"
          ? { images: { bytes: { hash: `sandbox${sandboxIdOf(seed)}` } } }
          : { id: sandboxIdOf(seed) };
  return { outcome: "ok", status: 200, json, list: null, fault: null, said: null, usage: null };
}

/** What Meta holds of the campaign, as sandbox makes it up: every part as approved, at the moment asked. */
export function sandboxHeld(
  launch: { ad: { id: string; name: string }; approved: LaunchApproved; accountId: string },
  built: { campaign: string; set: string; ads: string[] },
  moment: LaunchMoment,
): MetaCampaignHeld {
  const { approved } = launch;
  const paused = moment === "made";
  return {
    id: built.campaign,
    name: launchNameOf(launch.ad),
    accountId: launch.accountId,
    paused,
    state: paused ? "PAUSED" : "ACTIVE",
    objective: "OUTCOME_ENGAGEMENT",
    declared: [],
    sets: [
      {
        id: built.set,
        name: launchNameOf(launch.ad),
        paused,
        opens: "WHATSAPP",
        goal: "CONVERSATIONS",
        totalMinor: approved.mostMinor,
        dailyMinor: null,
        startsAt: null,
        endsAt: approved.endsAt,
        pageId: approved.pageId,
        whatsappNumber: approved.whatsapp.replace(/\D/g, ""),
        youngest: 18,
        miles: approved.area ? null : approved.miles,
        area: metaAreaSent({ wide: approved.area, miles: approved.miles }),
        places: LAUNCH_PLACES,
      },
    ],
    ads: built.ads.map((id, nth) => ({
      id,
      name: launchNameOf(launch.ad, { at: nth + 1, of: built.ads.length }),
      setId: built.set,
      paused,
      state: paused ? "PAUSED" : "PENDING_REVIEW",
      accountId: launch.accountId,
      creativeId: null,
      imageHash: null,
      storyId: null,
      pageId: approved.pageId,
      instagramUserId: null,
      text: approved.versions[nth]?.text ?? null,
      headline: approved.versions[nth]?.headline ?? null,
      whatsapp: true,
      ownChanges: [],
      besideOthers: false,
    })),
  };
}
