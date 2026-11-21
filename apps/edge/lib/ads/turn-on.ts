/**
 * POST /api/admin/ads/turn-on: an owner turns an ad on (decision 0050, calls 2, 3, 5 and 11; the Ads plan's 4.7).
 * Signed admin token only: the dashboard's /api/v1/ads/turn-on route is the caller, for the owner, with what it judged
 * at the press. In order, and nothing after a step that refuses:
 *
 *   1. This deployment's switch (`ADS_WRITES`, live or sandbox) and its list of workspaces (the plan's 6.2 and D7).
 *   2. The owner alone: `has_permission(…, 'ads')`, asked here before anything is kept.
 *   3. A connected account with its Page, and AI not stopped (Stop everything): no ad is turned on while nobody would
 *      answer the people it brings.
 *   4. The press kept by its one door (ad_turn_on), with the decision, the event and the account's job asked for at
 *      once: the same press twice answers with the one ad; a draft changed since the press judged it is refused; one
 *      ad of an account is set up at a time.
 *
 * Nothing here calls Meta: the account's job does (launch.ts), as its first work. The answer is the ad's id, setting up.
 */
import { UUID, isTenantId, metaAdConfigOf, type TenantId } from "@chanlytics/contracts";
import { findLiveAdAccount, mayRunAds, keepTurnOn, type AdTurnOnKept } from "@chanlytics/db/ads";
import { isSendingStopped } from "@chanlytics/db/workspace";
import type { Json } from "@chanlytics/db/types";
import { personFor, workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { json, refuse } from "../shared/http.js";
import { logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";
import { NO_ADS_DOORS, adsOfferedIn } from "./account-ops.js";
import { endFixedAd } from "./change.js";
import { endOfDayIn } from "./launch-parts.js";
import { adsWrites } from "./tell.js";

/** What the owner approved, as the dashboard judged it at the press (contracts ADS_TURN_ON_DOOR). */
interface TurnOnAd {
  name: string;
  service: string;
  picture: string;
  picture_kind: "photo" | "video";
  miles: number;
  /** A place wider than the circle, by Meta's key, where the owner chose one: then no street address is sent. */
  area?: { kind: "city" | "region" | "country"; key: string; name?: string; country?: string } | undefined;
  total_minor: number;
  most_minor: number;
  end_day: string;
  versions: { text: string; headline: string }[];
  /** The circle's centre: none where a wider place is chosen. */
  address?: string | undefined;
  whatsapp: string;
  declared: "none";
}

/** What the door reads of its body. */
interface AdsTurnOnBody {
  tenant_id?: string;
  user_id?: string;
  key?: string;
  draft_at?: string;
  ad?: TurnOnAd;
  /** The ad Meta turned down that this one is Fix it's draft of. */
  fixes?: string;
}

/** Where an ad made here shows: Facebook alone, since no Instagram account of the Page's is named (meta-make.ts). */
const SHOWN_ON = ["facebook"];

/** What the press approved, kept on the ad: what the launch sends and compares Meta's read back with. */
function approvedOf(ad: TurnOnAd, account: { currency: string; timezone: string; pageId: string }): Json {
  return {
    ...ad,
    versions: ad.versions.map((version) => ({ text: version.text, headline: version.headline })),
    ends_at: endOfDayIn(account.timezone, ad.end_day),
    currency: account.currency,
    page_id: account.pageId,
    instagram: false,
  };
}

/** What the press came to at its door, as the dashboard reads it: the ad, or a refusal by its code. */
function turnOnAnswerOf(kept: AdTurnOnKept): Response {
  if (kept.outcome === "kept" || kept.outcome === "same")
    return json(202, { ok: true, outcome: kept.outcome, ad_id: kept.adId ?? "" });
  if (kept.outcome === "not_allowed") return refuse(403, "ad_account_not_owner");
  if (kept.outcome === "no_door") return refuse(503, "not_ready", NO_ADS_DOORS);
  if (kept.outcome === "stopped") return refuse(409, "ai_stopped", AI_STOPPED);
  if (kept.outcome === "busy") return refuse(409, "ad_busy", "Another ad of this account is still being set up.");
  if (kept.outcome === "stale") return refuse(409, "ad_stale", "The draft changed since it was judged.");
  return refuse(409, "nothing_to_do", "No connected ad account.");
}

const AI_STOPPED = "AI is stopped, so no ad is turned on.";

/** The workspace's connected Meta account with its Page, as an ad made here needs it; null where there is none. */
async function accountFor(
  db: NonNullable<ReturnType<typeof pg>>,
  tenantId: TenantId,
): Promise<{ currency: string; timezone: string; pageId: string } | null> {
  const live = await findLiveAdAccount(db, tenantId, "meta");
  const pageId = live ? metaAdConfigOf(live.config).page_id : null;
  if (!live || live.status !== "connected" || !live.currency || !pageId) return null;
  return { currency: live.currency, timezone: live.timezone ?? "UTC", pageId };
}

/** The door's work: the switch, the owner, the account and AI's stop asked first, then the press kept. */
export async function runAdTurnOn(auth: Admitted, body: Partial<AdsTurnOnBody>): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  const userId = personFor(auth, body.user_id) ?? "";
  const key = String(body.key ?? "");
  const draftAt = String(body.draft_at ?? "");
  const ad = body.ad;
  if (!isTenantId(tenantId) || !UUID.test(userId) || !UUID.test(key) || !draftAt || !ad)
    return refuse(400, "bad_request", "tenant_id, user_id, key, draft_at and the ad required");
  // Where the ad shows: a wider place, or a circle around the business's address.
  if (!ad.area && !ad.address) return refuse(400, "bad_request", "the ad's area or the business's address required");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const writes = adsWrites();
  if (writes === "off" || !adsOfferedIn(tenantId))
    return refuse(409, "ads_writes_off", "Turning an ad on from here is not turned on in this workspace.");
  // The owner alone, asked before anything is kept (decision 0050, call 2).
  if (!(await mayRunAds(db, tenantId, userId))) return refuse(403, "ad_account_not_owner");
  const account = await accountFor(db, tenantId);
  if (!account) return refuse(409, "nothing_to_do", "No connected ad account with a Page.");
  if (await isSendingStopped(db, tenantId)) return refuse(409, "ai_stopped", AI_STOPPED);
  const [first] = ad.versions;
  const kept = await keepTurnOn(
    db,
    { tenantId, userId },
    {
      key,
      draftAt,
      ad: {
        name: ad.name,
        total_minor: ad.most_minor,
        ends_at: endOfDayIn(account.timezone, ad.end_day),
        approved: approvedOf(ad, account),
        shown_on: SHOWN_ON,
        said: { headline: first?.headline ?? "", body: first?.text ?? "" },
      },
    },
  );
  // Fix it's draft takes the place of the ad Meta turned down: that one ends, its campaign archived by the account's job.
  const fixes = kept.outcome === "kept" && body.fixes && UUID.test(body.fixes) ? body.fixes : null;
  const fixed = fixes === null ? null : await endFixedAd(db, { tenantId, userId }, fixes);
  logger({ tenant_id: tenantId }).info("ads_turned_on", { outcome: kept.outcome, ad_id: kept.adId, writes, fixed });
  return turnOnAnswerOf(kept);
}
