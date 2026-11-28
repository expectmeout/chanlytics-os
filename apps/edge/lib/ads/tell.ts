/**
 * Telling Meta of an owner's press on an ad (decision 0050, calls 1 and 9; the Ads plan's 5.2 and 6.4): the ad's own
 * switch set, then the ad read back so the page says what Meta says. Nothing is sent that Meta is likely to refuse:
 * Meta takes one change to an ad every thirty seconds, so a press inside that time waits, and a change is not sent
 * while Meta holds the account back. A change that got no answer is never sent again blind: Meta is asked at once where
 * the part stands. Holding what was asked, it is told. A pause Meta does not hold was never taken, so it stays on its
 * way and goes again when Meta will take it. Anything else (a turning back on Meta does not show yet, or no answer to
 * that question either) is marked sent, never sent again, and the next read says what stands at Meta.
 *
 * `ADS_WRITES` decides whether what can spend reaches Meta: `live` sends; `sandbox` does everything but the call, and
 * says Meta took it; `off` (or unset) is refused before a press is kept (press.ts). A pause is never held by that
 * switch: one an owner can see, they can stop, so `off` sends a pause as `live` does (`stopWrites`).
 */
import {
  callMetaAds,
  metaAdStandingRequest,
  metaAdSwitchRequest,
  metaConfirmed,
  parseMetaAdStanding,
  type MetaUsage,
} from "@chanlytics/channels/ads";
import { adLeftOn, adStateOfRow, SECOND_MS, type TenantId } from "@chanlytics/contracts";
import {
  adSwitchIdOf,
  listMadeAds,
  listPendingAds,
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

/**
 * How a stop (a pause, an end, a cancel) reaches Meta, whatever this deployment's switch says of what can spend: sent,
 * but in the sandbox, which calls nobody. The switch never stands between an owner and stopping an ad.
 */
export const stopWrites = (writes: AdsWrites): Exclude<AdsWrites, "off"> => (writes === "sandbox" ? "sandbox" : "live");

/** How long Meta takes between two changes to the same ad (its page: thirty seconds), with a second to spare. */
const CHANGE_EVERY_MS = 31 * SECOND_MS;

/** Whether Meta will take a change to an ad now: none was sent in its last thirty seconds. */
export const mayTellNow = (toldAt: string | null, nowMs: number): boolean =>
  toldAt === null || nowMs - Date.parse(toldAt) >= CHANGE_EVERY_MS;

/**
 * What telling Meta came to. `slowed`: Meta took nothing and the press is still on its way. `not_taken`: a pause Meta
 * never answered, and Meta, asked, does not hold it: still on its way, and it goes again when Meta will take it.
 */
interface Told {
  outcome: "told" | "refused" | "unknown" | "slowed" | "not_taken" | "revoked" | "again" | "kept" | "not_found";
  usage: MetaUsage | null;
  /** Meta's own words where it refused. */
  said: string | null;
}

const SWITCH: Record<AdIntent, "PAUSED" | "ACTIVE"> = { paused: "PAUSED", on: "ACTIVE" };

/** Whose press is told, and how. */
interface Telling {
  tenantId: TenantId;
  signIn: MetaSignIn;
  writes: AdsWrites;
  /**
   * Whether the ad is read back once Meta took the change. A disconnect that pauses many does not: each read back is
   * one more of the account's few calls, and a pause Meta confirmed leaves no doubt what the ad's own switch says.
   */
  readBack?: boolean;
}

/** One press told to Meta, and what came of it kept (ad_told). Sent once. */
export async function tellAd(
  db: Db,
  log: Log,
  who: Telling,
  ad: Pick<AdPendingRow, "id" | "platform_ad_id" | "intent"> & { switch_id?: string | null },
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
  // A pause is a stop: this deployment's switch never holds it. What turns an ad on is held while the switch is off.
  const writes = ad.intent === "paused" ? stopWrites(who.writes) : who.writes;
  if (writes === "off") return { outcome: "slowed", usage: null, said: null };
  if (writes !== "live") return done(await kept("told", SWITCH[ad.intent], null), null, null);

  // An ad made here is switched at its own campaign, which holds its versions and nothing else (00666).
  const part = ad.switch_id ?? ad.platform_ad_id;
  const sent = await callMetaAds(metaAdSwitchRequest(signIn.token, signIn.appSecret, part, SWITCH[ad.intent]));
  if (sent.fault === "revoked") return { outcome: "revoked", usage: sent.usage, said: sent.said };
  // Meta took nothing and said to come back: the press stays on its way.
  if (sent.fault === "slowed") return { outcome: "slowed", usage: sent.usage, said: sent.said };
  log.info("ads_ad_told", { ad_id: ad.id, asked: ad.intent, fault: sent.fault, status: sent.status });
  if (sent.fault === "silent") {
    // No answer: Meta is asked where the part stands before anything is said of it, or sent again. Its own word says
    // whether its own switch is off (PAUSED: an ad's, never its ad set's or its campaign's, which Meta words apart).
    const stands = await askMetaAds(
      log,
      "ad_standing",
      callMetaAds(metaAdStandingRequest(signIn.token, signIn.appSecret, part)),
      parseMetaAdStanding,
    );
    const usage = stands.usage ?? sent.usage;
    const word = stands.ok ? stands.value : null;
    const held = word === null ? null : (word === SWITCH.paused) === (ad.intent === "paused");
    // Meta holds what was asked: it took it. The ad's own word is kept where the part asked is the ad itself.
    if (held === true) {
      const says = ad.intent === "paused" ? SWITCH.paused : part === ad.platform_ad_id ? word : null;
      return done(await kept("told", says, null), usage, null);
    }
    // A pause Meta does not hold was never taken: nothing is marked, it stays on its way, and goes again, never blind.
    if (held === false && ad.intent === "paused") return { outcome: "not_taken", usage, said: null };
    // Not known: never sent again, and the next read says what stands.
    return done(await kept("unknown", null, null), usage, null);
  }
  if (sent.fault !== null || !metaConfirmed(sent.json))
    return done(await kept("refused", null, sent.said), sent.usage, sent.said);
  // Taken. What Meta now says of the ad, where its allowance leaves room to ask: else the next read says.
  const room = who.readBack !== false && (sent.usage === null || sent.usage.pct < ADS_USAGE_HOLD_PCT);
  const standing = room
    ? await askMetaAds(
        log,
        "ad_standing",
        callMetaAds(metaAdStandingRequest(signIn.token, signIn.appSecret, ad.platform_ad_id)),
        parseMetaAdStanding,
      )
    : null;
  const usage = standing?.usage ?? sent.usage;
  // Not read back: a pause Meta confirmed is its own switch off, so the ad is not running, and the row says so now
  // (the next read says which of Meta's words it is). What an ad turned back on stands at is Meta's to say: it may be
  // checking it again.
  const stands = standing?.ok ? standing.value : ad.intent === "paused" ? SWITCH.paused : null;
  return done(await kept("told", stands, null), usage, null);
}

/** The most presses one read sends before it reads: each is a change, three of the account's allowance. */
const TELL_MAX = 5;

/**
 * An account's presses still on their way, sent before its read: each whose thirty seconds have passed, while Meta's
 * allowance leaves room. A pause goes before a turning back on, since a pause stops money and waits for nothing; of
 * a kind, the oldest ask first. What it came to, for the read's line; `revoked` ends the read. While this deployment's
 * switch is off only the pauses go: a stop is never held by it, and nothing that turns an ad on is sent.
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
  const pending = (await listPendingAds(db, who.tenantId, accountId))
    .filter((ad) => who.writes !== "off" || ad.intent === "paused")
    .filter((ad) => mayTellNow(ad.told_at, nowMs))
    .sort(
      (a, b) => Number(b.intent === "paused") - Number(a.intent === "paused") || a.intent_at.localeCompare(b.intent_at),
    );
  for (const ad of pending.slice(0, TELL_MAX)) {
    if (usage !== null && usage.pct >= ADS_USAGE_HOLD_PCT) break;
    const answer = await tellAd(db, log, who, ad);
    usage = answer.usage ?? usage;
    if (answer.outcome === "revoked") return { told, usage, revoked: true };
    if (answer.outcome === "slowed") break;
    // A pause Meta never took is still on its way: the next read sends it, and it is not counted as told.
    if (answer.outcome !== "not_taken") told += 1;
  }
  return { told, usage, revoked: false };
}

/**
 * Every ad of an account that is left on, paused, for a disconnect that pauses first (the Ads plan's 4.9): the ones
 * running, and the ones Meta is still checking with their own switch on, which would start by themselves once
 * approved, after the owner has gone. Which those are is the badge's to say (contracts adLeftOn), the same one the
 * page counted them by. The running ones go first: they are spending now. Each is the owner's press like any other,
 * kept by its door and told to Meta now. The names of the ones whose pause Meta did not confirm: with any left, the
 * owner is told the ad stays on before they disconnect. With no sign-in to tell Meta with, that is every one of them.
 */
export async function pauseLeftOn(
  db: Db,
  log: Log,
  who: { tenantId: TenantId; userId: string; signIn: MetaSignIn | null; writes: AdsWrites },
  account: { id: string; read_after: string | null; timezone: string | null },
): Promise<string[]> {
  const at = { nowMs: Date.now(), timezone: account.timezone ?? "UTC" };
  const leftOn = (await listMadeAds(db, who.tenantId, account.id))
    .map((ad) => ({ ...ad, state: adStateOfRow(ad, at) }))
    .filter((ad) => adLeftOn(ad.state))
    .sort((one, other) => Number(other.state === "on") - Number(one.state === "on"));
  const unconfirmed: string[] = [];
  let usage: MetaUsage | null = null;
  for (const ad of leftOn) {
    const held = account.read_after !== null && Date.parse(account.read_after) > Date.now();
    const room = usage === null || usage.pct < ADS_USAGE_HOLD_PCT;
    // Held only by Meta, never by this deployment's switch: a pause is a stop.
    if (who.signIn === null || held || !room) {
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
      { tenantId: who.tenantId, signIn: who.signIn, writes: who.writes, readBack: false },
      { id: ad.id, platform_ad_id: kept.platformAdId, switch_id: adSwitchIdOf(ad), intent: "paused" },
    );
    usage = told.usage ?? usage;
    if (told.outcome !== "told") unconfirmed.push(ad.name);
  }
  return unconfirmed;
}
