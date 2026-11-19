/**
 * One read of one ad account at Meta (job kind `ad_read`; decision 0049, step P1; the Ads plan's 6.6): the account as
 * Meta describes it now, the ads in it with the budget each sits under, Meta's days for them, and, once a day, the
 * Page and the subscription to Meta's notices. Everything it learned is kept by one door in one transaction
 * (ads_read_keep), or nothing is: a read that stops part way leaves the last good numbers and says it could not update.
 *
 * Meta's allowance for an account is small, so the read asks as little as tells it everything: one call for the
 * account, one a hundred ads, one for the ads its list no longer names, one five hundred ad-days. Every call is sent
 * once. A call Meta refuses ends the read: the account keeps why and the moment before which it is not asked again,
 * and the job ends well, so nothing sends the same calls again in the same breath. A sign-in Meta no longer takes
 * marks the account: access taken back.
 */
import {
  callMetaAds,
  metaAdDaysRequest,
  metaAdsByIdRequest,
  metaAdsRequest,
  metaSubscribeNoticesRequest,
  parseMetaAdDays,
  parseMetaAds,
  parseMetaAdsById,
  META_IDS_MAX,
  type MetaAd,
  type MetaAdDay,
  type MetaAdsFault,
  type MetaUsage,
} from "@chanlytics/channels/ads";
import type { MetaApp } from "@chanlytics/channels/meta";
import {
  findAdAccount,
  keepAdsRead,
  listHeldAdIds,
  markAdAccountRevoked,
  type AdAccountRow,
  type AdsReadKept,
} from "@chanlytics/db/ads";
import type { Database } from "@chanlytics/db/types";
import { metaAdConfigOf, MIN_MS, SECOND_MS, type TenantId } from "@chanlytics/contracts";
import type { ClaimedJob } from "@chanlytics/jobs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../shared/log.js";
import { metaAdsApp, signInOf } from "./account-ops.js";
import {
  ADS_PACE,
  adRowsOf,
  dayRowsOf,
  depthOf,
  nextReadOf,
  nextSettleOf,
  rangeOf,
  settledBeforeOf,
  type ReadDepth,
} from "./adopt.js";
import {
  accountConfigOf,
  askMetaAds,
  pageConfigOf,
  readMetaAccount,
  readMetaPage,
  standingOf,
  type Asked,
  type MetaSignIn,
} from "./meta-facts.js";
import { ADS_USAGE_HOLD_PCT, mayAskMeta, readAfterOf } from "./pace.js";

type Db = SupabaseClient<Database>;
type Log = ReturnType<typeof logger>;

/** No call is started with less than this left of a job: its answer and the one write end inside it. */
const CALL_ROOM_MS = 25 * SECOND_MS;
/** How long after a read that stopped the account is tried again, where Meta named no wait of its own. */
const RETRY_MS = 15 * MIN_MS;

/** Why a read stopped before it had everything. */
interface Stopped {
  stopped: true;
  fault: MetaAdsFault | "out_of_time" | "no_token";
  usage: MetaUsage | null;
}

/** One read in flight: who is asked, how, and what has been spent of Meta's allowance and of the job's time. */
interface Reading {
  log: Log;
  signIn: MetaSignIn;
  account: AdAccountRow & { external_id: string; currency: string };
  deadline: number;
  calls: number;
  usage: MetaUsage | null;
}

/**
 * One question of Meta inside a read. Null, with why kept on the reading, where it may not be asked (the job's time
 * is short, or Meta's last answer said the allowance is nearly spent) or Meta refused it.
 */
async function ask<T>(reading: Reading, question: () => Promise<Asked<T>>): Promise<T | Stopped> {
  if (Date.now() > reading.deadline - CALL_ROOM_MS)
    return { stopped: true, fault: "out_of_time", usage: reading.usage };
  if (reading.usage !== null && reading.usage.pct >= ADS_USAGE_HOLD_PCT)
    return { stopped: true, fault: "slowed", usage: reading.usage };
  reading.calls += 1;
  const asked = await question();
  reading.usage = asked.usage ?? reading.usage;
  if (!asked.ok) return { stopped: true, fault: asked.fault, usage: asked.usage };
  return asked.value;
}

const stopped = (value: unknown): value is Stopped =>
  typeof value === "object" && value !== null && "stopped" in value && value.stopped === true;

/** Every ad Meta's list names for the account, a page at a time, up to the most one read takes. */
async function listedAds(reading: Reading): Promise<MetaAd[] | Stopped> {
  const { signIn, account, log } = reading;
  const ads: MetaAd[] = [];
  for (let after: string | undefined; ads.length < ADS_PACE.maxAds;) {
    const page = await ask(reading, () =>
      askMetaAds(
        log,
        "ads",
        callMetaAds(metaAdsRequest(signIn.token, signIn.appSecret, account.external_id, after)),
        (json) => parseMetaAds(json, account.currency),
      ),
    );
    if (stopped(page)) return page;
    ads.push(...page.ads);
    if (page.after === null) break;
    after = page.after;
  }
  return ads;
}

/** Ads asked for by name: the ones this workspace holds, or that a day names, that Meta's list did not. */
async function namedAds(reading: Reading, ids: readonly string[]): Promise<MetaAd[] | Stopped> {
  const { signIn, account, log } = reading;
  const ads: MetaAd[] = [];
  for (let from = 0; from < ids.length; from += META_IDS_MAX) {
    const some = await ask(reading, () =>
      askMetaAds(
        log,
        "ads_by_id",
        callMetaAds(metaAdsByIdRequest(signIn.token, signIn.appSecret, ids.slice(from, from + META_IDS_MAX))),
        (json) => parseMetaAdsById(json, account.currency),
      ),
    );
    if (stopped(some)) return some;
    ads.push(...some);
  }
  return ads;
}

/** Meta's days for the account's ads over a range, a page at a time. */
async function daysOver(reading: Reading, range: { since: string; until: string }): Promise<MetaAdDay[] | Stopped> {
  const { signIn, account, log } = reading;
  const days: MetaAdDay[] = [];
  let after: string | undefined;
  for (let page = 0; page < ADS_PACE.maxDayPages; page += 1) {
    const some = await ask(reading, () =>
      askMetaAds(
        log,
        "days",
        callMetaAds(metaAdDaysRequest(signIn.token, signIn.appSecret, account.external_id, range, after)),
        (json) => parseMetaAdDays(json, account.currency),
      ),
    );
    if (stopped(some)) return some;
    days.push(...some.days);
    if (some.after === null) break;
    after = some.after;
  }
  return days;
}

/** The most ads asked for by name in one read: two of Meta's calls. */
const NAMED_MAX = 2 * META_IDS_MAX;

/** What a whole read learned, as the door keeps it; or why it stopped. */
async function learn(db: Db, app: MetaApp, reading: Reading, depth: ReadDepth, nowMs: number) {
  const { signIn, account, log } = reading;
  const tenantId = account.tenant_id as TenantId;
  const described = await ask(reading, () => readMetaAccount(log, signIn, account.external_id));
  if (stopped(described)) return described;

  const listed = await listedAds(reading);
  if (stopped(listed)) return listed;
  const days = await daysOver(reading, rangeOf(depth, described.timezone, nowMs));
  if (stopped(days)) return days;

  // The ads this workspace holds, and the ones a day names, that Meta's list did not: asked for by name, so one
  // archived since still says so, and one that ran in the window is adopted (the plan's G3).
  const seen = new Set(listed.map((ad) => ad.id));
  const held = await listHeldAdIds(db, tenantId, account.id);
  const unlisted = [...new Set([...held, ...days.map((day) => day.adId)])].filter((id) => !seen.has(id));
  const named = unlisted.length > 0 ? await namedAds(reading, unlisted.slice(0, NAMED_MAX)) : [];
  if (stopped(named)) return named;
  const ads = [...listed, ...named];

  // Once a day: the Page as Meta describes it now, and Meta's notices subscribed where they are not.
  const daily = depth !== "recent";
  const pageId = metaAdConfigOf(account.config).page_id;
  const page = daily && pageId !== null ? await ask(reading, () => readMetaPage(log, signIn, pageId)) : null;
  const mayChange = metaAdConfigOf(account.config).scopes.includes("ads_management");
  const subscribed =
    daily && account.notices_at === null && mayChange
      ? await ask(reading, () =>
          askMetaAds(
            log,
            "notices",
            callMetaAds(metaSubscribeNoticesRequest(signIn.token, signIn.appSecret, account.external_id, app.clientId)),
            (json) => json,
          ),
        )
      : null;

  const rows = adRowsOf(ads);
  const read: AdsReadKept = {
    account: {
      name: described.name,
      timezone: described.timezone,
      standing: { ...standingOf(described) },
      // A Page Meta would not describe this time keeps what was last known of it.
      config: { ...accountConfigOf(described), ...(page !== null && !stopped(page) ? pageConfigOf(page) : {}) },
      ...(reading.usage ? { usage_pct: reading.usage.pct } : {}),
      read_after: readAfterOf(reading.usage, null, nowMs),
    },
    ads: rows,
    days: dayRowsOf(days, new Map(rows.map((row) => [row.platform_ad_id, row.door]))),
    next_read_at: nextReadOf(ads, nowMs),
    ...(daily ? { settled_before: settledBeforeOf(described.timezone, nowMs) } : {}),
    ...(daily ? { settle_at: nextSettleOf(described.timezone, nowMs) } : {}),
    ...(subscribed !== null && !stopped(subscribed) ? { notices: "subscribed" as const } : {}),
  };
  return read;
}

/** A read that stopped: the account keeps why and when it may be asked again, and what stood, stands. */
function failedRead(stop: Stopped, nowMs: number): AdsReadKept {
  const fault = stop.fault === "out_of_time" || stop.fault === "no_token" ? null : stop.fault;
  const after = readAfterOf(stop.usage, fault, nowMs);
  const retryAt = new Date(nowMs + RETRY_MS).toISOString();
  return {
    account: { error: stop.fault, read_after: after, ...(stop.usage ? { usage_pct: stop.usage.pct } : {}) },
    next_read_at: after !== null && after > retryAt ? after : retryAt,
  };
}

/** What a read came to, for its line and the job's answer. */
interface ReadOut {
  outcome: string;
  depth: ReadDepth;
  calls: number;
  ads: number;
  days: number;
  adopted: number;
  moved: number;
}

/** ad_read as the job runner takes it: one account read at Meta, and what it learned kept. */
export async function runAdRead(
  db: Db,
  job: ClaimedJob,
  deadline: number,
): Promise<{ read: ReadOut } | { skipped: string }> {
  const tenantId = job.tenant_id as TenantId;
  const accountId = typeof job.payload.account_id === "string" ? job.payload.account_id : "";
  const log = logger({ tenant_id: tenantId, account_id: accountId });
  const app = metaAdsApp();
  if (!app) return { skipped: "this deployment holds no sign-in for ads" };
  const account = await findAdAccount(db, tenantId, accountId);
  if (!account || account.status !== "connected") return { skipped: "the account is not connected" };
  const { external_id: externalId, currency } = account;
  if (account.platform !== "meta" || externalId === null || currency === null)
    return { skipped: "the account names no Meta ad account" };
  const nowMs = Date.now();
  if (!mayAskMeta(account, nowMs)) return { skipped: "Meta is holding this account back" };
  const depth = depthOf(account, nowMs);
  const out = (outcome: string, calls: number): { read: ReadOut } => ({
    read: { outcome, depth, calls, ads: 0, days: 0, adopted: 0, moved: 0 },
  });

  const signIn = await signInOf(db, app, account.id);
  if (!signIn) {
    // A connected account with no token kept cannot be read: it says so, and is tried again at the slow pace.
    await keepAdsRead(db, tenantId, account.id, failedRead({ stopped: true, fault: "no_token", usage: null }, nowMs));
    log.error("ads_read_failed", { fault: "no_token" });
    return out("failed", 0);
  }
  const reading: Reading = {
    log,
    signIn,
    account: { ...account, external_id: externalId, currency },
    deadline,
    calls: 0,
    usage: null,
  };
  const learned = await learn(db, app, reading, depth, nowMs);
  if (stopped(learned)) {
    if (learned.fault === "revoked") {
      await markAdAccountRevoked(db, tenantId, account.id, "read");
      log.info("ads_revoked", { how: "read" });
      return out("revoked", reading.calls);
    }
    await keepAdsRead(db, tenantId, account.id, failedRead(learned, nowMs));
    log.info("ads_read_failed", { fault: learned.fault, calls: reading.calls, usage_pct: learned.usage?.pct ?? null });
    return out("failed", reading.calls);
  }
  const kept = await keepAdsRead(db, tenantId, account.id, learned);
  const read: ReadOut = {
    outcome: kept.outcome,
    depth,
    calls: reading.calls,
    ads: learned.ads?.length ?? 0,
    days: learned.days?.length ?? 0,
    adopted: kept.adopted,
    moved: kept.moved,
  };
  log.info("ads_read", { ...read, usage_pct: reading.usage?.pct ?? null });
  return { read };
}
