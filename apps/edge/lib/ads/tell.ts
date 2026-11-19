/**
 * Telling Meta of an owner's press on an ad (decision 0050, calls 1 and 9; the Ads plan's 5.2 and 6.4): the ad's own
 * switch set, then the ad read back so the page says what Meta says. Nothing is sent that Meta is likely to refuse:
 * Meta takes one change to an ad every thirty seconds, so a press inside that time waits, and a change is not sent
 * while Meta holds the account back. A change that got no answer is never sent again: it is marked sent, and the next
 * read says what stands at Meta.
 *
 * `ADS_WRITES` decides whether anything reaches Meta at all: `live` sends; `sandbox` does everything but the call,
 * and says Meta took it; `off` (or unset) is refused before a press is kept (press.ts).
 */
import {
  callMetaAds,
  metaAdStandingRequest,
  metaAdSwitchRequest,
  metaConfirmed,
  parseMetaAdStanding,
  type MetaUsage,
} from "@chanlytics/channels/ads";
import { SECOND_MS, type TenantId } from "@chanlytics/contracts";
import {
  listPendingAds,
  listRunningAds,
  markAdTold,
  setAdIntent,
  type AdIntent,
  type AdPendingRow,
} from "@chanlytics/db/ads";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../shared/env.js";
import type { logger } from "../shared/log.js";
import { askMetaAds, type MetaSignIn } from "./meta-facts.js";
import { ADS_USAGE_HOLD_PCT } from "./pace.js";

type Db = SupabaseClient<Database>;
type Log = ReturnType<typeof logger>;

/** Whether an owner's presses reach Meta from this deployment (the plan's 6.2). Anything but the two words is off. */
export type AdsWrites = "off" | "sandbox" | "live";
export function adsWrites(): AdsWrites {
  const set = (env.ADS_WRITES ?? "").toLowerCase();
  return set === "live" || set === "sandbox" ? set : "off";
}

/** How long Meta takes between two changes to the same ad (its page: thirty seconds), with a second to spare. */
const CHANGE_EVERY_MS = 31 * SECOND_MS;

/** Whether Meta will take a change to an ad now: none was sent in its last thirty seconds. */
export const mayTellNow = (toldAt: string | null, nowMs: number): boolean =>
  toldAt === null || nowMs - Date.parse(toldAt) >= CHANGE_EVERY_MS;

/** What telling Meta came to. `slowed`: Meta took nothing and the press is still on its way. */
export interface Told {
  outcome: "told" | "refused" | "unknown" | "slowed" | "revoked" | "again" | "kept" | "not_found";
  usage: MetaUsage | null;
  /** Meta's own words where it refused. */
  said: string | null;
}

const SWITCH: Record<AdIntent, "PAUSED" | "ACTIVE"> = { paused: "PAUSED", on: "ACTIVE" };

/** One press told to Meta, and what came of it kept (ad_told). Sent once. */
export async function tellAd(
  db: Db,
  log: Log,
  who: { tenantId: TenantId; signIn: MetaSignIn; writes: AdsWrites },
  ad: Pick<AdPendingRow, "id" | "platform_ad_id" | "intent">,
): Promise<Told> {
  const { tenantId, signIn } = who;
  const kept = async (outcome: "told" | "refused" | "unknown", platformState: string | null, said: string | null) =>
    markAdTold(db, tenantId, { adId: ad.id, asked: ad.intent, outcome, platformState, said });
  const done = (outcome: string, usage: MetaUsage | null, said: string | null): Told => ({
    outcome:
      outcome === "refused" || outcome === "unknown" || outcome === "again" || outcome === "kept" || outcome === "told"
        ? outcome
        : "not_found",
    usage,
    said,
  });
  if (who.writes !== "live") return done(await kept("told", SWITCH[ad.intent], null), null, null);

  const sent = await callMetaAds(
    metaAdSwitchRequest(signIn.token, signIn.appSecret, ad.platform_ad_id, SWITCH[ad.intent]),
  );
  if (sent.fault === "revoked") return { outcome: "revoked", usage: sent.usage, said: sent.said };
  // Meta took nothing and said to come back: the press stays on its way.
  if (sent.fault === "slowed") return { outcome: "slowed", usage: sent.usage, said: sent.said };
  log.info("ads_ad_told", { ad_id: ad.id, asked: ad.intent, fault: sent.fault, status: sent.status });
  // No answer: whether it went is not known. Never sent again; the next read says what stands.
  if (sent.fault === "silent") return done(await kept("unknown", null, null), sent.usage, null);
  if (sent.fault !== null || !metaConfirmed(sent.json))
    return done(await kept("refused", null, sent.said), sent.usage, sent.said);
  // Taken. What Meta now says of the ad, where its allowance leaves room to ask: else the next read says.
  const room = sent.usage === null || sent.usage.pct < ADS_USAGE_HOLD_PCT;
  const standing = room
    ? await askMetaAds(
        log,
        "ad_standing",
        callMetaAds(metaAdStandingRequest(signIn.token, signIn.appSecret, ad.platform_ad_id)),
        parseMetaAdStanding,
      )
    : null;
  const usage = standing?.usage ?? sent.usage;
  return done(await kept("told", standing?.ok ? standing.value : null, null), usage, null);
}

/** The most presses one read sends before it reads: each is a change, three of the account's allowance. */
const TELL_MAX = 5;

/**
 * An account's presses still on their way, sent before its read: each whose thirty seconds have passed, the oldest
 * wait first, while Meta's allowance leaves room. What it came to, for the read's line; `revoked` ends the read.
 */
export async function tellPending(
  db: Db,
  log: Log,
  who: { tenantId: TenantId; signIn: MetaSignIn; writes: AdsWrites },
  at: { accountId: string; nowMs: number },
): Promise<{ told: number; usage: MetaUsage | null; revoked: boolean }> {
  const { accountId, nowMs } = at;
  let usage: MetaUsage | null = null;
  let told = 0;
  if (who.writes === "off") return { told, usage, revoked: false };
  const pending = (await listPendingAds(db, who.tenantId, accountId)).filter((ad) => mayTellNow(ad.told_at, nowMs));
  for (const ad of pending.slice(0, TELL_MAX)) {
    if (usage !== null && usage.pct >= ADS_USAGE_HOLD_PCT) break;
    const answer = await tellAd(db, log, who, ad);
    usage = answer.usage ?? usage;
    if (answer.outcome === "revoked") return { told, usage, revoked: true };
    if (answer.outcome === "slowed") break;
    told += 1;
  }
  return { told, usage, revoked: false };
}

/**
 * Every ad of an account its platform last said was running, paused, for a disconnect that pauses first (the Ads
 * plan's 4.9). Each is the owner's press like any other, kept by its door and told to Meta now. The names of the ones
 * whose pause Meta did not confirm: with any left, the owner is told the ad keeps running before they disconnect.
 */
export async function pauseRunning(
  db: Db,
  log: Log,
  who: { tenantId: TenantId; userId: string; signIn: MetaSignIn | null; writes: AdsWrites },
  account: { id: string; read_after: string | null },
): Promise<string[]> {
  const running = await listRunningAds(db, who.tenantId, account.id);
  const unconfirmed: string[] = [];
  let usage: MetaUsage | null = null;
  for (const ad of running) {
    const held = account.read_after !== null && Date.parse(account.read_after) > Date.now();
    const room = usage === null || usage.pct < ADS_USAGE_HOLD_PCT;
    if (who.signIn === null || who.writes === "off" || held || !room) {
      unconfirmed.push(ad.name);
      continue;
    }
    const kept = await setAdIntent(db, who, { adId: ad.id, version: ad.version, intent: "paused" });
    const sendable = kept.platformAdId !== null && (kept.outcome === "asked" || kept.outcome === "same");
    if (!sendable || kept.platformAdId === null || !mayTellNow(kept.toldAt, Date.now())) {
      unconfirmed.push(ad.name);
      continue;
    }
    const told = await tellAd(
      db,
      log,
      { tenantId: who.tenantId, signIn: who.signIn, writes: who.writes },
      { id: ad.id, platform_ad_id: kept.platformAdId, intent: "paused" },
    );
    usage = told.usage ?? usage;
    if (told.outcome !== "told") unconfirmed.push(ad.name);
  }
  return unconfirmed;
}
