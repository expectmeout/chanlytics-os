/**
 * POST /api/admin/ads/preview: Meta's own preview of one version of New ad's draft, in each place the ad shows (the Ads
 * plan's 4.6, "The ad as Meta draws it", and section 10). The dashboard's GET /api/v1/ads/preview is the caller, for a
 * member who may draft, with the version its kept draft holds.
 *
 * A read with the business's own sign-in, the one the paused-ad check showed makes every part of an ad (20 November
 * 2026). It makes nothing at Meta, keeps nothing here and spends nothing, so, as with a place found by name
 * (places.ts), any member who may draft asks it and the route in front of it is the member's check; it is asked only
 * where this deployment offers Ads in the workspace (ADS_WORKSPACES), and needs no switch that lets presses reach Meta.
 *
 * What it sends: one read for each place the ad shows (Facebook's feed, stories and Reels, as Turn on makes it), all at
 * once, each with the creative Turn on would make of the version and the picture given by a signed address that lasts
 * a day, as long as Meta's frame does. Only a photo: Turn on sends no video yet, so a video's preview is not Meta's.
 * Nothing is asked while Meta's pace holds the account back (pace.ts), and nothing is kept of what it answers: a preview
 * Meta slowed says so, and the account's next read or press keeps the pace from its own answer.
 *
 * `outcome`: drawn (every place), partly (some), or why none was: not_connected, slowed, signed_out, video, no_picture,
 * silent (no answer came) or refused (Meta said no, in its own words in the log, never on a screen).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  callMetaAds,
  META_PREVIEW_PLACES,
  metaPreviewRequest,
  parseMetaPreview,
  type MetaAdsFault,
  type MetaPreviewPlace,
} from "@chanlytics/channels/ads";
import { findLiveAdAccount } from "@chanlytics/db/ads";
import { filesBucket, findFileForWork } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import {
  DAY_MS,
  filePathOf,
  isFileMime,
  isTenantId,
  metaAdConfigOf,
  SECOND_MS,
  UUID,
  type TenantId,
} from "@chanlytics/contracts";
import { personFor, workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { json, refuse } from "../shared/http.js";
import { logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";
import { adsOfferedIn, metaAdsApp, signInOf } from "./account-ops.js";
import type { MetaSignIn } from "./meta-facts.js";
import { mayAskMeta } from "./pace.js";

type Db = SupabaseClient<Database>;

/** One version, as the door reads it. */
interface PreviewAsk {
  picture: string;
  text: string;
  headline: string;
}

/** What the door reads of its body. */
interface AdPreviewBody {
  tenant_id?: string;
  user_id?: string;
  preview?: PreviewAsk;
}

/** One place, as the answer says it: Meta's frame, or what stood in the way. */
interface PlaceShown {
  place: MetaPreviewPlace;
  src: string | null;
  width: number | null;
  height: number | null;
  fault: MetaAdsFault | "unread" | null;
}

/** Why Meta drew no place: asked, or not asked at all. */
type NoneWhy = "not_connected" | "slowed" | "signed_out" | "video" | "no_picture" | "silent" | "refused";

/** How long Meta may take over one place: a preview is waited for by someone looking at New ad. */
const PREVIEW_CALL_MS = 9 * SECOND_MS;
/** How long the picture's address lasts: as long as Meta's frame does (its page: 24 hours). */
const PREVIEW_PICTURE_LINK_S = DAY_MS / SECOND_MS;

const noneAnswer = (outcome: NoneWhy): Response => json(200, { ok: true, outcome, places: [] });

/** The picture's signed address, where it is a photo of this workspace's that Files still holds; or why there is none. */
async function pictureLink(db: Db, tenantId: TenantId, fileId: string): Promise<{ url: string } | { none: NoneWhy }> {
  const row = await findFileForWork(db, tenantId, fileId);
  if (!row || row.removed_at !== null || !isFileMime(row.mime)) return { none: "no_picture" };
  if (row.mime.startsWith("video/")) return { none: "video" };
  if (!row.mime.startsWith("image/")) return { none: "no_picture" };
  // The file as Files keeps it: what Turn on sends to Meta.
  const signed = await filesBucket(db).createSignedUrl(
    filePathOf(row.tenant_id, row.id, row.mime),
    PREVIEW_PICTURE_LINK_S,
  );
  return signed.error ? { none: "no_picture" } : { url: signed.data.signedUrl };
}

/** Each place asked of Meta at once: three reads, one for each place an ad made here shows. */
async function askEachPlace(
  signIn: MetaSignIn,
  ask: Omit<Parameters<typeof metaPreviewRequest>[2], "place">,
): Promise<{ shown: PlaceShown[]; said: (string | null)[]; usage: number | null }> {
  const answers = await Promise.all(
    META_PREVIEW_PLACES.map(async (place) => ({
      place,
      answer: await callMetaAds(metaPreviewRequest(signIn.token, signIn.appSecret, { ...ask, place }), {
        timeoutMs: PREVIEW_CALL_MS,
      }),
    })),
  );
  const shown = answers.map(({ place, answer }): PlaceShown => {
    if (answer.fault !== null) return { place, src: null, width: null, height: null, fault: answer.fault };
    try {
      return { place, ...parseMetaPreview(answer.json), fault: null };
    } catch {
      // Meta answered something that is not a frame of its own preview page: nothing of it is drawn.
      return { place, src: null, width: null, height: null, fault: "unread" };
    }
  });
  const usages = answers.flatMap(({ answer }) => (answer.usage ? [answer.usage.pct] : []));
  return {
    shown,
    said: answers.map(({ answer }) => answer.said),
    usage: usages.length > 0 ? Math.max(...usages) : null,
  };
}

/** What the places came to, as one word: every place drawn, some, or why none was. */
function previewOutcomeOf(shown: readonly PlaceShown[]): "drawn" | "partly" | NoneWhy {
  const drawn = shown.filter((one) => one.src !== null).length;
  if (drawn === shown.length) return "drawn";
  if (drawn > 0) return "partly";
  const faults = shown.map((one) => one.fault);
  if (faults.includes("revoked")) return "signed_out";
  if (faults.includes("slowed")) return "slowed";
  return faults.every((fault) => fault === "silent") ? "silent" : "refused";
}

/** One version, read from the body: its picture's id and its words; null where it is not one. */
function previewAskOf(body: Partial<AdPreviewBody>): PreviewAsk | null {
  const { picture, text, headline } = body.preview ?? {};
  if (typeof picture !== "string" || !UUID.test(picture)) return null;
  if (typeof text !== "string" || !text.trim() || typeof headline !== "string" || !headline.trim()) return null;
  return { picture, text, headline };
}

/** The door's work: the workspace, Ads here, the account and its sign-in, the picture, then each place asked. */
export async function answerAdPreview(auth: Admitted, body: Partial<AdPreviewBody>): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  const userId = personFor(auth, body.user_id) ?? "";
  const ask = previewAskOf(body);
  if (!isTenantId(tenantId) || !UUID.test(userId) || !ask)
    return refuse(400, "bad_request", "tenant_id, user_id, and a version's picture, text and headline");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const app = metaAdsApp();
  if (!app) return refuse(503, "no_app_credentials");
  if (!adsOfferedIn(tenantId)) return refuse(409, "meta_off");
  const live = await findLiveAdAccount(db, tenantId, "meta");
  const pageId = live ? metaAdConfigOf(live.config).page_id : null;
  if (!live || live.status !== "connected" || !live.external_id || !pageId) return noneAnswer("not_connected");
  if (!mayAskMeta(live, Date.now())) return noneAnswer("slowed");
  const signIn = await signInOf(db, app, live.id);
  if (!signIn) return noneAnswer("signed_out");
  const picture = await pictureLink(db, tenantId, ask.picture);
  if ("none" in picture) return noneAnswer(picture.none);
  const { shown, said, usage } = await askEachPlace(signIn, {
    accountId: live.external_id,
    pageId,
    text: ask.text,
    headline: ask.headline,
    pictureUrl: picture.url,
  });
  const outcome = previewOutcomeOf(shown);
  logger({ tenant_id: tenantId, account_id: live.id }).info("ads_previewed", {
    outcome,
    faults: shown.map((one) => one.fault ?? "ok"),
    // Meta's own words for a place it did not draw: for support, never for a screen.
    ...(outcome === "drawn" ? {} : { said: said.filter((words) => words !== null) }),
    ...(usage === null ? {} : { usage_pct: usage }),
  });
  return json(200, { ok: true, outcome, places: shown });
}
