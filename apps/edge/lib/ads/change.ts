/**
 * An owner changes a running ad made here (the Ads plan's step 4, item 6, 4.5 and 5.2; decision 0050, Routes budget,
 * end-date, end): the press door's `change` op, and the changes still on their way, which the account's read sends.
 * In order, and nothing after a step that refuses:
 *
 *   1. The press door has asked this deployment's switch, its list of workspaces and the owner (press.ts).
 *   2. The change judged again by the one rule (contracts adChangeIssue) against what Meta holds, as the row keeps it:
 *      a raise whose most is not the one the press named is refused, and so is one past the owner's most; while AI is
 *      stopped, a change that can spend more is refused.
 *   3. Kept by its door (ad_change_keep): a press drawn from an old version, or from a total or a last day Meta no
 *      longer holds, is refused, so what the owner changed in Meta is never put back; one change at a time; four
 *      amounts an hour; the same press twice is answered once.
 *   4. Told once, where Meta will take it now (none to this ad in its last thirty seconds, the account not held back):
 *      an ad set's change as Meta's dry run, then for real; ending it, its campaign archived. Else kept, and the
 *      account's read sends it when Meta will (ad_tell_ask).
 *
 * A change sent and never answered is never sent again: the account's next read reads the campaign back and settles
 * it, taken or not. `ADS_WRITES`: `live` sends; `sandbox` does everything but the call, and says Meta took it.
 */
import {
  callMetaAds,
  metaAdSetChangeRequest,
  metaAdSwitchRequest,
  metaCampaignReadBackRequest,
  metaConfirmed,
  parseMetaCampaignHeld,
  parseMetaRefusal,
  type MetaAdSetChange,
  type MetaAdsAnswer,
  type MetaUsage,
} from "@chanlytics/channels/ads";
import {
  adChangeFactsOf,
  adChangeIssue,
  adChangeMostOf,
  adChangeOnWayOf,
  adChangeSpendsMore,
  metaAdConfigOf,
  recordOrEmpty,
  type AdChangeAsk,
  type AdChangeOnWay,
  type TenantId,
} from "@chanlytics/contracts";
import {
  askAdRead,
  askAdTell,
  findAd,
  findAdAccount,
  keepAdAccountRead,
  keepAdChange,
  listAdChanges,
  markAdAccountRevoked,
  markAdChangeTold,
  type AdChangeKept,
  type AdChangeRow,
} from "@chanlytics/db/ads";
import type { Database } from "@chanlytics/db/types";
import { isSendingStopped } from "@chanlytics/db/workspace";
import type { SupabaseClient } from "@supabase/supabase-js";
import { json, refuse } from "../shared/http.js";
import { logger } from "../shared/log.js";
import { NO_ADS_DOORS, metaAdsApp, signInOf } from "./account-ops.js";
import { approvedOf, endOfDayIn } from "./launch-parts.js";
import type { MetaSignIn } from "./meta-facts.js";
import { ADS_USAGE_HOLD_PCT, mayAskMeta, readAfterOf } from "./pace.js";
import { mayTellNow, type AdsWrites } from "./tell.js";

type Db = SupabaseClient<Database>;
type Log = ReturnType<typeof logger>;

/** A change as the press door's body holds it (contracts ADS_PRESS_DOOR). */
export interface AdsChangeBody {
  what: "total" | "end_day" | "miles" | "end";
  total_minor?: number | undefined;
  end_day?: string | undefined;
  miles?: number | undefined;
  from_minor?: number | undefined;
  from_ends_at?: string | undefined;
  expect_max_minor?: number | undefined;
}

/** The change a press asks, read whole from the door's body; null where it is not one. */
function changeAskOf(change: AdsChangeBody | undefined): AdChangeAsk | null {
  if (change === undefined) return null;
  if (change.what === "total" && change.total_minor !== undefined)
    return { what: "total", total_minor: change.total_minor };
  if (change.what === "end_day" && change.end_day !== undefined) return { what: "end_day", end_day: change.end_day };
  if (change.what === "miles" && change.miles !== undefined) return { what: "miles", miles: change.miles };
  return change.what === "end" ? { what: "end" } : null;
}

/** A change its door did not keep, as the refusal the dashboard words. */
function changeRefusalOf(kept: AdChangeKept): Response {
  if (kept.outcome === "not_allowed") return refuse(403, "ad_account_not_owner");
  if (kept.outcome === "not_found") return refuse(404, "not_found");
  if (kept.outcome === "stale") return refuse(409, "ad_stale");
  if (kept.outcome === "busy") return refuse(409, "ad_busy", "Another change to this ad is on its way to Meta.");
  if (kept.outcome === "unsure") return refuse(409, "ad_busy", "Meta hasn't said yet whether it took the last change.");
  if (kept.outcome === "amount_soon")
    return refuse(409, "ad_busy", `Meta takes four changes of an amount an hour; the next after ${kept.nextAt ?? ""}.`);
  if (kept.outcome === "no_door") return refuse(503, "not_ready", NO_ADS_DOORS);
  return refuse(409, "ad_not_ready", `The ad is ${kept.outcome.replace("_", " ")}.`);
}

/** What telling Meta of a change came to. */
interface ChangeTold {
  outcome: "told" | "refused" | "unknown" | "slowed" | "waits" | "revoked" | "nothing";
  usage: MetaUsage | null;
  said: string | null;
}

/** Meta's own words for a refusal, for the owner, in quotes; else what the wire said. */
const metaWordsOf = (answer: MetaAdsAnswer): string | null => parseMetaRefusal(answer.json)?.words ?? answer.said;

/** The ad set's change a change on its way sends: Meta's units and words for it, or null where it can't be built. */
function setChangeOf(on: AdChangeOnWay, ad: AdChangeRow, currency: string): MetaAdSetChange | null {
  if (on.what === "total") return { what: "total", totalMinor: on.total_minor, currency };
  if (on.what === "end_day") {
    const endsAt = recordOrEmpty(ad.change).ends_at;
    return typeof endsAt === "string" ? { what: "end", endsAt } : null;
  }
  if (on.what !== "miles") return null;
  // The circle's centre is the address the owner approved: the miles change, and nothing else of who sees it.
  const approved = approvedOf(ad.approved);
  if (approved === null || approved.area !== null) return null;
  return {
    what: "area",
    area: { centre: { address: approved.address }, miles: on.miles, wide: undefined, instagram: false },
  };
}

/** What a change's real call came to, kept: taken, refused in Meta's words, or sent with no answer. */
async function changeAnswered(db: Db, tenantId: TenantId, adId: string, sent: MetaAdsAnswer): Promise<ChangeTold> {
  const { usage } = sent;
  if (sent.fault === "revoked") return { outcome: "revoked", usage, said: sent.said };
  if (sent.fault === "slowed") return { outcome: "slowed", usage, said: sent.said };
  if (sent.fault === "silent") {
    // No answer: whether it went is not known. Never sent again; the next read settles it from what Meta holds.
    await markAdChangeTold(db, tenantId, { adId, outcome: "unknown" });
    return { outcome: "unknown", usage, said: null };
  }
  if (sent.fault !== null || !metaConfirmed(sent.json)) {
    const words = metaWordsOf(sent);
    await markAdChangeTold(db, tenantId, { adId, outcome: "refused", said: words });
    return { outcome: "refused", usage, said: words };
  }
  await markAdChangeTold(db, tenantId, { adId, outcome: "told" });
  return { outcome: "told", usage, said: null };
}

/** Whose change is told, and how. */
interface ChangeTelling {
  tenantId: TenantId;
  signIn: MetaSignIn;
  writes: AdsWrites;
  currency: string;
}

/**
 * One change told to Meta, once: ending it, the campaign archived; any other, the ad set's dry run first (which makes
 * nothing, so one unanswered or held back is asked again later), then the change itself.
 */
async function tellChange(db: Db, log: Log, teller: ChangeTelling, ad: AdChangeRow): Promise<ChangeTold> {
  const { tenantId } = teller;
  const on = adChangeOnWayOf(ad.change);
  if (on === null || on.unsure || ad.platform_set_id === null || ad.platform_campaign_id === null)
    return { outcome: "nothing", usage: null, said: null };
  if (teller.writes !== "live") {
    await markAdChangeTold(db, tenantId, { adId: ad.id, outcome: "told" });
    return { outcome: "told", usage: null, said: null };
  }
  const { token, appSecret } = teller.signIn;
  if (on.what === "end") {
    const sent = await callMetaAds(metaAdSwitchRequest(token, appSecret, ad.platform_campaign_id, "ARCHIVED"));
    log.info("ads_change_told", { ad_id: ad.id, what: on.what, fault: sent.fault, status: sent.status });
    return changeAnswered(db, tenantId, ad.id, sent);
  }
  const change = setChangeOf(on, ad, teller.currency);
  if (change === null) {
    await markAdChangeTold(db, tenantId, { adId: ad.id, outcome: "refused", said: null });
    return { outcome: "refused", usage: null, said: null };
  }
  const sign = { token, appSecret };
  const dry = await callMetaAds(metaAdSetChangeRequest(sign, ad.platform_set_id, change, { dryRun: true }));
  log.info("ads_change_checked", { ad_id: ad.id, what: on.what, fault: dry.fault, status: dry.status });
  if (dry.fault === "revoked") return { outcome: "revoked", usage: dry.usage, said: dry.said };
  if (dry.fault === "slowed") return { outcome: "slowed", usage: dry.usage, said: dry.said };
  if (dry.fault === "silent") return { outcome: "waits", usage: dry.usage, said: null };
  if (dry.fault !== null) {
    const words = metaWordsOf(dry);
    await markAdChangeTold(db, tenantId, { adId: ad.id, outcome: "refused", said: words });
    return { outcome: "refused", usage: dry.usage, said: words };
  }
  const sent = await callMetaAds(metaAdSetChangeRequest(sign, ad.platform_set_id, change, { dryRun: false }));
  log.info("ads_change_told", { ad_id: ad.id, what: on.what, fault: sent.fault, status: sent.status });
  return changeAnswered(db, tenantId, ad.id, sent);
}

/** Whether Meta holds what a change sent and never answered asked, from the campaign read back whole. */
function heldAsAsked(on: AdChangeOnWay, ad: AdChangeRow, json: unknown, currency: string): boolean {
  const held = parseMetaCampaignHeld(json, currency);
  const [set] = held.sets;
  if (on.what === "end") return held.state === "ARCHIVED" || held.state === "DELETED";
  if (on.what === "total") return set?.totalMinor === on.total_minor;
  if (on.what === "miles") return set?.miles === on.miles;
  const endsAt = recordOrEmpty(ad.change).ends_at;
  return typeof endsAt === "string" && set?.endsAt !== null && set?.endsAt !== undefined
    ? Date.parse(set.endsAt) === Date.parse(endsAt)
    : false;
}

/** A change sent and never answered, settled from what Meta holds: taken, or not. One read back, never a resend. */
async function settleChange(db: Db, log: Log, teller: ChangeTelling, ad: AdChangeRow): Promise<ChangeTold> {
  const on = adChangeOnWayOf(ad.change);
  if (on === null || !on.unsure || ad.platform_campaign_id === null)
    return { outcome: "nothing", usage: null, said: null };
  if (teller.writes !== "live") {
    await markAdChangeTold(db, teller.tenantId, { adId: ad.id, outcome: "told" });
    return { outcome: "told", usage: null, said: null };
  }
  const { token, appSecret } = teller.signIn;
  const read = await callMetaAds(metaCampaignReadBackRequest(token, appSecret, ad.platform_campaign_id));
  if (read.fault === "revoked") return { outcome: "revoked", usage: read.usage, said: read.said };
  if (read.fault !== null) return { outcome: "waits", usage: read.usage, said: null };
  let taken: boolean;
  try {
    taken = heldAsAsked(on, ad, read.json, teller.currency);
  } catch {
    // An answer that is not the campaign settles nothing: it is read again on the next pass.
    return { outcome: "waits", usage: read.usage, said: null };
  }
  await markAdChangeTold(db, teller.tenantId, { adId: ad.id, outcome: taken ? "told" : "not_taken" });
  log.info("ads_change_settled", { ad_id: ad.id, what: on.what, taken });
  return { outcome: taken ? "told" : "refused", usage: read.usage, said: null };
}

/** The most changes one read sends or settles before it reads: each is a change, three of the account's allowance. */
const CHANGES_MAX = 5;

/**
 * An account's changes still on their way, before its read: each sent and never answered settled first, then each
 * whose thirty seconds have passed sent, while Meta's allowance leaves room. `revoked` ends the read.
 */
export async function runChanges(
  db: Db,
  log: Log,
  teller: ChangeTelling,
  at: { accountId: string; nowMs: number },
): Promise<{ told: number; usage: MetaUsage | null; revoked: boolean }> {
  let usage: MetaUsage | null = null;
  let sent = 0;
  if (teller.writes === "off") return { told: sent, usage, revoked: false };
  const changes = await listAdChanges(db, teller.tenantId, at.accountId);
  const unsure = changes.filter((ad) => adChangeOnWayOf(ad.change)?.unsure === true);
  const waiting = changes.filter(
    (ad) => adChangeOnWayOf(ad.change)?.unsure === false && mayTellNow(ad.told_at, at.nowMs),
  );
  for (const [nth, ad] of [...unsure, ...waiting].slice(0, CHANGES_MAX).entries()) {
    if (usage !== null && usage.pct >= ADS_USAGE_HOLD_PCT) break;
    const answer =
      nth < unsure.length ? await settleChange(db, log, teller, ad) : await tellChange(db, log, teller, ad);
    usage = answer.usage ?? usage;
    if (answer.outcome === "revoked") return { told: sent, usage, revoked: true };
    if (answer.outcome === "slowed") break;
    if (answer.outcome === "told" || answer.outcome === "refused" || answer.outcome === "unknown") sent += 1;
  }
  return { told: sent, usage, revoked: false };
}

/** A change kept, told to Meta where Meta will take it now; else left on its way with its read asked for. */
async function tellChangeNow(
  db: Db,
  owner: { tenantId: TenantId; writes: AdsWrites },
  press: { adId: string; accountId: string },
  kept: AdChangeKept,
): Promise<Response> {
  const { tenantId } = owner;
  const log = logger({ tenant_id: tenantId, ad_id: press.adId });
  const answer = (outcome: string) => json(200, { ok: true, outcome, version: kept.version ?? 0 });
  const soon = async () => {
    await askAdTell(db, tenantId, press.adId);
    log.info("ads_changed", { outcome: "soon" });
    return answer("soon");
  };
  const app = metaAdsApp();
  const account = await findAdAccount(db, tenantId, press.accountId);
  const nowMs = Date.now();
  if (!app || !account?.currency || !mayTellNow(kept.toldAt, nowMs) || !mayAskMeta(account, nowMs)) return soon();
  const signIn = await signInOf(db, app, account.id);
  const ad = (await listAdChanges(db, tenantId, account.id)).find((one) => one.id === press.adId);
  if (!signIn || !ad) return soon();
  const telling = await tellChange(db, log, { tenantId, signIn, writes: owner.writes, currency: account.currency }, ad);
  log.info("ads_changed", { outcome: telling.outcome });
  if (telling.outcome === "revoked") {
    await markAdAccountRevoked(db, tenantId, account.id, "read");
    return refuse(409, "meta_signed_out", telling.said ?? undefined);
  }
  if (telling.outcome === "slowed") {
    await keepAdAccountRead(db, tenantId, account.id, {
      error: "slowed",
      read_after: readAfterOf(telling.usage, "slowed", nowMs),
      ...(telling.usage ? { usage_pct: telling.usage.pct } : {}),
    });
    return soon();
  }
  if (telling.outcome === "waits" || telling.outcome === "nothing") return soon();
  if (telling.outcome === "refused") return refuse(502, "meta_refused", telling.said ?? undefined);
  if (telling.outcome === "told") return answer("told");
  // No answer came: never sent again. The account's read is asked for at once, and settles it from what Meta holds.
  if (account.external_id !== null) await askAdRead(db, "meta", account.external_id);
  return answer("sent");
}

/** What the change is kept as: the ask, its last moment in the account's zone, and what the press was drawn from. */
function keptChangeOf(ask: AdChangeAsk, body: AdsChangeBody, timezone: string): Record<string, string | number> {
  return {
    ...ask,
    ...(ask.what === "end_day" ? { ends_at: endOfDayIn(timezone, ask.end_day) } : {}),
    ...(body.from_minor === undefined ? {} : { from_minor: body.from_minor }),
    ...(body.from_ends_at === undefined ? {} : { from_ends_at: body.from_ends_at }),
    ...(body.expect_max_minor === undefined ? {} : { expect_max_minor: body.expect_max_minor }),
  };
}

/**
 * The door's `change` op: judged again against what Meta holds, kept by its door, then told. The switch, the list of
 * workspaces and the owner were asked by the door first (press.ts).
 */
export async function runAdChange(
  db: Db,
  owner: { tenantId: TenantId; userId: string; writes: AdsWrites },
  press: { adId: string; version: number; change: AdsChangeBody | undefined },
): Promise<Response> {
  const { tenantId } = owner;
  const ask = changeAskOf(press.change);
  if (ask === null || press.change === undefined) return refuse(400, "bad_request", "change: what, and to what");
  const row = await findAd(db, tenantId, press.adId);
  if (!row) return refuse(404, "not_found");
  if (row.origin !== "chanlytics") return refuse(409, "ad_not_ready", "An ad made in Meta is changed in Meta.");
  const account = await findAdAccount(db, tenantId, row.account_id);
  if (!account || account.status !== "connected" || account.currency === null)
    return refuse(409, "nothing_to_do", "No connected ad account.");
  const minDaily = metaAdConfigOf(account.config).min_daily_minor;
  const timezone = account.timezone ?? "UTC";
  const facts =
    minDaily === null
      ? null
      : adChangeFactsOf(
          row,
          { currency: account.currency, minDailyMinor: minDaily, ownerMostMinor: account.most_minor, timezone },
          Date.now(),
        );
  if (facts === null) return refuse(409, "ad_not_ready", "Meta hasn't said this ad's total and end yet.");
  // The one rule, again, against what Meta holds now: what the dashboard judged may have moved since. What Meta holds
  // already is the door's to answer as the same press again.
  const issue = adChangeIssue(ask, facts);
  if (issue?.code !== "same") {
    if (issue !== null) return refuse(409, "ad_stale", `The change meets ${issue.code}.`);
    if (adChangeMostOf(ask, facts) !== (press.change.expect_max_minor ?? null))
      return refuse(409, "ad_stale", "The most the press named is not this change's.");
    if (adChangeSpendsMore(ask, facts) && (await isSendingStopped(db, tenantId)))
      return refuse(409, "ai_stopped", "AI is stopped, so no ad is given more to spend.");
  }
  const kept = await keepAdChange(db, owner, {
    adId: press.adId,
    version: press.version,
    change: keptChangeOf(ask, press.change, timezone),
  });
  if (kept.outcome === "same")
    return json(200, { ok: true, outcome: kept.pending ? "soon" : "same", version: kept.version ?? press.version });
  if (kept.outcome === "took_back") {
    logger({ tenant_id: tenantId, ad_id: press.adId }).info("ads_changed", { outcome: "took_back" });
    return json(200, { ok: true, outcome: "took_back", version: kept.version ?? press.version });
  }
  if (kept.outcome !== "asked") return changeRefusalOf(kept);
  return tellChangeNow(db, owner, { adId: press.adId, accountId: row.account_id }, kept);
}

/**
 * The ad an ad made from Fix it takes the place of, ended once that one is turned on (the Ads plan's 4.5 and C8): only
 * while Meta still turns it down, so an ad Meta has since approved is never ended by it. Its campaign is archived by the
 * account's job, which Turn on has asked for. Kept as the owner's own press, by the owner who turned the new one on.
 */
export async function endFixedAd(
  db: Db,
  owner: { tenantId: TenantId; userId: string },
  adId: string,
): Promise<"ended" | "kept"> {
  const row = await findAd(db, owner.tenantId, adId);
  if (!row || row.origin !== "chanlytics" || row.status !== "made" || row.platform_state !== "DISAPPROVED")
    return "kept";
  const kept = await keepAdChange(db, owner, { adId, version: row.version, change: { what: "end" } });
  if (kept.outcome !== "asked") return "kept";
  await askAdTell(db, owner.tenantId, adId);
  return "ended";
}
