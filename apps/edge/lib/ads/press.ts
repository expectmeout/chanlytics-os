/**
 * POST /api/admin/ads/press: an owner pauses an ad, or turns one back on (decision 0050, calls 1, 2 and 9; the Ads
 * plan's step 2, part 6), or changes a running ad made here (`change`, the plan's step 4, item 6: change.ts). Signed
 * admin token only: the dashboard's /api/v1/ads/:id routes are the callers, for the owner. In order, and nothing
 * after a step that refuses:
 *
 *   1. This deployment's switch (`ADS_WRITES`) and its list of workspaces (the plan's 6.2 and D7).
 *   2. The owner alone: `has_permission(…, 'ads')`, asked here before anything is kept or asked of Meta.
 *   3. The press is kept by its one door (ad_set_intent), with the decision and the event: a stale press is refused,
 *      the same press twice is answered once, and turning back on is refused where the rule says no (the plan's C1).
 *   4. Meta is told, once, where it will take the change now: none to this ad in the last thirty seconds, and the
 *      account not held back. Otherwise the press waits, and the account's read sends it when Meta will take it.
 *
 * The answer's `outcome` says which: `told` (Meta took it), `sent` (no answer came: never sent again, and the
 * account's read is asked for at once, which says what stands at Meta), `soon` (kept, and sent when Meta will take
 * it), `took_back` (it undid a press Meta was never told of), `same` (what was asked already stands). A refusal is a
 * code, with Meta's own words for support in `detail`.
 *
 * Four more ops take the same first two steps. `check` asks the account's read of an ad whose last switch Meta never
 * answered, and sends nothing. `pause_all` pauses every ad of a set (below): each kept by the same door, all in one
 * transaction before the door answers, and Meta told at its pace by each account's read, never in this request.
 * `resume_all` turns back on the ads Stop everything paused, the owner's own press after a Resume, the same way. `cancel`
 * stops an ad made here while it is set up: kept on its launch, which its account's job stops at its next step (00676).
 */
import { AD_PAUSE_ALL_MAX, UUID, isTenantId, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import {
  askAdRead,
  askAdTell,
  findAd,
  findAdAccount,
  findAdSwitchId,
  keepAdAccountRead,
  markAdAccountRevoked,
  cancelAdLaunch,
  mayRunAds,
  pauseAdsKept,
  resumeStoppedAds,
  setAdIntent,
  type AdIntent,
  type AdPressKept,
  type AdResumedKept,
} from "@chanlytics/db/ads";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { personFor, workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { json, refuse } from "../shared/http.js";
import { logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";
import { NO_ADS_DOORS, adsOfferedIn, metaAdsApp, signInOf } from "./account-ops.js";
import { runAdChange, type AdsChangeBody } from "./change.js";
import { mayAskMeta, readAfterOf } from "./pace.js";
import { adsWrites, mayTellNow, tellAd, type AdsWrites } from "./tell.js";

type Db = SupabaseClient<Database>;

/** What the door reads of its body. */
interface AdsPressBody {
  op?: string;
  tenant_id?: string;
  user_id?: string;
  ad_id?: string;
  version?: number;
  change?: AdsChangeBody;
  /** `pause_all`: the set, each ad with the version it was drawn from, as sent: pausesOf reads it. */
  ads?: unknown;
}

/** A press its door did not keep, as the refusal the dashboard words. */
function refusalOf(kept: AdPressKept): Response {
  if (kept.outcome === "not_allowed") return refuse(403, "ad_account_not_owner");
  if (kept.outcome === "not_found") return refuse(404, "not_found");
  if (kept.outcome === "stale") return refuse(409, "ad_stale");
  if (kept.outcome === "cant_resume") return refuse(409, "ad_cant_resume");
  if (kept.outcome === "no_door") return refuse(503, "not_ready", NO_ADS_DOORS);
  return refuse(409, "ad_not_ready", `The ad is ${kept.outcome.replace("_", " ")}.`);
}

/** A press kept, told to Meta where Meta will take it now; else left on its way with its read asked for. */
async function tellNow(
  db: Db,
  who: { tenantId: TenantId; writes: AdsWrites },
  press: { adId: string; intent: AdIntent },
  kept: AdPressKept,
): Promise<Response> {
  const { tenantId } = who;
  const log = logger({ tenant_id: tenantId, ad_id: press.adId });
  const answer = (outcome: string) => json(200, { ok: true, outcome, version: kept.version ?? 0 });
  const soon = async () => {
    await askAdTell(db, tenantId, press.adId);
    log.info("ads_pressed", { asked: press.intent, outcome: "soon" });
    return answer("soon");
  };
  const app = metaAdsApp();
  const account = kept.accountId === null ? null : await findAdAccount(db, tenantId, kept.accountId);
  if (!app || !account || kept.platformAdId === null) return soon();
  const nowMs = Date.now();
  if (!mayTellNow(kept.toldAt, nowMs) || !mayAskMeta(account, nowMs)) return soon();
  const signIn = await signInOf(db, app, account.id);
  if (!signIn) return soon();
  const told = await tellAd(
    db,
    log,
    { tenantId, signIn, writes: who.writes },
    {
      id: press.adId,
      platform_ad_id: kept.platformAdId,
      switch_id: await findAdSwitchId(db, tenantId, press.adId),
      intent: press.intent,
    },
  );
  log.info("ads_pressed", { asked: press.intent, outcome: told.outcome });
  if (told.outcome === "revoked") {
    await markAdAccountRevoked(db, tenantId, account.id, "read");
    return refuse(409, "meta_signed_out", told.said ?? undefined);
  }
  if (told.outcome === "slowed") {
    // Meta took nothing: the account keeps the moment before which it is not asked again, and the press waits for it.
    await keepAdAccountRead(db, tenantId, account.id, {
      error: "slowed",
      read_after: readAfterOf(told.usage, "slowed", nowMs),
      ...(told.usage ? { usage_pct: told.usage.pct } : {}),
    });
    return soon();
  }
  if (told.outcome === "refused") return refuse(502, "meta_refused", told.said ?? undefined);
  // `again`: pressed again while this one was on its way; that newer ask is kept, and sent when Meta will take it.
  if (told.outcome === "again") return soon();
  if (told.outcome !== "unknown") return answer("told");
  // No answer came, so whether Meta took it is not known, and it is never sent again (decision 0050). What stands at
  // Meta is read, and soon: the page then says which, within minutes and not at the hour's read.
  if (account.external_id !== null) await askAdRead(db, "meta", account.external_id);
  return answer("sent");
}

/**
 * `check`: an owner's Check on an ad whose last switch Meta never answered (the Ads plan's 4.7, point 7). Nothing is
 * sent again: the account's read is asked for, which says what stands at Meta, and the page reads it once it is in.
 */
async function checkAd(db: Db, tenantId: TenantId, adId: string): Promise<Response> {
  const row = await findAd(db, tenantId, adId);
  if (!row) return refuse(404, "not_found");
  const account = await findAdAccount(db, tenantId, row.account_id);
  if (!account || account.status !== "connected" || account.external_id === null)
    return refuse(409, "nothing_to_do", "No connected ad account.");
  await askAdRead(db, "meta", account.external_id);
  logger({ tenant_id: tenantId, ad_id: adId }).info("ads_pressed", { asked: "check", outcome: "asked" });
  return json(200, { ok: true, outcome: "asked", version: row.version });
}

/** Who an op acts for, once admitted: the workspace, the owner, and this deployment's switch. */
interface PressedBy {
  tenantId: TenantId;
  userId: string;
  writes: AdsWrites;
}

/**
 * What every op asks before anything is kept or asked of Meta, in order: the database, this deployment's switch and its
 * list of workspaces (the plan's 6.2 and D7), and the owner alone (decision 0050, call 2). Then the op.
 */
async function admitted(
  asker: { tenantId: TenantId; userId: string },
  op: (db: Db, by: PressedBy) => Promise<Response>,
): Promise<Response> {
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const writes = adsWrites();
  if (writes === "off" || !adsOfferedIn(asker.tenantId))
    return refuse(409, "ads_writes_off", "Changing an ad from here is not turned on in this workspace.");
  if (!(await mayRunAds(db, asker.tenantId, asker.userId))) return refuse(403, "ad_account_not_owner");
  return op(db, { ...asker, writes });
}

/** One ad's press: Check asks what stands at Meta; a pause or a turning back on is kept, then told where Meta takes it. */
async function pressOne(
  db: Db,
  by: PressedBy,
  press: { adId: string; version: number; intent: AdIntent | null },
): Promise<Response> {
  const { tenantId, userId } = by;
  const { adId, version, intent } = press;
  if (intent === null) return checkAd(db, tenantId, adId);
  const kept = await setAdIntent(db, { tenantId, userId }, { adId, version, intent });
  if (kept.outcome === "same")
    return json(200, { ok: true, outcome: kept.pending ? "soon" : "same", version: kept.version ?? version });
  if (kept.outcome !== "asked") return refusalOf(kept);
  if (!kept.tell) {
    logger({ tenant_id: tenantId, ad_id: adId }).info("ads_pressed", { asked: intent, outcome: "took_back" });
    return json(200, { ok: true, outcome: "took_back", version: kept.version ?? version });
  }
  return tellNow(db, { tenantId, writes: by.writes }, { adId, intent }, kept);
}

/* --------------------------------------------------------------------------------------------------- pause_all --- */

/*
 * `pause_all`: an owner pauses every ad of a set at once (the Ads plan's G17: AI stopped with ads still on, and the one
 * press that pauses them all). Every pause is kept through the door a single pause is kept by, all in one transaction
 * (ad_pause_all, 00671), before the door answers; each Meta is to be told of goes at Meta's pace, by its account's read,
 * as a single pause Meta will not take at once goes. Meta is asked nothing here: a handler that told Meta ad by ad could
 * stop halfway, as the tab that sent the pauses one by one could, and leave the rest running.
 */

/** One ad of the set, as the body names it. */
interface AdPause {
  adId: string;
  version: number;
}

/**
 * What one ad of the set came to, as the dashboard reads it: `soon` (kept, and Meta is told at its pace), `took_back` (it
 * undid a turning back on Meta was never told of, so the ad stands paused), `same` (it stood paused already), and why one
 * was not kept: `stale` (drawn from an old version), `not_found`, `not_ready` (not connected, or not made at Meta).
 */
type AdPauseOutcome = "soon" | "took_back" | "same" | "stale" | "not_found" | "not_ready";

/** What the door's answer for one ad says, from what ad_set_intent kept of it. */
function pauseOutcomeOf(kept: AdPressKept): AdPauseOutcome {
  if (kept.outcome === "asked") return kept.tell ? "soon" : "took_back";
  if (kept.outcome === "same") return kept.pending ? "soon" : "same";
  if (kept.outcome === "stale" || kept.outcome === "not_found") return kept.outcome;
  return "not_ready";
}

/**
 * The set as the body names it: one to AD_PAUSE_ALL_MAX ads, each an id and the version it was drawn from (a whole number
 * from 1), and no ad twice. Null where the body is not that, so nothing of it is kept.
 */
function pausesOf(ads: unknown): AdPause[] | null {
  const list: readonly unknown[] = Array.isArray(ads) ? ads : [];
  if (list.length === 0 || list.length > AD_PAUSE_ALL_MAX) return null;
  const out: AdPause[] = [];
  for (const one of list) {
    const { ad_id: adId, version } = recordOrEmpty(one);
    if (typeof adId !== "string" || !UUID.test(adId)) return null;
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return null;
    out.push({ adId, version });
  }
  return new Set(out.map((press) => press.adId)).size === out.length ? out : null;
}

/**
 * `resume_all`: the ads Stop everything paused, turned back on together on the owner's own press (00676; the content
 * loop PRD's 14.1, call 21: Resume never turns an ad on). Each kept through the door a single turning back on is kept by,
 * and Meta told at its pace by each account's read. Refused while AI is stopped. What each came to, as pause_all says it,
 * and `not_stopped` for one the stop did not pause.
 */
async function resumeAll(db: Db, by: PressedBy, presses: readonly AdPause[]): Promise<Response> {
  const kept = await resumeStoppedAds(db, by, presses);
  if (kept.outcome === "no_door") return refuse(503, "not_ready", NO_ADS_DOORS);
  if (kept.outcome === "not_allowed") return refuse(403, "ad_account_not_owner");
  if (kept.outcome === "stopped") return refuse(409, "ai_stopped");
  const outcomeOf = (one: AdResumedKept): string => (one.outcome === "not_stopped" ? one.outcome : pauseOutcomeOf(one));
  const ads = kept.ads.map((one) => ({ ad_id: one.adId, outcome: outcomeOf(one), version: one.version }));
  logger({ tenant_id: by.tenantId }).info("ads_pressed", {
    asked: "resume_all",
    outcome: "kept",
    ads: ads.length,
    soon: ads.filter((one) => one.outcome === "soon").length,
  });
  return json(200, { ok: true, outcome: "kept", ads });
}

/**
 * `cancel`: the owner stops an ad made here while it is set up (the Ads plan's 4.7, point 8). Kept on its launch; its
 * account's job stops it at its next step and removes what it made. One made already answers `made`, where its Pause
 * stops it, and one whose launch ended answers `stopped`. Nothing is sent to Meta here.
 */
async function cancelOne(db: Db, by: PressedBy, adId: string): Promise<Response> {
  const kept = await cancelAdLaunch(db, by, adId);
  if (kept.outcome === "no_door") return refuse(503, "not_ready", NO_ADS_DOORS);
  if (kept.outcome === "not_allowed") return refuse(403, "ad_account_not_owner");
  if (kept.outcome === "not_found") return refuse(404, "not_found");
  logger({ tenant_id: by.tenantId, ad_id: adId }).info("ads_pressed", { asked: "cancel", outcome: kept.outcome });
  return json(200, { ok: true, outcome: kept.outcome, version: kept.version ?? 0 });
}

/** Every ad of the set paused, kept together; what each came to. The switch and the owner are asked before this. */
async function pauseAll(db: Db, by: PressedBy, presses: readonly AdPause[]): Promise<Response> {
  const kept = await pauseAdsKept(db, by, presses);
  if (kept.outcome === "no_door") return refuse(503, "not_ready", NO_ADS_DOORS);
  if (kept.outcome === "not_allowed") return refuse(403, "ad_account_not_owner");
  const ads = kept.ads.map((one) => ({ ad_id: one.adId, outcome: pauseOutcomeOf(one), version: one.version }));
  logger({ tenant_id: by.tenantId }).info("ads_pressed", {
    asked: "pause_all",
    outcome: "kept",
    ads: ads.length,
    soon: ads.filter((one) => one.outcome === "soon").length,
  });
  return json(200, { ok: true, outcome: "kept", ads });
}

/** The door's ops: pause, resume, check, change and cancel on one ad, and pause_all and resume_all on a set of them. */
export async function runAdPress(auth: Admitted, body: Partial<AdsPressBody>): Promise<Response> {
  const intent: AdIntent | null = body.op === "pause" ? "paused" : body.op === "resume" ? "on" : null;
  const all = body.op === "pause_all" || body.op === "resume_all";
  const change = body.op === "change";
  const cancel = body.op === "cancel";
  if (intent === null && body.op !== "check" && !all && !change && !cancel)
    return refuse(400, "unknown_op", "op is pause, resume, check, change, cancel, pause_all or resume_all");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  const userId = personFor(auth, body.user_id) ?? "";
  if (all) {
    const presses = pausesOf(body.ads);
    if (!isTenantId(tenantId) || !UUID.test(userId) || presses === null)
      return refuse(400, "bad_request", "tenant_id, user_id and ads (each an ad_id and its version, once) required");
    return admitted({ tenantId, userId }, (db, by) =>
      body.op === "resume_all" ? resumeAll(db, by, presses) : pauseAll(db, by, presses),
    );
  }
  if (cancel) {
    const adId = String(body.ad_id ?? "");
    if (!isTenantId(tenantId) || !UUID.test(userId) || !UUID.test(adId))
      return refuse(400, "bad_request", "tenant_id, user_id and ad_id required");
    return admitted({ tenantId, userId }, (db, by) => cancelOne(db, by, adId));
  }
  const adId = String(body.ad_id ?? "");
  const version = typeof body.version === "number" && Number.isInteger(body.version) ? body.version : 0;
  if (!isTenantId(tenantId) || !UUID.test(userId) || !UUID.test(adId) || version < 1)
    return refuse(400, "bad_request", "tenant_id, user_id, ad_id and version required");
  if (change)
    return admitted({ tenantId, userId }, (db, by) => runAdChange(db, by, { adId, version, change: body.change }));
  return admitted({ tenantId, userId }, (db, by) => pressOne(db, by, { adId, version, intent }));
}
