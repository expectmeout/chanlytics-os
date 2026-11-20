/**
 * POST /api/admin/ads/check: the paused-ad check on an owner's own ad account (the Ads plan's step 4, "Checking against
 * Meta without spending"; the order is on docs/plans/2026-11-18-ads-meta-checks.md). Signed admin token only: the
 * dashboard's /api/v1/ads/check route is the caller, for the owner, with the draft it judged.
 *
 * What it sends, once, each make PAUSED: the least Meta takes a day and the Instagram accounts the ad account names
 * (two reads); the campaign as a dry run, then made; the ad set as a dry run, then made; the picture, placed in the
 * account's library; one ad with its creative inside it as a dry run (with Meta's own look at the words and the
 * picture), then made; and the campaign read back whole, compared with what was sent. Where Meta refuses a step, nothing
 * after it is sent, the answer says Meta's own words, and a campaign already made is removed, with whatever is under it:
 * a check either finishes, paused, or leaves nothing. With `remove` in place of a draft, a campaign an earlier check
 * left is removed: one in this account, paused, named as a check names it, with no ad.
 *
 * Nothing here can spend: every part is made paused, and the campaign above the ad stays paused, so the ad is never
 * shown. An ad made paused still goes through Meta's check of an ad, and a creative leaves an unpublished post on the
 * Page. The ad is shown on Facebook alone: an Instagram account the ad account names is reported, never used, since a
 * creative may name only the Page's own.
 *
 * The owner alone, on a deployment whose switch is `live` and a workspace ADS_WORKSPACES names (the plan's 6.2).
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  callMetaAds,
  isMetaId,
  metaAccountInstagramRequest,
  metaAdImageRequest,
  metaAdRequest,
  metaAdSetRequest,
  metaCampaignReadBackRequest,
  metaCampaignRemoveRequest,
  metaCampaignRequest,
  metaMinimumBudgetsRequest,
  parseMetaAccountInstagram,
  parseMetaCampaignHeld,
  parseMetaImageHash,
  parseMetaLeastADay,
  parseMetaMadeId,
  parseMetaRefusal,
  parseMetaRemoved,
  type MetaAdsAnswer,
  type MetaCampaignHeld,
  type MetaMakeHow,
} from "@chanlytics/channels/ads";
import { findLiveAdAccount, mayRunAds } from "@chanlytics/db/ads";
import { filesBucket, findFileForWork } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { filePathOf, isFileMime, isTenantId, metaAdConfigOf, UUID, type TenantId } from "@chanlytics/contracts";
import { personFor, workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { json, refuse } from "../shared/http.js";
import { logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";
import { adsOfferedIn, metaAdsApp, signInOf } from "./account-ops.js";
import { endOfDayIn } from "./launch-parts.js";
import type { MetaSignIn } from "./meta-facts.js";
import { adsWrites } from "./tell.js";

type Db = SupabaseClient<Database>;
type Log = ReturnType<typeof logger>;
/** One request to Meta, as the wire sends it. */
type MetaRequest = Parameters<typeof callMetaAds>[0];

/** The draft the dashboard judged, as the door reads it. */
interface CheckedDraft {
  service: string;
  picture: string;
  miles: number;
  total_minor: number;
  end_day: string;
  text: string;
  headline: string;
  address: string;
  whatsapp: string;
}

/** What the door reads of its body. */
interface AdsCheckBody {
  tenant_id?: string;
  user_id?: string;
  draft?: CheckedDraft;
  /** Meta's id for a campaign an earlier check left, to remove in place of a check. */
  remove?: string;
}

/** One step, as the answer says it: what Meta did, its own words where it refused, and the id of what it made. */
interface CheckStep {
  at: string;
  outcome: string;
  said: string | null;
  id: string | null;
}

const DRY: MetaMakeHow = { dryRun: true };
/** A make's key: a new one each time, never shared (Meta's header for a create that is safe to repeat). */
const keyed = (): MetaMakeHow => ({ key: randomUUID() });
/** What every check's name carries, and nothing else Chanlytics makes: how a campaign a check left is known. */
const CHECK_MARK = "paused check [cl:";
/** Where the ad shows, as the ad set names it (meta-make.ts): Facebook's feed, stories and Reels. */
const PLACES_SENT = ["facebook:facebook_reels", "facebook:feed", "facebook:story"];

/** One call to Meta for a step, its outcome kept on the list and in the log. Meta's own sentence where it refused. */
async function sendStep(
  log: Log,
  steps: CheckStep[],
  at: string,
  request: MetaRequest,
): Promise<MetaAdsAnswer & { madeId: string | null }> {
  const began = Date.now();
  const answer = await callMetaAds(request);
  const refusal = answer.fault === null ? null : parseMetaRefusal(answer.json);
  // Only a make names what it made: a read's answer carries the id of what it read.
  const madeId = answer.fault === null && request.method === "POST" ? parseMetaMadeId(answer.json) : null;
  const words = answer.fault === null ? null : (refusal?.words ?? answer.said);
  steps.push({ at, outcome: answer.fault ?? "ok", said: words, id: madeId });
  log.info("ads_check_step", {
    at,
    outcome: answer.fault ?? "ok",
    ms: Date.now() - began,
    ...(refusal ? { code: refusal.code, subcode: refusal.subcode, fields: refusal.fields } : {}),
    ...(answer.usage ? { usage_pct: answer.usage.pct } : {}),
  });
  return { ...answer, madeId };
}

/** A read's answer, read; a step whose answer its parser cannot read is kept as refused, with why. */
function readStepAnswer<T>(steps: CheckStep[], answer: MetaAdsAnswer, parse: (body: unknown) => T): T | null {
  if (answer.fault !== null) return null;
  try {
    return parse(answer.json);
  } catch (failure) {
    const last = steps.at(-1);
    if (last) Object.assign(last, { outcome: "refused", said: failure instanceof Error ? failure.message : "unread" });
    return null;
  }
}

/** What Meta holds that is not what was sent: each by a short name. Empty where they agree. */
function checkDiffers(
  sent: { totalMinor: number; endsAt: string; whatsapp: string; miles: number; text: string; headline: string },
  held: MetaCampaignHeld,
): string[] {
  const out: string[] = [];
  const differ = (name: string, same: boolean) => {
    if (!same) out.push(name);
  };
  differ("campaign_paused", held.paused);
  differ("declared", held.declared.length === 0);
  differ("objective", held.objective === "OUTCOME_ENGAGEMENT");
  const [set] = held.sets;
  differ("one_ad_set", held.sets.length === 1);
  differ("set_paused", set?.paused === true);
  differ("opens", set?.opens === "WHATSAPP");
  differ("total", set?.totalMinor === sent.totalMinor && set.dailyMinor === null);
  differ("end", set?.endsAt === sent.endsAt);
  differ("number", set?.whatsappNumber === sent.whatsapp.replace(/\D/g, ""));
  differ("adults", set?.youngest === 18);
  differ("miles", set?.miles === sent.miles);
  differ("places", JSON.stringify(set?.places ?? []) === JSON.stringify(PLACES_SENT));
  const [ad] = held.ads;
  differ("one_ad", held.ads.length === 1);
  differ("ad_paused", ad?.paused === true);
  differ("button", ad?.whatsapp === true);
  differ("own_changes", ad !== undefined && ad.ownChanges.length === 0);
  differ("beside_others", ad?.besideOthers === false);
  differ("words", ad?.text === sent.text && ad.headline === sent.headline);
  return out;
}

/** The picture's bytes, read from Files: a photo of this workspace's, or null where there is none to send. */
async function pictureBytes(db: Db, tenantId: TenantId, fileId: string): Promise<Uint8Array | null> {
  const row = await findFileForWork(db, tenantId, fileId);
  if (!row || row.removed_at !== null || !isFileMime(row.mime) || !row.mime.startsWith("image/")) return null;
  const read = await filesBucket(db).download(filePathOf(row.tenant_id, row.id, row.mime));
  return read.data ? new Uint8Array(await read.data.arrayBuffer()) : null;
}

interface CheckAt {
  db: Db;
  log: Log;
  tenantId: TenantId;
  signIn: MetaSignIn;
  account: { externalId: string; timezone: string; currency: string; pageId: string };
}

/** A campaign removed, with whatever is under it: Meta's own words where it refused, and whether it took. */
async function removeStep(at: CheckAt, steps: CheckStep[], campaignId: string): Promise<boolean> {
  const { token, appSecret } = at.signIn;
  const answer = await sendStep(at.log, steps, "remove", metaCampaignRemoveRequest(token, appSecret, campaignId));
  if (answer.fault !== null) return false;
  if (parseMetaRemoved(answer.json)) return true;
  Object.assign(steps.at(-1) ?? {}, { outcome: "refused", said: "Meta did not say the campaign was removed." });
  return false;
}

/** Everything under a campaign just made, step by step: the ad set, the picture, the ad, and the read back compared. */
async function makeUnder(
  at: CheckAt,
  draft: CheckedDraft,
  under: { steps: CheckStep[]; name: string; campaignId: string },
): Promise<string[] | null> {
  const { log, signIn, account } = at;
  const { token, appSecret } = signIn;
  const { steps, name, campaignId } = under;
  const accountId = account.externalId;
  const endsAt = endOfDayIn(account.timezone, draft.end_day);
  const setAsk = {
    accountId,
    campaignId,
    name,
    currency: account.currency,
    totalMinor: draft.total_minor,
    endsAt,
    pageId: account.pageId,
    whatsappNumber: draft.whatsapp,
    centre: { address: draft.address },
    miles: draft.miles,
    instagram: false,
  };
  if ((await sendStep(log, steps, "ad_set_dry", metaAdSetRequest(token, appSecret, setAsk, DRY))).fault) return null;
  const setId = (await sendStep(log, steps, "ad_set", metaAdSetRequest(token, appSecret, setAsk, keyed()))).madeId;
  if (!setId) return null;

  const bytes = await pictureBytes(at.db, at.tenantId, draft.picture);
  if (!bytes) {
    steps.push({ at: "picture", outcome: "unread", said: "The picture could not be read from Files.", id: null });
    return null;
  }
  const image = await sendStep(log, steps, "picture", metaAdImageRequest(token, appSecret, accountId, bytes));
  const hash = readStepAnswer(steps, image, parseMetaImageHash);
  if (!hash) return null;

  const adAsk = {
    accountId,
    setId,
    name,
    creative: {
      name,
      pageId: account.pageId,
      instagramUserId: null,
      text: draft.text,
      headline: draft.headline,
      picture: { kind: "image" as const, hash },
    },
  };
  if ((await sendStep(log, steps, "ad_dry", metaAdRequest(token, appSecret, adAsk, DRY))).fault) return null;
  if (!(await sendStep(log, steps, "ad", metaAdRequest(token, appSecret, adAsk, keyed()))).madeId) return null;

  const back = await sendStep(log, steps, "read_back", metaCampaignReadBackRequest(token, appSecret, campaignId));
  const held = readStepAnswer(steps, back, (body) => parseMetaCampaignHeld(body, account.currency));
  if (!held) return null;
  const sent = {
    totalMinor: draft.total_minor,
    endsAt,
    whatsapp: draft.whatsapp,
    miles: draft.miles,
    text: draft.text,
    headline: draft.headline,
  };
  return checkDiffers(sent, held);
}

/**
 * The check itself, step by step: what each came to, and what Meta holds against what was sent. Where it stops after
 * the campaign is made, the campaign is removed, so a stop leaves nothing at Meta.
 */
async function runCheck(at: CheckAt, draft: CheckedDraft): Promise<{ steps: CheckStep[]; differs: string[] | null }> {
  const { log, signIn, account } = at;
  const { token, appSecret } = signIn;
  const steps: CheckStep[] = [];
  const name = `Chanlytics · ${draft.service} · ${CHECK_MARK}${randomUUID().slice(0, 8)}]`;
  const accountId = account.externalId;
  const least = await sendStep(log, steps, "least_a_day", metaMinimumBudgetsRequest(token, appSecret, accountId));
  const leastMinor = readStepAnswer(steps, least, (body) => parseMetaLeastADay(body, account.currency));
  if (steps.at(-1)?.outcome === "ok") Object.assign(steps.at(-1) ?? {}, { said: `${leastMinor ?? "none"} a day` });
  const instagram = await sendStep(log, steps, "instagram", metaAccountInstagramRequest(token, appSecret, accountId));
  const named = readStepAnswer(steps, instagram, parseMetaAccountInstagram);
  if (named) Object.assign(steps.at(-1) ?? {}, { said: `${named.length} named` });

  const campaignAsk = { accountId, name };
  if ((await sendStep(log, steps, "campaign_dry", metaCampaignRequest(token, appSecret, campaignAsk, DRY))).fault)
    return { steps, differs: null };
  const campaign = await sendStep(log, steps, "campaign", metaCampaignRequest(token, appSecret, campaignAsk, keyed()));
  const campaignId = campaign.madeId;
  if (!campaignId) return { steps, differs: null };
  const differs = await makeUnder(at, draft, { steps, name, campaignId });
  if (differs === null) await removeStep(at, steps, campaignId);
  return { steps, differs };
}

/**
 * A campaign an earlier check made and left, removed: only one in this account, paused, named as a check names it, and
 * with no ad under it, read back first. Anything else is left as it stands, and the answer says so.
 */
async function removeLeftover(at: CheckAt, campaignId: string): Promise<{ steps: CheckStep[]; removed: boolean }> {
  const { token, appSecret } = at.signIn;
  const steps: CheckStep[] = [];
  const back = await sendStep(at.log, steps, "read_back", metaCampaignReadBackRequest(token, appSecret, campaignId));
  const held = readStepAnswer(steps, back, (body) => parseMetaCampaignHeld(body, at.account.currency));
  if (!held) return { steps, removed: false };
  const inAccount = held.accountId === at.account.externalId.replace(/^act_/, "");
  if (!inAccount || !held.name.includes(CHECK_MARK) || !held.paused || held.ads.length > 0) {
    const reason = "Not a paused campaign a check left in this account with no ad, so it is left as it stands.";
    steps.push({ at: "remove", outcome: "refused", said: reason, id: null });
    return { steps, removed: false };
  }
  return { steps, removed: await removeStep(at, steps, campaignId) };
}

/** What the door was asked for, read: a draft to check, or a campaign to remove; null where it is neither, or both. */
function checkAskOf(body: Partial<AdsCheckBody>): { draft: CheckedDraft } | { remove: string } | null {
  if (body.draft && body.remove === undefined) return { draft: body.draft };
  if (!body.draft && body.remove !== undefined && isMetaId(body.remove)) return { remove: body.remove };
  return null;
}

/** The door's work: the owner, the switch, the account and its sign-in asked first, then the check or the removal. */
export async function runAdsCheck(auth: Admitted, body: Partial<AdsCheckBody>): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  const userId = personFor(auth, body.user_id) ?? "";
  const ask = checkAskOf(body);
  if (!isTenantId(tenantId) || !UUID.test(userId) || !ask)
    return refuse(400, "bad_request", "tenant_id, user_id, and a draft or Meta's id for a campaign to remove");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  // A check makes things at Meta: only where this deployment's switch is live, never in sandbox.
  if (adsWrites() !== "live" || !adsOfferedIn(tenantId))
    return refuse(409, "ads_writes_off", "Making an ad at Meta is not turned on in this workspace.");
  // The owner alone, asked before anything is asked of Meta (decision 0050, call 2).
  if (!(await mayRunAds(db, tenantId, userId))) return refuse(403, "ad_account_not_owner");
  const app = metaAdsApp();
  if (!app) return refuse(503, "no_app_credentials");
  const live = await findLiveAdAccount(db, tenantId, "meta");
  const pageId = live ? metaAdConfigOf(live.config).page_id : null;
  if (!live || live.status !== "connected" || !live.external_id || !live.currency || !pageId)
    return refuse(409, "nothing_to_do", "No connected ad account with a Page.");
  const signIn = await signInOf(db, app, live.id);
  if (!signIn) return refuse(409, "meta_signed_out");
  const log = logger({ tenant_id: tenantId });
  const account = {
    externalId: live.external_id,
    timezone: live.timezone ?? "UTC",
    currency: live.currency,
    pageId,
  };
  const at = { db, log, tenantId, signIn, account };
  if ("remove" in ask) {
    const { steps, removed } = await removeLeftover(at, ask.remove);
    const outcome = removed ? "removed" : "stopped";
    log.info("ads_check_done", { outcome, steps: steps.length, differs: [] });
    return json(200, { ok: true, outcome, steps, differs: [] });
  }
  const { steps, differs } = await runCheck(at, ask.draft);
  const outcome = differs === null ? "stopped" : differs.length === 0 ? "matches" : "differs";
  log.info("ads_check_done", { outcome, steps: steps.length, differs: differs ?? [] });
  return json(200, { ok: true, outcome, steps, differs: differs ?? [] });
}
