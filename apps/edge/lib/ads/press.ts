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
 */
import { UUID, isTenantId, type TenantId } from "@chanlytics/contracts";
import {
  askAdRead,
  askAdTell,
  findAd,
  findAdAccount,
  findAdSwitchId,
  keepAdAccountRead,
  markAdAccountRevoked,
  mayRunAds,
  setAdIntent,
  type AdIntent,
  type AdPressKept,
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

/** What a press's op asks of an ad: a switch set, Check, or a change; null for no op of this door's. */
const opOf = (op: string | undefined): AdIntent | "check" | "change" | null =>
  op === "pause" ? "paused" : op === "resume" ? "on" : op === "check" || op === "change" ? op : null;

/** The door's ops: pause, resume, check and change. */
export async function runAdPress(auth: Admitted, body: Partial<AdsPressBody>): Promise<Response> {
  const asks = opOf(body.op);
  if (asks === null) return refuse(400, "unknown_op", "op is pause, resume, check or change");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  const userId = personFor(auth, body.user_id) ?? "";
  const adId = String(body.ad_id ?? "");
  const version = typeof body.version === "number" && Number.isInteger(body.version) ? body.version : 0;
  if (!isTenantId(tenantId) || !UUID.test(userId) || !UUID.test(adId) || version < 1)
    return refuse(400, "bad_request", "tenant_id, user_id, ad_id and version required");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const writes = adsWrites();
  if (writes === "off" || !adsOfferedIn(tenantId))
    return refuse(409, "ads_writes_off", "Changing an ad from here is not turned on in this workspace.");
  // The owner alone, asked before anything is kept or asked of Meta (decision 0050, call 2).
  if (!(await mayRunAds(db, tenantId, userId))) return refuse(403, "ad_account_not_owner");
  if (asks === "change") return runAdChange(db, { tenantId, userId, writes }, { adId, version, change: body.change });
  if (asks === "check") return checkAd(db, tenantId, adId);
  const intent = asks;
  const kept = await setAdIntent(db, { tenantId, userId }, { adId, version, intent });
  if (kept.outcome === "same")
    return json(200, { ok: true, outcome: kept.pending ? "soon" : "same", version: kept.version ?? version });
  if (kept.outcome !== "asked") return refusalOf(kept);
  if (!kept.tell) {
    logger({ tenant_id: tenantId, ad_id: adId }).info("ads_pressed", { asked: intent, outcome: "took_back" });
    return json(200, { ok: true, outcome: "took_back", version: kept.version ?? version });
  }
  return tellNow(db, { tenantId, writes }, { adId, intent }, kept);
}
