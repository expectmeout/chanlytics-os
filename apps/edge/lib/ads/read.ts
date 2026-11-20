/**
 * One read of one ad account at Meta (job kind `ad_read`; decision 0049, step P1; the Ads plan's 6.6): the account as
 * Meta describes it now, the ads in it with the budget each sits under, Meta's days for them, and, once a day, the
 * Page and the subscription to Meta's notices. Everything it learned is kept by one door in one transaction
 * (ads_read_keep), or nothing is: a read that stops part way leaves the last good numbers and says it could not update.
 *
 * Meta's allowance for an account is small, so the read asks as little as tells it everything: one call for the
 * account, one a hundred ads, one for the ads its list no longer names, one five hundred ad-days. Every call is sent
 * once. A call Meta refuses ends the read: the account keeps why and the moment before which it is not asked again,
 * and the job ends well, so nothing sends the same calls again in the same breath. A read that keeps failing is tried
 * less and less often, up to once a day: a call Meta refuses counts against the app, so one it will keep refusing is
 * not sent every quarter of an hour. A sign-in Meta no longer takes, or one Chanlytics no longer holds, marks the
 * account: access taken back, and the owner connects again.
 *
 * One read takes at most five hundred ads and three thousand ad-days. Past either it keeps what it read and says what
 * it could not vouch for: whether an ad has its budget to itself is left unsaid (so it is never turned back on from
 * here), and the days are left open, never marked settled, so a figure built on them says "so far".
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
import { DAY_MS, metaAdConfigOf, MIN_MS, SECOND_MS } from "@chanlytics/contracts";
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
  readsInstagram,
  standingOf,
  type Asked,
  type MetaSignIn,
} from "./meta-facts.js";
import { ADS_USAGE_HOLD_PCT, mayAskMeta, readAfterOf } from "./pace.js";
import { adsWrites, tellPending } from "./tell.js";

type Db = SupabaseClient<Database>;
type Log = ReturnType<typeof logger>;

/** No call is started with less than this left of a job: its answer and the one write end inside it. */
const CALL_ROOM_MS = 25 * SECOND_MS;
/** How lately an account was read that a read asked for only to send a press reads nothing more. */
const FRESH_MS = 2 * MIN_MS;
/** The soonest, and the latest, an account whose read stopped is tried again. */
const RETRY_SOONEST_MS = 15 * MIN_MS;
const RETRY_LATEST_MS = DAY_MS;

/**
 * How long after a read that stopped the account is tried again: half as long as it has gone without a good read, so
 * each try waits half again as long as the one before, from a quarter of an hour up to a day. Nothing counts the
 * tries: the wait is read from the account's own last good read (or its connect, before the first), which a good read
 * or the owner's own look moves, so the pace is the hourly one again from that moment.
 */
export function retryMsOf(account: { read_at: string | null; connected_at: string | null }, nowMs: number): number {
  const sinceMs = Date.parse(account.read_at ?? account.connected_at ?? "");
  const stale = Number.isFinite(sinceMs) ? nowMs - sinceMs : 0;
  return Math.min(Math.max(stale / 2, RETRY_SOONEST_MS), RETRY_LATEST_MS);
}

/** Why a read stopped before it had everything. */
interface Stopped {
  stopped: true;
  fault: MetaAdsFault | "out_of_time";
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
  return heard(reading, await question());
}

/** What one answer came to, its usage kept on the reading: the answer read, or why the read stops. */
function heard<T>(reading: Reading, asked: Asked<T>): T | Stopped {
  reading.usage = asked.usage ?? reading.usage;
  if (!asked.ok) return { stopped: true, fault: asked.fault, usage: asked.usage };
  return asked.value;
}

const stopped = (value: unknown): value is Stopped =>
  typeof value === "object" && value !== null && "stopped" in value && value.stopped === true;

/** A list read a page at a time: what it holds, and whether that is all of it or the most one read takes. */
interface Listed<T> {
  rows: T[];
  whole: boolean;
}

/** Every ad Meta's list names for the account, a page at a time, up to the most one read takes. */
async function listedAds(reading: Reading): Promise<Listed<MetaAd> | Stopped> {
  const { signIn, account, log } = reading;
  const ads: MetaAd[] = [];
  let whole = false;
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
    whole = page.after === null;
    if (whole) break;
    after = page.after ?? undefined;
  }
  return { rows: ads, whole };
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

/** Meta's days for the account's ads over a range, a page at a time, up to the most one read takes. */
async function daysOver(
  reading: Reading,
  range: { since: string; until: string },
): Promise<Listed<MetaAdDay> | Stopped> {
  const { signIn, account, log } = reading;
  const days: MetaAdDay[] = [];
  let after: string | undefined;
  let whole = false;
  for (let page = 0; page < ADS_PACE.maxDayPages; page += 1) {
    const some = await ask(reading, () =>
      askMetaAds(
        log,
        "days",
        callMetaAds(metaAdDaysRequest(signIn.token, signIn.appSecret, account.external_id, { ...range, after })),
        (json) => parseMetaAdDays(json, account.currency),
      ),
    );
    if (stopped(some)) return some;
    days.push(...some.days);
    whole = some.after === null;
    if (whole) break;
    after = some.after ?? undefined;
  }
  return { rows: days, whole };
}

/** The most ads asked for by name in one read: two of Meta's calls. */
const NAMED_MAX = 2 * META_IDS_MAX;

/** What a read could not vouch for, having reached the most it takes: every ad, every day, both, or nothing. */
type ReadCut = "ads" | "days" | "ads_days" | null;

/** What a read learned, as the door keeps it, and what it was cut short of; or why it stopped. */
async function learn(
  db: Db,
  app: MetaApp,
  reading: Reading,
  at: { depth: ReadDepth; nowMs: number },
): Promise<{ read: AdsReadKept; cut: ReadCut } | Stopped> {
  const { depth, nowMs } = at;
  const { signIn, account, log } = reading;
  const tenantId = account.tenant_id;
  const described = await ask(reading, () => readMetaAccount(log, signIn, account.external_id));
  if (stopped(described)) return described;

  const list = await listedAds(reading);
  if (stopped(list)) return list;
  const listed = list.rows;
  const dayList = await daysOver(reading, rangeOf(depth, described.timezone, nowMs));
  if (stopped(dayList)) return dayList;
  const days = dayList.rows;

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
  const instagram = readsInstagram(metaAdConfigOf(account.config).scopes);
  const page =
    daily && pageId !== null ? await ask(reading, () => readMetaPage(log, signIn, { id: pageId, instagram })) : null;
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

  // Whether an ad has its budget to itself is only known where every ad of the account was seen.
  const rows = adRowsOf(ads, list.whole);
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
    // Days are marked settled only by a look back that read every one of them: one cut short leaves them open.
    ...(daily && dayList.whole ? { settled_before: settledBeforeOf(described.timezone, nowMs) } : {}),
    ...(daily ? { settle_at: nextSettleOf(described.timezone, nowMs) } : {}),
    ...(subscribed !== null && !stopped(subscribed) ? { notices: "subscribed" as const } : {}),
  };
  const cut: ReadCut = list.whole ? (dayList.whole ? null : "days") : dayList.whole ? "ads" : "ads_days";
  return { read, cut };
}

/** A read that stopped: the account keeps why and when it may be asked again, and what stood, stands. */
function failedRead(stop: Stopped, account: Reading["account"], nowMs: number): AdsReadKept {
  const fault = stop.fault === "out_of_time" ? null : stop.fault;
  const after = readAfterOf(stop.usage, fault, nowMs);
  const retryAt = new Date(nowMs + retryMsOf(account, nowMs)).toISOString();
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
  /** What the read could not vouch for, having reached the most one read takes; null for a whole one. */
  cut: ReadCut;
}

/** ad_read as the job runner takes it: one account read at Meta, and what it learned kept. */
export async function runAdRead(
  db: Db,
  job: ClaimedJob,
  deadline: number,
): Promise<{ read: ReadOut } | { skipped: string }> {
  const tenantId = job.tenant_id;
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
    read: { outcome, depth, calls, ads: 0, days: 0, adopted: 0, moved: 0, cut: null },
  });

  const signIn = await signInOf(db, app, account.id);
  if (!signIn) {
    // A connected account whose token is not kept can never be read again, and no try mends it: it is marked as one
    // whose access is gone, so its page says the one thing that does, Connect again.
    await markAdAccountRevoked(db, tenantId, account.id, "no_token");
    log.error("ads_revoked", { how: "no_token" });
    return out("revoked", 0);
  }
  const reading: Reading = {
    log,
    signIn,
    account: { ...account, external_id: externalId, currency },
    deadline,
    calls: 0,
    usage: null,
  };
  const revoked = async () => {
    await markAdAccountRevoked(db, tenantId, account.id, "read");
    log.info("ads_revoked", { how: "read" });
    return out("revoked", reading.calls);
  };
  // The owner's presses still on their way go first: a pause must not wait behind a read (00652).
  const sent = await tellPending(db, log, { tenantId, signIn, writes: adsWrites() }, { accountId: account.id, nowMs });
  reading.usage = sent.usage;
  if (sent.revoked) return revoked();
  // A read asked for only to send a press, moments after the account's last read, has nothing new to read.
  if (sent.told > 0 && account.read_at !== null && nowMs - Date.parse(account.read_at) < FRESH_MS)
    return out("told", sent.told);
  const learned = await learn(db, app, reading, { depth, nowMs });
  if (stopped(learned)) {
    if (learned.fault === "revoked") return revoked();
    await keepAdsRead(db, tenantId, account.id, failedRead(learned, reading.account, nowMs));
    log.info("ads_read_failed", {
      fault: learned.fault,
      calls: reading.calls,
      usage_pct: learned.usage?.pct ?? null,
      ms: Date.now() - nowMs,
    });
    return out("failed", reading.calls);
  }
  const kept = await keepAdsRead(db, tenantId, account.id, learned.read);
  const read: ReadOut = {
    outcome: kept.outcome,
    depth,
    calls: reading.calls,
    ads: learned.read.ads?.length ?? 0,
    days: learned.read.days?.length ?? 0,
    adopted: kept.adopted,
    moved: kept.moved,
    cut: learned.cut,
  };
  // How long a read took, from the account's first question to its last write: what a real read is timed by.
  log.info("ads_read", { ...read, usage_pct: reading.usage?.pct ?? null, ms: Date.now() - nowMs });
  return { read };
}
